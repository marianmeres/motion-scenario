/**
 * Model
 * Purpose: the engine-free data the parser produces and every other tool consumes.
 * Invariants: no absolute time, no coordinates, no easing, no engine types.
 * See: SPEC.md §3 (Model)
 */

/** The only format version this package reads. The first line of a file states it. */
export const FORMAT_VERSION = 1;

/** A parsed `.scenario` file. */
export interface Scenario {
	/** Format version from the first line (`motion-scenario 1`). */
	version: number;
	/** The `video` block: slug, formats, languages, music, style and free notes. */
	video: Video;
	/** The `cast` block: every object a direction may address, in file order. */
	cast: CastMember[];
	/** `ui` strings: key → language → text. Translated words inside the stylised UI. */
	ui: UiStrings;
	/** Every scene, in file order. */
	scenes: Scene[];
}

/** The `video` block. */
export interface Video {
	/** The name after `video` on the block's first line. */
	slug: string;
	/** Output formats the project renders (free names, e.g. `wide`, `reel`). May be empty. */
	formats: string[];
	/** Every language the video renders. The first one is the reference language. */
	languages: string[];
	/** The music grid holds snap to, or `silent`. */
	music: Music;
	/** Name of the project's style preset, if declared. Not interpreted by this package. */
	style?: string;
	/** Free keys (`audience`, `status`, `remember`, …), in file order. Never interpreted. */
	notes: Record<string, string>;
	/** 1-based source line of the `video` block. */
	line: number;
}

/** The music grid holds snap to. `silent` means no snapping. */
export type Music =
	| { kind: "silent" }
	| { kind: "grid"; bpm: number; offset: number; perBar: number };

/** One line of the `cast` block. */
export interface CastMember {
	/** The name directions address this member by. */
	name: string;
	/** Component type from the project registry. `"new"` when `isNew`, `""` for a group. */
	type: string;
	/** Declared with `new:` — the component does not exist yet. */
	isNew: boolean;
	/** The text after `new:`. */
	description?: string;
	/** `on <host>` — the member lives inside another member. */
	host?: string;
	/** `<n>x <member>` — this name stands for `count` copies of `member`. */
	group?: { count: number; member: string };
	/** Remaining tokens after the type (and host), e.g. a URL or a `ui.<key>` reference. */
	args: string[];
	/** 1-based source line. */
	line: number;
}

/** `ui` strings: key → language → text. */
export type UiStrings = Record<string, Record<string, string>>;

/** A named group of beats with an ending state and an optional entry transition. */
export interface Scene {
	/** The name after `scene`. */
	name: string;
	/** `ends clean` (empty background, the default) or `ends full` (the next scene pushes it away). */
	ends: "full" | "clean";
	/** `transition <kind>` — how this scene enters. */
	transition?: string;
	/** The scene's beats, in file order. */
	beats: Beat[];
	/** 1-based source line of the `scene` header. */
	line: number;
}

/** One unit of meaning: one headline, one focal point, one duration. */
export interface Beat {
	/** The beat's name, unique across the whole file. */
	id: string;
	/** `role <role>` — `hook`, `end`, or any documentary tag. */
	role?: string;
	/** Language → headline (+ optional sub line). */
	text: Record<string, BeatText>;
	/** `hold <n> s|beats|bars` — replaces reading time as the beat's duration source. */
	hold?: Hold;
	/** Stage directions, in file order. */
	directions: Direction[];
	/** Prose lines kept for the implementer. Never interpreted. */
	notes: string[];
	/** 1-based source line of the `beat` header. */
	line: number;
}

/** A beat's words in one language. Both lines count toward reading time. */
export interface BeatText {
	/** The on-screen headline. */
	headline: string;
	/** The optional second line (`<lang>.sub`). */
	sub?: string;
}

/** A beat's explicit duration: `hold <value> <unit>`. */
export interface Hold {
	/** A non-negative number of `unit`s. */
	value: number;
	/** Seconds, or music-grid beats or bars. */
	unit: HoldUnit;
}

