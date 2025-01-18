---
title: Databases as an Alternative to Application Logging
date: 2025-01-13
tags:
- software-engineering
- duckdb
- databases
- rust
---

In my [work](https://stadiamaps.com/), I've been doing a lot of ETL pipeline design recently for our geocoding system.
The system processes on the order of a billion records per job,
and failures are part of the process.
We want to log these.

Most applications start by dumping logs to `stderr`.
Until they overflow their terminal scrollback buffer.
The next step is usually text files.
But getting insights from 10k+ of lines of text with `grep` is a chore.
It may even be impossible unless you've taken extra care with how your logs are formatted.

In this post we'll explore some approcahes to do application logging better.

# Structured logging

My first introduction to logs with a structural element was probably Logcat for Android.
Logcat lets you filter the fire hose of Android logs down to a specific application,
and can even refine the scope further if you learn how to use it.
Logcat is a useful tool, but fundamentally all it can do is *filter* logs from a stream
and it has most of the same drawbacks as grepping plain text files.

Larger systems often benefit from something like the `tracing` crate,
which integrates with services like `journald` and Grafana Loki.
This is a great fit for a long-running *service*,
but is total overkill for an application that does some important stuff &trade;
and exits.
Like our ETL pipeline example.

(Aside: I have a love/hate relationship with `journalctl`.
I mostly interact with it through Ctrl+R in my shell history,
which is problemating when connecting to a new server.
But it does have the benefit of being a nearly ubiquitous local structured logging system!)

# Databases for application logs

Using a database as an application log can be a brilliant level up for many applications
because you can actually *query* your logs with ease.
I'll give a few examples, and then show some crazy cool stuff you can do with that.

One type of failure we frequently encounter is metadata that looks like a URL where it shouldn't be.
For example, the name of a shop being `http://spam.example.com/`,
or having a URL in an address or phone number field.
In this case, we usually drop the record, but we also want to log it so we can clean up the source data.
Some other common failures are missing required fields, data in the wrong format, and the like.

## A good schema enables analytics

Rather than logging these to `stderr` or some plain text files, we write to a DuckDB database.
This has a few benefits beyond the obvious.
First, using a database forces you to come up with a schema.
And just like using a language with types, this forces you to clarify your thinking a bit upfront.
In our case, we log things like the original data source, an ID, a log level (warn, error, info, etc.),
a failure code, and additional details.

From here, we can do meaningufl *analytical* queries like
"how many records were dropped due to invalid geographic coordinates"
or "how many records were rejected due to metadata mismatches"
(ex: claiming to be a US address but appearing in North Korea).

If this query uncovers a lot of rejected records from one data source,
wouldn't it be nice if we could look at a sample?
We have the IDs right there in the log, and the data source identifier, after all.
But since we're in DuckDB rather than a plain text file,
we can pretty much effortlessly join on the data files!
(This assumes that your data is in some halfway sane format like JSON, CSV, Parquet, or even another database).

We can even take this one step further and compare logs across imports!
What's up with that spike in errors compared to last month's release from that data source?

These are the sort of insights which are almost trivial to uncover when your log is a database.

# Practical bits

Now that I've described all the awesome things you can do,
let's get down to the practical questions like how you'd do this in your app.
My goals for the code were to make it easy to use and impossible to get wrong at the use site.
Fortunately that's pretty easy in Rust!

```rust
#[derive(Clone)]
pub struct ImportLogger {
    pool: Pool<DuckdbConnectionManager>,
    // Implementation detail for our case: we have multiple ETL importers that share code AND logs.
    // If you have any such attributes that will remain fixed over the life of a logger instance,
    // consider storing them as struct fields so each event is easier to log.
    importer_name: String,
}
```

Pretty standard struct setup using DuckDB and [`r2d2`](https://github.com/sfackler/r2d2) for connection pooling.
We put this in a shared logging crate in a workspace containing multiple importers.
The `importer_name` is a field that will get emitted with every log,
and doesn't change for a logger instance.
If your logging has any such attributes (ex: a component name),
storing them as struct fields makes each log invocation easier!

> [!note]
> At the time of this writing, I couldn't find any async connection pool integrations for DuckDB.
> If anyone knows of one (or wants to add it to [`bb8`](https://github.com/djc/bb8)), let me know!

```rust
pub fn new(config: ImportLogConfig, importer_name: String) -> anyhow::Result<ImportLogger> {
    let manager = DuckdbConnectionManager::file(config.import_log_path)?;
    let pool = Pool::new(manager)?;

    pool.get()?.execute_batch(include_str!("schema.sql"))?;

    Ok(Self {
        pool,
        importer_name,
    })
}
```

The constructor isn't anything special; it sets up a DuckDB connection to a file-backed database
based on our configuration.
It also initializes the schema from a file.
The schema file lives in the source tree, but the lovely [`include_str!`](https://doc.rust-lang.org/std/macro.include_str.html)
macro bakes it into a static string at compile time (so we can still distribute a single binary).

```rust
pub fn log(&self, level: Level, source: &str, id: Option<&str>, code: &str, reason: &str) {
    log::log!(level, "{code}\t{source}\t{id:?}\t{reason}");
    let conn = match self.pool.get() {
        Ok(conn) => conn,
        Err(e) => {
            log::error!("failed to get connection: {}", e);
            return;
        }
    };
    match conn.execute(
        "INSERT INTO logs VALUES (current_timestamp, ?, ?, ?, ?, ?, ?)",
        params![level.as_str(), self.importer_name, source, id, code, reason],
    ) {
        Ok(_) => (),
        Err(e) => log::error!("Failed to insert log entry: {}", e),
    }
}
```

And now the meat of the logging!
The `log` method does what you'd expect.
The signature is a reflection of the schema:
what you need to log, what you may optionally log, and what type of data you're logging.

For our use case, we decided to additionally log via the `log` crate.
This way, we can see critical errors on the console to as the job is running.

And that's pretty much it!
It took significantly more time to write this post than to actually write the code.
Someone could probably write a macro-based crate to generate these sorts of loggers if they had some spare time ;)

## Bonus: `filter_log`

We have a pretty common pattern in our codebase,
where most operations / pipeline stages yield results,
and we want to chain these together.
When it succeeds, we pass the result on to the next stage.
Otherwise, we want to log what went wrong.

We called this `filter_log` because it usually shows up in `filter_map` over streams
and as such yields an `Option<T>`.

This was extremely easy to add to our logging struct,
and saves loads of boilerplate!

```rust
/// Converts a result to an option, logging the failure if the result is an `Err` variant.
pub fn filter_log<T, E: Debug>(
    &self,
    level: Level,
    source: &str,
    id: Option<&str>,
    code: &str,
    result: Result<T, E>,
) -> Option<T> {
    match result {
        Ok(result) => Some(result),
        Err(err) => {
            self.log(level, source, id, code, &format!("{:?}", err));
            None
        }
    }
}
```

# Conclusion

The concept of logging to a database is not at all original with me
Many enterprise services log extensively to special database tables.
But I think the technique is rarely applied to applications.

Hopefully this post convinced you to give it a try in the next situation where it makes sense.
