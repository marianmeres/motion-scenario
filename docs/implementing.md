# Implementing a scenario

For whoever turns a `.scenario` into a running video: a person, or an agent handed the file and a
renderer (a DOM page, a canvas, a video engine, a slide tool). The scenario is the contract. This
page is the procedure. The format itself is in [SPEC.md](../SPEC.md); the reference example is
[`examples/sprout.scenario`](../examples/sprout.scenario) and the DOM renderer in
[`examples/dom/`](../examples/dom/) is a complete, small implementation of everything below.

## 1. Read the file

A scenario has four kinds of blocks. Read them in this order:

| Block            | What it tells you                                                                                                                                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `video`          | Slug, output `formats`, `languages` (first = reference), `music` grid, `style` preset name, and free notes (`status`, `audience`, `remember`, `cta`) that are the brief.                        |
| `cast`           | Every thing that will move, with its component type. `new:` members do not exist yet: build them. `<n>x <member>` is a group. `on <host>` nests. Trailing tokens (`ui.<key>`, a URL) are props. |
| `ui <key>`       | Translated strings inside the UI. Bind them to component props.                                                                                                                                 |
| `scene` → `beat` | The video, in order. Each beat: the words per language, then directions, holds and notes.                                                                                                       |

How to read one beat:

```
beat remind                                   ← id; role hook/end carries rules
  en  Get a nudge when it is thirsty.         ← shown at the beat's start, replaced at the next
  sk  Dostanete štuchanec, keď je smädná.
  card steps aside                            ← moment 1
  and phone enters from the right, just after ← still moment 1, starts a hair later
  reminder pops                               ← moment 2, after moment 1 completes
  reminder blinks once                        ← moment 3
  - the reminder should feel like a nudge     ← a note: advice, not a rule
```

- A line with no leading word, or `then`, starts a new **moment** after the previous one ends.
  `and` joins the current moment. `, just after` offsets within it.
- The **subject** is a cast name, optionally `.part`. The **verb phrase** is one of the vocabulary
  (SPEC §7) or a project verb; anything else is a **new motion** for you to build.
- `from`, `to`, `on`, `with` carry arguments (a side, a pose, a host, a `ui.<key>`).
- The only per-line adjustments: `slowly`, `quickly`, `with overshoot`, `softly`.
- The headline is never directed. It changes at every beat; a `hook` beat has it on screen at
  frame 0 instead of animating it in.

## 2. Check it

```sh
deno run -A jsr:@marianmeres/motion-scenario/cli check video.scenario --config project.config.json
```

- **Errors** (missing translation, undeclared name, structure): fix them _with the author_.
  Never silently repair the file; the file is theirs.
- **Warnings** are your work list:
  - `W_NEW_MOTION` → implement the motion, then add it to the config (§5) so it binds next time.
  - `W_NEW_COMPONENT` / `W_UNKNOWN_TYPE` → build the component; add its type to the config.
  - `W_BUDGET`, `W_HEADLINE_*`, `W_BLACKLIST`, `W_DOUBLE_POP` → tell the author; these are
    editorial.
- Use `--strict` in CI once the config is complete.

## 3. Get the data

```sh
… resolve video.scenario --config project.config.json > timeline.json   # what to schedule
… words   video.scenario > words.json                                    # what to say
… board   video.scenario --config project.config.json > board.md         # what to review
```

Or in code: `const a = analyze(text, config); a.resolved; a.words;` (see [API.md](../API.md)).

`timeline.json` has, per language, every beat with absolute `start`/`end`, when its text is
readable, what bounded its length, and its moments; every direction with absolute `start`,
`duration`, the bound `motion` (or `null`), `object`, `args`, `modifiers`, `count`, `group`. The
numbers are an **estimate** from the preset; your render is the truth. Keep them close by keeping
the preset honest (§5).

## 4. Build the cast

| In the file                                    | You build                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `card  FormCard`                               | One instance of your `FormCard`, addressable by the name `card`                                                           |
| `plants  3x plant`                             | Three instances of `plant`'s type; a direction on `plants` applies to all, `one by one` staggers them by `preset.stagger` |
| `reminder  Notification on phone  ui.reminder` | A `Notification` inside `phone`, with the `ui.reminder` string for the current language                                   |
| `wilted  new: a plant that visibly droops`     | A new component; add its type to the config when done                                                                     |
| `card.button` in a direction                   | A part your `FormCard` exposes; declare it in `types.FormCard.parts`                                                      |

