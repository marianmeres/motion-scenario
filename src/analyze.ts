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

/** The result of `analyze`: every tool's output, or `null` where an earlier stage stopped it. */
export interface Analysis {
	/** No parse errors and no check errors. */
	ok: boolean;
	/** Parse errors, then check errors. */
	errors: Issue[];
	/** Check warnings. Empty on parse errors. */
	warnings: Issue[];
	/** The parsed scenario, `null` on parse errors. */
	scenario: Scenario | null;
	/** The full check result, `null` on parse errors. */
	check: CheckResult | null;
	/** The timing estimate, `null` unless `ok`. */
	resolved: ResolveResult | null;
	/** Every translated string per language, `null` unless `ok`. */
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
