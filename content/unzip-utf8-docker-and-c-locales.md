---
title: "Unzip, UTF-8, Docker, and C Locales"
date: 2025-08-27
tags:
- unicode
---

Today's episode of "things that make you go 'wat'" is sponsored by `unzip`.
Yes, the venerable utility ubiquitous on UNIX-like systems.
I mean, what could possibly go wrong?

This morning I was minding my own business sipping a coffee,
when suddenly the "simple" CI pipeline I was working on failed.
I literally copied the command that failed out of a shell script.
Which ran on the exact same machine previously.
And the command that failed was a simple `unzip`.
Huh?

I initially assumed the file may have been corrupted, or maybe the archive had failed in a weird way
(I don't control the process, and was downloading it from the internet).
While it was running again, I started hitting `Page Down` looking for oddities in the log.
I was greeted by this near the end of the output:

```
se/municipality_of_savsj#U00f6-addresses-city.geojson:  mismatching "local" filename (se/municipality_of_savsjö-addresses-city.geojson),
         continuing with "central" filename version
```

Weird, huh?
It looks like it's trying to unzip a file with a UTF-8 name, which should be supported.

I `ssh`'d into the remote machine to give it a try in the terminal.
I've run this command dozens of times, and wanted to see if I got the same output in a standard `bash` remote terminal.
Given that log output is sometimes inscrutable, I thought "maybe it wasn't the unzip itself that failed directly?"
Or something...

Well, the `unzip` worked in the regular bash login shell on the same host.
So there must be _something_ different about the CI environment.

# Searching for the root cause

As a first resort, I started digging through the help and man pages.
The first amusing factoid I learned was that apparently the last official release of this utility happened in 2009.
I guess zip doesn't evolve much, eh?

The man page was actually pretty detailed,
but it didn't have a lot to say about Unicode, or anything else obvious related to the error.
And the project doesn't exactly have an active central issue tracker (there is one on SourceForge, but replies are few and far between).
I couldn't find anyone else talking about this specific error in the usual places on the internet either.

I did however find this interesting [bug report via a Debian mailing list](https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=918894)
from 2019.
The thing that caught my eye was the code sample and mention of locales.

Oh no...
What if this actually changes behavior based on your system locale?
Then it started coming back to me... something about a dozen or so environment variables
that determine the behavior of C programs in bizarre ways...

So I ran `locale` on the `ssh` session and got something reasonable back:

```
$ locale
LANG=C.UTF-8
LANGUAGE=
LC_CTYPE="C.UTF-8"
LC_NUMERIC="C.UTF-8"
LC_TIME="C.UTF-8"
LC_COLLATE="C.UTF-8"
LC_MONETARY="C.UTF-8"
LC_MESSAGES="C.UTF-8"
LC_PAPER="C.UTF-8"
LC_NAME="C.UTF-8"
LC_ADDRESS="C.UTF-8"
LC_TELEPHONE="C.UTF-8"
LC_MEASUREMENT="C.UTF-8"
LC_IDENTIFICATION="C.UTF-8"
LC_ALL=
```

Then, to avoid wasting even more hours of CI time (it's a long job whose source is a ~100GB ZIP file),
I set about replicating the environment of the runner.
Fortunately it left a Docker volume behind for me.
So, I launched an interactive Docker container using the same image that the CI job used (`python:3.13`).
Somewhat surprisingly, the output of `locale` was a bunch of variables set to.... nothing!
Now we're getting somewhere!

To confirm that I could indeed reproduce the failure, I ran `unzip` again in the container,
and sure enough, I got the same log message, and the exit code was `1`.
Now we've confirmed how to reproduce the issue at least, so we can test a fix.

# How locale affects `unzip`

Since `unzip` is single threaded (read: SLOW),
I spent my time during the tests looking through the source code to try and confirm my theory about the locale variables being the issue.
The official version seems to be [hosted on SourceForge](https://sourceforge.net/projects/infozip/), which is apparently still a thing.
(I'm sure there are a lot of Debian patches, but I just wanted a quick way to peruse the code).
Amusingly, there were 47,074 downloads/week of `unzip60.tar.gz`, and only 36 downloads/week of the ZIP version.

Eventually, I found what I was looking for in `unzip.c`:

```c
int unzip(__G__ argc, argv)
    __GDEF
    int argc;
    char *argv[];
{
#ifndef NO_ZIPINFO
    char *p;
#endif
#if (defined(DOS_FLX_H68_NLM_OS2_W32) || !defined(SFX))
    int i;
#endif
    int retcode, error=FALSE;
#ifndef NO_EXCEPT_SIGNALS
#ifdef REENTRANT
    savsigs_info *oldsighandlers = NULL;
#   define SET_SIGHANDLER(sigtype, newsighandler) \
      if ((retcode = setsignalhandler(__G__ &oldsighandlers, (sigtype), \
                                      (newsighandler))) > PK_WARN) \
          goto cleanup_and_exit
#else
#   define SET_SIGHANDLER(sigtype, newsighandler) \
      signal((sigtype), (newsighandler))
#endif
#endif /* NO_EXCEPT_SIGNALS */

    /* initialize international char support to the current environment */
    SETLOCALE(LC_CTYPE, "");

#ifdef UNICODE_SUPPORT
    /* see if can use UTF-8 Unicode locale */
# ifdef UTF8_MAYBE_NATIVE
    {
        char *codeset;
#  if !(defined(NO_NL_LANGINFO) || defined(NO_LANGINFO_H))
        /* get the codeset (character set encoding) currently used */
#       include <langinfo.h>

        codeset = nl_langinfo(CODESET);
#  else /* NO_NL_LANGINFO || NO_LANGINFO_H */
        /* query the current locale setting for character classification */
        codeset = setlocale(LC_CTYPE, NULL);
        if (codeset != NULL) {
            /* extract the codeset portion of the locale name */
            codeset = strchr(codeset, '.');
            if (codeset != NULL) ++codeset;
        }
#  endif /* ?(NO_NL_LANGINFO || NO_LANGINFO_H) */
        /* is the current codeset UTF-8 ? */
        if ((codeset != NULL) && (strcmp(codeset, "UTF-8") == 0)) {
            /* successfully found UTF-8 char coding */
            G.native_is_utf8 = TRUE;
        } else {
            /* Current codeset is not UTF-8 or cannot be determined. */
            G.native_is_utf8 = FALSE;
        }
        /* Note: At least for UnZip, trying to change the process codeset to
         *       UTF-8 does not work.  For the example Linux setup of the
         *       UnZip maintainer, a successful switch to "en-US.UTF-8"
         *       resulted in garbage display of all non-basic ASCII characters.
         */
    }
# endif /* UTF8_MAYBE_NATIVE */
```

And there we have it, right at the start of the program...

This is a bit rough to grok if you don't regularly read C,
but the gist of it is that it tries to look at the system locale
using [`setlocale`](https://en.cppreference.com/w/c/locale/setlocale.html).
The `LC_CTYPE` specifies the types of character used in the locale.
The second argument is... very C.
The function will "install the specified system locale... as the new C locale."

It defaults to `"C"` at startup, per the docs.
In `unzip.c` though, the authors use the magic value `""`,
whose behavior is to set the locale to the "user-preferred locale".
This comes from those environment variables.
A few lines down, past the `#ifdefs` gating unicode support,
they parse the codeset portion by passing `NULL`, which is ANOTHER magic value
that simply returns the current value.
(So this two-step dance loads the preferred locale from the environment variables,
which are empty in this case, and then inspects the codeset.).

If your environment variables do not explicitly specify UTF-8,
you will get some.... strange and undesirable behavior, apparently,
if your archive contains unicode file names!

I'm pretty sure there's a good historical reason for this.
Given that many C library functions are locale-sensitive,
and UTF-8 support is much younger than UNIX and (obviously) C.
But I found this behavior from `unzip` to be a bit surprising nonetheless.
And rather than setting a sensible default like `C.UTF-8`,
it turns out most Docker containers start with none!

# The Fix

Fortunately this is pretty easy to fix.
Just `export LC_ALL="C.UTF-8"` before using `unzip`.
(There is probably a more granular approach, but the `LC_ALL` sledgehammer does the job.)
Kinda crazy that you have to do this,
but hopefully this saves someone else an afternoon of debugging!
