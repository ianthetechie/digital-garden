---
title: Conserving Memory while Streaming from DuckDB
tags:
- rust
- apache arrow
- parquet
- duckdb
- big data
- data engineering
date: 2024-12-31
---

In the weeks since my previous post on [Working with Arrow and DuckDB in Rust](working-with-arrow-and-duckdb-in-rust.md),
I've found a few gripes that I'd like to address.

# Memory usage of `query_arrow` and `stream_arrow`

In the previous post, I used the `query_arrow` API.
It's pretty straightforward and gives you iterator-compatible access to the query results.
However, there's one small problem: its memory consumption scales roughly linearly with your result set.

This isn't a problem for many uses of DuckDB, but if your datasets are in the tens or hundreds of gigabytes
and you're wanting to process a large number of rows, the RAM requirements can be excessive.
The memory profile of `query_arrow` seems to be "create all of the `RecordBatch`es upfront
and keep them around for as long as you hold the `Arrow` handle.

> [!note] Disclaimer
> I have **not** done extensive allocation-level memory profiling as of this writing.
> It's quite possible that I've missed something, but this seems to be what's happening
> from watching Activity Monitor.
> Please let me know if I've misrepresented anything!

Fortunately, DuckDB also has another API: [`stream_arrow`](https://docs.rs/duckdb/latest/duckdb/struct.Statement.html#method.stream_arrow).
This appears to allocate `RecordBatch`es on demand rather than all at once.
There is also some overhead, which I'll revisit later that varies with result size.
But overall, profiling indicates that `stream_arrow` requires significantly less RAM over the life of a large `Arrow` iterator.

Unfortunately, none of the above information about memory consumption appears to be documented,
and there are no (serious) code samples demonstrating the use of `stream_arrow`!

> [!question] Down the rabbit hole...
> Digging into the code in duckdb-rs raises even more questions,
> since several underlying C functions, like [`duckdb_execute_prepared_streaming`](https://duckdb.org/docs/api/c/api.html#duckdb_execute_prepared_streaming)
> are marked as deprecated.
> Presumably, alternatives are being developed or the methods are just not stable yet.

# Getting a `SchemaRef`

The signature of `stream_arrow` is a bit different from that of `query_arrow`.
Here's what it looks like as of crate version 1.1.1:

```rust
pub fn stream_arrow<P: Params>(
    &mut self,
    params: P,
    schema: SchemaRef,
) -> Result<ArrowStream<'_>>
```

This looks pretty familiar at first if you've used `query_arrow`,
but there's a new third parameter: `schema`.
`SchemaRef` is just a type alias for `Arc<Schema>`.
Arrow objects have a schema associated with them,
so this is a reasonable detail for a low-level API.
But DuckDB is fine at inferring this when needed!
Surely there is a way of getting it from a query, right?
(After all, `query_arrow` has to do something similar, but doesn't burden the caller.)

My first attempt at getting a `Schema` object was to call the [`schema()`](https://docs.rs/duckdb/latest/duckdb/struct.Statement.html#method.schema) method on `Statement`.
The `Statement` type in duckdb-rs is actually a high-level wrapper around `RawStatement`,
and at the time of this writing, the schema getter [hides an `unwrap`](https://github.com/duckdb/duckdb-rs/blob/2bd811e7b1b7398c4f461de4de263e629572dc90/crates/duckdb/src/raw_statement.rs#L212).
The docs do tell you this (using a somewhat nonstandard heading?),
but basically you can't get a schema without executing a query.
I wish they used the [Typestate pattern](https://cliffle.com/blog/rust-typestate/)
or at least made the result an `Option`, but alas...

This leaves developers with three options.

1. Construct the schema manually.
2. Construct a different `Statement` that is the same SQL, but with a `LIMIT 0` clause at the end.
3. Execute the statement, but don't load all the results into RAM.

## Manually construct a Schema?

Manually constructing the schema is a non-starter for me.
A program which has a hand-written code dependency on a SQL string is a terrible idea
on several levels.
Besides, DuckDB clearly _can_ infer the schema in `query_arrow`, so why not here?

## Query another, nearly identical statement

The second idea is, amusingly, what ChatGPT o1 suggested (after half a dozen prompts;
it seems like it will just confidently refuse to fetch documentation now,
and hallucinates new APIs based off its outdated training data).
The basic idea is to add `LIMIT 0` to the end of the original query
so it's able to get the schema, but doesn't actually return any results.

```rust
fn fetch_schema_for_query(db: &Connection, sql: &str) -> duckdb::Result<SchemaRef> {
    // Append "LIMIT 0" to the original query, so we don't actually fetch anything
    // NB: This does NOT handle cases such as the original query ending in a semicolon!
    let schema_sql = format!("{} LIMIT 0", sql);

    let mut statement = db.prepare(&schema_sql)?;
    let arrow_result = statement.query_arrow([])?;

    Ok(arrow_result.get_schema())
}
```

There is nothing fundamentally unsound about this approach.
But it requires string manipulation, which is less than ideal.
There is also at least one obvious edge case.

## Execute the stamement without loading all results first

The third option is not as straightforward as I expected it to be.
At first, I tried the `row_count` method,
but internally this [just calls a single FFI function](https://github.com/duckdb/duckdb-rs/blob/2bd811e7b1b7398c4f461de4de263e629572dc90/crates/duckdb/src/raw_statement.rs#L79).
This doesn't actually update the internal `schema` field.
You really _do_ need to run through a more "normal" execution path.

A solution that _seems_ reasonably clean is to do what the docs say and call `stmt.execute()`.
It's a bit strange to do this on a `SELECT` query to be honest,
but the API does indeed internally mutate the `Schema` property,
_and_ returns a row count.
So it seems semantically equivalent to a `SELECT COUNT(*) FROM (...)`
(and in my case, getting the row count was helpful too).

In my testing, it _appears_ that this may actually allocate a non-trivial amount of memory,
which may be mildly surprising.
However, the max amount of memory we require during execution is definitely less overall.
Any ideas why this is?

# Full example using `stream_arrow`

Let's bring what we've learned into a "real" example.

```rust
// let sql = "SELECT * FROM table;";
let mut stmt = conn.prepare(sql)?;
// Execute the query (so we have a usable schema)
let size = stmt.execute([])?;
// Now we run the "real" query using `stream_arrow`.
// This returned in a few hundred milliseconds for my dataset.
let mut arrow = stmt.stream_arrow([], stmt.schema())?;
// Iterate over arrow...
```

When you structure your code like this rather than using the easier `query_arrow`,
you can significantly reduce your memory footprint for large datasets.
In my testing, there was no appreciable impact on performance.

# Open Questions

The above leaves me with a few open questions.
First, with my use case (a dataset of around 12GB of Parquet files), `execute` took several _seconds_.
The "real" `stream_arrow` query took a few hundred milliseconds.
What's going on here?
Perhaps it's doing a scan and/or caching some data initially the way to make subsequent queries faster?

Additionally, the memory profile does have a "spike" which makes me wonder what exactly each step loads into RAM,
and thus, the memory requirements for working with extremely large datasets.
In my testing, adding a `WHERE` clause that significantly reduces the result set
DOES reduce the memory footprint.
That's somewhat worrying to me, since it implies there is still measurable overhead
proportional to the dataset size.
What practical limits does this impose on dataset size?

> [!note]
> An astute reader may be asking whether the memory profile of the `LIMIT 0` and `execute` approaches are equivalent.
> The answer appears to be yes.

I've [opened issue #418](https://github.com/duckdb/duckdb-rs/issues/418)
asking for clarification.
If any readers have any insights, post them in the issue thread!
