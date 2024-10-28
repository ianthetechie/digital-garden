---
title: Copying and Unarchiving From a Server Without a Temp File
date: 2024-10-28
tags:
- ssh
- terminal
- shell
- tar
---

Sometimes I want to copy files from a remote machine--usually a server I control.
Easy; just use `scp`, right?

Well, today I had a subtly different twist to the usual problem.
I needed to transfer a ~100GB tarball to my local machine,
and I really wanted to unarchive it so that I could get at the internal data directly.
And I wanted to do it in one step, since I didn't have 200GB of free space.

I happened to remember that this *should* be possible with pipes or something.
The tarball format is helpfully designed to allow streaming.
But it took me a bit to come up with the right set of commands to do this.

`scp` is really designed for dumping to files first.
I found a few suggestions on StackOverflow that looked like they might work,
but didn't for me (might have been my shell? I use `fish` rather than `bash`).
But I noticed that almost all of the answers recommended using `ssh` instead,
since it's a bit more suited to the purpose.

The basic idea is to dump the file to standard out on the remote host,
then pipe the ssh output into `tar` locally.
The `tar` flags are probably familiar or easily understandable: `-xvf -` in my case.
This puts `tar` into extract mode,
enables verbose logging (so you see its progress),
and tells it to read from stdin (`-`).
My _tarball_ was not compressed.
If yours is, add the appropriate decompression flags.

The SSH flags were a bit trickier.
I discovered the `-C` flag, which enables gzip compression.
I happen to know this dataset compresses well with gzip,
and further that the network link between me and the remote is not the best,
so I enabled it.
Don't use this if your data does not compress well,
or if it is already compressed.

Another flag, `-e none`,
I found via [this unix.com forum post](https://www.unix.com/unix-for-dummies-questions-and-answers/253941-scp-uncompress-file.html).
This seemed like a good thing to enable after some research,
since sequences like `~.` will not be interpreted as "kill the session."
It also prevents more subtle bugs which would look like data corruption.

`-T` was suggested after I pressed ChatGPT o1-preview for other flags that might be helpful.
It just doesn't allocate a pseudo-terminal.
Which we didn't need anyways.
(Aside: ChatGPT 4o will give you some hot garbage suggestions; o1-preview was only helpful in suggesting refinements.)

Finally, the command executes `cat` on the remote host to dump the tarball to `stdout`.
I saw suggestions as well to use `dd` since you can set the block size explicitly.
That might improve perf in some situations if you know your hardware well.
Or it might just be a useless attempt at premature optimization ;)

Here's the final command:

```shell
ssh -C -e none -T host.example.com 'cat /path/to/archive.tar' | tar -xvf -
```
