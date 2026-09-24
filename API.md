# API

All exports come from `@marianmeres/motion-scenario` (`src/mod.ts`). Everything is pure and
browser-safe. The CLI (`@marianmeres/motion-scenario/cli`) is Deno-only.

Times are seconds. Every result is rounded to milliseconds (`ms()`).

---

## Pipeline

### `analyze(text, config?)`

Parse, check, resolve and extract words in one call, with "errors stop every tool" applied.

**Parameters:**

- `text` (string) — the `.scenario` file contents
- `config` ([`ProjectConfig`](#projectconfig), optional)

**Returns:** [`Analysis`](#analysis)

```ts
import { analyze } from "@marianmeres/motion-scenario";

const a = analyze(await Deno.readTextFile("video.scenario"), config);
if (!a.ok) console.error(a.errors);
a.resolved?.timelines.en.total; // running time
a.words?.sk.ui.reminder; // a translated string
```

### `parse(text)`

`.scenario` text → `Scenario`, or structural errors. Registry-free. Never throws on content;
collects every structural error before giving up.

**Returns:** [`ParseResult`](#parseresult) — `scenario` is `null` when `errors` is non-empty.

```ts
const { scenario, errors } = parse(text);
```

### `check(scenario, config?)`

Every content rule of [SPEC §6](./SPEC.md#6-checks). Calls `resolve` internally for the budget
check.

**Returns:** [`CheckResult`](#checkresult)

```ts
const c = check(scenario, { blacklist: { en: ["just"] } });
c.ok; // no errors
c.newMotions; // [{ phrase: "types ui.plantName", subject: "card", type: "FormCard", line: 43, raw }]
```

### `resolve(scenario, config?)`

The timing estimate per language ([SPEC §5](./SPEC.md#5-timing)).

**Returns:** [`ResolveResult`](#resolveresult)

```ts
const r = resolve(scenario, config);
const beat = r.timelines.en.beats[2];
beat.start;
beat.end;
beat.boundedBy; // 5, 8.5, "words"
beat.moments[0].directions[1].start; // 5.15 (`, just after`)
beat.moments[0].directions[1].motion; // "enters"
```

### `words(scenario)`

Every translated string, per language.

**Returns:** [`Words`](#words) — `{ [lang]: { beats: { [id]: { headline, sub? } }, ui: { [key]: text } } }`

---

## Reports

### `formatReport(analysis, { file? })`

The `check` report as text: counts, errors, warnings, new motions and components, the timing table
per language, the grid and running times.

### `formatBoard(analysis)`

A markdown board: the `video` block as a title card, cast, ui strings, then one section per beat
with its words in every language, timing, moments (each direction with its bound motion, count,
offset and duration) and notes. With errors it prints them instead.

### `formatIssues(issues)`

`L12   E_CODE   message`, one per line.

---

## Vocabulary and config

### `resolveConfig(config?)`

Fill every default: `CORE_VERBS` merged under the project's `verbs`, `DEFAULT_PRESET` under
`preset`, `DEFAULT_READING` under `reading`, `DEFAULT_TRANSITIONS`, `headline.maxWords` 7.

**Returns:** [`ResolvedConfig`](#resolvedconfig)

### `bind(direction, scenario, cfg)`

Match a parsed direction's verb phrase against the vocabulary ([SPEC §7.3](./SPEC.md#73-binding)):
longest phrase first, plural forms tried, the subject's type verbs before project verbs before
core.

**Parameters:** `direction` ([`Direction`](#direction)), `scenario`, `cfg` ([`ResolvedConfig`](#resolvedconfig))

**Returns:** [`Bound`](#bound)

```ts
const b = bind(direction, scenario, resolveConfig(config));
b.motion; // MotionDef | null
b.phrase; // "takes the stage"
b.object; // ["ui.plantName"]
b.count; // group size or object count
```

### `verbForms(verb)`

`"pop"` → `["pop", "pops"]`; `"push"` → `["push", "pushs", "pushes"]`. As written first.

### `uiRefs(direction, bound)`

Every `ui.<key>` key referenced in the direction's object words and argument values.

### `CORE_VERBS`

`Record<string, MotionDef>` — the core vocabulary of [SPEC §7.1](./SPEC.md#71-core-verbs).

### `DEFAULT_PRESET`, `DEFAULT_READING`, `DEFAULT_TRANSITIONS`, `DEFAULT_MAX_HEADLINE_WORDS`

The defaults of [SPEC §5.5](./SPEC.md#55-style-preset), §5.1, §2.6 and §6.2.

---

## Timing helpers

### `snapUp(t, music)`

The first grid point at or after `t`; `t` itself when silent.

### `readingTime(words, reading)`

`max(min, base + perWord × words)`; 0 for no words.

### `holdSeconds(hold, music)`

A `Hold` in seconds. Without a grid, `beats`/`bars` fall back to 120 bpm, 4 per bar (the checker
reports `E_HOLD_NO_GRID` before this matters).

### `gridBeat(music)`

Seconds per grid beat, or `null` when silent.

### `resolveMoments(directions, beatStart, scenario, cfg)`

Group a beat's directions into moments and time each direction. Used by `resolve`.

### `ms(n)`

Round to milliseconds.

---

## Parsing helpers

### `parseMusic(value)`

`"silent"` | `"<bpm> bpm [offset <s> s] [<n> per bar]"` → [`Music`](#music) | `null`.

### `parseHold(tokens)`

`["3", "s"]` → `{ value: 3, unit: "s" }` | `null`.

### `parseDirectionTail(after)`

Everything after the subject (`"enters from the right, just after, slowly"`) → `{ verb, words,
args, justAfter, group, modifiers }` | `null` when there is no verb.

---

## Model helpers

### `castTypeOf(cast, name)`

Follow a group to its member; returns the `CastMember` whose type applies.

### `wordCount(text)`

Whitespace-separated tokens in headline + sub.

### `sortIssues(issues)`

By line, findings without a line last. Stable.

---

## Types

### `Scenario`

```ts
interface Scenario {
	version: number; // 1
	video: Video;
	cast: CastMember[];
	ui: UiStrings; // key → lang → text
	scenes: Scene[];
}
```

### `Video`

```ts
interface Video {
	slug: string;
	formats: string[]; // free names; may be empty
	languages: string[]; // [0] is the reference language
	music: Music;
	style?: string;
	notes: Record<string, string>; // free keys, file order
	line: number;
}
```

### `Music`

```ts
type Music =
	| { kind: "silent" }
	| { kind: "grid"; bpm: number; offset: number; perBar: number };
```

### `CastMember`

```ts
interface CastMember {
	name: string;
	type: string; // "new" when isNew, "" for a group
	isNew: boolean;
	description?: string; // after `new:`
	host?: string; // `on <host>`
	group?: { count: number; member: string }; // `<n>x <member>`
	args: string[];
	line: number;
}
```

### `Scene`, `Beat`, `BeatText`, `Hold`

```ts
interface Scene {
	name: string;
	ends: "full" | "clean";
	transition?: string;
	beats: Beat[];
	line: number;
}
interface Beat {
	id: string;
	role?: string;
	text: Record<string, BeatText>; // lang → text
	hold?: Hold;
	directions: Direction[];
	notes: string[];
	line: number;
}
interface BeatText {
	headline: string;
	sub?: string;
}
interface Hold {
	value: number;
	unit: "s" | "beats" | "bars";
}
```

### `Direction`

```ts
interface Direction {
	relation: "then" | "and";
	subject: string;
	part?: string;
	verb: string; // first word after the subject
	words: string[]; // bare words: [rest of first segment, ...later bare segments]
	args: Partial<Record<"from" | "to" | "on" | "with", string[]>>; // articles stripped
	justAfter: boolean;
	group?: "oneByOne" | "together";
	modifiers: ("slowly" | "quickly" | "with overshoot" | "softly")[];
	line: number;
	raw: string;
}
```

`card enters from the right, just after, slowly` → `{ verb: "enters", words: [], args: { from: ["right"] }, justAfter: true, modifiers: ["slowly"] }`
`logo takes the stage` → `{ verb: "takes", words: ["the stage"] }`
`card shows ui.a, ui.b` → `{ verb: "shows", words: ["ui.a", "ui.b"] }`

### `Issue`

```ts
interface Issue {
	severity: "error" | "warning";
	code: string;
	message: string;
	line?: number;
}
```

### `ParseResult`

```ts
interface ParseResult {
	scenario: Scenario | null;
	errors: Issue[];
}
```

### `CheckResult`

```ts
interface CheckResult {
	ok: boolean; // no errors
	errors: Issue[];
	warnings: Issue[];
	newMotions: NewMotion[]; // { phrase, subject, type?, raw, line }
	newComponents: NewComponent[]; // { name, type, description?, line }
}
```

### `ResolveResult`

```ts
interface ResolveResult {
	slug: string;
	languages: string[];
	reference: string;
	formats: string[];
	music: Music;
	grid: { beat: number | null; bar: number | null };
	preset: Preset;
	reading: ReadingTime;
	timelines: Record<string, Timeline>; // per language
}
interface Timeline {
	language: string;
	total: number;
	beats: ResolvedBeat[];
}
interface ResolvedBeat {
	scene: string;
	id: string;
	role?: string;
	index: number;
	start: number;
	end: number;
	duration: number;
	textReadableAt: number;
	readUntil: number;
	motionEnd: number;
	boundedBy: "words" | "motion" | "hold";
	text?: BeatText;
	words: number;
	hold?: Hold;
	holdSeconds?: number;
	moments: ResolvedMoment[];
	notes: string[];
	line: number;
}
interface ResolvedMoment {
	index: number;
	start: number;
	end: number;
	duration: number;
	directions: ResolvedDirection[];
}
interface ResolvedDirection {
	index: number;
	relation: "then" | "and";
	subject: string;
	part?: string;
	phrase: string; // bound vocabulary phrase, or the bare verb
	object: string[]; // words after the phrase
	args: Direction["args"];
	modifiers: Direction["modifiers"];
	justAfter: boolean;
	group?: "oneByOne" | "together"; // effective, after defaults
	motion: string | null; // null = new motion
	count: number;
	start: number; // absolute
	offset: number; // within the moment
	duration: number;
	end: number;
	line: number;
	raw: string;
}
```

### `Words`

```ts
type Words = Record<
	string,
	{ beats: Record<string, BeatText>; ui: Record<string, string> }
>;
```

### `Analysis`

```ts
interface Analysis {
	ok: boolean; // no parse errors and no check errors
	errors: Issue[];
	warnings: Issue[];
	scenario: Scenario | null;
	check: CheckResult | null;
	resolved: ResolveResult | null; // only when ok
	words: Words | null; // only when ok
}
```

### `ProjectConfig`

```ts
interface ProjectConfig {
	types?: Record<string, ComponentType>; // { parts?: string[]; verbs?: Record<string, MotionDef>; description? }
	verbs?: Record<string, MotionDef>;
	poses?: string[];
	transitions?: string[];
	preset?: Partial<Preset>;
	reading?: Partial<ReadingTime>; // { min, base, perWord }
	formats?: Record<string, FormatConfig>; // { budget?: [min, max]; charsPerLine?; maxLines? }
	headline?: { maxWords?: number };
	blacklist?: Record<string, string[]>; // lang → words
}
interface MotionDef {
	duration: DurationKey | number; // "textIn" | "enter" | "leave" | "move" | "pop" | "scale" | "accent" | "unknown", or seconds
	description?: string;
	staggered?: boolean; // several objects stagger by default
}
interface Preset {
	textIn: number;
	enter: number;
	leave: number;
	move: number;
	pop: number;
	scale: number;
	accent: number;
	unknown: number;
	stagger: number;
	justAfter: number;
	slowly: number;
	quickly: number;
}
```

### `ResolvedConfig`

`ProjectConfig` with every field required and filled.

### `Bound`

```ts
interface Bound {
	phrase: string;
	object: string[];
	motion: MotionDef | null;
	source: "core" | "project" | "type" | null;
	count: number;
	typed?: CastMember; // the member whose type applies (a group → its member)
}
```

---

## Constants

| Name                         | Value                                               |
| ---------------------------- | --------------------------------------------------- |
| `FORMAT_VERSION`             | `1`                                                 |
| `ARG_KEYWORDS`               | `["from", "to", "on", "with"]`                      |
| `MODIFIERS`                  | `["slowly", "quickly", "with overshoot", "softly"]` |
| `DEFAULT_TRANSITIONS`        | `["cut", "push", "slide", "crossfade"]`             |
| `DEFAULT_MAX_HEADLINE_WORDS` | `7`                                                 |
| `DEFAULT_READING`            | `{ min: 1.8, base: 0.8, perWord: 0.3 }`             |
| `DEFAULT_PRESET`             | see [SPEC §5.5](./SPEC.md#55-style-preset)          |
| `CORE_VERBS`                 | see [SPEC §7.1](./SPEC.md#71-core-verbs)            |

---

## CLI

```
deno run -A jsr:@marianmeres/motion-scenario/cli <command> <file> [options]

check   <file> [--config <path>] [--strict] [--json]
resolve <file> [--config <path>]
words   <file>
board   <file> [--config <path>]
```

| Option            | Meaning                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `--config <path>` | A `.json` file, or a `.ts`/`.js` module whose default (or `config`) export is the `ProjectConfig` |
| `--strict`        | `check`: exit 1 on warnings too                                                                   |
| `--json`          | `check`: print the full `Analysis` as JSON instead of the report                                  |

Exit codes: `0` ok · `1` errors (or warnings with `--strict`) · `2` usage or I/O error.
`resolve`, `words` and `board` print errors to stderr and exit 1 when the file has errors.

From a checkout: `deno task cli check examples/sprout.scenario --config examples/sprout.config.json`.

The module also exports `main(argv): Promise<number>` and `loadConfig(path)`.
