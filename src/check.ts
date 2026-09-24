/**
 * Check
 * Purpose: the content rules. Errors stop every tool; warnings are printed and tools continue.
 * Structural rules (version, blocks, indentation, duplicates) live in the parser.
 * See: SPEC.md §6 (Checks)
 */

import { bind, uiRefs } from "./bind.ts";
import { type ProjectConfig, resolveConfig } from "./config.ts";
import { type Beat, type Issue, type Scenario, sortIssues } from "./model.ts";
import { resolve } from "./resolve.ts";

/** A direction whose verb phrase the vocabulary does not know yet (`W_NEW_MOTION`). */
export interface NewMotion {
	/** The verb phrase as bound (the bare verb plus any bare words). */
	phrase: string;
	/** The cast name the direction addresses. */
	subject: string;
	/** The subject's component type, when known. */
	type?: string;
	/** The direction line as written, trimmed. */
	raw: string;
	/** 1-based source line. */
	line: number;
}

/** A cast member whose component does not exist yet in the project's registry. */
export interface NewComponent {
	/** The cast name. */
	name: string;
	/** `new` for `new:` members; the declared type when it is not in the registry. */
	type: string;
	/** The text after `new:`, when declared that way. */
	description?: string;
	/** 1-based source line. */
	line: number;
}

/** The result of `check`. */
export interface CheckResult {
	/** No errors. Warnings do not affect it. */
	ok: boolean;
	/** Findings that stop every tool, sorted by line. */
	errors: Issue[];
	/** Findings that are reported while tools continue, sorted by line. */
	warnings: Issue[];
	/** Every unbound verb, one entry per line. */
	newMotions: NewMotion[];
	/** `new:` members and members whose type the registry does not know. */
	newComponents: NewComponent[];
}

