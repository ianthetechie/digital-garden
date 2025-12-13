---
title: Delightfully Simple Pipelines with Nushell
date: 2025-12-13
tags:
- shell
---

I've been using [nushell](https://www.nushell.sh/) as my daily driver for about six months now,
and wanted to show a few simple examples of why I'm enjoying it so much.
I think it's a breath of fresh air compared to most shells.

# Why a new Shell?

In case you've never heard of it before, nushell is a, well, new shell ;)
`bash` has been the dominant shell for as long as I can remember,
though `zsh` have their fair share of devotees.
`fish` is the only recent example I can think of as a "challenger" shell.
`fish` gained enough traction that it's supported by tooling such as Python `virtualenv`
(which only has integrations out of the box for a handful of shells).
I think `fish` is popular because it had some slightly saner defaults out of the box,
was easier to "customize" with flashy prompts (which can make your shell SUPER slow to init),
and had a saner scripting language than `bash`.
But it still retained a lot of the historical baggage from POSIX shells.

Nushell challenges two common assumptions about shells
and asks "what if things were different?"

1. POSIX compliance is a non-goal.
2. Many standard tools from GNU coreutils/base system (e.g. `ls` and `du`) are replaced by builtins.
3. All nushell "native" utilities produce and consume **structured data** rather than text by default.

By dropping the goal of POSIX compliance,
nushell frees itself from decades of baggage.
This means you get a scripting language that feels a lot more like Rust.
You'll actually get errors by default when you try to do something stupid,
unlike most shells which will happily proceed,
usually doing something even more stupid.
Maybe treating undefined variables as empty string make sense in the 1970s,
but that's almost never helpful.

nushell also takes a relatively unique approach to utilities.
When you type something like `ls` or `ps` in nushell,
this is handled by a shell builtin!
It's just Rust code baked into the shell rather than calling out to GNU coreutils
or whatever your base system includes.
This means that whether you type `ps` on FreeBSD, Debian, or macOS,
you'll get the same behavior!

I can already hear some readers thinking "doesn't this just massively bloat the shell?"
No, not really.
The code for these is for less than that of the typical GNU utility,
because nushell actually (IMO) embraces UNIX philosophy even better than the original utilities.
They are all extremely minimal and work with other builtins.
For example, there are no sorting flags for `ls`,
and no format/unit flags for `du`.

The reason that nushell _can_ take this approach is because they challenge the notion that
"text is the universal API."
You _can't_ meaningfully manipulate text without lots of lossy heuristics.
But you _can_ do this for structured data!
I admit I'm a bit of a chaos monkey, so I love to see a project taking a rare new approach
in space where nothing has fundamentally changed since the 1970s.

Okay, enough about philosophy... here are a few examples of some shell pipelines I found delightful.

# Elastic snapshot status

First up: I do a lot of work with Elasticsearch during `$DAYJOB`.
One workflow I have to do fairly often is spin up a cluster and restore from a snapshot.
The Elasticsearch API is great... for programs.
But I have a hard time grokking hundreds of lines of JSON.
Here's an example of a pipeline I built which culls the JSON response down to just the section I care about.

```nu
http get "http://localhost:9200/myindex/_recovery"
  | get restored-indexname
  | get shards
  | get index
  | get size
```

In case it's not obvious, the `http` command makes HTTP requests.
This is another nushell builtin that is an excellent alternative to `curl`.
It's not as feature-rich (`curl` has a few decades of head start),
but it brings something new to the table: it understands from the response that the content is JSON,
and converts it into structured data!
Everything in this pipeline is nushell builtins.
And it'll work on _any_ OS that nushell supports.
Even Windows!
That's wild!

Pro tip: you can press option+enter to add a new line when typing in the shell.

# Disk usage in bytes

Here's an example I hinted at earlier.
If you type `help du` (to get built-in docs),
you won't find any flags for changing the units.
But you can do it using formatters like so:

```nu
du path/to/bigfile.bin | format filesize B apparent
```

The `du` command _always_ shows human-readable units by default. Which I very much appreciate!
And did you notice `apparent` at the end there?
Well, the version of `du` you'd find with a typical Linux distro doesn't _exactly_ lie to you,
but it withholds some very important information.
The physical size occupied on disk is not necessarily the same as how large the file
(in an abstract platonic sense) _actually_ is.

There are a bunch of reasons for this, but the most impactful one is compressed filesystems.
If I ask Linux `du` how large a file is in an OpenZFS dataset,
it will report the physical size by default, which may be a few hundred megabytes
when the file is really multiple gigabytes.
Not _necessarily_ helpful.

Anyways, the nushell builtin always gives you columns for both physical and apparent.
So you can't ignore the fact that these sizes are often different.
I like that!

# Some other helpful bits for switching

If you want to give nushell a try,
they have some great documentation.
Read the basics, but also check out their specific pages on, e.g.
[coming from bash](https://www.nushell.sh/book/coming_from_bash.html).

Finally, here are two more that tripped me up at first.

- If you want to get the PID of your process, use `$nu.pid` instead of `$$`.
- To access environment *variables*, you need to be explicit and go through `$env`. On the plus side, you can now explicitly differentiate from environment variables.

