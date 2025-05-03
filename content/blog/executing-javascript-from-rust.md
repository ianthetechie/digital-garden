---
title: Executing JavaScript from Rust
tags:
- rust
- javascript
- v8
- wasm
date: 2025-04-05
draft: true
---

In this post, we'll explore a ways to run JavaScript code from Rust.
If your first reaction may be "why would you want to do that?"
then your skepticism is not unfounded,
but there are at least two reasons that I'm aware of:

- You have some code written in JavaScript that you're not going to rewrite yet
- You want to offer a plugin API with dynamic loading and strong sandboxing

My own use case was the former.

# Approaches considered

## Call the code via an API request (REST, gRPC, etc.)

The first option that many arrive at is to simply run the code in Node.js, Deno, or a similar runtime,
wrap it in a web server using your favorite server-side JS framework, and call it a day.
This is a reasonable option if you have a relatively "pure" input+output process,
especially if the code you  want to use already comes with such a wrapper.

But there are some tradeoffs to consider.
First, anything involving a network call introduces risks to system stability and resilience.
This isn't always an issue, but it's a notable tradeoff that "microservice" architecture designs need to account for.
Second, this introduces latency in your app.
Even when running on a single physical box,
the added latency is not zero.
I was seeing low single digit milliseconds.

## Embed a JavaScript runtime

Embedding a JavaScript runtime in your Rust project is probably the next most obvious approach.
This isn't to say it's a matter of adding a crate and 3 lines of code though.
JavaScript runtimes require a fair bit of setup,
are typically written in C++ (which introduces its own complications),
and introduce a non-trivial build step.

On the plus side,
embedding a JavaScript runtime will eliminate network latency
and improve the overall robustness of the application
since it can run in a single process.

## Convert it to a WebAssembly component

Finally, and decidedly most unconventional, the code could be converted to WebAssembly components.
There is a fairly good chance you don't know what a WASM component is, or why you should care,
so I'll give a brief overview.

### What is WebAssembly?

WebAssembly (WASM) is, in my opinion, one of the worst named technologies in recent history.
For me, something that's "web" usually sounds like it's confined to the likes of web browsers.
And similarly, WebAssembly probably sounds like assembly code for... a web browser?

That's not entirely wrong.
WASM is an instruction format for a virtual machine that's most commonly run in a web browser.
But it's a bit more than meets the eye.
You probably don't write, say, armv8 assembly on a daily basis.
You write in a language like Rust or C++
which is (eventually) translated to some binary format which your CPU understands.

