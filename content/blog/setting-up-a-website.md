---
title: On Setting Up a Website
tags:
- blogging
- hosting
- web
- frontend
draft: true
---

Setting up your own website, even a simple blog,
is a shocking amount of work.
Even in 2024.
Here's what I learned setting up my own.

# Background

Before we dive in, it probably helps to have a bit of background.
I'm no stranger to the web.
I had an AOL dial-up account when I was 5.
I've been programming since 3rd grade.
Professionally since high school.
I've written web sites by hand.

I also rage quit web dev about 10 years ago
to focus on backend and mobile,
since they were (and still are IMO)
much saner.

Here in 2024, the web is simultaneously more accessible than ever,
and yet it feels like some things are no better than they were in the early '00s.
This post will explore what it took a seasoned geek to get a relatively simple website up.

# Improvements in web accessibility

Before I start sounding too much like the meme of the old man yelling at the cloud,
let's talk about what improved.
A lot, actually!

For one, Markdown is almost universally accepted as a way of authoring content.
Even if you use a full SPA framework like Nuxt,
you have options for writing in Markdown.
Markdown isn't perfect (as the good folks at Oxide will tell you),
but it's good enough for the vast majority of things.
Especially if you're "just" writing a blog now and then.
And if you really want, you can throw in whatever HTML you like.
It just works, and it lets me focus on the content rather than tedious markup.

We've also had a huge improvement in ease of hosting.
In fact, it's basically free these days.

# My requirements

A few weeks ago, my friend Paul and I were talking about how we had things to say,
and really should have blogs.
I had one in the past (long gone, on platforms that no longer exists),
and was overdue to start sharing things again,
so we made a pact to start blogs by the end of the month.
[Paul launched his a few days ago](https://https://graycoding.com/), by the way 😉.

My requirements going into this were pretty simple:

- Content must be editable in Markdown (or similar)
- Niceties I take for granted, like code fences with syntax highlighting and charts/diagrams via Mermaid
- Requires approximately zero configuration
- Must have good styles out of the box or VERY easily installable
- Can generate an RSS feed
- Must not require heavy/fragile tooling
- Must generate a static site
- Must have search

# In search of simplicity

Most of these requirements boil down to one concept: simplicity.
Between work and family, I have zero patience to deal with a complex system.
Static site generators are a huge leap forward,
because you can just run a command which "renders" the site
and throw it up on object storage or even GitHub.
I opted for the latter.
It's literally free, and I'm busy, so it's almost silly not to use!
(And for all you readers shouting "but GitHub could disappear tomorrow!",
yes, I know, and the whole point of using Git is that I have a copy
and could move it anywhere else with ease.)

But a lot of SSGs are actually really complicated.
Many require installing a bunch of fragle node tooling.
Or worse, docker.
I have a strong dislike for this complexity,
so I initially looked at [Zola](https://www.getzola.org/),
an SSG written in Rust.

Zola was OK.
I used it in the past on one site.
But I found the documentation lacking,
and the process for installing a theme to be very confusing
(and highly dependent on the theme).
Most had minimal documentation.
I gave up after a few hours. It wasn't worth the headache.

I also had a good look at VuePress.
It was OK.
The default theme was alright.
But there was only like one additional theme that anyone used,
it wasn't *really* designed for blogging (more of a docs thing),
and it was quite heavy overall.
After a few snags and a few hors, I decided that probably wasn't the best option either.

Material for MkDocs

Hugo is probably the best-known static site generator.
I took a solid look at that.
I'm pretty sure I'd have been happy with Hugo.
But after reading a [great blog post last week](https://garden.christophertee.dev/blogs/Memory-Alignment-and-Layout/Part-1),
I looked into how the site was made and stumbled upon [Quartz](https://quartz.jzhao.xyz/).
I fell in love, especially as it's spiritually similar to the [Zettelkasten method](https://zettelkasten.de/overview/).