The DOM example does this with markup: one element per member, `data-cast="<name>"`, groups as
repeated elements, hosted members nested inside their host.

## 5. Build the vocabulary and the preset

Implement every core verb (SPEC §7.1) and every project verb, and put the durations your
implementation actually uses into the config. The preset **is** your motion library's timing
table; the resolver's estimate is only as good as that.

| Verb                                                                        | What a renderer does                                                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `appears`, `enters from <side>`                                             | opacity 0→1 with a short travel into place (from the named side when given), ease-out, `preset.enter`                                          |
| `pops`                                                                      | scale-in with overshoot, `preset.pop`                                                                                                          |
| `leaves`, `exits to <side>`                                                 | the reverse, ease-in, `preset.leave`                                                                                                           |
| `moves to <pose>`, `steps aside` (= `aside`), `takes the stage` (= `stage`) | tween to a **named pose**; poses are positions you define per output format                                                                    |
| `becomes the focus`                                                         | the subject holds; everything else dims and recedes                                                                                            |
| `grows`, `shrinks`                                                          | scale tween, `preset.scale`                                                                                                                    |
| `blinks once`                                                               | one short accent, `preset.accent`                                                                                                              |
| `shows ui.a, ui.b`                                                          | reveal each named piece of content, staggered by `preset.stagger`                                                                              |
| project verbs (`types`, `submits`, `scans`, …)                              | whatever the component does; a **composite** verb is several steps, and the author overrides it by writing the smaller verbs on separate lines |

Modifiers: `slowly` / `quickly` are already applied to `duration` in the timeline;
`with overshoot` and `softly` are yours to map to curves.

Register what you built:

```jsonc
{
	"types": {
		"FormCard": { "parts": ["button"], "verbs": { "types": { "duration": 0.8 } } }
	},
	"verbs": { "wobbles": { "duration": "accent" } },
	"preset": { "enter": 0.5, "pop": 0.5, "stagger": 0.12 },
	"formats": { "reel": { "budget": [15, 25] } }
}
```

## 6. Schedule

Pseudo-code of a conforming player (the DOM example is this, in ~200 lines):

```
for each beat b (in order):
  at b.start:
    if the beat starts a new scene:
      previous scene `ends clean`  → the stage is already empty (your directions did it; verify)
      previous scene `ends full`   → play this scene's `transition` (push, slide, crossfade, cut)
    set the headline (+ sub) for the current language
      role hook → visible immediately; otherwise animate in over preset.textIn
  for each moment m, for each direction d:
    at d.start: run motion(d.motion ?? d.phrase, subject(d), args, modifiers) for d.duration
      group / several objects with d.group == "oneByOne" → member i starts i × preset.stagger later
  role end → hold still until b.end (b.holdSeconds)
the video ends at timeline.total
```

Everything a step needs is on the resolved direction: `subject`, `part`, `motion`, `object`,
`args.from/to/on/with`, `modifiers`, `count`, `group`, `start`, `duration`. A `motion: null`
direction is a new motion; do not skip it silently — build it or ask.

## 7. Deviate honestly

Where the code departs from a direction (a pose that did not work, a verb that read better
another way), say so in the review, and update the scenario to what was built. After that, the
scenario is both the reviewed intent and the words; the code is the mechanics. The words never
live in the code: read them from `words` at build or run time.

## Checklist

- [ ] `check --config` has no errors; every warning is either fixed, built, or answered
- [ ] every cast member exists; `new:` members built and typed in the config
- [ ] every verb in the file is bound (no `motion: null` left in `resolve`)
- [ ] the preset in the config matches the durations the code uses
- [ ] text per language comes from `words`, not from copies
- [ ] a hook beat has its text at frame 0; an end beat holds
- [ ] scene boundaries honour `ends` and `transition`
- [ ] the render's running time per language is within a grid beat of `timeline.total`
- [ ] deviations are written back into the scenario
