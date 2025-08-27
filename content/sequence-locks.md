---
title: Sequence Locks
date: 2024-10-30
tags:
- concurrency
- data-structures
- podcasts
---

I just listened to a fantastic Two's Complement [podcast episode](https://www.twoscomplement.org/podcast/sequence_locks.mp3)
([transcript](https://www.twoscomplement.org/podcast/sequence_locks.txt))
in which Matt and Ben discussed a data structure I'd never heard of before:
the [sequence lock](https://en.wikipedia.org/wiki/Seqlock).
It is not very well known,
but it's useful for cases where you want to avoid writer starvation
and it's acceptable for readers to do a bit more work
(and occasionally fail).

Some use cases they discussed:

- Getting the time information from the kernel without a syscall
- Getting the latest stock ticker price when latency isn't a concern

The basic idea is to increment an atomic variable two times:
once when a writer enters the critical section, and again when it is finished.
This clever dance lets readers quickly check that they aren't reading in the middle of an update,
since a simple modulo 2 check will tell you if you're reading during an update.
Clever!

It's a lot lighter than a mutex,
allows a single writer in the basic case,
but can support more (per Matt).
And of course there is no mutex or similar mechanism creating a bottleneck.

The tradeoff is that reads can fail,
and it is the responsibility of the reader to retry in this case.
Readers will always be able to get the latest value *eventually*,
and writers are never blocked.

During the podcast, Matt mentioned formal verification in passing,
since it's difficult to gain confidence in these sorts of things.
This area is something I've long been fascinated with,
but agree with him that it's not practical for most applications.
If formal verification is interesting to you,
Oxide & Friends did a whole [episode on it](https://oxide.computer/podcasts/oxide-and-friends/1394769).
