---
title: Optimizing Rust `target-flags`
date: 2025-07-28
tags:
- rust
---

Recently I've been doing some work using [Apache DataFusion](https://datafusion.apache.org/) for some high-throughput data pipelines.
One of the interesting things I noticed on the user guide was the suggestion to set
`RUSTFLAGS='-C target-cpu=native'`.
This is actually a pretty common optimization (which I periodically forget about and rediscover),
so I thought I'd do a quick writeup on this.

# Background: CPU features

One of the things that a modern optimizing compiler does for your code is to take advantage of these features.
This includes rewriting known patterns into "vectorized" code using specialized SIMD instructions.

In Rust compiler speak, your base configuration is determined by the _target triple_
you're building for.
In the case of my work laptop, that's `aarch64-apple-darwin`.
Since this architecture doesn't have a lot of configurations,
the compiler can make some pretty good assumptions about what's available.
(In fact, for my specific CPU, it's perfect!)

Unfortunately, CPUs are far from homogenous,
and there are a lot of differences within the most common architectures you're likely to deploy on.
As a result, your code is often compiled for the lowest common denominator.

# Checking available features

The canonical way of checking CPU features on Linux is probably to `cat /proc/cpuinfo`.
This gives a lot more output that you probably need though.
Helpfully, `rustc` includes a simple command that shows you the config
for the native CPU capabilities: `rustc --print=cfg -C target-cpu=native`.
Here's what it looks like on one Linux machine:

```
debug_assertions
panic="unwind"
target_abi=""
target_arch="x86_64"
target_endian="little"
target_env="gnu"
target_family="unix"
target_feature="adx"
target_feature="aes"
target_feature="avx"
target_feature="avx2"
target_feature="bmi1"
target_feature="bmi2"
target_feature="cmpxchg16b"
target_feature="f16c"
target_feature="fma"
target_feature="fxsr"
target_feature="lzcnt"
target_feature="movbe"
target_feature="pclmulqdq"
target_feature="popcnt"
target_feature="rdrand"
target_feature="rdseed"
target_feature="sse"
target_feature="sse2"
target_feature="sse3"
target_feature="sse4.1"
target_feature="sse4.2"
target_feature="ssse3"
target_feature="xsave"
target_feature="xsavec"
target_feature="xsaveopt"
target_feature="xsaves"
target_has_atomic="16"
target_has_atomic="32"
target_has_atomic="64"
target_has_atomic="8"
target_has_atomic="ptr"
target_os="linux"
target_pointer_width="64"
target_vendor="unknown"
unix
```

Aside: I'm not quite sure why, but this isn't a 1:1 match with `/proc/cpuinfo` on this box!
It definitely does support some AVX512 instructions,
but those don't show up in the native CPU options.
If anyone knows why, let me know!

# Checking the default features

Perhaps the more interesting question which motivates this investigation is
what the defaults are.
You can get this with `rustc --print cfg`.
This shows what you get when you run `cargo build` without any special configuration.
Here's the output for the same machine:

```
debug_assertions
panic="unwind"
target_abi=""
target_arch="x86_64"
target_endian="little"
target_env="gnu"
target_family="unix"
target_feature="fxsr"
target_feature="sse"
target_feature="sse2"
target_has_atomic="16"
target_has_atomic="32"
target_has_atomic="64"
target_has_atomic="8"
target_has_atomic="ptr"
target_os="linux"
target_pointer_width="64"
target_vendor="unknown"
unix
```

Well, that's disappointing, isn't it?
By default, you'd only get up to SSE2, which is over 20 years old by now!
This CPU is new enough to support
This is a consequence of the diversity of the `x86_64` architecture.
If you want your binary to run _everywhere_, this is the price you'd have to pay.

# Enabling features individually

While `-C target-cpu=native` will probably make your code faster on the build machine,
a lot of modern software is built by a CI pipeline and run elsewhere.
To reliably target a specific set of features, use the `target-feature` flag.
This lets you specifically enable features you know will be available on the machine running the code.
Here's an example of `RUSTFLAGS` that incorporates all of the above features.
This should enable builds to proceed from _any_ other x86_64 Linux machine and while producing a binary
that supports the exact features of the deployment machine.

```shell
RUSTFLAGS="-C target-feature=+adx,+aes,+avx,+avx2,+bmi1,+bmi2,+cmpxchg16b,+f16c,+fma,+fxsr,+lzcnt,+movbe,+pclmulqdq,+popcnt,+rdrand,+rdseed,+sse,+sse2,+sse3,+sse4.1,+sse4.2,+ssse3,+xsave,+xsavec,+xsaveopt,+xsaves"
```

# Don't forget to measure!

Enabling CPU features doesn't always make things faster.
In fact, in some cases, it can even do the opposite!
This [thread](https://internals.rust-lang.org/t/slower-code-with-c-target-cpu-native/17315)
has some interesting anecdotes.

# Other helpful commands

* `rustc --print target-cpus` - List all known target CPUs. This also tells you what your current CPU is and what the default is.
* `rustc --print target-features` - List all _available_ target features with a short description. You can scope to a specific CPU with `-C target-cpu=`.
