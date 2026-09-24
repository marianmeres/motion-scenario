import { assertStringIncludes } from "@std/assert";
import { analyze } from "../src/analyze.ts";
import { formatBoard, formatReport } from "../src/report.ts";
import { BROKEN, exampleConfig, exampleText } from "./helpers.ts";

Deno.test("formatReport", () => {
	const a = analyze(exampleText());
	const r = formatReport(a, { file: "x.scenario" });
	assertStringIncludes(r, "x.scenario: 0 error(s), 2 warning(s)");
	assertStringIncludes(r, "W_NEW_MOTION");
	assertStringIncludes(r, "new motions");
	assertStringIncludes(r, "types ui.plantName (FormCard)");
	assertStringIncludes(r, "timeline en — 14.50 s");
	assertStringIncludes(r, "running time: en 14.50 s, sk 13.50 s");
	const broken = formatReport(analyze(Deno.readTextFileSync(BROKEN)));
	assertStringIncludes(broken, "7 error(s)");
	assertStringIncludes(broken, "E_DUPLICATE_BEAT");
});

Deno.test("formatBoard", () => {
	const b = formatBoard(analyze(exampleText(), exampleConfig()));
	assertStringIncludes(b, "# sprout-how-it-works");
	assertStringIncludes(b, "## Cast");
	assertStringIncludes(b, "| plantName | Monstera | Monstera |");
	assertStringIncludes(b, "## 1. intro / hook · role hook");
	assertStringIncludes(
		b,
		"Moments:\n\n1. 0.00 → 0.74 s\n   - plants pop, one by one — `pops` (×3, 0.74 s)",
	);
	assertStringIncludes(
		b,
		"Finally, from 2.50 s:\n\n2. 2.50 → 2.90 s\n   - finally plants leave — `leaves` (×3, 0.40 s)",
	);
	assertStringIncludes(b, "- hold 3 s (3.00 s)");
	assertStringIncludes(formatBoard(analyze("nope")), "# board unavailable");
});
