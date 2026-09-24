/**
 * Parser
 * Purpose: `.scenario` text → `Scenario`, or a list of structural errors. Registry-free: it
 * knows the grammar, not the project's vocabulary.
 * Invariants: structure is strict (any structural doubt is an error, all errors are collected
 * before giving up); content is loose (a beat line that is not text, hold or a direction on a
 * cast member is a note).
 * See: SPEC.md §2 (Syntax)
 */

import {
	ARG_KEYWORDS,
	type ArgKeyword,
	type Beat,
	type CastMember,
	type Direction,
	FORMAT_VERSION,
	type Hold,
	type HoldUnit,
	type Issue,
	type Modifier,
	MODIFIERS,
	type Music,
	type Relation,
	type Scenario,
	type Scene,
	sortIssues,
	type UiStrings,
	type Video,
} from "./model.ts";

export interface ParseResult {
	/** The scenario when there were no errors, otherwise `null`. */
	scenario: Scenario | null;
	/** Structural errors (always `severity: "error"`). Empty when `scenario` is set. */
	errors: Issue[];
}

interface Rec {
	no: number;
	indent: string;
	level: number;
	content: string;
}

interface RawBeat {
	beat: Beat;
	lines: Rec[];
}

const LANG_LIKE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?(\.sub)?$/;
const KEYWORDS = new Set<string>(ARG_KEYWORDS);
const MODIFIER_WORDS = new Set<string>(["slowly", "quickly", "softly"]);
const MODIFIER_PHRASES = new Set<string>(MODIFIERS);

