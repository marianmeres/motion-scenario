# Architecture

## Overview

Three layers; only the first is this package.

| Layer                | What                                                                                                          | Where                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Core**             | Format spec, parser, model, checker, resolver, words, reports, CLI. Pure TypeScript, engine-free.             | this repo                                      |
| **Renderer adapter** | The vocabulary bound to real motions, named poses per format, the style preset's numbers, the project config. | the consuming project (`examples/dom/` is one) |
| **Content**          | One `.scenario` per video.                                                                                    | the consuming project                          |

The core takes a `ProjectConfig` from the adapter; nothing project-specific is compiled in.

## Component Map

```
              ┌──────────┐
.scenario ───▶│ parser   │──▶ Scenario ─────┬──────────────────────┐
              └──────────┘   (model.ts)     │                      │
                                            ▼                      ▼
              ┌──────────┐             ┌──────────┐           ┌──────────┐
config ──────▶│ config   │──cfg──────▶ │ check    │──────────▶│ resolve  │
              │ (defaults│             └──────────┘   uses    └──────────┘
              │  + core  │                  │                      │
              │  verbs)  │──cfg──▶ bind ◀───┴──────────────────────┘
              └──────────┘                  │
                                            ▼
                                      words · report (text, markdown) · analyze (all of it)
                                            │
                                            ▼
                                      cli.ts (Deno) · examples/dom (browser)
```

## Data Flow

1. `parse(text)` tokenizes lines (drops comments/blanks, validates the indent unit), reads blocks
   in pass 1, then classifies beat lines in pass 2 once languages and cast names are known.
   Output: `Scenario` or `Issue[]` (never both).
2. `check(scenario, config)` walks cast, ui, scenes, beats, directions. Per direction it calls
   `bind` (vocabulary) and `uiRefs`. It calls `resolve` for moment counts and format budgets.
3. `resolve(scenario, config)` computes, per language, each beat's `start`/`end` from reading
   time, holds, moments and the music grid: opening moments from the beat's start, closing
   (`finally`) moments from `closeAt`. Per direction: bound phrase, `count`, `offset`,
   `duration`, absolute `start`.
4. `words(scenario)` flattens text per language.
5. `analyze` chains 1–4 and applies "errors stop every tool". `report.ts` renders.

## Key Files

| File             | Responsibility                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------ |
| `src/model.ts`   | Types; `castTypeOf`, `wordCount`, `sortIssues`                                             |
| `src/parser.ts`  | Grammar (SPEC §2). Exports the sub-parsers `parseMusic`, `parseHold`, `parseDirectionTail` |
| `src/config.ts`  | `ProjectConfig`, `ResolvedConfig`, `CORE_VERBS`, `DEFAULT_PRESET`, `resolveConfig`         |
| `src/bind.ts`    | SPEC §7.3                                                                                  |
| `src/check.ts`   | SPEC §6                                                                                    |
| `src/resolve.ts` | SPEC §5; `snapUp`, `readingTime`, `holdSeconds`, `resolveMoments`                          |
| `src/report.ts`  | Text report and markdown board                                                             |
| `src/cli.ts`     | Argument parsing, config loading (`.json` or module), exit codes                           |

## External Dependencies

Runtime: none in `src/` except `cli.ts` (`@std/cli`, `@std/path`). Dev: `@std/assert`,
`@marianmeres/npmbuild`, `@marianmeres/deno-build` (example bundle), `@marianmeres/vanilla`
(example only).

## Boundaries

- The parser never sees the vocabulary; the vocabulary never sees the file.
- Formats do not affect timing (v1); they only carry budgets and headline sizes for checks.
- The resolver's estimate is not the render's truth; drift between them is expected to show up
  as a report/preset mismatch, not to be hidden.
