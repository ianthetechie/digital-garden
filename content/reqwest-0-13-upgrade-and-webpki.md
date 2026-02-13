---
title: reqwest 0.13 Upgrade and WebPKI
date: 2026-02-13
tags:
- rust
- cryptography
---

In case you missed the [announcement](https://seanmonstar.com/blog/reqwest-v013-rustls-default/),
the `reqwest` crate has a new and very important release out!
`reqwest` is an opinionated, high-level HTTP client for Rust,
and the main feature of this release is that [`rustls`](https://rustls.dev/)
is now the default TLS backend.
Read the excellent blog posts from Sean and others on why `rustls`
safer and often faster than native TLS.
It's also a lot more convenient most of the time!

# Changes to certificate verification

This post is about one of the more mundane parts of the release.
Previously there were a lot of somewhat confusing features related to certificate verification.
These have been condensed down to a smaller number of feature flags.
The summary of these changes took a bit to "click" for me so here's a rephrasing in my own words.

* By default, it uses the [native platform verifier](https://docs.rs/rustls-platform-verifier/latest/rustls_platform_verifier/),
  which looks for root certificates in your system store, and inherits systemwide revocations and explicit trust settings
  in addition to the "baseline" root CAs trusted by your OS.
* The feature flag to enable WebPKI bundling of roots is gone.
  WebPKI is a bundle of CA root certificates trusted and curated by Mozilla.
  It's a reasonably standard set, and most other trust stores look pretty similar.
* You can merge in your own _additionally_ trusted root certificates using [`tls_certs_merge`](https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html#method.tls_certs_merge).
* You can be extra exclusive and use [`tls_certs_only`](https://docs.rs/reqwest/latest/reqwest/struct.ClientBuilder.html#method.tls_certs_only)
  to limit verification to only the certificates you specify.

The documentation and release notes also mention that `tls_certs_merge` is not always supported.
I frankly have no idea what conditions cause this to be supported or not.
But `tls_certs_only` apparently can't fail. ¯\_(ツ)_/¯

# What this means for containerized applications

The reason I'm interested in this in mostly because at `$DAYJOB`, just about everything is deployed in containers.
For reasons that I don't fully understand (something about image size maybe??),
the popular container images like `debian:trixie-slim` **do not include any root CAs**.
You have to `apt-get install` them yourself.
This is to say that most TLS applications will straight up break in the out-of-the-box config.

Previously I had seen this solved in two ways.
The first is to install the certs from your distribution's package manager like so:

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
```

The second is to add the WebPKI roots to your cargo dependencies.
This actually requires some manual work; adding the crate isn't enough.
You then have to add all of the roots (e.g. via `tls_certs_merge` or `tls_certs_only`).

# Which approach is better?

The net result is _approximately_ the same, but not entirely.
The system-level approach is more flexible.
Presumably you would get updates in some cases without having to rebuild your application
(though you do _not_ get these automatically; the certs are only loaded once on app startup
by `rustls_platform_verifier`!).
Presumably you would also get any, say, enterprise-level trust, distrust, CRLs, etc.
that are dictated by your corporate IT department.

The WebPKI approach on the other hand is baked at build time.
The [crate](https://docs.rs/webpki-root-certs/latest/webpki_root_certs/)
has a pretty strong, if slightly obtuse warning about this:

> This library is suitable for use in applications that can always be recompiled and instantly deployed. For applications that are deployed to end-users and cannot be recompiled, or which need certification before deployment, consider a library that uses the platform native certificate verifier such as `rustls-platform-verifier`. This has the additional benefit of supporting OS provided CA constraints and revocation data.

Attempting to read between the lines, past that "instantly deployed" jargon,
I think they are really just saying "if you use this, certs are baked at compile time and you _never_ get automatic updates. Be careful with that."

So it's clear to me you shouldn't ship, say, a static binary to users with certs baked like this.
But I'm building server-side software.
And as of February 2026, people look at you funny if you don't deploy using containers.
I _can_ deploy sufficiently instantly,
though to be honest I would have no idea _when_ I should.
Most apps get deployed frequently enough that I would assume this just doesn't matter,
and so I'm not sure the warning as-written does much to help a lot of the Rust devs I know.

# Conclusion

My conclusion is that if you're deploying containerized apps, there is approximately no functional difference.
Your container is a static image anyways.
They don't typically run background tasks of any sort.
And even if they did, the library won't reload the trusted store during application.
So it's functionally the same (delta any minor differences between WebPKI and Debian, which should be minimal).
Similarly, unless you work for a large enterprises / government,
you probably don't have mandated, hand-picked set of CAs and CRLs.
So again here there really is no difference as far as I can tell.

In spite of that, I decided to switch away from using WebPKI in one of our containers that I upgraded.
The reason is that structuring this way
(provided that the sources are copied from a previous layer!)
ensures that every image build always has the latest certs from Debian.
`cargo build` is a lot more deterministic,
and will use whatever you have in the lockfile unless you explicitly run `cargo update`.

And even though I'm fortunate to not have an IT apparatus dictating cert policy today,
you never know... this approach seems to be both more flexible and creates a "pit of success"
rather than a landmine where the trust store may not see an update for a year
despite regular rebuilds.

Hope this helps; I wrote this because I didn't understand the tradeoffs initially,
and had some trouble parsing the existing writing on the subject.
