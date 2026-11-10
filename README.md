# Fridge Decision

**App:** https://jellyfishhamburger.github.io/fridge-decision/
**Fridge panel:** https://jellyfishhamburger.github.io/fridge-decision/display.html
**Panel sync / pairing:** https://jellyfishhamburger.github.io/fridge-decision/fridge-screen.html
**Settings:** https://jellyfishhamburger.github.io/fridge-decision/settings.html
**Where everything lives (architecture):** https://jellyfishhamburger.github.io/fridge-decision/stack.html

It answers one question — *what do I cook tonight, and why* — and the answer is ranked by
what is about to go off, not by what you happen to own. Everything else (inventory, recipes,
panel) exists to make that one decision easy to act on.

Started as an IDAT7211 group project; it now runs in one household, on a fridge panel, in two
languages.

## Contents (read from the code, data.js version 0.3 · 2026-11-05)

| Layer | Count | Source / note |
|---|---|---|
| Foods with a shelf life | **118** | 9 cited to the FDA/USDA cold-storage chart, 109 internal estimates — marked per item in the UI |
| Recipes | **373** | HowToCook (Anduin2017, CC-BY-4.0); each has needs, pantry, minutes, kcal, steps |
| Recipe kinds | 138 meat · 65 veg · 59 staple · 38 snack · 23 drink · 22 soup · 19 dessert · 9 condiment | only meat/veg/soup/staple count as "a dish" for the nightly decision |
| Local dish vocabulary | **151** across 13 cuisines | 「锅里这几样 → 有哪些经典菜」, no model needed |
| Pantry staples | 27 | assumed present, not counted as "missing" |
| One-person meal sets | 12 | main + side + staple, kcal and minutes summed |
| Dish photographs | 360 | Wikimedia Commons CC / public domain, credits + per-image licence in `img/dish/credits.json` |
| Food artwork | 107 line icons · 25 filled cook-art pictograms | drawn for a three-colour panel |

Recount any time:

```bash
node -e "global.window={};require('./data.js');require('./dishes.js');
console.log(window.FD_DATA.foods.length, window.FD_DATA.recipes.length, window.FD_DISHES.length)"
# 118 373 151
```

## Screens

| Page | What it is |
|---|---|
| `index.html` | Phone PWA, three tabs + settings: **fridge** (stock, countdown) · **discover** (ranked recipes, filters) · **build** (pick what you want, narrow by kcal / time / greens) |
| `cook.html` | 今天的锅 — cooking mode, step by step, consumes stock when it finishes |
| `add.html`, `capture.html` | Manual add; 采购整理 — photograph what you bought, recognition runs on device, stock is written only after you confirm |
| `gate.html`, `nocontact.html` | Hands-in-the-door logging; a single-camera no-contact option |
| `collect.html` | Sample capture for training the food classifier |
| `account.html` | Email sign-in and household (create / join by invite code) |
| `fridge-screen.html` | 400 × 300 panel sync centre: read household stock, download a device config, pair a panel |
| `display.html` | 296 × 128 three-colour e-paper strip simulation with three physical buttons |
| `disc.html` | 240 × 240 round puck (1.54″): a red-amber-green ring of what is about to go off |
| `settings.html` | What the panel shows, rotation speed, and the goals that drive ranking |
| `stack.html`, `backend.html` | Architecture and "how to add a backend" explainers |

## The decision rule

`logic.js → evaluate()`, one function, no model:

```
status   ready           every ingredient is in the fridge
         shop1           exactly one ingredient missing
         blocked         two or more missing, or nothing matches the catalogue

score  = Σ max(0, 8 − daysLeft) × 0.35            per used ingredient
       + (4 − soonest) × 2.2                      when the soonest item dies in ≤ 3 days
       + 4                                        if the dish lands a green and a greens goal is set
       − 1.2 × minutes over the weeknight limit
       − 10 × missing ingredients
```

The ranking axis is **the soonest item to die**, not the sum of expiring things: a fish with
one day left has to outrank two-day pork plus three-day tofu, or the fish is never cooked.
The remaining terms are deliberately small so a dish cannot climb by using many ingredients.
Expired items count as missing — they are not usable and not "in stock".

## What the numbers are worth

- 9 of 118 shelf lives are FDA/USDA-cited; 109 are internal estimates. The settings page shows
  which is which, because a demo that quotes a shelf life nobody can defend is worse than no number.
- Only 4 of 373 recipes carry reliable gram amounts, so cooking deducts **1 份 per ingredient**
  rather than implying exact quantities. The action is undoable, and `store.js` is the single
  write path (`reserve` / `complete` / `cancel`, all idempotent) so double taps and network
  retries cannot double-deduct.
- kcal and minutes come from each recipe page; 12 sets add rice at 150 kcal (estimate, same
  standard as single dishes).

## Optional backend (Supabase)

Inert by default: with no URL and key the app is exactly the static prototype it was —
localStorage only, zero network calls. Switch it on and:

- **Auth** — email magic link, two REST endpoints, no SDK (`auth.js`)
- **Household** — create or join by invite code; RLS means you only ever read your own household
  (`migrations/004_household.sql`, `002_rls.sql`)
- **Data** — read cloud-first, write local-first with an outbox drained by RPC (`cloud.js`)
- **Multi-device** — subscribe to `items`, refetch on change rather than merging payloads (`realtime.js`)

Migrations are additive and ordered by risk in `migrations/README.md`; `ALL_SAFE*.sql` are the
"paste once" bundles. No migration deletes data except `011_cleanup_demo.sql`, which is opt-in.

## On-device models (no API keys)

- `classifier.js` — 8-class fridge classifier: MobileNetV3Small fine-tuned on 8 staples,
  exported as `models/food8_u8.tflite`, run through MediaPipe. uint8 input is deliberate: float32
  input needs NormalizationOptions metadata that MediaPipe's image path will not give it.
  Anything the model does not recognise falls back to manual entry.
- `receipt.js` — receipt OCR in the browser (PaddleOCR / Tesseract in `vendor/`). A receipt is
  used to **cross-check**, never to write stock directly: bought ≠ in the fridge.

## Hardware

- Fridge panel: 400 × 300 e-ink on ESP32-C3; cooking knob: 1.28″ 240 × 240.
- Firmware lives on branch `hardware/cooking-pebble-md50e`; implementation notes in `docs/`
  (`FridgePebble_实施_v0.1.md`, `CookingPebble_硬件实施_v0.1.md`, `交接_HANDOFF_冰箱硬件.md`).
- The panel gets an identity from `fridge-screen.html`: the household creator downloads a device
  config (its own secret, not a login token), the panel fetches a snapshot over Wi-Fi, skips the
  refresh when nothing changed, and keeps the last frame when the network drops.

## Tests and tools

```bash
node --test tests/inventory.test.mjs      # inventory invariants
node tools/check-step-ing.js              # step ↔ ingredient annotation consistency
node tools/verify-sync.cjs                # sync round-trip against a configured backend
```

## Deliberately not built

- **Automatic inventory by vision.** The classifier knows 8 staples and every hit needs confirming.
- **Portions in grams.** See above — 4 of 373 recipes support it honestly.
- **Full nutrition.** One kcal estimate per recipe, nothing per 100 g.
- **A consumption history that supports forecasting.** There is a take/skip log and a meal log,
  not a time series you could model.

## Deploy

Static site, GitHub Pages from `main`. Any edit: commit + push, Pages rebuilds in about a minute.
Assets are referenced with `?v=` cache-busting parameters — bump the one you touched or the
browser and the service worker will serve the old file. `sw.js` is network-first for HTML.