/** Parse `.scenario` text. Never throws on content; collects every structural error. */
export function parse(text: string): ParseResult {
	const errors: Issue[] = [];
	const err = (message: string, line?: number, code = "E_SYNTAX") =>
		errors.push({ severity: "error", code, message, line });

	const recs = tokenizeLines(text, err);
	if (!recs.length) {
		err("empty file: the first line must be `motion-scenario 1`", 1, "E_VERSION");
		return { scenario: null, errors };
	}

	// version line
	const first = recs[0];
	const vm = /^motion-scenario\s+(\d+)$/.exec(first.content);
	if (first.level !== 0 || !vm) {
		err(
			`the first line must be \`motion-scenario ${FORMAT_VERSION}\`, got \`${first.content}\``,
			first.no,
			"E_VERSION",
		);
		return { scenario: null, errors };
	}
	const version = Number(vm[1]);
	if (version !== FORMAT_VERSION) {
		err(
			`unsupported format version ${version} (this package reads ${FORMAT_VERSION})`,
			first.no,
			"E_VERSION",
		);
		return { scenario: null, errors };
	}

	// pass 1: blocks
	let video: Video | null = null;
	let cast: CastMember[] | null = null;
	const ui: UiStrings = {};
	const uiLines: Record<string, Record<string, number>> = {};
	const scenes: Scene[] = [];
	const rawBeats: RawBeat[] = [];

	type Ctx =
		| { kind: "none" }
		| { kind: "video" }
		| { kind: "cast" }
		| { kind: "ui"; key: string }
		| { kind: "scene"; scene: Scene; beat: RawBeat | null };
	let ctx: Ctx = { kind: "none" };

	for (const r of recs.slice(1)) {
		if (r.level === 0) {
			ctx = { kind: "none" };
			const [head, ...rest] = r.content.split(/\s+/);
			switch (head) {
				case "video": {
					if (video) {
						err("duplicate `video` block", r.no, "E_DUPLICATE_BLOCK");
						break;
					}
					if (rest.length !== 1) {
						err("expected `video <slug>`", r.no);
						break;
					}
					video = {
						slug: rest[0],
						formats: [],
						languages: [],
						music: { kind: "silent" },
						notes: {},
						line: r.no,
					};
					ctx = { kind: "video" };
					break;
				}
				case "cast": {
					if (cast) {
						err("duplicate `cast` block", r.no, "E_DUPLICATE_BLOCK");
						break;
					}
					if (rest.length) err("expected `cast` with nothing after it", r.no);
					cast = [];
					ctx = { kind: "cast" };
					break;
				}
				case "ui": {
					if (rest.length !== 1) {
						err("expected `ui <key>`", r.no);
						break;
					}
					const key = rest[0];
					if (ui[key]) {
						err(`duplicate ui key \`${key}\``, r.no, "E_DUPLICATE_UI");
						break;
					}
					ui[key] = {};
					uiLines[key] = {};
					ctx = { kind: "ui", key };
					break;
				}
				case "scene": {
					const scene = parseSceneHeader(rest, r, err);
					if (!scene) break;
					if (scenes.some((s) => s.name === scene.name)) {
						err(
							`duplicate scene name \`${scene.name}\``,
							r.no,
							"E_DUPLICATE_SCENE",
						);
					}
					scenes.push(scene);
					ctx = { kind: "scene", scene, beat: null };
					break;
				}
				default:
					err(
						`unknown block \`${head}\` (expected video, cast, ui or scene)`,
						r.no,
						"E_UNKNOWN_BLOCK",
					);
			}
			continue;
		}

		if (ctx.kind === "none") {
			err("indented line outside of any block", r.no, "E_INDENT");
			continue;
		}

		if (ctx.kind === "video") {
			if (r.level !== 1) {
				err("unexpected indentation inside `video`", r.no, "E_INDENT");
				continue;
			}
			parseVideoLine(video!, r, err);
			continue;
		}

		if (ctx.kind === "cast") {
			if (r.level !== 1) {
				err("unexpected indentation inside `cast`", r.no, "E_INDENT");
				continue;
			}
			const m = parseCastLine(r, err);
			if (!m) continue;
			if (cast!.some((c) => c.name === m.name)) {
				err(`duplicate cast name \`${m.name}\``, r.no, "E_DUPLICATE_CAST");
				continue;
			}
			cast!.push(m);
			continue;
		}

		if (ctx.kind === "ui") {
			if (r.level !== 1) {
				err("unexpected indentation inside `ui`", r.no, "E_INDENT");
				continue;
			}
			const [lang, txt] = splitTwoColumns(r.content);
			if (!txt) {
				err("expected `<lang>  <text>`", r.no);
				continue;
			}
			if (ui[ctx.key][lang] !== undefined) {
				err(
					`duplicate language \`${lang}\` in ui \`${ctx.key}\``,
					r.no,
					"E_DUPLICATE_TEXT",
				);
				continue;
			}
			ui[ctx.key][lang] = txt;
			uiLines[ctx.key][lang] = r.no;
			continue;
		}

		// scene
		if (r.level === 1) {
			const beat = parseBeatHeader(r, err);
			if (!beat) {
				ctx.beat = null;
				continue;
			}
			if (rawBeats.some((b) => b.beat.id === beat.id)) {
				err(`duplicate beat id \`${beat.id}\``, r.no, "E_DUPLICATE_BEAT");
			}
			const rb: RawBeat = { beat, lines: [] };
			rawBeats.push(rb);
			ctx.scene.beats.push(beat);
			ctx.beat = rb;
			continue;
		}
		if (r.level === 2) {
			if (!ctx.beat) {
				err("beat line outside of a beat", r.no, "E_INDENT");
				continue;
			}
			ctx.beat.lines.push(r);
			continue;
		}
		err("unexpected indentation inside `scene`", r.no, "E_INDENT");
	}

	if (!video) err("missing `video` block", undefined, "E_MISSING_BLOCK");
	if (!cast) err("missing `cast` block", undefined, "E_MISSING_BLOCK");
	if (video && !video.languages.length) {
		err("`video` must declare `languages`", video.line, "E_MISSING_LANGUAGES");
	}
	if (!scenes.length) err("no `scene` block", undefined, "E_MISSING_BLOCK");

	// ui languages must be declared
	if (video) {
		for (const [key, byLang] of Object.entries(ui)) {
			for (const lang of Object.keys(byLang)) {
				if (!video.languages.includes(lang)) {
					err(
						`ui \`${key}\` has text in undeclared language \`${lang}\``,
						uiLines[key][lang],
						"E_UNDECLARED_LANGUAGE",
					);
				}
			}
		}
	}

	// pass 2: beat lines (needs languages and cast names)
	if (video && cast) {
		const languages = new Set(video.languages);
		const castNames = new Set(cast.map((c) => c.name));
		for (const rb of rawBeats) {
			for (const r of rb.lines) {
				parseBeatLine(rb.beat, r, languages, castNames, err);
			}
		}
	}

	if (errors.length || !video || !cast) {
		return { scenario: null, errors: sortIssues(errors) };
	}
	return { scenario: { version, video, cast, ui, scenes }, errors };
}

