import { assert, assertEquals } from "@std/assert";
import { check } from "../src/check.ts";
import { parse } from "../src/parser.ts";
import { codes, exampleConfig, exampleText, parseOk, scenario } from "./helpers.ts";

const run = (text: string, config = {}) => check(parseOk(text), config);

Deno.test("example is clean with its config", () => {
	const s = parse(exampleText()).scenario!;
	const r = check(s, exampleConfig());
	assertEquals(r.errors, []);
	assertEquals(r.warnings, []);
	assertEquals(r.ok, true);
});

Deno.test("example without config reports project verbs as new motions", () => {
	const r = check(parse(exampleText()).scenario!);
	assertEquals(r.ok, true);
	assertEquals(codes(r.warnings), ["W_NEW_MOTION", "W_NEW_MOTION"]);
	assertEquals(r.newMotions.map((m) => m.phrase), [
		"types ui.plantName",
		"types ui.waterEvery",
	]);
	assertEquals(r.newMotions[0].type, "FormCard");
});

Deno.test("plural verbs on groups bind to the singular vocabulary", () => {
	const r = run(scenario(
		`
		scene s
		  beat a
		    en  x
		    cards pop, one by one
		    cards enter
		    cards leave
	`,
		{ cast: ["cards  3x card"] },
	));
	assertEquals(codes(r.warnings).filter((c) => c === "W_NEW_MOTION"), []);
});

Deno.test("cast errors", () => {
	const r = run(scenario(
		`
		scene s
		  beat a
		    en  x
		    card appears
		    logo appears
	`,
		{ cast: ["a  T on nobody", "b  2x ghost", "c  1x c", "d  T  ui.missing"] },
	));
	assertEquals(codes(r.errors), [
		"E_UNDECLARED_CAST",
		"E_UNDECLARED_CAST",
		"E_UNDECLARED_CAST",
		"E_UI_MISSING",
	]);
});

Deno.test("text rules", () => {
	const r = run(scenario(
		`
		ui k
		  en  a
		scene s
		  beat noText
		    card appears
		  beat noSk
		    en  x
		    card appears
		  beat subMismatch
		    en      x
		    en.sub  y
		    sk      z
		    card appears
		  beat gridHold
		    en  x
		    sk  y
		    hold 2 beats
	`,
		{ languages: "en, sk" },
	));
	const c = codes(r.errors);
	assertEquals(c.filter((x) => x === "E_EMPTY_BEAT").length, 1);
	assert(c.includes("E_TEXT_MISSING"));
	assert(c.includes("E_SUB_MISMATCH"));
	assert(c.includes("E_UI_TEXT_MISSING"));
	assert(c.includes("E_HOLD_NO_GRID"));
});

Deno.test("ui references", () => {
	const r = run(scenario(`
		ui known
		  en  a
		scene s
		  beat a
		    en  x
		    card shows ui.known, ui.nope
		    card types ui.other
		    logo appears with ui.known
	`));
	assertEquals(codes(r.errors), ["E_UI_MISSING", "E_UI_MISSING"]);
	assert(!codes(r.warnings).includes("W_UNUSED_UI"));
});

Deno.test("scene rules", () => {
	const r = run(scenario(`
		scene a ends full
		  beat a1
		    en  x
		    card appears
		scene b
		  beat b1
		    en  x
		    logo appears
		scene c ends full transition wipe
		  beat c1 role hook
		    en  x
		    card appears
	`));
	assertEquals(codes(r.errors), ["E_CLEAN_PLATE", "E_HOOK_POSITION"]);
	assert(codes(r.warnings).includes("W_NEW_TRANSITION"));
});

Deno.test("role warnings", () => {
	const r = run(scenario(`
		scene a
		  beat h role hook
		    en  x
		  beat e role end
		    en  y
		    logo appears
		    logo blinks once
		    card appears
		    card pops
		    and logo pops
	`));
	assertEquals(r.errors, []);
	const c = codes(r.warnings);
	assert(c.includes("W_HOOK_NO_DIRECTION"));
	assert(c.includes("W_END_NO_HOLD"));
	assert(c.includes("W_END_BUSY"));
	assert(c.includes("W_DOUBLE_POP"));
});

Deno.test("vocabulary warnings", () => {
	const r = run(
		scenario(
			`
		scene a
		  beat b
		    en  x
		    card.knob wobbles gently
		    card.top appears
		    logo appears
		    then card appears, just after
	`,
			{ cast: ["thing  new: a thing", "other  Unknown"] },
		),
		{
			types: { FormCard: { parts: ["top"] }, Logo: {} },
		},
	);
	const c = codes(r.warnings);
	assert(c.includes("W_NEW_MOTION"));
	assert(c.includes("W_UNKNOWN_PART"));
	assert(c.includes("W_NEW_COMPONENT"));
	assert(c.includes("W_UNKNOWN_TYPE"));
	assert(c.includes("W_UNUSED_CAST"));
	assert(c.includes("W_JUST_AFTER_THEN"));
	assertEquals(r.newMotions[0].phrase, "wobbles gently");
	assertEquals(r.newComponents.map((n) => n.name), ["thing", "other"]);
});

Deno.test("no type registry → no unknown-type warnings", () => {
	const r = run(scenario(`
		scene a
		  beat b
		    en  x
		    card appears
		    logo appears
	`));
	assertEquals(r.warnings, []);
});

Deno.test("headline, blacklist, budget", () => {
	const r = run(
		scenario(
			`
		scene a
		  beat b
		    en  One two three four five six seven eight, just simply
		    card appears
		    logo appears
		  beat c
		    en  Short
		    hold 100 s
	`,
			{ formats: "wide" },
		),
		{
			formats: { wide: { budget: [5, 20], charsPerLine: 20, maxLines: 2 } },
			blacklist: { en: ["just", "simply"] },
		},
	);
	const c = codes(r.warnings);
	assert(c.includes("W_HEADLINE_LONG"));
	assert(c.includes("W_HEADLINE_LINES"));
	assertEquals(c.filter((x) => x === "W_BLACKLIST").length, 2);
	assert(c.includes("W_BUDGET"));
});

Deno.test("blacklist matches whole words only", () => {
	const r = run(
		scenario(`
		scene a
		  beat b
		    en  Adjust the justification
		    card appears
		    logo appears
	`),
		{ blacklist: { en: ["just"] } },
	);
	assertEquals(codes(r.warnings).filter((x) => x === "W_BLACKLIST"), []);
});
