---
title: How (and why) to work with Arrow and DuckDB in Rust
tags:
- rust
- apache arrow
- parquet
- duckdb
- big data
- data engineering
- gis
date: 2024-12-08
---

My day job involves wrangling a lot of data very fast.
I've heard a lot of people raving about several technologies like DuckDB,
(Geo)Parquet, and Apache Arrow recently.
But despite being an "early adopter,"
it took me quite a while to figure out how and why to leverage these practiclaly.

Last week, something "clicked" for me, so I'd like to share what I learned in case it helps you.

# (Geo)Parquet

This is quite possibly the least surprising discovery, so let's start off easy.
(Geo)Parquet is not exactly new.
Parquet has been around for quite a while in the big data ecosystem.
If you need a refresher, the [Cloud-optimized Geospatial Formats Guide](https://guide.cloudnativegeo.org/geoparquet/)
gives a great high-level overview.

Here are the stand-out features:

* It has a schema and some data types, unlike CSV (you can even have maps and lists!).
* It's column-oriented, which means GREAT compression.
* It has statistics which enable "predicate pushdown." Even though the files are columnar in nature,
  you can narrow which files and "row groups" have the data you need.

The big picure idea is that you can distribute large datasets in _one or more_ files
which will be significantly _smaller and faster to query_ than other familiar formats.

## Why you should care

The value proposition is crystal clear for most big data use cases.
If you're trying to get a record of all traffic accidents in California,
or find the hottest restaurants in Paris based on a multi-terabyte dataset,
it's an obvious win.
You can skip row groups within the parquet file or even whole files!

But what if you're doing anything besides this high-level analytical sort of thing?
This wasn't immediately clear to me, but Parquet has become a standard interchange format in recent years
for some good reasons.

* Column-level compression is really nice; it lets you process much larger datasets from your laptop.
* You actually have a schema! This means less format shifting and validation!
* Operating on row groups turns out to be pretty efficient.
  Combined with the above, your processing code will get simpler and faster.
* It's designed to be read from object storage, and implementations acknowledege this.

The upshot of all this is that it generally gets both _easier_ and _faster_
to work with your data!
I understood this intuitively for the "analytical" use case.
But I couldn't fully appreciate it for my more typical use case (consuming whole datasets)
until I had the right tools to leverage it.
That changed when I realized how I could leverage DuckDB.

# DuckDB

DuckDB describes itself as an in-process, portable, feature-rich, and fast database
for analytical workloads.
DuckDB was that tool that triggered my "lightbulb moment" last week.
Foursquare, an app which I've used for a decade or more,
recently released an [open data set](https://location.foursquare.com/resources/blog/products/foursquare-open-source-places-a-new-foundational-dataset-for-the-geospatial-community/),
which was pretty cool!
It was also in Parquet format (just like [Overture](https://overturemaps.org/)'s data sets).

You can't just open up a Parquet file in a text editor or spreadsheet software like you can a CSV.
My friend Oliver released a [web-based demo](https://wipfli.github.io/foursquare-os-places-pmtiles/)
a few weeks ago which was akin to an inpectable point cloud,
but I had a few other types of queries I wanted to do as well.

DuckDB provided the tools to get started quickly,
but turned out to be even more useful than I expected.

## Why you should care

### It's embedded

I understood the in-process part of DuckDB's value proposition right away.
Think SQLite, where you don't have to go through a server
or over an HTTP connection.
This is both simpler to reason about and [can be quite a bit faster, even locally](quadrupling-the-performance-of-a-data-pipeline.md)!

Similarly, the portable part makes sense.
They describe themselves as dependency-free (which really means they vendor some things.
I'll leave it up to you to decide whether this is good or bad, but it's a widespread practice).
In fact, for my use case, I decided to build it locally.
That took only a minute or two on my laptop (an M1 Max MBP).
The Rust crate has a helpful flag for this which, if you don't set,
will look for a shared library.
Strangely, even after a `brew` install, that didn't work.
Minor annoyances aside,
having a vendored library actually makes things like consistent Docker builds easier!

### Features galore!

I did not fully appreciate previously just how feature-rich and fast DuckDB is.
It has pretty much the kitchen sink thrown in.
You can query a whole directory (or bucket) of CSV files,
a Postgres database, SQLite, or even an OpenStreetMap PBF file 🤯
It's kind of nuts how much of a Swiss Army Knife DuckDB is.
And the fact that it's in-process via a library means that
**you can deeply integrate it into regular programs**.

DuckDB literally lets you write a SQL query against a glob expression of Parquet files in S3
as your "table."
**That's really cool!**

### Speed

Writing a query against a local directory of files is actually really fast!
It does a bit of munging upfront, and yes,
it's not quite as fast as if you'd prepped the data into a clean table,
but you actually can run quite efficient queries this way locally!

When running a query against local data,
DuckDB will make liberal use of your system memory
(the default is 80% of system RAM)
and as many CPUs as you can throw at it.
But it will reward you with excellent response times,
courtesy of the "vectorized" query engine.
What I've heard of the design reminds me of how array-oriented programming languages like APL
(or less esoteric libraries like numpy) are often implemented.

Not to bury a teaser halfway through the post,
but I was able to do some spatial aggregation operations
(bucketing a filtered list of locations by H3 index)
in about **10 seconds on a dataset of more than 40 million rows**!
That piqued my interest, to say the least.
(Here's the result of that query, visualized).

![A map of the world showing heavy density in the US, southern Canada, central Mexico, parts of coastal South America, Europe, Korea, Japan, parts of SE Aaia, and Australia](images/foursquare-os-places-density-2024.png)

### Bridging local and cloud

In case you haven't got the memo yet, "cloud" doesn't mean "faster."
In fact, in many cases, it's actually _significantly_ slower than running workloads locally.
But what it does do is let you optimize for constraints.
Your laptop has limited storage, and upgrading is annoying and expensive.
If you can run something within those limits, it will often be faster if you have a modern laptop.

With the cloud, you can access practically infinite storage.
The cost is latency and throughput.
But if you can afford that / you don't have the space locally,
DuckDB will let you query parquet (or whatever) from an S3 bucket,
which is kind of nuts!
This lets you perform aggregations via your laptop on multi-terabyte datasets.
And you don't have to spin up a whole "big data"
processing cluster or have terabytes of local storage!

### That analytical thing...

And now for the final buzzword in DuckDB's marketing: analytical.
DuckDB frquently describes itself as optimized for OLAP (OnLine Analytical Processing) workloads.
This is contrasted with OLTP (OnLine Transaction Processing).
[Wikipedia](https://en.wikipedia.org/wiki/Online_analytical_processing) will tell you some differences
in a lot of sweepingly broad terms, like being used for "business reporting" and read operations
rather than "transactions."
Wikipedia and many other sources also focus on things like _aggregation_ rather than returning single rows.
The DuckDB marketing is not super helpful in clarifying.

This put me off a bit to be honest (as does a lot of "marketing" speak),
as it doesn't tell me very much useful for my case.
I need to process a LOT of individual rows!
I really don't care about the aggregates for most of my workloads.
Is an OLAP daabase right for me?

Let me know on Mastodon if you have a good answer 🤣
So far, DuckDB has been excellent at iterating over datasets in the tens of millions of rows.
I assume it's maybe not the best choice per se if you want to do tens of thousands of inserts per second?
But the extend to which it has been optimized / is poorly suited for certain workloads is still unclear to me.

## Embedded, revisitied

At this point, we need to revisit the topic of how DuckDB is embedded in your process,
just like SQLite.
This is a superpower, because languages like Python and Rust
don't have primitives for expressing things like joins across datasets
from 3 different sources built-in.
DuckDB, like most database systems, does!

Yes, I _could_ write some code using the `parquet` crate
that wolud filter across a nested directory tree of 5,000 files.
But DuckDB does that out of the box!
Using DuckDB's Rust API enabled the above visualization,
which is a mix of low-level analysis, format-shifting the results to a JSON file,
and rendering using [MapLibre](https://maplibre.org/),
All served up by an Axum web server,
so we get a _single binary_ that does the analysis, visualization, and presentation together.

But before I get too carried away with delight over how well it works,
let's talk about how we bring it all together: Apache Arrow.


# Apache Arrow

[Apache Arrow](https://arrow.apache.org/) is a _language-independent memory format_
that's _optimized for efficient analytic operations_ on modern CPUs and GPUs.
Among its other features, it's designed to support zero-copy reads.
This sounds kind of boring, but it's a _huge_ deal for performance,
and I'll probably blog about it at some point.
Beyond simply "not copying," there is a whole ecosystem of libraries which understand the Arrow memory format.

The core idea is that, rather than having to convert data from one format to another (this implies copying!),
Arrow defines as shared memory format which many systems understand.
In practice, this ends up being a bunch of standards which define common representations for different types,
and libraries for working with them.
For example, the [GeoArrow](https://geoarrow.org/) spec
builds on the Arrow ecosystem to enable operations on spatial data in a common memory format.
Pretty cool!

## How the heck do I use it?

The [DuckDB crate](https://docs.rs/duckdb/latest/duckdb/)
includes an [Arrow API](https://docs.rs/duckdb/latest/duckdb/struct.Statement.html#method.query_arrow)
which will give you an iterator over `RecordBatch`es.
But the Arrow ecosystem has, at least in the Rust ecosystem, rather obtuse APIs.

I'm an early adopter of many technologies,
but I have to admit I had a _really_ hard time figuring out how I'd ever get started with Arrow.
But after discovering what I could do with DuckDB,
I really wanted to figure out how to leverage that power _efficiently_
within my code, and without compromising performance.


[`serde_arrow`](https://docs.rs/serde_arrow/) provided a convenient solution.
It builds on the `serde` ecosystem with easy-to-use methods that operate on `RecordBatch`es.
I was initilaly worried about how performant it would be,
but the rotation from columns to rows turns out to be a pretty performant operation over large batches!
This enables Rust code like the following:

```rust
serde_arrow::from_record_batch::<Vec<FoursquarePlaceRecord>>(&batch)
```

A few combinators later and you've got a proper data pipeline!

# Review: what this enables

What this ultimately enabled for me was being able to get a lot closer to "scripting"
a pipeline in Rust.
Most people turn to Python or JavaScript for tasks like this,
but Rust has something to add: strong typing and all the related guarantees that only come with some level of formalism.
But that doesn't necessarily have to get in the way of productivity.

[`serde`](https://docs.rs/serde/latest/), for example, provides ways of handling serialization and deserialization
via macros which are both ergonimic and performant.
It's also quite possible to write zero-copy code in Rust these days which retains most of the good parts of both worlds.

[`serde_arrow`](https://docs.rs/serde_arrow/) and [`duckdb`](https://docs.rs/duckdb/) combined will give superpowers to your data pipelines.
And in fact, they unlock something like a scripting flow in Rust.
SQL, regular expressions, and other DSLs let you concisely (and sometimes easily)
express logic that would otherwise span thousands of lines of code.
And it doesn't have to be slow.
