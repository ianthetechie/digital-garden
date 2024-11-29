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
I inherited some old ones which seemed especially slow,
and I finally hit a limit where an overhaul made sense.
The pipelines process and generate data on the order of hundreds of gigabytes,
requiring correlation and conflated across several datasets.

The pipelines in question happened to be written in Node.js,
which I will do my absolute best not to pick on too much throughout.
Node is actually a perfectly fine solution for certain problems,
but was being used especially badly in this case.
The rewritten pipeline, using Rust, clocked in at 4x faster than the original.
But as we'll soon see, the choice of language wasn't even the main factor in the sluggishness.

So, let's get into it...

# Problem 1: Doing CPU-bound work on a single thread

Node.js made a splash in the early 2010s,
and I can remember a few years where it was the hot new thing to write everything in.
One of the selling points was its ability to handle thousands (or tens of thousands)
of connections with ease; all from JavaScript!
The key to this performance is **async I/O**.
Modern operating systems are insanely good at this, and Node made it _really_ easy to tap into it.
This was novel to a lot of developers at the time, but it's pretty standard now
for building I/O heavy apps.

**Node performs well as long as you were dealing with I/O-bound workloads**,
but the magic fades if your workload requires a lot of CPU work.
By default, Node is single-threaded.
You need to bring in `libuv`, worker threads (Node 10 or so), or something similar
to access _parallel_ processing from JavaScript.
I've only seen a handful of Node programs use these,
and the pipelines in question were not among them.

## Going through the skeleton

If you ingest data files (CSV and the like) record-by-record in a naïve way,
you'll just read one record at a time, process, insert to the database, and so on in a loop.
The original pipeline code was fortunately not quite this bad (it did have batching at least),
but had some room for improvemnet.

The ingestion phase, where you're just reading data from CSV, parquet, etc.
maps naturally to Rust's [streams](https://rust-lang.github.io/async-book/05_streams/01_chapter.html)
(the cousin of futures).
The original node code was actually fine at this stage,
if a bit less elegant.
But the Rust structure we settled on is worth a closer look.

```rust
fn csv_record_stream<'a, S: AsyncRead + Unpin + Send + 'a, T: TryFrom<StringRecord>>(
    stream: S,
    delimiter: u8,
) -> impl Stream<Item = T> + 'a
where
    <T as TryFrom<StringRecord>>::Error: Debug,
{
    let reader = AsyncReaderBuilder::new()
        .delimiter(delimiter)
        // Other config elided...
        .create_reader(stream);
    reader.into_records().filter_map(|res| async move {
        let Ok(record) = res else {
            log::error!("Error reading from the record stream: {:?}", res);
            return None;
        };

        match T::try_from(record) {
            Ok(parsed) => Some(parsed),
            Err(e) => {
                log::error!("Error parsing record: {:?}.", e);
                None
            }
        }
    })
}
```

It starts off dense, but the concept is simple.
We'll take an async reader,
configure a CSV reader to pull records for it,
and map them to another data type using `TryFrom`.
If there are any errors, we just drop them from the stream and log an error.
This usually isn't a reason to stop processing for our use case.

You should _not_ be putting expensive code in your `TryFrom` implementation.
But really quick things like verifying that you have the right number of fields,
or that a field contains an integer or is non-blank are usually fair game.

Rust's trait system really shines here.
Our code can turn _any_ CSV(-like) file
into an arbitrary record type.
And the same techniques can apply to just about any other data format too.

## How to use Tokio for CPU-bound operations?

Now that we've done the light format shifting and discarded some obviously invalid records,
let's turn to the heavier processing.

```rust
let available_parallelism = std::thread::available_parallelism()?.get();
// let record_pipeline = csv_record_stream(...);
record_pipeline
    .chunks(500)  // Batch the work (your optimal size may vary)
    .for_each_concurrent(available_parallelism, |chunk| {
        // Clone your database connection pool or whatnot before `move`
        // Every app is different, but this is a pretty common pattern
        // for sqlx, Elastic Search, hyper, and more which use Arcs and cheap clones for pools.
        let db_pool = db_pool.clone();
        async move {
            // Process your records using a blocking threadpool
            let documents = tokio::task::spawn_blocking(move || {
                // Do the heavy work here!
                chunk
                    .into_iter()
                    .map(do_heavy_work)
                    .collect()
            })
            .await
            .expect("Problem spawning a blocking task");

            // Insert processesd data to your database
            db_pool.bulk_insert(documents).await.expect("You probably need an error handling strategy here...");
        }
    })
    .await;
```

