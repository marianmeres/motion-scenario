# Conventions

## File Organisation

- One module per pipeline stage in `src/`; `mod.ts` re-exports everything but `cli.ts`.
- One test file per module in `tests/`; inline scenarios via `tests/helpers.ts` (`scenario()`,
  `dedent()`, `parseOk()`); real files in `tests/fixtures/` and `examples/`.
- Every new `src/` module goes into `scripts/build-npm.ts` `sourceFiles` (npm gets the core only).

## Naming

- Issue codes: `E_SCREAMING_SNAKE` for errors, `W_…` for warnings. Stable once published.
- Vocabulary phrases are lowercase English in the third person singular (`pops`,
  `takes the stage`). Preset keys are camelCase (`textIn`, `justAfter`).
- Resolved types are prefixed `Resolved…`; raw parse types are not.

## Patterns

✅ Do: collect issues and continue

```ts
if (!castNames.has(c.host)) error("E_UNDECLARED_CAST", `…`, c.line);
```

❌ Don't: throw on content

```ts
throw new Error("undeclared host"); // a writer's mistake is a report, not a crash
```

✅ Do: round at boundaries

```ts
return { start: ms(start), duration: ms(duration) };
```

✅ Do: put every inferred value in the output

```ts
group: d.group ?? (b.count > 1 && b.motion?.staggered ? "oneByOne" : undefined),
```

❌ Don't: consult the vocabulary in the parser, or the file's text in `bind`/`resolve` beyond the
model.

## Error Handling

- `parse` → `{ scenario: null, errors }` on any structural error, all errors collected and sorted
  by line.
- `check` → `{ ok, errors, warnings }`; `analyze` runs `resolve`/`words` only when `ok`.
- CLI exit codes: 0 / 1 (content) / 2 (usage, I/O). Content errors go to stdout for `check`
  (it is the report) and to stderr for `resolve`/`words`/`board` (stdout is the artifact).

## Testing

- Every SPEC §6 rule has at least one asserting test; every timing formula in §5 has a numeric
  case; the example's numbers (`14.00 s` en, `13.00 s` sk) are asserted end to end.
- CLI tests spawn `deno run -A src/cli.ts` and assert exit codes and parseable JSON.
- Compare timing with values passed through `ms()`.

## Documentation

- SPEC.md is normative; code follows it. API.md lists every export. README stays short.
- No consumer-specific names anywhere public. The example product is the fictional Sprout.
- Human docs per `HUMAN_DOCUMENTATION_GUIDE.md`, agent docs per `AGENT_DOCUMENTATION_GUIDE.md`
  (the ecosystem's guides).
