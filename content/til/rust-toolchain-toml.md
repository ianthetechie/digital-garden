---
title: The rust-toolchain.toml file
date: 2025-01-13
tags:
- rust
- cross-compilation
---

This isn't so much a TIL as a quick PSA.
If you're a Rust developer and need to ensure specific things about your toolchain,
the `rust-toolchain.toml` file is a real gem!

I don't quite remember how, but I accidentally discovered this file a year or two ago.
Since then, I've spread the good news to at least half a dozen other devs,
and most of them simply had no idea it existed.
So, without further ado...

# What does the file do?

`rust-toolchain.toml` is a file that lets you specify certain things about your Rust toolchain.
For example, if you need to use nightly rust for a project,
you can specify that in your toolchain file.
It also lets you specify other cargo components to install
and specify cross-compilation targets you want to have available.

# Why would I need this?

The headline use case in [The rustup book](https://rust-lang.github.io/rustup/overrides.html#the-toolchain-file)
is to pin to a specific release.
This is pretty rare in practice I think, unless you need `nightly`.
You can specify channels like `nightly`, `stable`, and `beta` in addition to specific releases.

The more useful one in my opinion is for cross-compilation.
I do a lot of cross compiling, and codifying all required targets in a single file makes life much easier!

The best part is that, as long as you're using `rustup`, everything is automatic!
For projects with a large number of collaborators (like an open-source library),
this makes it a lot easier to onboard new devs.

## What if I'm not using rustup?

Not everyone uses rustup.
For example, some devs I know use nix.
When I asked one of them about how to do this without duplicating work,
they suggested [Fenix](https://github.com/nix-community/fenix),
which is able to consume the `rust-toolchain.toml`.

If you have suggestions or experiences with other invironments,
let me know and I'll update this post.
Contact links in the footer.

# Show me an example!

Here's what the file looks like for a cross-platform mobile library that I maintain:

```toml
[toolchain]
channel = "stable"
targets = [
    # iOS
    "aarch64-apple-ios",
    "x86_64-apple-ios",
    "aarch64-apple-ios-sim",

    # Android
    "armv7-linux-androideabi",
    "i686-linux-android",
    "aarch64-linux-android",
    "x86_64-linux-android",
    "x86_64-unknown-linux-gnu",
    "x86_64-apple-darwin",
    "aarch64-apple-darwin",
    "x86_64-pc-windows-gnu",
    "x86_64-pc-windows-msvc",

    # WebAssembly
    "wasm32-unknown-unknown"
]
components = ["clippy", "rustfmt"]
```
