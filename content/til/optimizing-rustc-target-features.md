---
title: Optimizing Rust Builds with Target Flags
date: 2025-07-28
modified: 2025-07-31
tags:
- rust
- devops
---

Recently I've been doing some work using [Apache DataFusion](https://datafusion.apache.org/) for some high-throughput data pipelines.
One of the interesting things I noticed on the user guide was the suggestion to set
`RUSTFLAGS='-C target-cpu=native'`.
This is actually a pretty common optimization (which I periodically forget about and rediscover),
so I thought I'd do a quick writeup on this.

# Background: CPU features

A compiler translates your "idiomatic" code into low-level instructions.
Modern optimizing compilers are pretty good at figuring out ways to cleverly rewrite your code
to make it faster, while still being functionally equivalent at execution time.
The instructions may be reordered from what your simple mental model expects,
and they may even have no resemblance.
This includes rewriting some loop-like (or iterator) patterns into "vectorized" code using SIMD instructions
that perform some operation on multiple values at once.

Special instruction families like this often vary within a single architecture,
which may be surprising at first.
The compiler can be configured to enable (or disable!) specific "features",
optimizing for compatibility or speed.

In `rustc`, each _target triple_ has a default set of CPU features enabled.
In the case of my work laptop, that's `aarch64-apple-darwin`.
Since this architecture doesn't have a lot of variation among chips,
the compiler can make some pretty good assumptions about what's available.
(In fact, for my specific CPU, the M1 Max, it's perfect!)
But we'll soon see this is not the case for the most common target: x86_64 Linux.

# Checking available features

To figure out what features we could theoretically enable,
we need some CPU info from the machine we intend to deploy on.
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
what the _defaults_ are.
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
This is a consequence of the diversity of the `x86_64` architecture.
If you want your binary to run _everywhere_, this is the price you'd have to pay.

# Enabling features individually

While `-C target-cpu=native` will usually make your code faster on the build machine,
a lot of modern software is built by a CI pipeline on cheap runners, but deployed elsewhere.
To reliably target a specific set of features, use the `target-feature` flag.
This lets you specifically enable features you know will be available on the machine running the code.
Here's an example of `RUSTFLAGS` that incorporates all of the above features.
This should enable builds to proceed from _any_ other x86_64 Linux machine and while producing a binary
that supports the exact features of the deployment machine.

```shell
RUSTFLAGS="-C target-feature=+adx,+aes,+avx,+avx2,+bmi1,+bmi2,+cmpxchg16b,+f16c,+fma,+fxsr,+lzcnt,+movbe,+pclmulqdq,+popcnt,+rdrand,+rdseed,+sse,+sse2,+sse3,+sse4.1,+sse4.2,+ssse3,+xsave,+xsavec,+xsaveopt,+xsaves"
```

# Enabling features by x86 microarchitecture level

A few days after writing this, I accidentally stumbled upon something else when working out target flags
for a program I knew would have wider support across several datacenters.
It sure would be nice if there were some "groups" of commonly supported features, right?

Turns out this exists, and it was staring right at me in the CPU list: microarchitecture levels!
If you list out all the available target CPUs via `rustc --print target-cpus` on a typical x86_64 Linux box,
you'll see that your default target CPU is `x86-64`.
This means it will run on all x86_64 CPUs, and as we discussed above, this doesn't give much of a baseline.
But there are 4 versions in total, going up to `x86-64-v4`.
It turns out that AMD, Intel, RedHat, and SUSE got together in 2020 to define these,
and came up with some levels which are specifically designed for our use case of optimizing compilers!
You can find the [full list of supported features by level on Wikipedia](https://en.wikipedia.org/wiki/X86-64)
(search for "microarchitecture levels").

`rustc --print target-cpus` will also tell you which _specific_ CPU you're on.
You can use this info to find which "level" you support.
But a more direct way to map to level support is to run `/lib64/ld-linux-x86-64.so.2 --help`.
Thanks, internet!
You'll get some output like this on a modern CPU:

```
Subdirectories of glibc-hwcaps directories, in priority order:
  x86-64-v4 (supported, searched)
  x86-64-v3 (supported, searched)
  x86-64-v2 (supported, searched)
```

And if you run on slightly older hardware, you might get something like this:

```
Subdirectories of glibc-hwcaps directories, in priority order:
  x86-64-v4
  x86-64-v3 (supported, searched)
  x86-64-v2 (supported, searched)
```

This should help if you're trying to aim for broader distribution rather than enabling specific features for some known host.
The line to target an x86_64 microarch level is a lot shorter.
For example:

```
RUSTFLAGS="-C target-cpu=x86-64-v3"
```

# Don't forget to measure!

Enabling CPU features doesn't always make things faster.
In fact, in some cases, it can even do the opposite!
This [thread](https://internals.rust-lang.org/t/slower-code-with-c-target-cpu-native/17315)
has some interesting anecdotes.

# Summary of helpful commands

In conclusion, here's a quick reference of the useful commands we covered:

* `rustc --print cfg` - Shows the compiler configuration that your toolchain will use by default.
* `rustc --print=cfg -C target-cpu=native` - List the configuration if you were to specifically target for your CPU. Use this to see the delta between the defaults and the featurse supported for a specific CPU.
* `rustc --print target-cpus` - List all known target CPUs. This also tells you what your current CPU and what the default CPU is for your current toolchain.
* `/lib64/ld-linux-x86-64.so.2 --help` - Specifically for x86_64 Linux users, will show you what microarchitecture levels your CPU supports.
* `rustc --print target-features` - List _all available_ target features with a short description. You can scope to a specific CPU with `-C target-cpu=`. Useful mostly to see what you're missing, I guess.
