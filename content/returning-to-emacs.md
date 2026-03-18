---
title: Returning to Emacs
date: 2026-03-18
tags:
- software-engineering
- shell
---

# JetBrains woes

I have been a fan of JetBrains products for over a decade by now,
and an unapologetic lover of IDEs generally.
I've used PyCharm since shortly after it launched,
and over the years I've used IntelliJ IDEA,
WebStorm, DataGrip, RustRover, and more.
I literally have the all products pack (and have for many years).

I truly believe that a good IDE can be a productivity multiplier.
You get refactoring, jump-to-definition, symbol-aware search,
saved build/run configurations, a nice and consistent interface
to otherwise terrible tooling (looking at you CMake and the half dozen Python package managers
of the last decade and change).

But something has changed over the past few years.
The quality of the product has generally deteriorated in several ways.
With the advent of LSP, the massive lead JetBrains had in "code intelligence"
has eroded, and in many cases no longer exists.
The resource requirements of the IDE have also ballooned massively,
even occasionally causing memory pressure on my amply equipped MacBook Pro with 32GB of RAM.

(Side note: I regularly have 3 JetBrains IDEs open at once because I need to work in many languages,
and for some reason they refuse to ship a single product that does that.
I would have paid for such a product.)

And as if that weren't enough, it seems like I have to restart to install some urgent nagging update
several times/week, usually related to one of their confusing mess of AI plugins
(is AI Chat what we're supposed to use? Or Junie? Or... what?).
To top it all off, stability has gone out the window.
At least once/week, I will open my laptop from sleep,
only to find out that one or more of my JetBrains IDEs has crashed.
Usually RustRover.
Which also eats up like 30GB of extra disk space for things like macro expansions
and other code analysis.
The taxes are high and increasing on every front.

# My philosophy of editors

So, I decided the time was right to give Emacs another shot.

If you know me personally, you may recall that I made some strong statements in the past
to the effect that spending weeks writing thousands of lines of Lua to get the ultimate Neovim config was silly.
And my strongly worded statements of the past were partially based on my own experiences with such editors,
including Emacs.
Basically, I appreciate that you _can_ "build your own lightsaber",
but I did not consider that to be a good use of my time.
One of the reasons I like(d) JetBrains is that I _didn't_ ever need to think about tweaking configs!

But things have gotten so bad that I figured I'd give it a shot with a few stipulations.

1. I would try it for a week, but if it seriously hampered my productivity after a few days, I'd switch back.
2. I was only going to spend a few hours configuring it.

With these constraints, I set off to see if I needed to revise my philosophy of editors.

# Why Emacs?

Aside: why not (Helix|Neovim|Zed|something else)?
A few reasons, in no particular order:

- I sorta know Emacs. I used it as one of my primary editors for a year or two in the early 2010s.
- I tried Helix for a week last year. It didn't stick; something about "modal editing" just does not fit with my brain.
- I don't mind a terminal per se, but we invented windowing systems decades before I was born and I don't understand the fascination
  with running _everything_ in a terminal (or a web browser, for that matter :P).
- If I'm going to go through the pain of switching, I want to be confident it'll be around and thriving in another 10 years.
  And it should work everywhere, including lesser known platforms like FreeBSD.
- If your movement keys require a QWERTY layout, I will be very annoyed.

# First impressions (3 days in)

So, how's it going so far?
Here are a few of the highlights.

## LSPs have improved a lot!

It used to be the case that JetBrains had a dominant position in code analysis.
This isn't the case anymore, and most of the languages I use that would benefit from an LSP
have a great one available.
Things have improved a lot, particularly in terms of Emacs integrations,
over the past decade!
[`eglot`](https://www.gnu.org/software/emacs/manual/html_node/eglot/Eglot-Features.html) is now bundled with Emacs,
so you don't even need to go out of your way to get some funky packages hooked up
(like I had to with some flycheck plugin for Haskell back in the day).

### Refactoring tools have also improved

The LSP-guided tools for refactoring have also improved a lot.
It used to be that only a "real IDE" had much better than grep and replace.
I was happy to find that `eglot-rename` "just worked".

### Docs

I'm used to hovering my mouse over any bit of code, waiting a few seconds,
and being greeted by a docs popover.
This is now possible in Emacs too with `eldoc` + your LSP.
I added the [`eldoc-box`](https://github.com/casouri/eldoc-box) plugin and configured it to my liking.

### Quick fix actions work too!

So far, every single quick-fix action that I'm used to in RustRover
seems to be there in the eglot integration with rust-analyzer.
It took me a few minutes to realize that this was called `eglot-code-actions`),
but once I figured that out, I was rolling.

## Jump to definition works great, but navigation has caveats

I frequently use the jump-to-definition feature in IDEs.
Usually by command+clicking.
You can do the same in Emacs with `M-.`, which is a bit weird, but okay.
I picked up the muscle memory after less than an hour.
The weird thing though is what happens next.
I'm used to JetBrains and most other well-designed software (*glares in the general direction of Apple*)
"just working" with the forward+back buttons that many input devices have.
Emacs did not out of the box.

One thing JetBrains did fairly well was bookmarking where you were in a file, and even letting you jump back after
navigating to the definition or to another file.
This had some annoying side effects with multiple tabs, which I won't get into but it worked overall.
In Emacs, you can return from a definition jump with `M-,`, but there is no general navigate forward/backward concept.
This is where the build-your-own-lightsaber philosophy comes in I guess.
I knew I'd hit it eventually.

I tried out a package called `better-jumper` but it didn't _immediately_ do what I wanted,
so I abandoned it.
I opted instead to simple backward and forward navigation.
It works alright.

```lisp
(global-set-key (kbd "<mouse-3>") #'previous-buffer)
(global-set-key (kbd "<mouse-4>") #'next-buffer)
```

Aside: I had to use `C-h k` (`describe-key`) to figure out what the mouse buttons were.
Advice I saw online apparently isn't universally applicable,
and Xorg, macOS, etc. may number the buttons differently!

## Terminal emulation within Emacs

The emacs `shell` mode is terrible.
It's particularly unusable if you're running any sort of TUI application.
I friend recommended [`eat`](https://codeberg.org/akib/emacs-eat) as an alternative.
This worked pretty well out of the box with most things,
but when I ran `cargo nextest` for the first time,
I was shocked at how slow it was.
My test suite which normally runs in under a second took over 30!
Yikes.
I believe the slowness is because it's implemented in elisp,
which is still pretty slow even when native compilation is enabled.

Another Emacs user recommended I try out [`vterm`](https://github.com/akermu/emacs-libvterm), so I did.
Hallelujah!
It's no iTerm 2, and it does have a few quirks,
but it's quite usable and MUCH faster.
It also works better with full-screen TUI apps like Claude Code.

## Claude Code CLI is actually great

I'm not going to get into the pros and cons of LLMs in this post.
But if you use these tools in your work,
I think you'll be surprised by how good the experience is with `vterm` and the `claude` CLI.
I have been evaluating JetBrains' disjoint attempts at integrations with Junie,
and more recently Claude Code and Codex.

Junie is alright for some things.
The only really good thing I have to say about the product is that at least it let me select a GPT model.
Anthropic models have been severely hampered in their ability to do anything useful in most codebases I work in,
due to tiny context windows.
That recently changed when they rolled out a 1 million token context window to certain users.

They confusingly refer to Claude Code as "Claude Agent" and team subscriptions automatically include some monthly credits.
Every single JetBrains IDE will install its own separate copy of Claude Code (yay).
But it _is_ really just shelling out to Claude Code it seems.

So I assumed the experience and overall quality would be similar.
Well, I was VERY wrong there.
Claude Code in the terminal is far superior for a number of reasons.
Not just access to the new model though that helps.
You can also configure "effort" (lol), and the "plan" mode seems to be far more sophisticated than what you get in the JetBrains IDEs.

So yeah, if you're going to use these tools, just use the official app.
It makes sense; they have an incentive to push people to buy direct.
And it so happens that Claude Code fits comfortably in my Emacs environment.

Also, LLMs generally are excellent at recommending Emacs packages and config tweaks.
So it's never been easier to give it a try.
I've spent something like 2-3x longer writing this post than I did configuring Emacs.
(And yes, before you ask, this post is 100% hand-written.)

## VCS integration

While I'm no stranger to hacking around with nothing more than a console,
I really don't like the git CLI.
I've heard jj is better, but honestly I think GUIs are pretty great most of the time.
I will probably try magit at some point,
but for now I'm very happy with Sublime Merge.

But one thing I MUST have in my editor is a "gutter" view of lines that are new/changed,
and a way to get a quick inline diff.
JetBrains had a great UX for this which I used daily.
And for Emacs, I found something just as great: [`diff-hl`](https://github.com/dgutov/diff-hl).

My config for this is very simple:

```lisp
(unless (package-installed-p 'diff-hl)
  (package-install 'diff-hl))
(use-package diff-hl
  :config
  (global-diff-hl-mode))
```

To get a quick diff of a section that's changed,
I use `diff-hl-show-chunk`.
I might even like the hunk review experience here better than in JetBrains!

## Project-wide search

I think JetBrains has the best search around with their double-shift, cmd+shift+o, and cmd-shift-f views.
I have not yet gotten my Emacs configured to be as good.
But `C-x p g` (`project-find-regexp`) is pretty close.
I'll look into other plugins later for fuzzy filename/symbol search.
I _do_ miss that.

## Run configurations

The final pleasant surprise is that I don't miss JetBrains run configurations as much as I expected.
I instead switch to putting a [`justfile`](https://just.systems/man/en/introduction.html) in my repo and populating that with my run configurations
(much of the software I work on has half a dozen switches which vary by environment).
This also has the side effect of cleaning up some of my CI configuration (`just` run the same thing!)
and also serves as useful documentation to LLMs.

## Spell checking

I have [`typos`](https://github.com/crate-ci/typos) configured for most of my projects in CI,
but it drives me nuts when an editor doesn't flag typos for me.
JetBrains did this well.
Emacs has nothing out of the box (Zed also annoyingly doesn't ship with anything, which is really confusing to me).
But it's easy to add.

I went with Jinx.
There are other options, but this one seemed pretty modern and worked without any fuss, so I stuck with it.

# Papercuts to solve later

This is all a lot more positive than I was expecting to be honest!
I am not going to cancel my JetBrains subscription tomorrow;
they still _do_ make the best database tool I know of.
But I've moved all my daily editing to Emacs.

That said, there are still some papercuts I need to address:

- Macro expansion. I liked that in RustRover. There's apparently a way to get this with `eglot-x` which I'll look into later.
- Automatic indentation doesn't work out of the box for all modes to my liking. I think I've fixed most of these but found the process confusing.
- Files don't reload in buffers automatically with disk changes (e.g. `cargo fmt`)!
- Code completion and jump to definition don't work inside rustdoc comments.
- RustRover used to highlight all of my `mut` variables. I would love to get that back in Emacs.
