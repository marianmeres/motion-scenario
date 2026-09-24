/**
 * Resolve
 * Purpose: compute the timing estimate — per language, every beat's start, duration and what
 * bounded it, every moment and direction's start and length, and the running time. The render
 * is the truth; this estimate exists so reports, boards and animatics agree with each other.
 * Invariants: deterministic; everything it decides is in the output. Formats do not change
 * timing in this version, so timelines are per language only; format budgets are checked in
 * `check.ts`.
 * See: SPEC.md §5 (Timing)
 */

import { bind } from "./bind.ts";
import {
	type Preset,
	type ProjectConfig,
	type ReadingTime,
	resolveConfig,
} from "./config.ts";
import type {
	ArgKeyword,
	BeatText,
	Direction,
	GroupTail,
	Hold,
	Modifier,
	Music,
	Relation,
	Scenario,
} from "./model.ts";
import { wordCount } from "./model.ts";

/** One direction with its bound motion and absolute timing. */
export interface ResolvedDirection {
	/** Position within the beat, 0-based. */
	index: number;
	/** `then`, `and` or `finally`, as parsed. */
	relation: Relation;
	/** A cast name. */
	subject: string;
	/** `<subject>.<part>` — an anchor the component type knows. */
	part?: string;
	/** The bound vocabulary phrase, or the bare verb when unbound. */
	phrase: string;
	/** Bare words after the phrase: `ui.<key>` references, a cast name, a pose. */
	object: string[];
	/** Keyword arguments, as parsed. */
	args: Partial<Record<ArgKeyword, string[]>>;
	/** Per-line adjustments, as parsed. */
	modifiers: Modifier[];
	/** `, just after` — offset from the direction above within the moment. */
	justAfter: boolean;
	/** Effective group behaviour after defaults (`shows a, b` staggers by default). */
	group?: GroupTail;
	/** Vocabulary phrase when bound, `null` for a new motion. */
	motion: string | null;
	/** Group members or objects the motion applies to. */
	count: number;
	/** Absolute seconds from the start of the video. */
	start: number;
	/** Seconds after the moment's start. */
	offset: number;
	/** Seconds, after modifiers and any `one by one` stagger. */
	duration: number;
	/** Absolute seconds: `start + duration`. */
	end: number;
	/** 1-based source line. */
	line: number;
	/** The line as written, trimmed. */
	raw: string;
}

/** `opening`: from the beat's start. `closing`: from `finally` on, starting at `closeAt`. */
export type MomentPhase = "opening" | "closing";

/** A `then` or `finally` line (or a beat's first line) and the `and` lines that join it. */
export interface ResolvedMoment {
	/** Position within the beat, 0-based. */
	index: number;
	/** Whether the moment is part of the beat's opening or of its closing (`finally`). */
	phase: MomentPhase;
	/** Absolute seconds: the previous moment's end, the beat's start, or `closeAt`. */
	start: number;
	/** Absolute seconds: the latest end of its directions. */
	end: number;
	/** Seconds: `end - start`. */
	duration: number;
	/** The moment's directions, in file order. */
	directions: ResolvedDirection[];
}

/** What decided a beat's length: reading time, the last moment, or an explicit `hold`. */
export type BoundedBy = "words" | "motion" | "hold";

/** One beat of one language's timeline. */
export interface ResolvedBeat {
	/** The name of the scene the beat belongs to. */
	scene: string;
	/** The beat's id. */
	id: string;
	/** The beat's `role`, when declared. */
	role?: string;
	/** Position in the whole video, 0-based. */
	index: number;
	/** Absolute seconds: the previous beat's end, or 0. */
	start: number;
	/** Absolute seconds: the last closing moment's end snapped up to the grid, else `closeAt`. */
	end: number;
	/** Seconds: `end - start`. */
	duration: number;
	/** When the headline is readable (`start` for a hook beat). */
	textReadableAt: number;
	/** Reading time or hold satisfied. */
	readUntil: number;
	/** Every opening moment complete. */
	motionEnd: number;
	/**
	 * Absolute seconds: the later of `readUntil` and `motionEnd`, snapped up to the music grid.
	 * The closing moments start here; without any, it equals `end`.
	 */
	closeAt: number;
	/** What decided `closeAt`: reading time, the opening moments, or an explicit `hold`. */
	boundedBy: BoundedBy;
	/** The beat's words in this language, when it has any. */
	text?: BeatText;
	/** Word count of headline + sub, the reading-time input. */
	words: number;
	/** The beat's `hold`, as parsed. */
	hold?: Hold;
	/** The hold in seconds, when there is one. */
	holdSeconds?: number;
	/** The beat's directions grouped into timed moments. */
	moments: ResolvedMoment[];
	/** Prose lines kept for the implementer. */
	notes: string[];
	/** 1-based source line of the `beat` header. */
	line: number;
}

