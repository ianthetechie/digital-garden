---
title: Using tar with Your Favorite Compression
date: 2025-12-14
tags:
- shell
- compression
- tar
---

Here's a fun one!
You may already know that tarball is a pure archive format,
and that any compression is applied to the whole archive as a unit.
That is to say that compression is not actually applied at the _file_ level,
but to the entire archive.

This is a trade-off the designers made to limit complexity,
and as a side-effect, is the reason why you can't randomly access parts of a compressed tarball.

What you may not know is that the `tar` utility has built-in support for a few formats!
GZIP is probably the most commonly used for historical reasons,
but `zstd` and `lz4` are built-in options on my Mac.
This is probably system-dependent, so check your local manpages.

Here's an example of compressing and decompressing with `zstd`:

```shell
tar --zstd -cf directory.tar.zst directory/
tar --zstd -xf directory.tar.zst
```

You can also use this with _any_ (de)compression program that operates on stdin and stdout!

```shell
tar --use-compress-program zstd -cf directory.tar.zst directory/
```

Pretty cool, huh?
It's no different that using pipes at the end of the day,
but it does simplify the invocation a bit in my opinion.
