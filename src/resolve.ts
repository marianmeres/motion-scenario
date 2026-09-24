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

export interface ResolvedDirection {
	/** Position within the beat, 0-based. */
	index: number;
	relation: Relation;
	subject: string;
	part?: string;
	/** The bound vocabulary phrase, or the bare verb when unbound. */
	phrase: string;
	/** Bare words after the phrase: `ui.<key>` references, a cast name, a pose. */
	object: string[];
	args: Partial<Record<ArgKeyword, string[]>>;
	modifiers: Modifier[];
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
	duration: number;
	end: number;
	line: number;
	raw: string;
}

export interface ResolvedMoment {
	index: number;
	start: number;
	end: number;
	duration: number;
	directions: ResolvedDirection[];
}

export type BoundedBy = "words" | "motion" | "hold";

export interface ResolvedBeat {
	scene: string;
	id: string;
	role?: string;
	/** Position in the whole video, 0-based. */
	index: number;
	start: number;
	end: number;
	duration: number;
	/** When the headline is readable (`start` for a hook beat). */
	textReadableAt: number;
	/** Reading time or hold satisfied. */
	readUntil: number;
	/** Every moment complete. */
	motionEnd: number;
	/** What decided the beat's length. */
	boundedBy: BoundedBy;
	text?: BeatText;
	words: number;
	hold?: Hold;
	/** The hold in seconds, when there is one. */
	holdSeconds?: number;
	moments: ResolvedMoment[];
	notes: string[];
	line: number;
}

export interface Timeline {
	language: string;
	/** Running time in seconds. */
	total: number;
	beats: ResolvedBeat[];
}

export interface ResolveResult {
	slug: string;
	languages: string[];
	reference: string;
	formats: string[];
	music: Music;
	/** Grid units in seconds, `null` when silent. */
	grid: { beat: number | null; bar: number | null };
	preset: Preset;
	reading: ReadingTime;
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

				const moments = resolveMoments(beat.directions, start, scenario, cfg);
				const motionEnd = moments.length
					? moments[moments.length - 1].end
					: start;
				const end = snapUp(Math.max(readUntil, motionEnd), music);
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

/** Group a beat's directions into moments and time each direction. */
export function resolveMoments(
	directions: Direction[],
	beatStart: number,
	scenario: Scenario,
	cfg: ReturnType<typeof resolveConfig>,
): ResolvedMoment[] {
	const moments: ResolvedMoment[] = [];
	let cur: ResolvedMoment | null = null;
	let prevOffset = 0;

	directions.forEach((d, i) => {
		if (!cur || d.relation === "then") {
			const start = cur ? cur.end : beatStart;
			cur = {
				index: moments.length,
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
			index: i,
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
