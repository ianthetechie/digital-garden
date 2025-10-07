---
title: Const Assertions
date: 2025-10-07
tags:
- rust
---

I'm currently working on a [project](https://github.com/stadiamaps/valinor) which involves a lot of lower level
data structures.
By lower level I mean things like layout and bit positions, and exact sizes being important.
As such, I have a number of pedantic lints enabled.

One of the lints I use is [`cast_precision_loss`](https://rust-lang.github.io/rust-clippy/master/index.html#cast_precision_loss).
For example, casting from `usize` to `f32` using the `as` keyword is not guaranteed to be exact,
since `f32` can only precisely represent integrals up to 23 bits of precision (due to how floating point is represented).
Above this you can have precision loss.

This lint is pedantic because it can generate false positives where you _know_ the input can't ever exceed some threshold.
But wouldn't it be nice if we could go from "knowing" we can safely disable a lint to actually _proving_ it?

The first thing that came to mind was runtime assertions, but this is kind of ugly.
It requires that we actually exercise the code at runtime, for one.
We _should_ be able to cover this in unit tests, but even if we do that,
an assertion isn't as good as a compile time guarantee.

# `const`

One thing I didn't mention, and the reason I "know" that the lint would be fine is that I'm using a `const` declaration.
Here's a look at what that's like:

```rust
pub const BUCKET_SIZE_MINUTES: u32 = 5;
pub const BUCKETS_PER_WEEK: usize = (7 * 24 * 60) as usize / BUCKET_SIZE_MINUTES as usize;
```

This isn't the same as a `static` or a `let` binding.
`const` expressions are actually evaluated at compile time.
(Well, most of the time... there's a funny edge case where `const` blocks which can _never_ executed at runtime
[is not guaranteed to evaluate](https://doc.rust-lang.org/reference/expressions/block-expr.html#const-blocks).)

You can't do everything in `const` contexts, but you can do quite a lot, including many kinds of math.
Not all math; some things like square root and trigonometry are not yet usable in `const` contexts
since they are not reproducible across architectures (and sometimes even on the same machine, it seems).

# `assert!` in a `const` block

And now for the cool trick!
I want to do a division here, and to do so, I need to ensure the types match.
This involves casting a `usize` to `f32`,
which can cause truncation as noted above.

But since `BUCKETS_PER_WEEK` is a constant value,
we can actually do an assertion against it _in our `const` context_.
This lets us safely enable the lint, while ensuring we'll get a compile-time error if this ever changes!
This has no runtime overhead.

```rust
#[allow(clippy::cast_precision_loss, reason = "BUCKETS_PER_WEEK is always <= 23 bits")]
const PI_BUCKET_CONST: f32 = {
    // Asserts the invariant; panics at compile time if violated
    assert!(BUCKETS_PER_WEEK < 2usize.pow(24));
	// Computes the value
    std::f32::consts::PI / BUCKETS_PER_WEEK as f32
};
```

This is all possible in stable Rust at the time of this writing (tested on 1.89).
I saw some older crates out there which appeared to do this,
but as far as I can tell, they are no longer necessary.

Here's a [Rust Playground](https://play.rust-lang.org/?version=stable&mode=debug&edition=2024&gist=dd294501c156f8d67f72a21f7dea27c4)
preloaded with the sample code
where you can verify that changing `BUCKETS_PER_WEEK` to a disallowed value causes a compile-time error.