/** Run every content rule. Pure; never throws on content. */
export function check(scenario: Scenario, config?: ProjectConfig): CheckResult {
	const cfg = resolveConfig(config);
	const errors: Issue[] = [];
	const warnings: Issue[] = [];
	const newMotions: NewMotion[] = [];
	const newComponents: NewComponent[] = [];
	const error = (code: string, message: string, line?: number) =>
		errors.push({ severity: "error", code, message, line });
	const warn = (code: string, message: string, line?: number) =>
		warnings.push({ severity: "warning", code, message, line });

	const { video, cast, ui, scenes } = scenario;
	const languages = video.languages;
	const reference = languages[0];
	const castNames = new Set(cast.map((c) => c.name));
	const hasTypes = Object.keys(cfg.types).length > 0;
	const usedCast = new Set<string>();
	const usedUi = new Set<string>();

	// cast
	for (const c of cast) {
		if (c.host) {
			usedCast.add(c.host);
			if (!castNames.has(c.host)) {
				error(
					"E_UNDECLARED_CAST",
					`\`${c.name}\` is on undeclared host \`${c.host}\``,
					c.line,
				);
			}
		}
		if (c.group) {
			usedCast.add(c.group.member);
			if (!castNames.has(c.group.member)) {
				error(
					"E_UNDECLARED_CAST",
					`group \`${c.name}\` names undeclared member \`${c.group.member}\``,
					c.line,
				);
			} else if (c.group.member === c.name) {
				error("E_UNDECLARED_CAST", `group \`${c.name}\` names itself`, c.line);
			}
			if (c.group.count < 1) {
				error(
					"E_CAST",
					`group \`${c.name}\` must have at least 1 member`,
					c.line,
				);
			}
		}
		if (c.isNew) {
			newComponents.push({
				name: c.name,
				type: "new",
				description: c.description,
				line: c.line,
			});
			warn(
				"W_NEW_COMPONENT",
				`\`${c.name}\` is a new component${
					c.description ? `: ${c.description}` : ""
				}`,
				c.line,
			);
		} else if (!c.group && hasTypes && !cfg.types[c.type]) {
			newComponents.push({ name: c.name, type: c.type, line: c.line });
			warn(
				"W_UNKNOWN_TYPE",
				`\`${c.name}\` has type \`${c.type}\` which the registry does not know`,
				c.line,
			);
		}
		for (const a of c.args) {
			const m = /^ui\.(\S+)$/.exec(a);
			if (m) {
				usedUi.add(m[1]);
				if (!ui[m[1]]) error("E_UI_MISSING", `\`${a}\` is not defined`, c.line);
			}
		}
	}

	// ui strings
	for (const [key, byLang] of Object.entries(ui)) {
		for (const lang of languages) {
			if (byLang[lang] === undefined) {
				error(
					"E_UI_TEXT_MISSING",
					lang === reference
						? `ui \`${key}\` has no text in the reference language \`${lang}\``
						: `ui \`${key}\` has no text in \`${lang}\``,
				);
			}
		}
		for (const lang of languages) {
			checkBlacklist(key, lang, byLang[lang], warn, cfg.blacklist);
		}
	}

	// scenes and beats
	const allBeats: { beat: Beat; sceneIndex: number; beatIndex: number }[] = [];
	scenes.forEach((scene, si) => {
		if (scene.transition && !cfg.transitions.includes(scene.transition)) {
			warn(
				"W_NEW_TRANSITION",
				`scene \`${scene.name}\` uses unknown transition \`${scene.transition}\``,
				scene.line,
			);
		}
		if (
			scene.ends === "full" && si < scenes.length - 1 && !scenes[si + 1].transition
		) {
			error(
				"E_CLEAN_PLATE",
				`scene \`${scene.name}\` ends full but the next scene \`${
					scenes[si + 1].name
				}\` declares no transition`,
				scenes[si + 1].line,
			);
		}
		if (!scene.beats.length) {
			warn("W_EMPTY_SCENE", `scene \`${scene.name}\` has no beats`, scene.line);
		}
		scene.beats.forEach((beat, bi) =>
			allBeats.push({ beat, sceneIndex: si, beatIndex: bi })
		);
	});

	const resolved = resolve(scenario, config);
	const refTimeline = resolved.timelines[reference];

	for (const { beat, sceneIndex, beatIndex } of allBeats) {
		const langsWithText = Object.keys(beat.text);
		if (!langsWithText.length && !beat.hold) {
			error(
				"E_EMPTY_BEAT",
				`beat \`${beat.id}\` has neither text nor hold`,
				beat.line,
			);
		}
		if (langsWithText.length) {
			const anySub = langsWithText.some((l) => beat.text[l].sub !== undefined);
			for (const lang of languages) {
				const t = beat.text[lang];
				if (!t?.headline) {
					error(
						"E_TEXT_MISSING",
						lang === reference
							? `beat \`${beat.id}\` has no text in the reference language \`${lang}\``
							: `beat \`${beat.id}\` has no text in \`${lang}\``,
						beat.line,
					);
					continue;
				}
				if (anySub && t.sub === undefined) {
					error(
						"E_SUB_MISMATCH",
						`beat \`${beat.id}\` has a sub line in another language but not in \`${lang}\``,
						beat.line,
					);
				}
				const n = t.headline.trim().split(/\s+/).length;
				if (n > cfg.headline.maxWords) {
					warn(
						"W_HEADLINE_LONG",
						`beat \`${beat.id}\` headline in \`${lang}\` has ${n} words (max ${cfg.headline.maxWords})`,
						beat.line,
					);
				}
				for (const format of video.formats) {
					const f = cfg.formats[format];
					if (!f?.charsPerLine) continue;
					const lines = Math.ceil(t.headline.length / f.charsPerLine);
					const max = f.maxLines ?? 2;
					if (lines > max) {
						warn(
							"W_HEADLINE_LINES",
							`beat \`${beat.id}\` headline in \`${lang}\` needs ~${lines} lines in \`${format}\` (max ${max})`,
							beat.line,
						);
					}
				}
				checkBlacklist(
					`beat \`${beat.id}\``,
					lang,
					[t.headline, t.sub ?? ""].join(" "),
					warn,
					cfg.blacklist,
				);
			}
		}
		if (beat.hold && beat.hold.unit !== "s" && video.music.kind === "silent") {
			error(
				"E_HOLD_NO_GRID",
				`beat \`${beat.id}\` holds in ${beat.hold.unit} but the video is silent`,
				beat.line,
			);
		}

		// roles (only opening moments count: a `finally` exit is not the hook's motion, nor
		// does it make an end card busy)
		const rb = refTimeline?.beats.find((b) => b.id === beat.id);
		const opening = rb?.moments.filter((m) => m.phase === "opening") ?? [];
		const isFirst = sceneIndex === 0 && beatIndex === 0;
		if (beat.role === "hook") {
			if (!isFirst) {
				error(
					"E_HOOK_POSITION",
					`\`role hook\` is only valid on the first beat of the first scene`,
					beat.line,
				);
			}
			if (!opening.length) {
				warn(
					"W_HOOK_NO_DIRECTION",
					`hook beat \`${beat.id}\` has no opening direction (nothing moves in the first second)`,
					beat.line,
				);
			}
		}
		if (beat.role === "end") {
			if (!beat.hold) {
				warn(
					"W_END_NO_HOLD",
					`end beat \`${beat.id}\` states no hold`,
					beat.line,
				);
			}
		}

		// directions
		if (beat.role === "end" && opening.length > 2) {
			warn(
				"W_END_BUSY",
				`end beat \`${beat.id}\` has ${opening.length} moments; an end card holds still after its entrance`,
				beat.line,
			);
		}
		for (const m of rb?.moments ?? []) {
			const pops = m.directions.filter((d) => d.phrase === "pops");
			if (pops.length > 1) {
				warn(
					"W_DOUBLE_POP",
					`beat \`${beat.id}\` has ${pops.length} pops in one moment (one focal point per frame)`,
					pops[1].line,
				);
			}
		}
		for (const d of beat.directions) {
			usedCast.add(d.subject);
			const b = bind(d, scenario, cfg);
			if (!b.motion) {
				const phrase = [b.phrase, ...b.object].join(" ");
				newMotions.push({
					phrase,
					subject: d.subject,
					type: b.typed?.type,
					raw: d.raw,
					line: d.line,
				});
				warn(
					"W_NEW_MOTION",
					`new motion \`${phrase}\` on \`${d.subject}\`${
						b.typed?.type ? ` (${b.typed.type})` : ""
					}`,
					d.line,
				);
			}
			if (
				d.part && b.typed && cfg.types[b.typed.type]?.parts &&
				!cfg.types[b.typed.type].parts!.includes(d.part)
			) {
				warn(
					"W_UNKNOWN_PART",
					`\`${d.subject}.${d.part}\`: type \`${b.typed.type}\` has no part \`${d.part}\``,
					d.line,
				);
			}
			if (d.justAfter && d.relation !== "and") {
				warn(
					"W_JUST_AFTER_THEN",
					`\`just after\` has no effect on a \`${d.relation}\` line (it needs \`and\`)`,
					d.line,
				);
			}
			for (const key of uiRefs(d, b)) {
				usedUi.add(key);
				if (!ui[key]) {
					error("E_UI_MISSING", `\`ui.${key}\` is not defined`, d.line);
				}
			}
			for (const vals of Object.values(d.args)) {
				for (const v of vals ?? []) if (castNames.has(v)) usedCast.add(v);
			}
			for (const o of b.object) if (castNames.has(o)) usedCast.add(o);
		}
	}

	for (const c of cast) {
		if (!usedCast.has(c.name)) {
			warn("W_UNUSED_CAST", `\`${c.name}\` is declared but never directed`, c.line);
		}
	}
	for (const key of Object.keys(ui)) {
		if (!usedUi.has(key)) {
			warn("W_UNUSED_UI", `ui \`${key}\` is defined but never referenced`);
		}
	}

	// budgets
	for (const format of video.formats) {
		const budget = cfg.formats[format]?.budget;
		if (!budget) continue;
		for (const lang of languages) {
			const total = resolved.timelines[lang].total;
			if (total < budget[0] || total > budget[1]) {
				warn(
					"W_BUDGET",
					`running time ${total}s in \`${lang}\` is outside the \`${format}\` budget ${
						budget[0]
					}–${budget[1]}s`,
				);
			}
		}
	}

	return {
		ok: errors.length === 0,
		errors: sortIssues(errors),
		warnings: sortIssues(warnings),
		newMotions,
		newComponents,
	};
}

function checkBlacklist(
	where: string,
	lang: string,
	text: string | undefined,
	warn: (code: string, message: string, line?: number) => void,
	blacklist: Record<string, string[]>,
): void {
	if (!text) return;
	const words = blacklist[lang];
	if (!words?.length) return;
	const lower = text.toLowerCase();
	for (const w of words) {
		const re = new RegExp(
			`(^|[^\\p{L}\\p{N}])${escapeRe(w.toLowerCase())}(?=$|[^\\p{L}\\p{N}])`,
			"u",
		);
		if (re.test(lower)) {
			warn(
				"W_BLACKLIST",
				`${where} in \`${lang}\` uses the blacklisted word \`${w}\``,
			);
		}
	}
}

function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
