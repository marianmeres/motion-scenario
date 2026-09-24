/**
 * Bind
 * Purpose: match a parsed direction's verb phrase against the vocabulary (core + project +
 * component type). The parser does not know the vocabulary; this is where "a verb is bound or
 * it is new" is decided.
 * See: SPEC.md §7 (Vocabulary)
 */

import { CORE_VERBS, type MotionDef, type ResolvedConfig } from "./config.ts";
import { type CastMember, castTypeOf, type Direction, type Scenario } from "./model.ts";

export type BindSource = "core" | "project" | "type";

export interface Bound {
	/** The matched vocabulary phrase, or the bare verb when nothing matched. */
	phrase: string;
	/** Bare words left after the phrase: `ui.<key>` references, a cast name, a pose. */
	object: string[];
	motion: MotionDef | null;
	source: BindSource | null;
	/** Group members or objects the motion applies to (≥ 1). */
	count: number;
	/** The cast member whose component type applies (a group resolves to its member). */
	typed?: CastMember;
}

/** Bind one direction. Longest matching phrase wins; type verbs win over project and core. */
export function bind(d: Direction, scenario: Scenario, cfg: ResolvedConfig): Bound {
	const typed = castTypeOf(scenario.cast, d.subject);
	const typeVerbs = (typed && cfg.types[typed.type]?.verbs) ?? {};
	const head = d.words[0] ? d.words[0].split(/\s+/) : [];

	let phrase = d.verb;
	let motion: MotionDef | null = null;
	let source: BindSource | null = null;
	let used = 0;
	// Longest phrase first. A plural subject takes a plural verb (`plants pop`), so each
	// candidate is also tried in its third-person singular form (`pops`, `pushes`).
	outer: for (let k = head.length; k >= 0; k--) {
		for (const verb of verbForms(d.verb)) {
			const candidate = [verb, ...head.slice(0, k)].join(" ");
			if (typeVerbs[candidate]) {
				motion = typeVerbs[candidate];
				source = "type";
			} else if (cfg.verbs[candidate]) {
				motion = cfg.verbs[candidate];
				source = cfg.verbs[candidate] === CORE_VERBS[candidate]
					? "core"
					: "project";
			}
			if (motion) {
				phrase = candidate;
				used = k;
				break outer;
			}
		}
	}

	const rest = head.slice(used).join(" ");
	const object = [rest, ...d.words.slice(1)].filter(Boolean);
	const subject = scenario.cast.find((c) => c.name === d.subject);
	const count = subject?.group ? subject.group.count : Math.max(1, object.length);
	return { phrase, object, motion, source, count, typed };
}

/** `pop` → `pop`, `pops`; `push` → `push`, `pushs`, `pushes`. As written first. */
export function verbForms(verb: string): string[] {
	const out = [verb];
	if (!verb.endsWith("s")) out.push(`${verb}s`);
	if (/(s|x|z|ch|sh)$/.test(verb)) out.push(`${verb}es`);
	return out;
}

/** Every `ui.<key>` reference in a direction (object words and argument values). */
export function uiRefs(d: Direction, b: Bound): string[] {
	const out: string[] = [];
	const scan = (s: string) => {
		for (const m of s.matchAll(/(?:^|\s)ui\.([^\s,]+)/g)) out.push(m[1]);
	};
	for (const w of b.object) scan(w);
	for (const vals of Object.values(d.args)) for (const v of vals ?? []) scan(v);
	return out;
}
