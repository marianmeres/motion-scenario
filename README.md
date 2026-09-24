# @marianmeres/motion-scenario

[![JSR](https://jsr.io/badges/@marianmeres/motion-scenario)](https://jsr.io/@marianmeres/motion-scenario)
[![NPM](https://img.shields.io/npm/v/@marianmeres/motion-scenario)](https://www.npmjs.com/package/@marianmeres/motion-scenario)
[![License](https://img.shields.io/npm/l/@marianmeres/motion-scenario)](LICENSE)

A plain-text format for describing a motion-design video — its **beats**, the **words** on screen
in every language, and the **stage directions** for each beat — and the tools that turn that file
into a checkable contract: a parser, a checker, a timing resolver and a words extractor.

It is a description, not an animation library. It has no engine types, no coordinates, no easing,
and no absolute time except end-card holds. A human writes the file; a person or an agent
implements it in whatever renders pixels; the tools keep both honest.

```
scene workflow ends full
	beat remind
		en  Get a nudge when it is thirsty.
		sk  Dostanete štuchanec, keď je smädná.
		card steps aside
		and phone enters from the right, just after
		reminder pops
		reminder blinks once
```

## Why

Writing a video as code has one expensive step: review. The director does not want to read scene
code, and the words end up living both in a review table and in the code. A scenario is the
review table made real:

- **Readable.** It reads aloud like a choreographer talks: _the card steps aside and the phone
  comes in, then the reminder pops._
- **Checkable.** Every language has every beat, every direction names a declared thing, every
  verb is either implemented or reported as new, the running time is estimated per language.
- **Owned once.** The words live in the scenario and are exported as data; the code never carries
  a copy.
- **Renderer-agnostic.** The resolved timeline is plain JSON: absolute seconds, bound verbs,
  arguments. The [DOM example](./examples/dom/) plays it with CSS classes; a video engine would
  play the same data.

## Install

```sh
deno add jsr:@marianmeres/motion-scenario
npx jsr add @marianmeres/motion-scenario   # Node
```

The CLI is Deno-only:

```sh
deno run -A jsr:@marianmeres/motion-scenario/cli check my-video.scenario
```

## Quick start

1. Write `my-video.scenario` (start from
   [`examples/sprout.scenario`](./examples/sprout.scenario); the format is in
   [SPEC.md](./SPEC.md), the friendly walkthrough in [docs/guide.md](./docs/guide.md)).
2. Check it:

   ```sh
   deno run -A jsr:@marianmeres/motion-scenario/cli check my-video.scenario
   ```

   ```
   my-video.scenario: 0 error(s), 2 warning(s)

   warnings:
     L45   W_NEW_MOTION         new motion `types ui.plantName` on `card` (FormCard)
     L46   W_NEW_MOTION         new motion `types ui.waterEvery` on `card` (FormCard)

   new motions (implement these, then add them to the registry):
     types ui.plantName (FormCard)            L45
     types ui.waterEvery (FormCard)           L46

   timeline en — 14.50 s
      #  beat       scene       start    dur  by     mom  headline
      0  hook       intro        0.00   3.00  words    2  Plants forget nothing. You do.
      1  add        workflow     3.00   2.50  words    3  Add a plant.
      ...
   running time: en 14.50 s, sk 13.50 s
   ```

3. Give the project a config (component types, project verbs, style preset, format budgets —
   see [`examples/sprout.config.json`](./examples/sprout.config.json)) and the new-motion
   warnings become bound verbs:

   ```sh
   deno run -A jsr:@marianmeres/motion-scenario/cli check my-video.scenario --config my.config.json
   ```

4. Implement it from the resolved timeline and the words:

   ```sh
   deno run -A jsr:@marianmeres/motion-scenario/cli resolve my-video.scenario --config my.config.json > timeline.json
   deno run -A jsr:@marianmeres/motion-scenario/cli words   my-video.scenario > words.json
   deno run -A jsr:@marianmeres/motion-scenario/cli board   my-video.scenario > board.md   # the review artifact
   ```

   The implementer's workflow, for people and agents, is in
   [docs/implementing.md](./docs/implementing.md).

## Library

```ts
import { analyze } from "@marianmeres/motion-scenario";

const a = analyze(text, config); // parse → check → resolve → words
if (!a.ok) throw new Error(a.errors.map((e) => `L${e.line} ${e.message}`).join("\n"));

for (const beat of a.resolved!.timelines.en.beats) {
	showHeadline(beat.text?.headline, beat.textReadableAt);
	for (const m of beat.moments) {
		for (const d of m.directions) {
			schedule(d.start, d.subject, d.motion ?? d.phrase, d.duration);
		}
	}
}
```

The steps are also separate: `parse(text)`, `check(scenario, config)`, `resolve(scenario, config)`,
`words(scenario)`, and `formatReport` / `formatBoard` for the text outputs. Everything is pure and
browser-safe; only the CLI touches the file system. Full reference: [API.md](./API.md).

## The DOM example

[`examples/dom/`](./examples/dom/) parses, checks and resolves
[`sprout.scenario`](./examples/sprout.scenario) **in the browser** and plays it with
[@marianmeres/vanilla](https://jsr.io/@marianmeres/vanilla) and plain CSS transitions. The player
maps each resolved direction's verb to a CSS class and fires it at the resolved second; the
stylesheet is the renderer's whole "motion library". A panel shows the resolved beats and the check
report next to the stage.

```sh
deno task example        # builds examples/dom/dist/bundle.js and serves http://localhost:8787/dom/
```

Add `?autoplay` (and `&lang=sk`) to the URL to start playing on load.

## What is in the box

|                                                |                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| [SPEC.md](./SPEC.md)                           | The format, normative: syntax, model, timing, checks, vocabulary, config |
| [docs/guide.md](./docs/guide.md)               | Writing a scenario, for the director                                     |
| [docs/implementing.md](./docs/implementing.md) | From a scenario to code, for the implementer (human or agent)            |
| [API.md](./API.md)                             | The library and CLI reference                                            |
| [AGENTS.md](./AGENTS.md)                       | Working on this package                                                  |

## What it is not

- Not an animation language: it has no numbers except holds.
- Not an interpreter of adjectives: motion character is a preset, defined once, in code.
- Not a workflow engine: `status proposed` in the header is text for humans.

## License

[MIT](./LICENSE)