/** Split into records; drop blank and comment lines; detect and validate the indent unit. */
function tokenizeLines(
	text: string,
	err: (message: string, line?: number, code?: string) => void,
): Rec[] {
	const out: Rec[] = [];
	let unit: string | null = null;
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const no = i + 1;
		const m = /^(\s*)(.*?)\s*$/.exec(line)!;
		const indent = m[1];
		const content = m[2];
		if (!content || content.startsWith("#")) continue;
		let level = 0;
		if (indent.length) {
			const allTabs = /^\t+$/.test(indent);
			const allSpaces = /^ +$/.test(indent);
			if (!allTabs && !allSpaces) {
				err("mixed tabs and spaces in indentation", no, "E_INDENT");
				continue;
			}
			if (unit === null) unit = allTabs ? "\t" : indent;
			const unitChar = unit[0];
			if (indent[0] !== unitChar) {
				err(
					`inconsistent indentation: file uses ${
						unitChar === "\t" ? "tabs" : "spaces"
					}`,
					no,
					"E_INDENT",
				);
				continue;
			}
			if (indent.length % unit.length !== 0) {
				err(
					`inconsistent indentation: expected a multiple of ${unit.length} ${
						unitChar === "\t" ? "tab(s)" : "space(s)"
					}`,
					no,
					"E_INDENT",
				);
				continue;
			}
			level = indent.length / unit.length;
		}
		out.push({ no, indent, level, content });
	}
	return out;
}

/** `<key>  <value>` — split on the first run of whitespace. */
function splitTwoColumns(content: string): [string, string] {
	const m = /^(\S+)\s+(.*)$/.exec(content);
	if (!m) return [content, ""];
	return [m[1], m[2].trim()];
}

function parseVideoLine(
	video: Video,
	r: Rec,
	err: (message: string, line?: number, code?: string) => void,
): void {
	const [key, value] = splitTwoColumns(r.content);
	if (!value) {
		err(`expected \`<key>  <value>\` in \`video\`, got \`${r.content}\``, r.no);
		return;
	}
	const list = () => value.split(",").map((s) => s.trim()).filter(Boolean);
	switch (key) {
		case "formats":
			video.formats = list();
			return;
		case "languages": {
			video.languages = list();
			const dup = video.languages.find((l, i) => video.languages.indexOf(l) !== i);
			if (dup) err(`duplicate language \`${dup}\``, r.no);
			return;
		}
		case "music": {
			const music = parseMusic(value);
			if (!music) {
				err(
					`invalid music \`${value}\` (expected \`silent\` or \`<bpm> bpm [offset <s> s] [<n> per bar]\`)`,
					r.no,
					"E_MUSIC",
				);
				return;
			}
			video.music = music;
			return;
		}
		case "style":
			video.style = value;
			return;
		default:
			video.notes[key] = value;
	}
}

/** `silent` | `<bpm> bpm [offset <s> s] [<n> per bar]` */
export function parseMusic(value: string): Music | null {
	const v = value.trim();
	if (v === "silent") return { kind: "silent" };
	const m =
		/^(\d+(?:\.\d+)?)\s*bpm(?:\s+offset\s+(\d+(?:\.\d+)?)\s*s)?(?:\s+(\d+)\s+per\s+bar)?$/
			.exec(v);
	if (!m) return null;
	const bpm = Number(m[1]);
	if (!(bpm > 0)) return null;
	return {
		kind: "grid",
		bpm,
		offset: m[2] ? Number(m[2]) : 0,
		perBar: m[3] ? Number(m[3]) : 4,
	};
}

function parseCastLine(
	r: Rec,
	err: (message: string, line?: number, code?: string) => void,
): CastMember | null {
	const [name, rest] = splitTwoColumns(r.content);
	if (!rest) {
		err(
			`expected \`<name>  <Type>\`, \`<name>  new: <description>\` or \`<name>  <n>x <member>\``,
			r.no,
		);
		return null;
	}
	if (name.includes(".")) {
		err(`cast name \`${name}\` must not contain a dot`, r.no);
		return null;
	}
	const base: CastMember = { name, type: "", isNew: false, args: [], line: r.no };
	if (rest.startsWith("new:")) {
		const description = rest.slice(4).trim();
		return {
			...base,
			type: "new",
			isNew: true,
			description: description || undefined,
		};
	}
	const tokens = rest.split(/\s+/);
	const g = /^(\d+)x$/.exec(tokens[0]);
	if (g) {
		if (tokens.length !== 2) {
			err("expected `<name>  <n>x <member>`", r.no);
			return null;
		}
		return { ...base, group: { count: Number(g[1]), member: tokens[1] } };
	}
	const type = tokens[0];
	let t = tokens.slice(1);
	let host: string | undefined;
	if (t[0] === "on") {
		if (!t[1]) {
			err("expected `on <host>`", r.no);
			return null;
		}
		host = t[1];
		t = t.slice(2);
	}
	return { ...base, type, host, args: t };
}

