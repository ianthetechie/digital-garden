---
title: Date Insanity with JavaScript
tags:
- javascript
date: 2025-02-28
---

Earlier today, a friend sent me a joke about boycotting &lt;some big evil tech company&gt; for three days:
Feb 29, 30, and 31.
I thought this was pretty funny.
But then, darker thoughts started to form.

I've recently had the misfortune of doing far too much (read: any) work that involves JavaScript.
If you haven't seen [Gary Bernhardt's classic Wat talk](https://www.destroyallsoftware.com/talks/wat),
go watch that first.
It's less than 5 minutes long, and you'll probably need another 5 after to recover 🤣

That brings us to today's TIL.
Upon receiving said joke involving nonexistent dates in February,
and also being vaguly aware of [some new API designed to replace it](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal),
I decided to try this is JavaScript in my browser (Chromium-based,
so the results would probably apply to Node.js, Deno, and others).

```javascript
new Date('2025-02-29')
// Sat Mar 01 2025 09:00:00 GMT+0900 (Korean Standard Time)
```

Classic!
And lest you say this is a bug, here's what [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) has to say about this:

> Non-standard strings can be parsed in any way as desired by the implementation,
> including the time zone — most implementations use the local time zone by default.
> Implementations are not required to return invalid date for out-of-bounds date components,
> although they usually do. A string may have in-bounds date components (with the bounds defined above),
> but does not represent a date in reality (for example, "February 30").
> Implementations behave inconsistently in this case.
> The [`Date.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/parse#examples) page offers more examples about these non-standard cases.

I'm not aware of any sane language that does this.
I checked a handful, including Rust, Swift, Python, and golang.
All returned an error, threw an exception, or something similar.

My first assumption was that this was just another case of JS always preferring to do anything besides report an error.
But it turns out my browser actually does return `Invalid Date`
for "day" values greater than 31.
I can only imagine what went into the first implementation of this,
and is now set in stone for backward compatibility!

One final factoid. You may reasonably guess that the input to the date constructor is ISO 8601, but that's not quite true.
It's a [simplification of it](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-date-time-string-format),
and it also accepts partial input!
