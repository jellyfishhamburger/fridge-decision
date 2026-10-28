# Fridge Decision — prototype v0 (decision layer)

**Live:** https://jellyfishhamburger.github.io/fridge-decision/

IDAT7211 group project. This prototype deliberately contains **no hardware and no image
recognition**: it exists to test the one thing the user research says people are actually
missing — *a decision*, not another inventory list.

## What it does

1. **In your fridge** — a list of items with days-left, colour-coded (green → amber → red).
2. **Add item** — pick a category (camera button is wired to the real camera but does *not*
   guess the item yet; recognition is intentionally out of scope for v0).
3. **Decide for me** — one primary suggestion plus two alternatives, each showing:
   - the exact items it consumes (always the most urgent instance of each),
   - whether it delivers today's greens,
   - cooking time against a user limit,
   - step-by-step method.
4. **Load demo fridge** — seeds the leftovers from our interviews (tofu, shrimp, greens,
   onion, dumplings, eggs) so the decision can be demonstrated live in 10 seconds.

## Where the logic lives

`index.html` is the whole app. The scoring function is `scoreDish()`:

```
score = urgency  (0..~7 per used item, = max(0, 8 - daysLeft) * 0.9)
      + greensBonus (4, if the dish lands a green and the user has a greens goal)
      - timePenalty (1.4 per minute over the user's limit)
```

`DISHES` declares exact catalogue ids, so the "why this one" line can never name an
ingredient the dish does not use. Adding a dish = one object. Adding an ingredient = one
line in `CATALOG`.

## Deliberately not built (next)

- Real ingredient recognition (vision) — needs a model, not a rule table.
- "Ate greens today" logging, so the greens bonus is once-per-day instead of always on.
- Hardware: magnetic module / fridge display. Out of scope for the midterm.
- Multi-user (a shared fridge is used by more than one person; this prototype is
  single-device, single-user — a known limitation we state rather than hide).

## Deploy

Static site, GitHub Pages from `main`. Any edit: commit + push, Pages rebuilds in ~1 min.
Service worker is network-first for the HTML, so edits appear immediately on reload.