function parseSceneHeader(
	rest: string[],
	r: Rec,
	err: (message: string, line?: number, code?: string) => void,
): Scene | null {
	if (!rest.length) {
		err("expected `scene <name> [ends full|clean] [transition <kind>]`", r.no);
		return null;
	}
	const scene: Scene = { name: rest[0], ends: "clean", beats: [], line: r.no };
	let i = 1;
	while (i < rest.length) {
		const k = rest[i];
		const v = rest[i + 1];
		if (k === "ends" && (v === "full" || v === "clean")) {
			scene.ends = v;
		} else if (k === "transition" && v) {
			scene.transition = v;
		} else {
			err(
				`unexpected \`${k}\` in scene header (expected \`ends full|clean\` or \`transition <kind>\`)`,
				r.no,
			);
			return null;
		}
		i += 2;
	}
	return scene;
}

function parseBeatHeader(
	r: Rec,
	err: (message: string, line?: number, code?: string) => void,
): Beat | null {
	const tokens = r.content.split(/\s+/);
	if (tokens[0] !== "beat" || !tokens[1]) {
		err(`expected \`beat <id> [role <role>]\`, got \`${r.content}\``, r.no);
		return null;
	}
	const beat: Beat = { id: tokens[1], text: {}, directions: [], notes: [], line: r.no };
	const rest = tokens.slice(2);
	if (rest.length === 0) return beat;
	if (rest.length === 2 && rest[0] === "role") {
		beat.role = rest[1];
		return beat;
	}
	err(
		`unexpected \`${rest.join(" ")}\` in beat header (expected \`role <role>\`)`,
		r.no,
	);
	return null;
}

function parseBeatLine(
	beat: Beat,
	r: Rec,
	languages: Set<string>,
	castNames: Set<string>,
	err: (message: string, line?: number, code?: string) => void,
): void {
	const content = r.content;
	const tokens = content.split(/\s+/);
	const first = tokens[0];

	// explicit note
	if (first === "-" || first.startsWith("-")) {
		beat.notes.push(content.replace(/^-\s*/, ""));
		return;
	}

	// hold
	if (first === "hold") {
		const hold = parseHold(tokens.slice(1));
		if (!hold) {
			err(
				`invalid \`${content}\` (expected \`hold <n> s|beats|bars\`)`,
				r.no,
				"E_HOLD",
			);
			return;
		}
		if (beat.hold) {
			err("duplicate `hold` in beat", r.no, "E_DUPLICATE_HOLD");
			return;
		}
		beat.hold = hold;
		return;
	}

	// text: `<lang>  <text>` | `<lang>.sub  <text>`
	const [langKey, rest] = splitTwoColumns(content);
	const sub = langKey.endsWith(".sub");
	const lang = sub ? langKey.slice(0, -4) : langKey;
	if (languages.has(lang)) {
		if (!rest) {
			err(`empty text for \`${langKey}\``, r.no, "E_EMPTY_TEXT");
			return;
		}
		const t = beat.text[lang] ?? { headline: "" };
		if (sub) {
			if (t.sub !== undefined) {
				err(
					`duplicate \`${langKey}\` in beat \`${beat.id}\``,
					r.no,
					"E_DUPLICATE_TEXT",
				);
				return;
			}
			t.sub = rest;
		} else {
			if (t.headline) {
				err(
					`duplicate \`${langKey}\` in beat \`${beat.id}\``,
					r.no,
					"E_DUPLICATE_TEXT",
				);
				return;
			}
			t.headline = rest;
		}
		beat.text[lang] = t;
		return;
	}

	// direction
	const rel: Relation | null = first === "then" || first === "and" ? first : null;
	const subjTok = rel ? tokens[1] : tokens[0];
	const dot = subjTok?.indexOf(".") ?? -1;
	const subject = dot >= 0 ? subjTok.slice(0, dot) : subjTok;
	if (subjTok && castNames.has(subject)) {
		const part = dot >= 0 ? subjTok.slice(dot + 1) : undefined;
		const after = content.slice(content.indexOf(subjTok) + subjTok.length).trim();
		const d = parseDirectionTail(after);
		if (!d) {
			err(`direction on \`${subject}\` has no verb`, r.no, "E_DIRECTION");
			return;
		}
		beat.directions.push({
			relation: rel ?? "then",
			subject,
			part: part || undefined,
			...d,
			line: r.no,
			raw: content,
		});
		return;
	}

	// two-column line that looks like a language code but is not declared
	const sep = /^\S+(\s+)/.exec(content)?.[1] ?? "";
	if (LANG_LIKE.test(langKey) && rest && (sep.length >= 2 || sep.includes("\t"))) {
		err(`text in undeclared language \`${lang}\``, r.no, "E_UNDECLARED_LANGUAGE");
		return;
	}

	beat.notes.push(content);
}