WASM is a similar idea, except that instead of targeting a phycical CPU, it targets a virtual one.
It's a portable binary format if you will.
If you're getting some JVM vibes here, you're not the only one!
For an in-depth dive into the differences,
I highly recommend [Chris Dickinson's three-part series](https://www.neversaw.us/2023/05/10/understanding-wasm/part1/virtualization/).
Some quick hits from me though:

* WASM is not a heavy and complex sort of VM like the JVM with JIT and so on; it's a simple stack-based model
* WASM is explicitly designed as a language-neutral target, whereas Java bytecode is relatively Java-specific

I'll skip over a _lot_ of details, but the promise of WASM is that you get to write code once,
in a high level language, and it will be executable on any other machine with a WASM runtime.
The code itself is architecture-independent, so the runtime typically compiles this on the fly to native machine code.
This allows for "nice things" like SIMD support, and (coming soon I think) multi-threading.

TL;DR, you can get the sandboxing benefits, of JavaScript,
performance somewhere in between JS and Rust,
and _write code in almost any higher level language_.

# First attempt: componentize it with `jco`

To say I'm bullish on the theory behind WebAssembly is an understatement.
So I was pretty stoked to have an excuse to try out a new tool in the ecosystem: `jco`,
which lets you compile a JavaScript module into a WebAssembly component.

Unfortunately I [hit a few snags](https://github.com/bytecodealliance/jco/issues/568) along the way.
Converting JavaScript to WASM has a few rough edges at the moment.
I'll revisit this in the future, since I truly believe the tech has promise,
and to be honest, I think my particular use case, which involved bringing a whopping 6 MB of *minified*
JS source code is a bit more than the fledgeling ecosystem is designed to handle.
JS is... yeah...

But in the meantime I wanted to share one factoid:
For my particular use case, **I found that the overhead of spawning a V8 isolate
was really high.
Like on the order of 100ms.**
A WASM component was significantly lower, even though there were other issues.

# Second attempt: `mozjs`? Or is it SpiderMonkey?

I had heard good things about Mozilla developing a JavaScript runtime that was fairly accessible from Rust.
However, I hit a few bumps along the way.

# Third attempt: `rusty-v8`

The approach I settled on was to use `rusty-v8`,
Rust bindings for the V8 engine maintained by Deno.
You could probably skip the rest of this blog post an just read [this other one by William Henderson](https://whenderson.dev/blog/embedding-v8-in-rust/).
But since you're here...

My `lib.rs` was pretty simple.
Around 250 lines of regular code,
plus another 2,000 lines of tests (ported mechanically from the JS library) for good measure.

At a high level, here's what I came up with:

* `std::sync::Once` to initialize v8, just as in William's post
* A `thread_local` isolate
* Message passing with `tokio::sync::mpsc::channel`

Spinning up a new Isolate for each thread / operation isn't feasible, so we chose to use a single isolate
and use message passing to get pretty good performance with a single instance.
Here's the rough structure:

```rust
use v8::script_compiler::Source;
use v8::{ContextOptions, ScriptOrigin};
use std::cell::RefCell;
use std::sync::Once;
use std::thread;
use tokio::sync::{mpsc, oneshot};


/// Ensures that V8 is initialised exactly once.
static INIT: Once = Once::new();

static ES_MODULE_TEXT: &str = include_str!("mylib.bundled.js");

thread_local! {
    static ISOLATE: RefCell<v8::OwnedIsolate> = RefCell::new(v8::Isolate::new(Default::default()));
}

// Application-specific types...
type Message = ...;
type Result = ...;

#[derive(Debug, Clone)]
pub struct JSBridge {
    sender: mpsc::Sender<ParseMessage>,
}

impl JSBridge {
    pub async fn try_init() -> anyhow::Result<Self> {
        // Global one-time init for v8
        INIT.call_once(|| {
            v8::V8::initialize_platform(v8::new_default_platform(0, false).make_shared());
            v8::V8::initialize();
        });

        // V8 isolates are *not* thread-safe!
        // So, we use channels to communicate back and forth with it via a dedicated thread
        // The cold start overhead of a V8 isolate is on the order of 130 milliseconds,
        // which is obviously unacceptable, so we have to just use one (or maybe a pool of) isolate(s).
        let (sender, receiver) = mpsc::channel(100);

        // Spawn an isolate.
        // Note: with an mpmc channel (i.e. crossbeam), we could technically spawn multiple isolates.
        spawn_parser_isolate(receiver);

        // Since initialization happens in another thread, we need to check that it actually completed.
        // We do this by sending an initial message and ensuring we get a non-error response back.
        let (tx, rx) = oneshot::channel();
        sender
            .send(("Some Text".to_string(), true, tx))
            .await?;
        rx.await??;

        Ok(Self { sender })
    }

    pub async fn exec(
        &self,
        text: String,
    ) -> Result {
        let (tx, rx) = oneshot::channel();
        self.sender
            .send((text, tx))
            .await?;

        rx.await?
    }
}

fn spawn_parser_isolate(mut receiver: mpsc::Receiver<Message>) {
    // Spawn a dedicated thread and initialize the Isolate with the module code
    // Heavily inspired by https://whenderson.dev/blog/embedding-v8-in-rust/
    thread::spawn(move || {
        // NOTE: ISOLATE is guaranteed to be thread-local
        ISOLATE.with(|isolate| {
            let mut isolate = isolate.borrow_mut();

            // Set up scopes
            let handle_scope = &mut v8::HandleScope::new(&mut *isolate);
            let context = v8::Context::new(handle_scope, ContextOptions::default());
            let scope = &mut v8::ContextScope::new(handle_scope, context);

            // Convert the script source text into the appropriate V8 internal representation
            let name: v8::Local<'_, v8::Value> = v8::String::new(scope, "mylib.js")
                .expect("Failed string conversion (name)")
                .into();
            let code =
                v8::String::new(scope, ES_MODULE_TEXT).expect("Failed string conversion (code)");
            let origin =
                ScriptOrigin::new(scope, name, 0, 0, false, 0, None, false, false, true, None);
            let mut source = Source::new(code, Some(&origin));

            // Compile the module
            let module = v8::script_compiler::compile_module(scope, &mut source)
                .expect("Unable to compile module");
            module
                .instantiate_module(scope, |_, _, _, m| Some(m))
                .expect("Error instantiating module");
            module.evaluate(scope).expect("Error evaluating module");

            // TODO: Figure out how to efficiently extract object fields; for now we use JSON
            let parse_fn_name = "parse_to_json";
            let key = v8::String::new(scope, parse_fn_name)
                .expect("Failed string conversion (parse_to_json)");
            let function_obj = module
                .get_module_namespace()
                .to_object(scope)
                .unwrap()
                .get(scope, key.into())
                .expect("Failed to get export");

            let function = v8::Local::<v8::Function>::try_from(function_obj)
                .expect("Unable to cast to function object");

            while let Some((text, trailing_numerics_are_complete, tx)) = receiver.blocking_recv() {
                let Some(input) = v8::String::new(scope, &text) else {
                    if tx.send(Err(ParseError::InputTooLong)).is_err() {
                        error!("Unable to send parse response (V8 error; input too long); the other channel hung up");
                    }
                    return;
                };

                let result = match function.call(scope, function_obj, &[input.into()]) {
                    Some(result) => {
                        if !result.is_undefined() {
                            let json_result = result.to_rust_string_lossy(scope);
                            serde_json::from_str::<ParsedAddressComponents>(&json_result)
                                .map_err(|_| ParseError::ParserDeserializationError)
                                .and_then(|comps| {
                                    tokenize(text, &comps, trailing_numerics_are_complete).map(|tokens| (comps, tokens))
                                })
                        } else {
                            Err(ParseError::UndefinedOrNullParseResult)
                        }
                    }
                    None => Err(ParseError::UndefinedOrNullParseResult),
                };
                if tx.send(result).is_err() {
                    warn!("Unable to send parse response; the other channel hung up");
                }
            }
        })
    });
}
```
