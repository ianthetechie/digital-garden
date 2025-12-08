---
title: Faster SSH File Transfers with rsync
tags:
- shell
date: 2025-12-08
---

If you're a developer or sysadmin, there's a pretty good chance you've had to transfer files back and forth.
Back in the old days, you may have used the `ftp` utility or something similar
(I think my first one was probably CuteFTP).
Then you probably thought better of doing things in plaintext,
and switched to SFTP/SCP, which operate over an SSH connection.

My quick post today is not exactly a bombshell of new information,
but these tools are not the fastest way to transfer.
There's often not a huge difference if you're transferring between machines in the same datacenter,
but you can do many times better then transferring from home or the office.

Of course I'm talking about `rsync`, which has a lot of features like compression, partial transfer resume,
checksumming so just the deltas are sent in a large file, and more.
I don't know why, but it's rarely in my consciousness, and always strikes me as a bit quirky.
You need quite a few flags for what I would consider to be reasonable defaults.
But if you remember those (or use shel history, like me),
it can save you a ton of time.

In fact, this morning, using rsync saved me more time than it took to write this blog post.
I was transferring a ~40GB file from a server halfway around the world,
but I only had to transfer bytes equivalent to 20% of the total.

Here's a look at the `rsync` command I often use for pulling files from a remote server
(I usually do this to download a large build artifact without going through a cloud storage intermediary,
which is both slower and more eexpensive):

```shell
rsync -Pzhv example.com:/remote/path/to/big/file ~/file
```

It's not really that bad compared to an `scp` invocation, but those flags make all the difference.
Here's what they do:

* `-P` - Keeps partially transferred files (in case of interruption) and shows progress during the transfer.
* `-z` - Compresses data on the source server before sending to the destination. This probably isn't a great idea for an intra-datacenter transfer (it just wastes CPU), but it's perfect for long distance transfers over "slower" links (where I'd say slower is something less than like 100Mbps between you and the server... the last part is important because you may have a gigabit link, but the peering arrangements or other issues conspire to limit effective transfer rates to something much lower).
* `-h` - Makes the output more "human-readable." This shows previfexs like K, M, or G. You can add it twice if you'd like 1024-based values instead of 1000-based. To be honest, I don't know why this isn't the default.
* `-v` - Verbose mode. By default, `rsync` is silent. This is another behavior that I find strange in the present, but probably made more sense in the era of teletype terminals and very slow links. It's not really that verbose; it just tells you what files are being transferred and a brief summary at the end. You actually have to give _two_ v's (`-vv`) for `rsync` to tell you which files it's skipping!

Hope this helps speed up your next remote file transfer.
If there's any options you like which I may have missed, hit me up on Mastodon with a suggestion!

Bonus pro tip: I had (until I recently switched to nushell) over a decade of accumulated shell history,
and sometimes it's hard to keep the options straight.
Naturally my history has a few different variations on a command like `rsync`.
Rather than searching through manpages with the equivalent of `grep`,
I usually go to [explainshell.com](explainshell.com).
It seems to be a frontend to the manapages that understands the various sections,
providing a much quicker explanation of what your switches do!
