---
title: Two Weeks of Emacs
date: 2026-03-28
tags:
- software-engineering
---

I'm approximately 2 weeks into using emacs as my daily editor and, well, I haven't opened JetBrains since.
I honestly didn't expect that, but here we are.

# Papercuts I said I would solve later

Here's the list of things I noted in my last post that I said I'd come back to.
The list has changed a bit since the last post:

Solved:

- Issues with automatic indentation
- Files not reloading automatically when changed externally (fixed with `global-auto-revert-mode`)
- Highlighting mutable variables

Haven't bothered to try resolving (infrequently used):
- Macro expansion
- Code completion and jump to definition within rustdoc comments

The highlighting one is worth a bit of explanation.
Here's what I had to do to get it working:

```lisp
;; Highlight mutable variables (like RustRover/JetBrains).
;; NB: Requires eglot 1.20+
(defface eglot-semantic-mutable
  '((t :underline t))
  "Face for mutable variables via semantic tokens.")

(with-eval-after-load 'eglot
  (add-to-list 'eglot-semantic-token-modifiers "mutable"))
```

Apparently this requires a fairly recent version of eglot to work,
and it isn't necessarily supported by every LSP,
but it works for me with rust-analyzer.
I spent way too much time on this because for some reason running `M-x eglot-reconnect`
or `M-x eglot` and accepting a restart didn't reset the buffer settings or something.
If this doesn't work, try killing the buffer and then find the file again.

# Other (new) papercuts!

Here's a similarly categorized list of things that I found over the past week or so.

Solved:

- "Project" views: I got even more than I bargained for with `(setq tab-bar-mode t)`! It's great.
  It's even better than I expected TBH since every tab can contain an arbitrary configuration of buffers.
  This is a weird way of thinking at first, but it's really nice since stuff doesn't need to follow the traditional bounds
  that I was used to in IDEs (e.g. a tab can be entirely terminal buffers, or cross "projects" which is useful to me).
- `xref-matches-in-files` was SLOW. Turned out to be an issue in my `fish` configuration (which isn't even my "preferred" shell,
  but it's still my login shell due to being more supported than nushell, which I use for most things).
  Removing pyenv fixed that.
  Also you can set it to use ripgrep with `(setq xref-search-program 'ripgrep)`
- Fuzzy finding files by name within a project quickly annoyed me.
  Turns out this is also not an unreasonable hotkey with the built-in project.el: `C-x p f` (mnemonic: project find).
- Searching the project by _symbol_ (variable, struct, trait, etc.) works well with the `consult-eglot` package.
  Specifically, it includes a `consult-eglot-symbols` command.

Not solved yet:

- It was really nice to just fold sections of code by clicking something in the margin ("fringe" in emacs parlance; gutter in JetBrains).
  It looks like there are ways to do this; I just haven't had time to mess with it.
- The language server can get confused if you do a big operation like a git branch switch. Restarting eglot fixes this.
  I'm sure this happened occasionally with JetBrains but it seems worse here.
- The lovely `diff-hl` package doesn't get the hint when files reload for some reason.

I'll also add a quick note that it's (still) surprisingly easy to screw up your own config.
Emacs as a system is super flexible but that also makes it somewhat fragile.
Everything is programmable, in a single-threaded, garbage-collected language.

One snag I hit was that after some period, the environment got super slow,
affecting things like unit test runtimes in terminal buffers,
and making input noticeably laggy.
The issue turned out to be my `global-auto-revert-mode` config.
Apparently if you do it wrong, it turns into a whole stack of polling operations for every buffer.
This was a consequence of Claude suggesting something dumb and me not researching it :P
The normal configuration will use filesystem notifications like kqueue or inotify.

# What's next?

I'm pretty happy with the new setup overall.
Obviously some room for tweaks, but it's pretty great overall,
and I'm really enjoying the tab bar approach for organizing things.
I'm also frankly shocked at how little CPU I'm using relative to previous norms on my MacBook.

Next up I'll probably try (in no particular order):

- Magit / Majitsu; I actually love Sublime Merge, but wouldn't mind one less context switch.
  Especially if I can get a view of the current project easily based on context.
  Sublime's search interface is terrible when you have hundreds of repos.
- Chezmoi for dotfile sync + see what breaks on my desktop (FreeBSD).
- More adventures with TRAMP. I used this extensively in the early '00s but have mostly been doing local dev this time around.
  But I see emacs having a lot of potential for remote dev with TRAMP so I'll give that a shot for some stuff over the next few weeks.
