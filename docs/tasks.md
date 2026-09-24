# Tasks

## Add a check rule

### Steps

1. Decide severity. Structure (blocks, duplicates, indentation) → `src/parser.ts`. Content →
   `src/check.ts`.
2. Add the code (`E_…` / `W_…`) and the message; include the line.
3. Add a row to `SPEC.md` §6.1 or §6.2.
4. Add a case to `tests/check.test.ts` (or `parser.test.ts`) using `scenario()` from
   `tests/helpers.ts`.
5. If the example now triggers it, either the example or the rule is wrong; fix one.

### Template

```ts
if (condition) warn("W_MY_RULE", `beat \`${beat.id}\` …`, beat.line);
```

### Checklist

- [ ] SPEC row · test · `deno task test` · example still clean

## Add a core verb

1. `src/config.ts` `CORE_VERBS`: phrase → `{ duration: <preset key>, description, staggered? }`.
2. `SPEC.md` §7.1 table.
3. `examples/dom/style.css` + `examples/dom/main.ts` `motion()`: the DOM renderer implements
   every core verb. Rebuild with `deno task example:build`.
4. A resolve test if the duration rule is new.

## Add a preset key

1. `Preset` and `DEFAULT_PRESET` in `src/config.ts`; `DurationKey` if motions may use it.
2. SPEC §5.5 table; API.md `Preset`.
3. `examples/dom/main.ts` copies duration keys into CSS variables; add it there if the CSS uses it.

## Add a CLI command

1. `src/cli.ts`: the `USAGE` text, the command list, a `case`.
2. `tests/cli.test.ts`: exit code and output shape.
3. API.md → CLI section; README if user-facing.

## Change the grammar

1. `SPEC.md` §2 first. The grammar must still fit on that page.
2. `src/parser.ts`; `src/model.ts` if the model changes; API.md types.
3. Tests in `tests/parser.test.ts`; update `examples/sprout.scenario` if it should use the new form.
4. `docs/guide.md` cheat sheet.

## Release

1. `deno task test && deno task check && deno task lint && deno fmt --check`
2. `deno task example:build` bundles.
3. `deno task rp` (patch) or `deno task rpm` (minor): release + JSR + npm.
