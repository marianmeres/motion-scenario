/**
 * Words
 * Purpose: every translated string the scenario owns, per language, as plain data. Beat text
 * and `ui` strings. The scenario owns the words; consumers type or wrap this however they like.
 * See: SPEC.md §4 (Words)
 */

import type { BeatText, Scenario } from "./model.ts";

export interface LanguageWords {
	/** Beat id → headline (+ sub). Beats without text are omitted. */
	beats: Record<string, BeatText>;
	/** `ui` key → text. */
	ui: Record<string, string>;
}

/** Language → words. Key order follows the file. */
export type Words = Record<string, LanguageWords>;

export function words(scenario: Scenario): Words {
	const out: Words = {};
	for (const lang of scenario.video.languages) {
		const beats: Record<string, BeatText> = {};
		for (const scene of scenario.scenes) {
			for (const beat of scene.beats) {
				const t = beat.text[lang];
				if (t) {
					beats[beat.id] = t.sub === undefined
						? { headline: t.headline }
						: { ...t };
				}
			}
		}
		const ui: Record<string, string> = {};
		for (const [key, byLang] of Object.entries(scenario.ui)) {
			if (byLang[lang] !== undefined) ui[key] = byLang[lang];
		}
		out[lang] = { beats, ui };
	}
	return out;
}
