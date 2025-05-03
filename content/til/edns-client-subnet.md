---
title: EDNS Client-Subnet and Geographic DNS
tags:
- dns
- networking
date: 2025-05-03
---

DNS is a complex beast,
so it's little surprise when I learn something new.
Today I learned a bit more about the internals of how DNS works
at various privacy-centric providers.

It all started a few weeks ago when someone I follow on Mastodon
(I'm very sorry I can't remember who)
mentioned [Quad9](http://quad9.net) as a privacy-friendly DNS solution.
I think the context was that they were looking for alternatives
to the US "big tech" vendors, like Cloudflare and Google.
I eventually remembered it and switched by DNS a few weeks ago from 1.1.1.1,
Cloudflare's similar service.

Fast forward to the present.
I was frustrated that some page loads were REALLY slow.
I couldn't figure out a clear pattern, but two sites which I visit a LOT
are [stadiamaps.com](https://stadiamaps.com/) and [docs.stadiamaps.com](https://docs.stadiamaps.com/),
since it's kinda my job ;)
This had been going on far at least a week or two,
but I thought it was just something funky with my ISP,
or maybe they were throttling me (I'm sure I'm a top 1% bandwidth user).

I had enough of the slowness this morning and was about to type up a thread in our internal Zulip chat
asking our network guy to look into it on Monday.
So like any decent engineer, I popped up a web inspector and captured a HAR file
so they could "see what I saw."

And what did I see?
After a few minutes looking over it for obvious problems,
I noticed that our marketing site was loading from our edge server in...
Johannesburg?!
And our docs site was coming from a server in Texas!
(We include some HTTP headers which assist in debugging this sort of thing.)

Well, that's not right...
I popped up `dig` in my terminal and verified that, indeed, the A records were resolving to servers
located on the other side of the world.
And then it hit me.
I had changed my DNS settings recently!
That must have something to do with it!

We use AWS Route53 for our geographically aware DNS resolution needs.
It's the best product I've seen in the industry,
so I assumed it wasn't their fault.
Then I remembered something I read in the [Quad9 FAQ](https://quad9.net/support/faq/#edns)
about EDNS Client-Subnet (also known as EDNS0 and ECS).
That seems relevant...

The quick version is that some DNS resolvers can use a truncated version of your IP address
to improve the quality of the results (giving a server near you).
Amazon has a great [detailed writeup](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy-edns0.html).

The trouble is that this info could theoretically be used (with some more details) to identify you,
so many privacy-focused DNS solutions (including Quad9) disable this by default

Quad9 operates an alternate server with EDNS Client-Subnet enabled.
I tried that and it gave the results I expected.
But this is not where the story ends!

It turns out, Cloudflare, which I had been using previously,
also gave the "expected" results.
But they state very clearly in their [FAQ](https://developers.cloudflare.com/1.1.1.1/faq/#does-1111-send-edns-client-subnet-header)
that they do not use EDNS Client-Subnet.
What gives?

At this point I'm speculating,
but I think that their network setup is a bit different.
Cloudflare is famous for having an extensive edge network,
and I have a server very close by.
My guess is that they make all upstream queries to authoritative servers
AND cache any results in the same nearby datacenter.
This would easily explain why they can still give a geographically relevant result,
without sending your subnet to the authoritative server.

Quad9 on the other hand either doesn't have as many servers nearby (for fast routing),
or perhaps they are sharing cache results globally.

As I said though, this is all just speculation.
If anyone has more knowledge of how Cloudflare and Quad9 operate,
let me know and I'll update this post!
