---
title: Even Safer Rust with Miri
date: 2026-01-07
tags:
- rust
- software-reliability
---

Recently some of the Miri contributors published a [paper that was accepted to POPL](https://plf.inf.ethz.ch/research/popl26-miri.html).
I've been using Rust professionally for about 7 years now,
and while I'd _heard of_ Miri several times over the years,
I think there's a wide lack of knowledge about what it does, and why anyone should care.
I only recently started using it myself, so I'm writing this post to share
what Miri is, why you should care, and how you can get started easily.

# What is Miri?

Miri is an interpreter for Rust's mid-level intermediate representation (MIR; hence the acronym).
That's how I first remember seeing it described years ago,
and that's what the GitHub project description still says.

The latest README is a bit more helpful though: it's a tool for detecting _undefined behavior_ (UB) in Rust code.
In other words, it helps you identify code that's unsafe or unsound.
While it would be a bug to hit such behaviors in safe Rust,
if you're using `unsafe` (or any of your dependency chain does!),
then this is a real concern!
Miri has in fact even found soundness bugs in the Rust standard library,
so even a transitive sort of `#![forbid(unsafe_code)]` won't help you.

# What is UB (and why is it bad)?

I think to understand why Miri matters,
we first need to understand why UB is bad.
This is not something that most professional programmers have a great understanding of (myself included).

In abstract, UB can mean "anything that isn't specified", or something like that...
But that's not very helpful!
And it doesn't really explain the stakes if we don't avoid it.
The Rust Reference has a [list](https://doc.rust-lang.org/reference/behavior-considered-undefined.html)
of behaviors that are considered to be undefined in Rust,
but they note that this list is not exhaustive.

When searching for a better understanding,
I've seen people online make statements like
"UB means your program can do literally anything at this point, like launch nuclear missiles."
While this is technically true, this isn't particularly helpful to most readers.
I want something more concrete...

The authors of the paper put UB's consequences in terms which really "clicked" for me
using a logical equivalence, which I'll quote here:

> Furthermore, Undefined Behavior is a massive security problem. Around 70% of critical security vulnerabilities are caused by memory safety violations [38, 18, 32], and all of these memory safety violations are instances of Undefined Behavior. After all, if the attacker overflows a buffer to eventually execute their own code, this is not something that the program does because the C or C++ specification says so—the specification just says that doing out-of-bounds writes (or overwriting the vtable, or calling a function pointer that does not actually point to a function, or doing any of the other typical first steps of an exploit chain) is Undefined Behavior, and executing the attacker’s code is just how Undefined Behavior happens to play out in this particular case.

I never made this connection on my own.
I equate UB most often with things like data races between threads,
where you can have unexpected update visibility without atomics or locks.
Or maybe torn reads of shared memory that's not properly synchronized.
But this is a new way of looking at it that makes the stakes more clear,
especially if you're doing anything with pointers.

Another connection I never made previously is that UB is relative to a very specific context.
Here's another quote from the paper:

> The standard random number crate used across the Rust ecosystem performed an unaligned memory access. Interestingly, the programmers seemed to have been aware that alignment is a problem in this case: there were dedicated code paths for x86 and for other architectures. Other architectures used read_unaligned, but the x86 code path had a comment saying that x86 allows unaligned reads, so we do not need to use this (potentially slower) operation. Unfortunately, this is a misconception: even though x86 allows unaligned accesses, Rust does not, no matter the target architecture—and this can be relevant for optimizations.

This is REALLY interesting to me!
It makes sense in retrospect, but it's not exactly obvious.
Languages are free to define their own semantics in addition to or independently of hardware.
I suspect Rust's specification here is somehow related to its concept of allocations
(which the paper goes into more detail about).

It is obviously not "undefined" what the hardware will do when given a sequence of instructions.
But it _is_ undefined in Rust, which controls how those instructions are generated.
And here the Rust Reference is explicit in calling this UB.
(NOTE: I don't actually know what the "failure modes" are here, but you can imagine they could be very bad
since it could enable the compiler to make a bad assumption that leads to a program correctness or memory safety vulnerability.)

I actually encountered the same confusion re: what the CPU guarantees vs what Rust guarantees for unaligned reads in [one of my own projects](https://github.com/stadiamaps/valinor/blob/5e75b2b8267cee2a57d4f22fcc5605728e0cf76e/valhalla-graphtile/src/graph_tile.rs#L857),
as a previous version of this function didn't account for alignment.
I addressed the issue by using the native zerocopy [`U32`](https://docs.rs/zerocopy/latest/zerocopy/byteorder/struct.U32.html) type,
which is something I'd have needed to do anyways to ensure correctness regardless of CPU endianness.
(If you need to do something like this at a lower level for some reason, there's a [`read_unaligned` function in `std::ptr`](https://doc.rust-lang.org/std/ptr/fn.read_unaligned.html)).

TL;DR - UB is both a correctness and a security issue, so it's really bad!

# Using Miri for great good

One of the reasons I write pretty much everything that I can in Rust is because
it naturally results in more correct and maintainable software.
This is a result of the language guarantees of safe Rust,
the powerful type system,
and the whole ecosystem of excellent tooling.
It's a real [pit of success](https://blog.codinghorror.com/falling-into-the-pit-of-success/) situation.

While you can run a program under Miri as a one-shot test,
this isn't a practical approach to ensuring correctness long-term.
Miri is a _complementary_ tool to existing things that you should be doing already.
Automated testing is the most obvious one,
but fuzzing and other strategies may also be relevant for you.

If you're already running automated tests in CI, adding Miri is easy.
Here's an example of how I use it in GitHub actions:

```yaml
steps:
    - uses: actions/checkout@v4
    - uses: taiki-e/install-action@nextest

    - name: Build workspace
      run: cargo build --verbose

    - name: Run tests
      run: cargo nextest run --no-fail-fast

    - name: Run doc tests (not currently supported by nextest https://github.com/nextest-rs/nextest/issues/16)
      run: cargo test --doc

    - name: Install big-endian toolchain (s390x)
      run: rustup target add s390x-unknown-linux-gnu

    - name: Install s390x cross toolchain and QEMU (Ubuntu only)
      run: sudo apt-get update && sudo apt-get install -y gcc-s390x-linux-gnu g++-s390x-linux-gnu libc6-dev-s390x-cross qemu-user-static

    - name: Run tests (big-endian s390x)
      run: cargo nextest run --no-fail-fast --target s390x-unknown-linux-gnu

    - name: Install Miri
      run: rustup +nightly component add miri

    - name: Run tests in Miri
      run: cargo +nightly miri nextest run --no-fail-fast
      env:
        RUST_BACKTRACE: 1
        MIRIFLAGS: -Zmiri-disable-isolation

    - name: Run doc tests in Miri
      run: cargo +nightly miri test --doc
      env:
        RUST_BACKTRACE: 1
        MIRIFLAGS: -Zmiri-disable-isolation

    - name: Install nightly big-endian toolchain (s390x)
      run: rustup +nightly target add s390x-unknown-linux-gnu

    - name: Run tests in Miri (big-endian s390x)
      run: cargo +nightly miri nextest run --no-fail-fast --target s390x-unknown-linux-gnu
      env:
        RUST_BACKTRACE: 1
        MIRIFLAGS: -Zmiri-disable-isolation
```

I know that's a bit longer than what you'll find in the README,
but I wanted to highlight my usage in a more complex codebase
since these examples are less common.
(NOTE: I assume an Ubuntu runner here, since Linux has the best support for Miri right now.)
Some things to highlight:

- I use [nextest](https://nexte.st/), which is significantly faster for large suites. (NOTE: It [does not support doc tests](https://github.com/nextest-rs/nextest/issues/16) at the time of this writing).
- I pass some `MIRIFLAGS` to disable host isolation for my tests, since they require direct filesystem access. You may not need this for your project, but I do for mine.
- Partly because I can, and partly because big-endian CPUS do still exist, I do tests under two targets. Miri is capable of doing this with target flags, which is REALLY cool, and the `s390x-unknown-linux-gnu` is the "big-endian target of choice" from the Miri authors. This requires a few dependencies and flags.
- Note that cargo doc tests [do not support building for alternate targets](https://github.com/rust-lang/cargo/issues/6460).

Hopefully you learned something from this post.
I'm pretty sure I wrote my first line of unsafe Rust less than a year ago
(after using it professionally for over 6 years prior),
so even if you don't need this today, file it away for later.
As I said at the start, I'm still not an expert,
so if you spot any errors, please reach out to me on Mastodon!
