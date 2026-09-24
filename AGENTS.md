# @marianmeres/motion-scenario — Agent Guide

Two kinds of agent read this file. **Working on this package** (parser, checker, resolver, docs):
this file and `docs/`. **Consuming a `.scenario` in another project** (you were handed a file and
must implement the video): read [SPEC.md](./SPEC.md) and
[docs/implementing.md](./docs/implementing.md) instead; this file is only about the package's own
code.

## Quick Reference

- **Stack**: Deno 2, TypeScript, zero runtime dependencies in `src/` (the CLI uses `@std/cli`
  and `@std/path`; the example uses `@marianmeres/vanilla`)
- **Test**: `deno task test` | **Types**: `deno task check` | **Lint**: `deno task lint` |
  **Format**: `deno fmt`
- **CLI**: `deno task cli check examples/sprout.scenario --config examples/sprout.config.json`
- **Example**: `deno task example` (bundles `examples/dom/main.ts`, serves `http://localhost:8787/dom/`)
- **Publish**: JSR (`.` and `./cli`) and npm (core only, via `scripts/build-npm.ts`)

## What it is

A plain-text format (`.scenario`) describing a motion-design video — beats, words per language,
stage directions — plus the tools that make it a checkable contract. It animates nothing. The
resolved timeline (JSON) is what a renderer consumes.

## Project Structure

```
src/
  model.ts     types of the parsed scenario; no engine types, no absolute time
  parser.ts    text → Scenario | errors; registry-free; collects every structural error
  config.ts    ProjectConfig, defaults, CORE_VERBS, preset, resolveConfig()
  bind.ts      verb phrase → vocabulary entry (longest phrase, plural forms, type > project > core)
  check.ts     content rules (SPEC §6); errors + warnings + newMotions + newComponents
  resolve.ts   timing estimate per language (SPEC §5): moments, reading time, grid snapping
  words.ts     per-language strings as data
  report.ts    formatReport (check output), formatBoard (markdown), formatIssues
  analyze.ts   parse → check → resolve → words in one call
  cli.ts       Deno CLI: check | resolve | words | board  (JSR-only, not in the npm build)
  mod.ts       public exports (everything except cli.ts)
tests/         one file per module + cli; fixtures/broken.scenario; helpers.ts (inline scenarios)
examples/      sprout.scenario + sprout.config.json (the reference example every doc uses)
  dom/         browser player: index.html + style.css + main.ts → dist/bundle.js (gitignored)
docs/          guide.md (writing), implementing.md (consuming), architecture, conventions, tasks
SPEC.md        normative format spec  ·  API.md  ·  README.md
tmp/           gitignored scratch (holds the original design proposal and its origin sketch)
```

## Pipeline

```
text ──parse──▶ Scenario ──check──▶ CheckResult ──┐
                   │                              ├──▶ Analysis (analyze.ts) ──▶ report / board / JSON
                   ├──resolve──▶ ResolveResult ───┤
                   └──words────▶ Words ───────────┘
```

`check` calls `resolve` (for budgets); both call `bind` per direction with `resolveConfig(config)`.

## Critical Conventions

1. **`src/` is browser-safe.** No `Deno.*`, no file system, except in `cli.ts`. The DOM example
   bundles `src/mod.ts` for the browser and must keep working.
2. **Never throw on content.** Parse and check collect `Issue[]`; `parse()` returns
   `scenario: null` when there are errors. Only programmer errors throw.
3. **The parser knows the grammar, not the vocabulary.** Verb binding is `bind.ts`, applied by
   `check` and `resolve`. Do not add vocabulary knowledge to `parser.ts`.
4. **Everything the resolver decides is in its output.** No hidden defaults: a new duration or
   rule appears in `ResolvedDirection` / `ResolvedBeat` and in SPEC §5.
5. **A rule is code + spec + test.** New check → `check.ts` (or the parser for structure), a row in
   SPEC §6, a case in `tests/check.test.ts` (or `parser.test.ts`). Codes are stable strings
   (`E_…`, `W_…`).
6. **The example stays clean.** `tests/check.test.ts` asserts `examples/sprout.scenario` has zero
   errors and zero warnings with its config, and exactly two `W_NEW_MOTION` without it.
7. **No consumer-specific references** in docs, examples, comments. The example is the fictional
   Sprout app.
8. **Formatting**: tabs, line width 90 (`deno fmt`). `.scenario` files and scenario snippets in
   docs indent with tabs and align columns with spaces (SPEC §1.1–1.2); spaces-indented input
   stays supported and is what the inline test scenarios use.
9. **Timing numbers are rounded with `ms()`** at every boundary; tests compare rounded values.

## Before Making Changes

- [ ] Read the relevant SPEC section; the code implements it, not the other way round
- [ ] `deno task test` passes; add the test with the change
- [ ] `deno task check` and `deno task lint` clean; `deno fmt`
- [ ] Public API changed → update `API.md`; grammar or rule changed → `SPEC.md`; new
      module → `scripts/build-npm.ts` `sourceFiles`
- [ ] Example touched → `deno task example:build` still bundles; the check with config is clean

## Documentation Index

- [SPEC.md](./SPEC.md) — the format (normative)
- [docs/architecture.md](./docs/architecture.md) — modules, data flow, boundaries
- [docs/conventions.md](./docs/conventions.md) — code standards, do/don't
- [docs/tasks.md](./docs/tasks.md) — add a check, a core verb, a preset key, a CLI command
- [docs/guide.md](./docs/guide.md) — writing a scenario (for directors)
- [docs/implementing.md](./docs/implementing.md) — implementing a scenario (for renderers, humans or agents)
- [API.md](./API.md) — library and CLI reference
