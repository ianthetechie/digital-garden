---
title: KWDC 24
tags:
- conferences
- AI
- translation
- apple
- Swift
---

Yesterday I had the pleasure of attending KWDC 24,
an Apple developer conference modeled after WWDC,
but for the Korean market.
Regrettably, I only heard about it a few days prior
through a friend at the [Seoul iOS Meetup](https://www.meetup.com/seoul-ios-meetup/),
so I wasn’t able to give a talk.

# Overall impressions

The iOS meetup typically has 20-30 attendees.
But wow... the turnout at KWDC far exceeded my expectations.
Nearly 600 attendees showed up,
and this is only its second year (I also didn’t hear about it last year;
clearly I live under a rock)!
The staff were well organized and friendly,
and the international participation was significantly better than I had expected.

# The challenge of multi-lingual events

Surprisingly, most of the (30+) event staff also spoke English very well (that’s a first for a Korean conference that I’ve been to).
I think the organizers did an excellent job in not only attracting an international audience
([one speaker](https://nerdyak.tech/) flew in from Czechia!),
but also making them feel welcome.
Hats off to the organizing team for that!
This makes me really happy, and I hope this is a big step in raising the level of conferences here.

Not only did they have a mix of English and Korean talks,
they handled live translation much better than any other event I’ve seen: [Flitto](flitto.com).
Apparently it’s a Korean company,
and they were using some AI models to do the heavy lifting.
It had some hiccups to be sure,
but it did a surprisingly good job.
The main complaint I heard was that it would wait for half or 2/3 of a screenful of content, causing jumps that were hard to read.

The speakers I talked with said they had to provide a script in advance,
which we speculate were used to improve the quality of the translations
(which were still live, even when the presenter went “off script”).
The model still mis-recognized some technical terms on occasion,
but these are acceptable hiccups.
Overall, the quality of the translation was excellent,
and I think this will be the future of live translation.
I’ve been at half a dozen events where they give you a radio receiver
and an earpiece for live translation.
This is almost always a flop for many reasons,
and I have to say the text on screen approach was preferred by everyone I talked to.

![View of the stage during a talk about Swift 6, showing the screen with live translation next to the slides](images/IMG_8818.jpeg)

# Favorite talks

My favorite talk was Pavel’s on “The Magic of SwiftUI Animations.”
He even walked up to the podium in a wizard robe 🧙
I was blown away by the amount of effort that he put into the slides,
and got a bunch of things to follow up on (like this [video on shaders](https://m.youtube.com/watch?v=f4s1h2YETNY)).
Talking with him after, he said it was the culmination of around 4 years of effort.

![Pavel Zak on stage](images/IMG_8820.jpeg)

[Riana’s](https://x.com/riana_soumi) talk on Swift Testing
got me fired up to switch.
I wanted to shout with excitement when I heard that Swift *finally*
supports parameterized tests in a native testing framework!
And it’s [open source](https://github.com/swiftlang/swift-testing),
so I hope it will be improve faster than XCTest.
Who knows; maybe it’ll even get property testing (like QuickCheck, Hypothesis, etc.)!

The third talk that stuck out to me was [Rudrank’s](https://www.rudrank.com/)
talk on widgets.
He was a GREAT presenter, with a number of Korean expressions woven throughout,
which the audience loved.
I also liked how he cleverly wove the Rime of the Ancient Mariner throughout
the talk (the title was “Widgets, Widgets Everywhere, and not a Pixel to Spare”).
My biggest learning was in the weird differences in the mental model for updates:
it’s all about the timeline!

# Networking

Networking at Korean conferences is typically a bit slow to be honest,
as it is not normal in Korean culture to walk up to someone
and start a conversation without much context.
This event also happened to be somewhat exceptional!

For starters, one minor shortcoming is that there was no clear announcement of lunch options.
Everyone was on their own, and the info was rather buried in some PDFs (which I didn’t get somehow)
and Discord (which I had a hard time navigating).
Together with a Danish friend I met at the iOS meetup a few days prior,
I suggested we wing it and just follow the crowd outside to see where we ended up 🤣

We ended up taking a few turns following the group in front of us,
and eventually I asked them if they would be cool with us crashing their party.
We ended up at a crowded Donkatsu buffet a few minutes later.
Both were iOS engineers, one working at Hyundai AutoEver,
and another at [오늘의집](https://www.bucketplace.com/en/),
and we had a great conversation over lunch!
(They even bought us coffee; so friendly!)

One of them mentioned that we should check out the networking area in-between sessions, which I did later.
It was a bit hard to find, since it was in a narrow hall,
after you passed through a cafe on another floor.
I think this could have been announced a bit better,
since not many people used it, but the conversations I had there were great!

Aside: another cool thing that I haven’t seen done elsewhere is round-table Q&A.
Along with the session times, each speaker was available for Q&A around (literally)
round tables near the networking zone.
Very cool idea!

The networking area had one room dedicated to local communities as well,
including the Seoul iOS Meetup,
the Korean [Swift Coding Club](https://github.com/Swift-Coding-Club),
and the AWS Korea User group.
The Swift Coding Club in particular was a super cool group.
Several were students,
and one was working on some apps related to EV charging.
This naturally lead to a conversation about the geocoding,
maps, and navigation SDKs I’ve been working on at [Stadia Maps](https://docs.stadiamaps.com/sdks/overview/).
It was a good time!

Finally, there wasn’t a big after-party or anything,
but there was a small event at a bar organized for the speakers and sponsors.
I didn’t speak, but they were fine letting me tag along.
I ended up talking for well over an hour with Riana about everything from Swift
to world cultures to under-representation of women in tech.
And she 100% sold me on attending [`try! Swift`](https://tryswift.jp/_en)
in Tokyo next year.
And Mark from [RevenueCat](https://www.revenuecat.com/),
who I also met at the iOS meetup prior,
taught me a bunch of things I didn’t know about the history of MacRuby
(turns out he built the first BaseCamp app using RubyMotion back in the day!).

I ended up getting home at 1:30am for the second time this week.
But it was worth it!