/** `<n> s|beats|bars` */
export function parseHold(tokens: string[]): Hold | null {
	if (tokens.length !== 2) return null;
	const value = Number(tokens[0]);
	const unit = tokens[1] as HoldUnit;
	if (!(value >= 0) || !["s", "beats", "bars"].includes(unit)) return null;
	return { value, unit };
}

type DirectionTail = Pick<
	Direction,
	"verb" | "words" | "args" | "justAfter" | "group" | "modifiers"
>;

/** Everything after the subject: `<verb> [words] [kw arg]... [, tail]...` */
export function parseDirectionTail(after: string): DirectionTail | null {
	const segments = after.split(",").map((s) => s.trim()).filter(Boolean);
	if (!segments.length) return null;
	const seg0 = segments[0].split(/\s+/);
	const verb = seg0[0];
	if (!verb || KEYWORDS.has(verb)) return null;

	const words: string[] = [];
	const args: Partial<Record<ArgKeyword, string[]>> = {};
	const modifiers: Modifier[] = [];
	let justAfter = false;
	let group: Direction["group"];

	const bare: string[] = [];
	let openKey: ArgKeyword | null = null;
	let openValue: string[] = [];
	const flush = () => {
		if (openKey) {
			(args[openKey] ??= []).push(stripArticle(openValue.join(" ")));
			openValue = [];
		}
	};
	for (const tok of seg0.slice(1)) {
		if (KEYWORDS.has(tok)) {
			flush();
			openKey = tok as ArgKeyword;
		} else if (MODIFIER_WORDS.has(tok)) {
			modifiers.push(tok as Modifier);
		} else if (openKey) {
			openValue.push(tok);
		} else {
			bare.push(tok);
		}
	}
	flush();
	if (bare.length) words.push(bare.join(" "));
	let lastList: ArgKeyword | "words" = openKey ?? "words";

	for (const seg of segments.slice(1)) {
		if (seg === "just after") {
			justAfter = true;
		} else if (seg === "one by one") {
			group = "oneByOne";
		} else if (seg === "together") {
			group = "together";
		} else if (MODIFIER_PHRASES.has(seg)) {
			modifiers.push(seg as Modifier);
		} else {
			const [kw, value] = splitTwoColumns(seg);
			if (KEYWORDS.has(kw) && value) {
				(args[kw as ArgKeyword] ??= []).push(stripArticle(value));
				lastList = kw as ArgKeyword;
			} else if (lastList !== "words") {
				(args[lastList] ??= []).push(stripArticle(seg));
			} else {
				words.push(seg);
			}
		}
	}

	// `with overshoot` written without a comma parses as an argument; it is a modifier.
	if (args.with) {
		const rest = args.with.filter((v) => v !== "overshoot");
		if (rest.length !== args.with.length) modifiers.push("with overshoot");
		if (rest.length) args.with = rest;
		else delete args.with;
	}

	return { verb, words, args, justAfter, group, modifiers: dedupe(modifiers) };
}

function stripArticle(s: string): string {
	return s.replace(/^(the|a|an)\s+/i, "");
}

function dedupe<T>(a: T[]): T[] {
	return [...new Set(a)];
}
