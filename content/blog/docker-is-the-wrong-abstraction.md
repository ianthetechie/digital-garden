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
I am _not_ saying that _containerization_ is fundamentally flawed or useless.
But I believe a significant amount of container usage in practice is for wrong/misguided reasons.

If it makes you feel better, I'm not directing any criticism at _you_ or anyone in particular.
It's just my commentary on the state of software engineering and devops.

This is also not in specific to Docker;
it applies to Podman or your favorite other runtime for OCI images.
I'll just use "Docker" for convenience.
This rant is not directed at FreeBSD jails or Solaris/Illumos zones,
as they are not typically (ab)used in the ways I'll describe.

# What are we (really) trying to do?

Broadly, when we use Docker, we're trying to accomplish the following:

* Run an _application_
* In a reproducible environment
* On any machine
* With some level of sandboxing/security

This isn't how _everyone_ uses it, but it's an extremely popular use.
In fact, it may be the most common usage for some!

# What is Docker image?

Docker images appear to fit this use case at a glance,
but what is Docker _really_ doing for us?

* A lightweight alternative to virtual machines
* Specific to an operating system (usually Linux)
* Tied to a specific CPU architecture
* Somewhat sandboxed

Measuring against our initial points,
Docker doesn't quite measure up.
Let's unpack my assertions though, since there is definitely some nuance.

## A lightweight alternative to VMs

Docker is, at its core, a lightweight alternative to Virtual Machines.
The legend has it that before Docker containers,
we often had to wait minutes to lanch a new VM with our application.
Docker significantly reduces that latency, and you get a "known working"
version of your app and all of its environment.

Docker has significantly improved the story around Devops
in that it reduces startup times significantly.
It also solves a pain point of provisioning your VMs,
particularly if they are of the VPS variety when you'd have to use something like Ansible or
(*gasp*) shell scripts.

I want to emphasize again that this is an improvement over VMs in many ways.
You get smaller startup times, and images which are pretty portable and can be executed
via several open-source runtimes.

But if we step back for a moment and look at how these are supposed to be used from a devops perspective,
we're usually trying to deploy an *application.*
Deploying a full VM is one way of doing this, but it's extremely heavy.
Container images for a simple web service can easily weigh in at hundreds of megabytes if you're not extremely careful
about your Dockerfile structure.
You can get this down to the tens of megabytes in many cases,
but that requires a lot of effort.

At the end of the day, you can only go so far, because you aren't just shipping your application.
You're shipping an entire OS, typically some flavor of Linux.
This is wasteful (or worse; we'll touch on security in a bit).

## OS-specific

Speaking of Linux, the next issue with containers (of _all_ flavors, not just Docker/OCI)
is that they are OS-specific.
After all, you are packaging an entire OS.
This means that the majority of containers won't be able to run natively on macOS.
Docker Desktop on macOS has many layers of hacks to let these run with virtualization,
but this is extremely slow.

Fortunately, most developers don't encounter this problem if their apps target popular interpreted languages
like Python or JavaScript.
Python and Node official images are readily available on all platforms.
But if you're deploying a binary application, the tooling for doing this isn't always very ergonomic,
even when using tools like `cargo` with great support for targeting another platforms.

Side note on the build ergonomics: it's quite difficult to build a container without privileged containers
or Docker-in-Docker in CI.
This has been the source of headaches for me for many years.
BuildKit has dramatically improved the story, but [it's still a huge chore to setup](../til/rootless-gitlab-ci-container-builds-with-buildkit.md).
And that's before we get into the complexities of targeting multiple OSes/architectures.

## Arch-specific

And that's not all... not all Linux or macOS images are the same.
Your image is also CPU-specific.
You need an emulation layer or another dimension in your build matrix
to support more platforms.

This is unavoidable at some level when binaries are involved.
But ideally this would be a runtime implementation detail,
rather than requiring an entire, for example, x86_64 Linux distribution available.
Particularly when you're distributing interpreted code or a static binary,
which are probably the two most popular distribution models.
In the former case, the complexity is handled upstream (usually in an official image) already,
but my gripe is that this pollutes your _application_ image.
The work is happening at the wrong level,
because container images lack a good composition model.

At this point, it's clear that the typical mental model of Docker containers running anywhere that there is an available runtime
is inaccurate.
You need an image that's specifically built for your host OS and CPU architecture,
or else you will incur virtualization penalties or just not be able to run it at all.
Given that Apple Silicon is one of the most popular developer platforms,
but x86_64 Linux is the most common container target,
tools like Docker Desktop go to great lengths to provide a compatibility layer through virtualization
and emulation.

## Sandboxing

Finally, let's look at the sandboxing axis.
(Docker) containers are canonically implemented via Linux kernel cgroups,
a namespacing mechanism that powers the lightweight virtualization.
All running containers share a single kernel, reducing some overhead (but also introducing a non-obvious dependency!).

# Other common container (ab)use cases

## "Reproducible" builds

## Utility distribution
