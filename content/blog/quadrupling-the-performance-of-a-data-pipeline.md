---
title: Quadrupling the Performance of a Data Pipeline
tags:
- algorithms
- rust
- elasticsearch
- nodejs
- data engineering
- gis
date: 2024-11-29
---

Over the past two weeks, I've been focused on optimizing some data pipelines.
I inherited  some pipelines from a previous project which seemed especially slow.
Yes, they were processing a reasonable amount of data.
We're talking hundreds of gigabytes,
requiring correlation and conflated across several datasets.
But something smelled off, since we had several pipelines which, on a GB/hr scale,
were an order of magnitude or more faster.

The pipelines in question happened to be written in Node.js,
which I will do my absolute best not to pick on too much throughout.
Node is actually a perfectly fine solution for certain problems.
By rewriting the pipeline in Rust, I was able to make it 4x faster
But as we'll soon see,
the choice of language wasn't the main factor in the sluggishness
(though I believe that Node is a poor choice for several reasons).

So, let's get into it...

# Problem 1: Doing CPU-bound work on a single thread

Node.js was becoming quite popular around the time I entered the industry.
One of the flashy selling points was its ability to handle thousands (or tens of thousands)
of connections with ease.
The key to this performance is **async I/O**.
Modern operating systems are insanely good at this, and Node made it _really_ easy to tap into it.
This was novel to a lot of developers at the time, but it's pretty much the standard now.

**Node works as long as you were dealing with I/O-bound workloads**,
but the magic fades if your workload requires a lot of CPU work.

This last statement is not always an easy thing for an engineer to assess.
If you looked at CPU utilization of the pipelines before I rewrote them,
you would have seem somewhere between 80% and 100% (of a single core) utilization.
By default, Node is single-threaded.
You need to bring in `libuv`, worker threads (Node 10 or so), or something similar
to access _parallel_ processing from JavaScript.

I've only seen a handful of Node programs use these,
and the pipelines in question were not one of them.
**You need to know what mix of parallelism and concurrency your tasks need**.
Concurrency is great for I/O bound operations,
but sometimes you can actually parallelize the work across multiple cores.

In our case, we were ingesting data files (CSV and the like) record-by-record.
If you do this the naïve way, you'll read one record at a time, process, and so on.
But unless your processing is truly trivial, you should parallelize this work.
In Rust, we accomplished this using stream combinators (streams are the cousin of futures;
learn more [here](https://rust-lang.github.io/async-book/05_streams/01_chapter.html)).

We used the [`chunks`](https://docs.rs/futures/latest/futures/stream/trait.StreamExt.html#method.chunks)
adaptor to pull hundreds of items at a time for more efficient processing in batches.
Then, we used [`for_each_concurrent`](https://docs.rs/futures/latest/futures/stream/trait.StreamExt.html#method.for_each_concurrent)
in conjunction with [`spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)
to introduce parallel processing.

## When to use Tokio for CPU-bound operations?

The astute reader may notice that there are a lot of caveats to this approach,
and the Rust ecosystem hasn't quite decided on all the "best practices" here.
The use of `spawn_blocking`, for example, is not universally accepted as a solution for blocking tasks.
Tokio is at (relatively) optimized for non-blocking workloads, so some claim that you should avoid this pattern.
But my experience having done this for 5+ years in production code serving over 2 billion requests/month,
and that of many others in the community, is that Tokio can be a great scheduler for this case too!

I think one thing that gets lost in the discussion around this
is that not all "long-running operations" are the same.
One category consists of graphics event loops,
long-running continuous computations,
or other things that may not always have an obvious "end."
But some tasks can be expected to complete within some period of time,
but it's longer than a blink (I've seen tens of microseconds posted by others as a rule of thumb).

In the case of the former ("long-lived" tasks), then spawning a dedicated thread often makes sense.
In the latter scenario though, Tokio tasks with `spawn_blocking` can be a great choice.

For our workload, we were doing a lot of the latter sort of operation.
Doing these comptutations in batches in parallel gave a nice speedup.

Pro tip: did you use the `num_cpus` crate in the past to auto-tune your parallel workloads?
[`std::thread::available_parallelism`](https://doc.rust-lang.org/std/thread/fn.available_parallelism.html)
might be a good replacement, and has been available since Rust 1.59.0 :)

# Problem 2: Premature optimization rather than backpressure

The original data pipeline was very careful overloading the data store.
Perhaps a bit too careful!
This may have been necessary at some point in the distant past,
but most data storage, from vanilla databases to multi-node clustered storage,
have some level of natural backpressure built-in these days.
Dropping the artificial limits (limitng the amount of work in-flight that hadn't been flushed)
approximately doubled throughput.

Set a reasonable concurrency, let the server tell you when it's chugging (usually via slower response times),
and let your async runtime handle the rest!

# Problem 3: Serde round-trips

Serde, or serialization + deserialization, can be a silent killer.
And unless you're tracking things carefully, you often won't notice!

I recently listened to [Recoding America](https://www.recodingamerica.us/) at the recommendation of a friend.
One of the anecdotes made me want to laugh and cry at the same time.
Engineers had designed a major improvemnet to GPS, but the rollout is delayed
due to a performance problem that renders it unusable.

The project is overseen by Raytheyon, a US government contractor.
And they can't deliver because some arcane federal guidance (not even a regulation proper)
"recommends" an "Enterprise Service Bus" in the architecture.
The startuppper in me dies when I hear such things.
The "recommendation" boils down to a data exchange medium where one "service" writes data and another consumes it.
Think message queues like you may have used before.

This is fine (even necessary) for some applications,
but positively crippling for others.
In the case of the new positioning system,
which was heavily dependent on timing,
this was a wildly inefficient architecture.
Even worse, the guidelines stated that it should be encrypted.

This wasn't even "bad" guidance, but in the context of the problem,
which depended on rapid exchange of time-sensitive messages,
it was a horrendously bad fit.


In the data pipeline in question, I encountered a situation with humorous resemblance in retrospect.
The pipeline was set up using a microservice architecture.
This probably sounded like a good idea at the time,
but it introduced some truly obscene overhead.
All services involved were capable of working with data in the same format,
but the Node.js implementation was split into multiple services with HTTP and JSON serde in the middle!
Double whammy!

The new data pipeline simply imports the "service" as a crate,
and gets rid of all the overhead by keeping everything in-process.
If you do really need to have a microservice architecture (ex: to scale another service up independently),
then other communication + data exchange formats may improve your performance.
But if it's possible to keep everything in-process, your overhead is roughly zero.
That's hard to beat.

# Conclusion

In the end, the new pipeline was 4x the speed of the old.
I happened to rewrite it in Rust, but Rust itself wasn't the source of all the speedups:
understanding the architecture was.
You could achieve similar results in Node.js or Python,
but Rust makes it significantly easy to reason about the architecture and correctness of your code.
This is especially important when it comes to parallelizing sections of a pipeline,
where Rust's type system will save you from the most common mistakes.

These and other non-performance-related reasons to use Rust will be the subject of a future blog post (or two).
