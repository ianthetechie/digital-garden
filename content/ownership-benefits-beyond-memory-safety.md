---
title: Ownership Benefits Beyond Memory Safety
tags:
- rust
- functional programming
date: 2025-05-31
---

Rust's ownership system is well-known for the ways it enforces memory safety guaranteees.
For example, you can't use some value after it's been freed.
Further, it also ensures that mutability is explicit,
and it enforces some extra rules that make _most_ data races impossible.
But the ownership system has benefits beyond this which don't get as much press.

Let's look at a fairly common design pattern: the builder.
A builder typically takes zero or few arguments to create.
In Rust, it's often implemented as a `struct` that implements the `Default` trait.
Then, you progressively "chain" method invocations to ergonomically
to specify how to build the thing you want.
For example:

```rust
let client = reqwest::Client::builder()
    .user_agent(APP_USER_AGENT)
    .timeout(Duration::from_secs(3))
    .build()?;
```

This pattern is useful because it avoids bloated constructors with dozens of arguments.
It also lets you encode **failability** into the process:
some combinations of arguments may be invalid.

If you look at the signature for the `timeout` function,
you'll find it takes `self` as its first parameter and returns a value of the same type.
The key thing to note is that a non-reference `self` parameter
will "consume" the receiver!
Since it takes ownership, you can't hold on to a reference to the original value!

This prevents a whole class of subtle bugs.
Python, for example, doesn't prevent you from modifying inputs,
and it's not always clear if a function/method is supposed to return a new value,
whether that value has the same contents as the original reference (which is still valid!)
or if it's completely fresh,
and so on.

A few other languages, mostly in the purely functional tradition (Haskell comes to mind)
also have a similar property.
They don't use a concept of "ownership" but rather remove mutability from the language.
Rust makes what I consider to be a nice compromise
which retains most of the benefits while being easier to use.

In summary, the borrow checker is a powerful ally,
and you can leverage it to make truly better APIs,
saving hours of debugging in the future.
