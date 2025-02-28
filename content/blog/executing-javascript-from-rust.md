---
title: Executing JavaScript from Rust
tags:
- rust
- javascript
- v8
- wasm
# date: 2025-02-25
draft: true
---

In this post, we'll explore a ways to run JavaScript code from Rust.
Your first reaction may be "why would you want to do that?"
There are a at least two reasons that I'm aware of:

- You have some code written in JavaScript that you're not going to rewrite yet
- You want to offer a plugin API with dynamic loading and strong sandboxing

My own use case was the former, but the first one actually hints at a possible solution.

# Approaches considered

Let's assume for a moment that "rewrite it in Rust" isn't an option.
Sometimes it's just not worth the time/effort to port code, and that's actually OK!

## Call the code via an API request (REST, gRPC, etc.)

The first option that many arrive at is to simply run the code in Node.js, Deno, or a similar runtime,
wrap it in a web server using your favorite server-side JS framework, and call it a day.
This is a great option if you have a relatively "pure" input+output process,
especially if the code you  want to use already comes with such a wrapper.

But there are some tradeoffs to to this.
First, anything involving a network call introduces risks to system stability and resilience.
This isn't always an issue, but it's a notable tradeoff that "microservice" architecture designs need to account for.
Second, this introduces latency in your app.
Even when running on a single physical computer,
the added latency is not zero and, depending on your application,
it could even be in the 1ms or more range after accounting for serialization+deserialization (serde)
round trips.

## Embed a JavaScript runtime

Embedding a JavaScript runtime in your Rust project is probably the next most obvious approach.
This isn't to say it's a matter of adding a crate and 3 lines of code though.
JavaScript runtimes require a fair bit of setup,
are typically written in C++ (which introduces its own complications),
and are relatively large to build.
And the icing on the cake is that there are multiple runtimes to choose from!

In spite of all this,
embedding a JavaScript runtime will eliminate network latency
and (if done correctly) improve the overall robustness of the application
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
You write in a language like Rust or C++ which, is (eventually) translated to some binary format which your CPU understands.

WASM is a similar idea, except that instead of targeting a phycical CPU, it targets a virtual one.
It's a portable binary format if you will.
If you're getting some JVM vibes here, you're not the only one!
For an in-depth dive into the differences,
I highly recommend [Chris Dickinson's three-part deep dive](https://www.neversaw.us/2023/05/10/understanding-wasm/part1/virtualization/).
Some quick hits from me though:

* WASM is not a heavy and complex sort of VM like the JVM with JIT and so on; it's a simple stack-based model
* WASM is explicitly designed as a language-neutral target, whereas Java bytecode is relatively Java-specific

I'll skip over a _lot_ of details, but the promise of WASM is that you get to write code once,
in a high level language, and it will be executable on any other machine with a WASM runtime.
The code itself is architecture-independent, so the runtime typically compiles this on the fly to native machine code.
This allows for things like SIMD, but

### What is a WASM component?