/** Every beat of the video, timed for one language. */
export interface Timeline {
	/** The language this timeline is for. */
	language: string;
	/** Running time in seconds. */
	total: number;
	/** Every beat across all scenes, in file order. */
	beats: ResolvedBeat[];
}

/** The result of `resolve`: the timing estimate an implementer schedules from. */
export interface ResolveResult {
	/** The video's slug. */
	slug: string;
	/** Every language the video renders. */
	languages: string[];
	/** The reference language (the first declared). */
	reference: string;
	/** Output formats, as declared. */
	formats: string[];
	/** The music grid, as declared. */
	music: Music;
	/** Grid units in seconds, `null` when silent. */
	grid: { beat: number | null; bar: number | null };
	/** The preset the timing used, with project overrides applied. */
	preset: Preset;
	/** The reading-time constants the timing used, with project overrides applied. */
	reading: ReadingTime;
	/** Language → timeline. */
	timelines: Record<string, Timeline>;
}

/** Round to milliseconds; keeps the JSON readable and the grid math stable. */
export function ms(n: number): number {
	return Math.round(n * 1000) / 1000;
}

/** Seconds of one grid beat, or `null` for silent. */
export function gridBeat(music: Music): number | null {
	return music.kind === "grid" ? 60 / music.bpm : null;
}

/** The first grid point at or after `t`. Silent music returns `t`. */
export function snapUp(t: number, music: Music): number {
	if (music.kind !== "grid") return ms(t);
	const beat = 60 / music.bpm;
	const k = Math.ceil((t - music.offset) / beat - 1e-9);
	return ms(music.offset + k * beat);
}

/** `readingTime = max(min, base + perWord × words)`; 0 for no words. */
export function readingTime(words: number, reading: ReadingTime): number {
	if (words <= 0) return 0;
	return Math.max(reading.min, reading.base + reading.perWord * words);
}

/** A hold in seconds. Without a music grid, `beats`/`bars` fall back to 120 bpm, 4 per bar. */
export function holdSeconds(hold: Hold, music: Music): number {
	if (hold.unit === "s") return hold.value;
	const beat = gridBeat(music) ?? 0.5;
	const perBar = music.kind === "grid" ? music.perBar : 4;
	return hold.unit === "beats" ? hold.value * beat : hold.value * perBar * beat;
}

/** Compute every language's timeline. */
export function resolve(scenario: Scenario, config?: ProjectConfig): ResolveResult {
	const cfg = resolveConfig(config);
	const { music } = scenario.video;
	const timelines: Record<string, Timeline> = {};

	for (const language of scenario.video.languages) {
		let t = 0;
		let index = 0;
		const beats: ResolvedBeat[] = [];

		for (const scene of scenario.scenes) {
			for (const beat of scene.beats) {
				const start = t;
				const text = beat.text[language];
				const words = wordCount(text);
				const isHook = beat.role === "hook";
				const textIn = text && !isHook ? cfg.preset.textIn : 0;
				const textReadableAt = start + textIn;

				let hs: number | undefined;
				let readUntil: number;
				if (beat.hold) {
					hs = holdSeconds(beat.hold, music);
					readUntil = start + hs;
				} else {
					readUntil = textReadableAt + readingTime(words, cfg.reading);
				}

				const cut = beat.directions.findIndex((d) => d.relation === "finally");
				const opening = resolveMoments(
					cut < 0 ? beat.directions : beat.directions.slice(0, cut),
					start,
					scenario,
					cfg,
				);
				const motionEnd = opening.length
					? opening[opening.length - 1].end
					: start;
				const closeAt = snapUp(Math.max(readUntil, motionEnd), music);
				const closing = cut < 0 ? [] : resolveMoments(
					beat.directions.slice(cut),
					closeAt,
					scenario,
					cfg,
					{ phase: "closing", index: cut, moment: opening.length },
				);
				const moments = [...opening, ...closing];
				const end = closing.length
					? snapUp(closing[closing.length - 1].end, music)
					: closeAt;
				const boundedBy: BoundedBy = readUntil >= motionEnd
					? (beat.hold ? "hold" : "words")
					: "motion";

				beats.push({
					scene: scene.name,
					id: beat.id,
					role: beat.role,
					index: index++,
					start: ms(start),
					end,
					duration: ms(end - start),
					textReadableAt: ms(textReadableAt),
					readUntil: ms(readUntil),
					motionEnd: ms(motionEnd),
					closeAt,
					boundedBy,
					text,
					words,
					hold: beat.hold,
					holdSeconds: hs === undefined ? undefined : ms(hs),
					moments,
					notes: beat.notes,
					line: beat.line,
				});
				t = end;
			}
		}
		timelines[language] = { language, total: ms(t), beats };
	}

	const beat = gridBeat(music);
	return {
		slug: scenario.video.slug,
		languages: scenario.video.languages,
		reference: scenario.video.languages[0],
		formats: scenario.video.formats,
		music,
		grid: {
			beat,
			bar: beat === null ? null : ms(beat * (music as { perBar: number }).perBar),
		},
		preset: cfg.preset,
		reading: cfg.reading,
		timelines,
	};
}