We used the [`chunks`](https://docs.rs/futures/latest/futures/stream/trait.StreamExt.html#method.chunks)
adaptor to pull hundreds of items at a time for more efficient processing in batches.
Then, we used [`for_each_concurrent`](https://docs.rs/futures/latest/futures/stream/trait.StreamExt.html#method.for_each_concurrent)
in conjunction with [`spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html)
to introduce parallel processing.

Note that neither `chunks` nor even `for_each_concurrent` imply any amount of _parallelism_
on their own.
`spawn_blocking` is the only thing that can actually create a new thread of execution!
Chunking simply splits the work into batches (most workloads like this tend to benefit from batching).
And `for_each_concurrent` allows for _concurrent_ operations over multiple batches.
But `spawn_blocking` is what enables computation in a background thread.
If you don't use `spawn_blocking`,
you'll end up blocking Tokio's async workers,
and your performance will tank.
Just like the old Node.js code.

The astute reader may point out that using `spawn_blocking` like this
is not universally accepted as a solution.
Tokio is (relatively) optimized for non-blocking workloads, so some claim that you should avoid this pattern.
But my experience having done this for 5+ years in production code serving over 2 billion requests/month,
is that Tokio can be a great scheduler for heavier tasks too!

One thing that's often overlooked in these discussions
is that not all "long-running operations" are the same.
One category consists of graphics event loops,
long-running continuous computations,
or other things that may not have an obvious "end."
But some tasks *can* be expected to complete within some period of time,
that's longer than a blink.

In the case of the former ("long-lived" tasks), then spawning a dedicated thread often makes sense.
In the latter scenario though, Tokio tasks with `spawn_blocking` can be a great choice.

For our workload, we were doing a lot of the latter sort of operation.
One helpful rule of thumb I've seen is that if your task takes longer than tens of microseconds,
you should move it off the Tokio worker threads.
Using `chunks` and `spawn_blocking` avoids this death by a thousand cuts.
In our case, the parallelism resulted in a VERY clear speedup.

# Problem 2: Premature optimization rather than backpressure

The original data pipeline was very careful to not overload the data store.
Perhaps a bit too careful!
This may have been necessary at some point in the distant past,
but most data storage, from vanilla databases to multi-node clustered storage,
have some level of natural backpressure built-in.
The Node implementation was essentially limiting the amount of work in-flight that hadn't been flushed.

This premature optimization and the numerous micro-pauses it introduced
were another death by a thousand cuts problem.
Dropping the artificial limits approximately doubled throughput.
It turned out that our database was able to process 2-4x more records than under the previous implementation.

**TL;DR** &mdash; set a reasonable concurrency, let the server tell you when it's chugging (usually via slower response times),
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

In our data pipeline, I discovered a situation with humorous resemblance in retrospect.
The pipeline was set up using a microservice architecture,
which I'm sure souded like a good idea at the time,
but it introduced some truly obscene overhead.
All services involved were capable of working with data in the same format,
but the Node.js implementation was split into multiple services with HTTP and JSON round trips in the middle!
Double whammy!

The new data pipeline simply imports the "service" as a crate,
and gets rid of all the overhead by keeping everything in-process.
If you do really need to have a microservice architecture (ex: to scale another service up independently),
then other communication + data exchange formats may improve your performance.
But if it's possible to keep everything in-process, your overhead is roughly zero.
That's hard to beat!

# Conclusion

In the end, the new pipeline was 4x the speed of the old.
I happened to rewrite it in Rust, but Rust itself wasn't the source of all the speedups:
understanding the architecture was.
You could achieve similar results in Node.js or Python,
but Rust makes it significantly easy to reason about the architecture and correctness of your code.
This is especially important when it comes to parallelizing sections of a pipeline,
where Rust's type system will save you from the most common mistakes.

These and other non-performance-related reasons to use Rust will be the subject of a future blog post (or two).
