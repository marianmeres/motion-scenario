import { assertEquals } from "@std/assert";
import { parse } from "../src/parser.ts";
import type { Issue, Scenario } from "../src/model.ts";

export const EXAMPLE = new URL("../examples/sprout.scenario", import.meta.url);
export const EXAMPLE_CONFIG = new URL("../examples/sprout.config.json", import.meta.url);
export const BROKEN = new URL("./fixtures/broken.scenario", import.meta.url);

export const exampleText = (): string => Deno.readTextFileSync(EXAMPLE);
export const exampleConfig = () => JSON.parse(Deno.readTextFileSync(EXAMPLE_CONFIG));

/** Strip the common leading tabs so scenarios can be written inline in tab-indented tests. */
export function dedent(s: string): string {
	const lines = s.replace(/^\n/, "").replace(/\s+$/, "").split("\n");
	const indents = lines.filter((l) => l.trim()).map((l) => /^\t*/.exec(l)![0].length);
	const min = Math.min(...indents);
	return lines.map((l) => l.slice(min)).join("\n") + "\n";
}

/** Parse and assert no errors. */
export function parseOk(text: string): Scenario {
	const r = parse(dedent(text));
	assertEquals(r.errors, [], "expected no parse errors");
	return r.scenario!;
}

export const codes = (issues: Issue[]): string[] => issues.map((i) => i.code);

export interface ScenarioOpts {
	/** Extra cast lines (unindented). */
	cast?: string[];
	languages?: string;
	music?: string;
	formats?: string;
}

/** A minimal valid scenario: `video t`, `cast` with `card` and `logo`, then `body` (dedented). */
export function scenario(body: string, opts: ScenarioOpts = {}): string {
	const lines = [
		"motion-scenario 1",
		"video t",
		`  languages  ${opts.languages ?? "en"}`,
		`  music      ${opts.music ?? "silent"}`,
		...(opts.formats ? [`  formats    ${opts.formats}`] : []),
		"cast",
		"  card   FormCard",
		"  logo   Logo",
		...(opts.cast ?? []).map((l) => `  ${l}`),
		dedent(body).trimEnd(),
	];
	return lines.filter((l) => l !== "").join("\n") + "\n";
}
