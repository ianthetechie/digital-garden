---
title: Sequence Locks
date: 2024-10-29
tags:
- concurrency
- data-structures
draft: true
---

Example use cases:

- Getting the current time from the kernel without a syscall
- Getting the latest stock ticker price when latency isn't a concern

[podcast episode](https://www.twoscomplement.org/podcast/sequence_locks.mp3)

Increments an atomic counter once when it enters the critical section (to prevent a dirty read)
and again when it is finished.
This clever dance lets readers quickly check that they aren't reading in the middle of an update.

It's a lot lighter than a mutex,
allows a single writer (it can be extended easily to multiple)
and many readers,
without creating a bottleneck.
The tradeoff is that the responsibility for retrying lies with the reader.
They will always be able to get the latest value *eventually*.

TLA+
