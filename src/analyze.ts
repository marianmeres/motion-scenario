/**
 * Analyze
 * Purpose: the one-call convenience: parse, check, resolve and extract words in one go, with
 * the "errors stop every tool" rule applied.
 */

import { check, type CheckResult } from "./check.ts";
import type { ProjectConfig } from "./config.ts";
import type { Issue, Scenario } from "./model.ts";
import { parse } from "./parser.ts";
import { resolve, type ResolveResult } from "./resolve.ts";
import { type Words, words } from "./words.ts";

export interface Analysis {
	/** No parse errors and no check errors. */
	ok: boolean;
	/** Parse errors, then check errors. */
	errors: Issue[];
	warnings: Issue[];
	scenario: Scenario | null;
	check: CheckResult | null;
	resolved: ResolveResult | null;
	words: Words | null;
}

/** Parse, check and resolve. On parse errors only `errors` is populated. */
export function analyze(text: string, config?: ProjectConfig): Analysis {
	const parsed = parse(text);
	if (!parsed.scenario) {
		return {
			ok: false,
			errors: parsed.errors,
			warnings: [],
			scenario: null,
			check: null,
			resolved: null,
			words: null,
		};
	}
	const c = check(parsed.scenario, config);
	return {
		ok: c.ok,
		errors: c.errors,
		warnings: c.warnings,
		scenario: parsed.scenario,
		check: c,
		resolved: c.ok ? resolve(parsed.scenario, config) : null,
		words: c.ok ? words(parsed.scenario) : null,
	};
}
