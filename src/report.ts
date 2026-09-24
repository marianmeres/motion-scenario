/**
 * Report
 * Purpose: human-readable renderings of an analysis — the check report with the timing table,
 * and the markdown board (one section per beat). Both are text; the CLI prints them.
 */

import type { Analysis } from "./analyze.ts";
import type { CheckResult } from "./check.ts";
import type { Issue } from "./model.ts";
import type { ResolvedBeat, ResolvedMoment, ResolveResult } from "./resolve.ts";

const fmt = (n: number, d = 2) => n.toFixed(d);

/** `L12  E_CODE  message`, one per line. */
export function formatIssues(issues: Issue[]): string {
	return issues
		.map((i) =>
			`  ${i.line !== undefined ? `L${i.line}`.padEnd(5) : "     "} ${
				i.code.padEnd(20)
			} ${i.message}`
		)
		.join("\n");
}

/** The `check` report: issues, new motions and components, and the timing estimate. */
export function formatReport(a: Analysis, opts: { file?: string } = {}): string {
	const out: string[] = [];
	const head = opts.file ? `${opts.file}: ` : "";
	out.push(`${head}${a.errors.length} error(s), ${a.warnings.length} warning(s)`);
	if (a.errors.length) out.push("", "errors:", formatIssues(a.errors));
	if (a.warnings.length) out.push("", "warnings:", formatIssues(a.warnings));
	if (a.check) out.push(...formatNew(a.check));
	if (a.resolved) out.push("", ...formatTimelines(a.resolved));
	return out.join("\n") + "\n";
}

function formatNew(c: CheckResult): string[] {
	const out: string[] = [];
	if (c.newMotions.length) {
		out.push("", "new motions (implement these, then add them to the registry):");
		const byKey = new Map<string, { type?: string; lines: number[] }>();
		for (const m of c.newMotions) {
			const key = `${m.phrase}${m.type ? ` (${m.type})` : ""}`;
			const e = byKey.get(key) ?? { type: m.type, lines: [] };
			e.lines.push(m.line);
			byKey.set(key, e);
		}
		for (const [key, e] of byKey) {
			out.push(`  ${key.padEnd(40)} L${e.lines.join(", L")}`);
		}
	}
	if (c.newComponents.length) {
		out.push("", "new components (build these):");
		for (const n of c.newComponents) {
			out.push(
				`  ${n.name.padEnd(12)} ${
					n.type === "new" ? (n.description ?? "") : `type ${n.type}`
				}`.trimEnd() + `  L${n.line}`,
			);
		}
	}
	return out;
}

function formatTimelines(r: ResolveResult): string[] {
	const out: string[] = [];
	for (const lang of r.languages) {
		const t = r.timelines[lang];
		out.push(`timeline ${lang} — ${fmt(t.total)} s`);
		out.push(
			`  ${"#".padStart(2)}  ${"beat".padEnd(10)} ${"scene".padEnd(10)} ${
				"start".padStart(6)
			} ${"dur".padStart(6)}  ${"by".padEnd(6)} ${"mom".padStart(3)}  headline`,
		);
		for (const b of t.beats) {
			out.push(
				`  ${String(b.index).padStart(2)}  ${b.id.padEnd(10)} ${
					b.scene.padEnd(10)
				} ${fmt(b.start).padStart(6)} ${fmt(b.duration).padStart(6)}  ${
					b.boundedBy.padEnd(6)
				} ${String(b.moments.length).padStart(3)}  ${b.text?.headline ?? "—"}`,
			);
		}
		out.push("");
	}
	const grid = r.grid.beat === null
		? "silent"
		: `${fmt(r.grid.beat, 3)} s per beat, ${fmt(r.grid.bar!, 3)} s per bar`;
	out.push(`grid: ${grid}`);
	out.push(
		`running time: ${
			r.languages.map((l) => `${l} ${fmt(r.timelines[l].total)} s`).join(", ")
		}`,
	);
	return out;
}

