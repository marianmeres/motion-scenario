/**
 * Project config
 * Purpose: everything project-specific the checker and resolver need — the vocabulary the
 * project has implemented, the style preset's numbers, reading-time constants, format budgets,
 * word blacklists. Nothing project-specific is compiled into the core; this file only holds
 * the defaults and the merge.
 * See: SPEC.md §7 (Vocabulary), §8 (Project config)
 */

/** The style preset: a duration table shared by the resolver and the project's motion library. */
export interface Preset {
	/** Seconds the headline takes to animate in (0 for a `hook` beat). */
	textIn: number;
	/** `appears`, `enters`, `shows`. */
	enter: number;
	/** `leaves`, `exits`. */
	leave: number;
	/** `moves to`, `steps aside`, `takes the stage`, `becomes the focus`. */
	move: number;
	/** `pops`. */
	pop: number;
	/** `grows`, `shrinks`. */
	scale: number;
	/** `blinks once`. */
	accent: number;
	/** Assumed length of an unbound (new) motion. */
	unknown: number;
	/** Gap between members of a `one by one` group. */
	stagger: number;
	/** Offset added by `, just after`. */
	justAfter: number;
	/** Multiplier for `slowly`. */
	slowly: number;
	/** Multiplier for `quickly`. */
	quickly: number;
}

/** Keys of the preset that name a duration a motion can take. */
export type DurationKey =
	| "textIn"
	| "enter"
	| "leave"
	| "move"
	| "pop"
	| "scale"
	| "accent"
	| "unknown";

/** A verb phrase the project has implemented. */
export interface MotionDef {
	/** The preset duration this motion takes, or a fixed number of seconds. */
	duration: DurationKey | number;
	/** Shown in reports and boards. */
	description?: string;
	/** Several objects or group members are staggered by default (like `shows a, b`). */
	staggered?: boolean;
}

/** A component type from the project's registry. */
export interface ComponentType {
	/** Anchors a direction may address as `<name>.<part>`. */
	parts?: string[];
	/** Verbs only this type implements (`types`, `submits`, …). */
	verbs?: Record<string, MotionDef>;
	description?: string;
}

export interface FormatConfig {
	/** Running-time budget in seconds, `[min, max]`. */
	budget?: [number, number];
	/** Characters per headline line at this format's size, for the line-count estimate. */
	charsPerLine?: number;
	/** Maximum headline lines before a warning. Default 2. */
	maxLines?: number;
}

export interface ReadingTime {
	/** Floor, seconds. */
	min: number;
	/** Fixed part, seconds. */
	base: number;
	/** Per word, seconds. */
	perWord: number;
}

/** What a project passes to `check`, `resolve`, `analyze`. Every field is optional. */
export interface ProjectConfig {
	/** Component types and their parts and component verbs. */
	types?: Record<string, ComponentType>;
	/** Verb phrases every type understands, in addition to the core vocabulary. */
	verbs?: Record<string, MotionDef>;
	/** Known pose names (`moves to <pose>`). Informational; unknown poses are not checked. */
	poses?: string[];
	/** Known scene transitions. Default: cut, push, slide, crossfade. */
	transitions?: string[];
	preset?: Partial<Preset>;
	reading?: Partial<ReadingTime>;
	/** Per-format budgets and headline sizes, keyed by the names the `video` block declares. */
	formats?: Record<string, FormatConfig>;
	headline?: { maxWords?: number };
	/** Words that must not appear in text, per language. */
	blacklist?: Record<string, string[]>;
}

/** `ProjectConfig` with every default filled in. */
export interface ResolvedConfig {
	types: Record<string, ComponentType>;
	verbs: Record<string, MotionDef>;
	poses: string[];
	transitions: string[];
	preset: Preset;
	reading: ReadingTime;
	formats: Record<string, FormatConfig>;
	headline: { maxWords: number };
	blacklist: Record<string, string[]>;
}

export const DEFAULT_PRESET: Preset = {
	textIn: 0.4,
	enter: 0.5,
	leave: 0.4,
	move: 0.5,
	pop: 0.5,
	scale: 0.4,
	accent: 0.3,
	unknown: 0.5,
	stagger: 0.12,
	justAfter: 0.15,
	slowly: 1.6,
	quickly: 0.6,
};

export const DEFAULT_READING: ReadingTime = { min: 1.8, base: 0.8, perWord: 0.3 };

export const DEFAULT_TRANSITIONS: string[] = ["cut", "push", "slide", "crossfade"];

export const DEFAULT_MAX_HEADLINE_WORDS = 7;

/**
 * The core vocabulary. Every phrase names a motion a renderer is expected to implement.
 * A project extends it (`verbs`, `types[].verbs`); it never has to repeat it.
 */
export const CORE_VERBS: Record<string, MotionDef> = {
	appears: { duration: "enter", description: "eases in and travels into place" },
	enters: {
		duration: "enter",
		description: "like appears; `from <side>` says where from",
	},
	pops: {
		duration: "pop",
		description: "arrives with overshoot; for things that *arrive*",
	},
	leaves: { duration: "leave", description: "eases out" },
	exits: { duration: "leave", description: "like leaves; `to <side>` says where to" },
	moves: { duration: "move", description: "`to <pose>`; the pose is resolved in code" },
	"steps aside": { duration: "move", description: "shorthand for `moves to aside`" },
	"takes the stage": {
		duration: "move",
		description: "shorthand for `moves to stage`",
	},
	"becomes the focus": {
		duration: "move",
		description: "rack focus: the subject holds, everything else dims and recedes",
	},
	grows: { duration: "scale", description: "scales up" },
	shrinks: { duration: "scale", description: "scales down" },
	"blinks once": { duration: "accent", description: "one accent; for end cards" },
	shows: {
		duration: "enter",
		staggered: true,
		description: "reveals content (`ui.<key>` objects), one after another",
	},
};

/** Fill every default. Project values win over defaults; project verbs win over core verbs. */
export function resolveConfig(config: ProjectConfig = {}): ResolvedConfig {
	return {
		types: config.types ?? {},
		verbs: { ...CORE_VERBS, ...(config.verbs ?? {}) },
		poses: config.poses ?? [],
		transitions: config.transitions ?? DEFAULT_TRANSITIONS,
		preset: { ...DEFAULT_PRESET, ...(config.preset ?? {}) },
		reading: { ...DEFAULT_READING, ...(config.reading ?? {}) },
		formats: config.formats ?? {},
		headline: { maxWords: config.headline?.maxWords ?? DEFAULT_MAX_HEADLINE_WORDS },
		blacklist: config.blacklist ?? {},
	};
}