/** Where a run of directions sits in its beat, for `resolveMoments`. */
export interface MomentRun {
	/** The run's phase. Default `opening`. */
	phase?: MomentPhase;
	/** Position of the run's first direction within the beat. Default 0. */
	index?: number;
	/** Position of the run's first moment within the beat. Default 0. */
	moment?: number;
}

/**
 * Group a run of a beat's directions into moments starting at `runStart`, and time each
 * direction. `resolve` calls it twice per beat: for the opening directions from the beat's
 * start, and for the closing ones (from `finally` on) from `closeAt`.
 */
export function resolveMoments(
	directions: Direction[],
	runStart: number,
	scenario: Scenario,
	cfg: ReturnType<typeof resolveConfig>,
	run: MomentRun = {},
): ResolvedMoment[] {
	const phase = run.phase ?? "opening";
	const moments: ResolvedMoment[] = [];
	let cur: ResolvedMoment | null = null;
	let prevOffset = 0;

	directions.forEach((d, i) => {
		if (!cur || d.relation !== "and") {
			const start = cur ? cur.end : runStart;
			cur = {
				index: (run.moment ?? 0) + moments.length,
				phase,
				start,
				end: start,
				duration: 0,
				directions: [],
			};
			moments.push(cur);
			prevOffset = 0;
		}
		const b = bind(d, scenario, cfg);
		const base = b.motion
			? (typeof b.motion.duration === "number"
				? b.motion.duration
				: cfg.preset[b.motion.duration])
			: cfg.preset.unknown;
		let mult = 1;
		if (d.modifiers.includes("slowly")) mult *= cfg.preset.slowly;
		if (d.modifiers.includes("quickly")) mult *= cfg.preset.quickly;
		const group: GroupTail | undefined = d.group ??
			(b.count > 1 && b.motion?.staggered ? "oneByOne" : undefined);
		const tail = group === "oneByOne" ? (b.count - 1) * cfg.preset.stagger : 0;
		const duration = base * mult + tail;
		const offset = d.justAfter && cur.directions.length
			? prevOffset + cfg.preset.justAfter
			: 0;
		const start = cur.start + offset;
		const end = start + duration;
		cur.directions.push({
			index: (run.index ?? 0) + i,
			relation: d.relation,
			subject: d.subject,
			part: d.part,
			phrase: b.phrase,
			object: b.object,
			args: d.args,
			modifiers: d.modifiers,
			justAfter: d.justAfter,
			group,
			motion: b.motion ? b.phrase : null,
			count: b.count,
			start: ms(start),
			offset: ms(offset),
			duration: ms(duration),
			end: ms(end),
			line: d.line,
			raw: d.raw,
		});
		cur.end = Math.max(cur.end, end);
		cur.duration = ms(cur.end - cur.start);
		prevOffset = offset;
	});

	for (const m of moments) {
		m.start = ms(m.start);
		m.end = ms(m.end);
	}
	return moments;
}
