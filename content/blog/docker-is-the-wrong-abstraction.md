---
title: Docker is the Wrong Abstraction
date: 2025-06-24
draft: true
tags:
- software-engineering
- docker
- containerization
- wasm
---

Docker is the wrong abstraction.
Now that I have your attention...
This post is a bit of a hot take that's been brewing for a while.
I've given several speeches to this effect,
but thought it would be great to get it written down somewhere.

Just to preempt the angry comments,
I am _not_ saying that containerization is fundamentally wrong or useless.
But I _will_ try to convince you that we're actually using it wrong
a significant amount of the time.

If it makes you feel better, I'm not directing any criticism at _you_ or anyone in particular.
It's just my commentary on the state of software engineering and devops.

This is also not in specific to Docker;
it applies to Podman or your favorite other runtime for OCI images.
I'll just use "Docker" for convenience.

# What are we (really) trying to do?

Broadly, when we use Docker, we're trying to accomplish the following:

* Run an _application_
* In a reproducible environment
* On any machine
* With some level of sandboxing

This isn't how _everyone_ uses it, but it's the most popular use
that a lot of developers encounter.

# What is Docker image?

Docker images appear to fit this use case at a glance,
but what is Docker _really_ doing for us?

* A lightweight alternative to virtual machines
* Specific to an operating system (usually Linux)
* Tied to a specific CPU architecture
* Mostly sandboxed (with not great defaults)