/** A markdown board: the title card, then one section per beat with words, moments and notes. */
export function formatBoard(a: Analysis): string {
	if (!a.scenario || !a.resolved) {
		return `# board unavailable\n\n${formatIssues(a.errors)}\n`;
	}
	const s = a.scenario;
	const r = a.resolved;
	const ref = r.reference;
	const out: string[] = [];
	out.push(`# ${s.video.slug}`, "");
	out.push("| | |", "|---|---|");
	if (s.video.formats.length) out.push(`| formats | ${s.video.formats.join(", ")} |`);
	out.push(`| languages | ${s.video.languages.join(", ")} (reference: ${ref}) |`);
	out.push(
		`| music | ${
			s.video.music.kind === "silent" ? "silent" : `${s.video.music.bpm} bpm`
		} |`,
	);
	if (s.video.style) out.push(`| style | ${s.video.style} |`);
	for (const [k, v] of Object.entries(s.video.notes)) out.push(`| ${k} | ${v} |`);
	out.push(
		`| running time | ${
			s.video.languages.map((l) => `${l} ${fmt(r.timelines[l].total)} s`).join(", ")
		} |`,
	);
	out.push("", "## Cast", "");
	for (const c of s.cast) {
		const what = c.isNew
			? `new: ${c.description ?? ""}`
			: c.group
			? `${c.group.count}× ${c.group.member}`
			: [c.type, c.host ? `on ${c.host}` : "", ...c.args].filter(Boolean).join(" ");
		out.push(`- **${c.name}** — ${what}`);
	}
	if (Object.keys(s.ui).length) {
		out.push("", "## UI strings", "");
		out.push(
			`| key | ${s.video.languages.join(" | ")} |`,
			`|---|${s.video.languages.map(() => "---").join("|")}|`,
		);
		for (const [k, byLang] of Object.entries(s.ui)) {
			out.push(
				`| ${k} | ${s.video.languages.map((l) => byLang[l] ?? "").join(" | ")} |`,
			);
		}
	}
	const refBeats = r.timelines[ref].beats;
	for (const b of refBeats) {
		out.push("", ...formatBoardBeat(b, s.video.languages, r));
	}
	return out.join("\n") + "\n";
}

function formatBoardBeat(
	b: ResolvedBeat,
	languages: string[],
	r: ResolveResult,
): string[] {
	const out: string[] = [];
	const role = b.role ? ` · role ${b.role}` : "";
	out.push(`## ${b.index + 1}. ${b.scene} / ${b.id}${role}`, "");
	out.push(
		`${fmt(b.start)} → ${fmt(b.end)} s · ${
			fmt(b.duration)
		} s · bounded by ${b.boundedBy}` +
			(languages.length > 1
				? ` · other languages: ${
					languages.slice(1).map((l) => {
						const ob = r.timelines[l].beats[b.index];
						return `${l} ${fmt(ob.duration)} s`;
					}).join(", ")
				}`
				: ""),
		"",
	);
	for (const l of languages) {
		const t = r.timelines[l].beats[b.index].text;
		if (!t) continue;
		out.push(`- **${l}** ${t.headline}${t.sub ? ` — _${t.sub}_` : ""}`);
	}
	if (b.hold) {
		out.push(
			`- hold ${b.hold.value} ${b.hold.unit}${
				b.holdSeconds !== undefined ? ` (${fmt(b.holdSeconds)} s)` : ""
			}`,
		);
	}
	const opening = b.moments.filter((m) => m.phase === "opening");
	const closing = b.moments.filter((m) => m.phase === "closing");
	if (opening.length) out.push("", "Moments:", "", ...formatBoardMoments(opening));
	if (closing.length) {
		out.push(
			"",
			`Finally, from ${fmt(b.closeAt)} s:`,
			"",
			...formatBoardMoments(closing),
		);
	}
	if (b.notes.length) {
		out.push("", "Notes:", "");
		for (const n of b.notes) out.push(`- ${n}`);
	}
	return out;
}

function formatBoardMoments(moments: ResolvedMoment[]): string[] {
	const out: string[] = [];
	for (const m of moments) {
		out.push(`${m.index + 1}. ${fmt(m.start)} → ${fmt(m.end)} s`);
		for (const d of m.directions) {
			const tag = d.motion ? `\`${d.motion}\`` : "**new motion**";
			const extra = [
				d.count > 1 ? `×${d.count}` : "",
				d.offset ? `+${fmt(d.offset)} s` : "",
				`${fmt(d.duration)} s`,
			].filter(Boolean).join(", ");
			out.push(`   - ${d.raw} — ${tag} (${extra})`);
		}
	}
	return out;
}