/** Units a `hold` may be stated in: seconds, or music-grid beats or bars. */
export type HoldUnit = "s" | "beats" | "bars";

/** `then` starts a new moment after the previous one completes; `and` joins the previous moment. */
export type Relation = "then" | "and";

/** Keywords that introduce a direction argument. */
export type ArgKeyword = "from" | "to" | "on" | "with";

/** Every `ArgKeyword`, as a runtime list. */
export const ARG_KEYWORDS: readonly ArgKeyword[] = ["from", "to", "on", "with"];

/** Tail of a direction on a group or on several objects. */
export type GroupTail = "oneByOne" | "together";

/** The only per-line adjustments the language allows. Everything else is a style preset. */
export type Modifier = "slowly" | "quickly" | "with overshoot" | "softly";

/** Every `Modifier`, as a runtime list. */
export const MODIFIERS: readonly Modifier[] = [
	"slowly",
	"quickly",
	"with overshoot",
	"softly",
];

/**
 * One direction line, as written. The verb is not yet bound to a motion: see `bind.ts`.
 *
 * `card enters from the right, just after, slowly` →
 * `{ subject: "card", verb: "enters", words: [], args: { from: ["right"] }, justAfter: true, modifiers: ["slowly"] }`
 *
 * `logo takes the stage` → `{ verb: "takes", words: ["the stage"] }` (bound later to the phrase `takes the stage`)
 *
 * `card shows ui.name, ui.note` → `{ verb: "shows", words: ["ui.name", "ui.note"] }`
 */
export interface Direction {
	/** `then` (the default when omitted) or `and`. */
	relation: Relation;
	/** A cast name. */
	subject: string;
	/** `<subject>.<part>` — an anchor the component type knows. */
	part?: string;
	/** The first word after the subject. */
	verb: string;
	/**
	 * Bare words after the verb, not introduced by a keyword. `words[0]` is the rest of the first
	 * comma segment (may be several tokens, e.g. `"the stage"`); further entries are later
	 * comma-separated segments (e.g. more `ui.<key>` objects).
	 */
	words: string[];
	/** Keyword arguments. Leading articles (`the`) are dropped from values. */
	args: Partial<Record<ArgKeyword, string[]>>;
	/** `, just after` — start one `justAfter` offset after the line above (only meaningful with `and`). */
	justAfter: boolean;
	/** `, one by one` | `, together`. */
	group?: GroupTail;
	/** Trailing per-line adjustments, in the order written. */
	modifiers: Modifier[];
	/** 1-based source line. */
	line: number;
	/** The line as written, trimmed. */
	raw: string;
}

/** An `error` stops every tool; a `warning` is reported and tools continue. */
export type Severity = "error" | "warning";

/** A check or parse finding. Errors stop every tool; warnings are printed and tools continue. */
export interface Issue {
	/** Whether the finding stops the tools. */
	severity: Severity;
	/** Stable machine code, e.g. `E_DUPLICATE_BEAT`, `W_NEW_MOTION`. */
	code: string;
	/** Human-readable description of the finding. */
	message: string;
	/** 1-based line in the source file, when the finding has one. */
	line?: number;
}

/** Sort by line (findings without a line last), stable. */
export function sortIssues<T extends { line?: number }>(issues: T[]): T[] {
	return [...issues].sort((a, b) =>
		(a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER)
	);
}

/** Follow a group to its member and return the cast member whose type applies to `name`. */
export function castTypeOf(cast: CastMember[], name: string): CastMember | undefined {
	const seen = new Set<string>();
	let cur = cast.find((c) => c.name === name);
	while (cur?.group && !seen.has(cur.name)) {
		seen.add(cur.name);
		cur = cast.find((c) => c.name === cur!.group!.member);
	}
	return cur;
}

/** Count of words in a beat's text (headline + sub), for reading time. */
export function wordCount(text: BeatText | undefined): number {
	if (!text) return 0;
	const s = [text.headline, text.sub ?? ""].join(" ").trim();
	return s ? s.split(/\s+/).length : 0;
}
