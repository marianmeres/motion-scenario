import { assert, assertEquals, assertMatch } from "@std/assert";
import { parse, parseDirectionTail, parseHold, parseMusic } from "../src/parser.ts";
import { codes, dedent, exampleText, parseOk, scenario } from "./helpers.ts";

Deno.test("parses the example scenario", () => {
	const r = parse(exampleText());
	assertEquals(r.errors, []);
	const s = r.scenario!;
	assertEquals(s.version, 1);
	assertEquals(s.video.slug, "sprout-how-it-works");
	assertEquals(s.video.formats, ["wide", "reel"]);
	assertEquals(s.video.languages, ["en", "sk"]);
	assertEquals(s.video.music, { kind: "grid", bpm: 120, offset: 0, perBar: 4 });
	assertEquals(s.video.style, "calm");
	assertEquals(s.video.notes.status, "proposed");
	assertEquals(s.cast.length, 7);
	assertEquals(s.cast.find((c) => c.name === "plants")?.group, {
		count: 3,
		member: "plant",
	});
	const reminder = s.cast.find((c) => c.name === "reminder")!;
	assertEquals(reminder.type, "Notification");
	assertEquals(reminder.host, "phone");
	assertEquals(reminder.args, ["ui.reminder"]);
	assertEquals(Object.keys(s.ui), ["plantName", "waterEvery", "reminder"]);
	assertEquals(s.ui.waterEvery.sk, "Polievať každých 7 dní");
	assertEquals(s.scenes.map((x) => x.name), ["intro", "workflow", "outro"]);
	assertEquals(s.scenes[0].ends, "clean");
	assertEquals(s.scenes[1].ends, "full");
	assertEquals(s.scenes[2].transition, "push");
	const hook = s.scenes[0].beats[0];
	assertEquals(hook.id, "hook");
	assertEquals(hook.role, "hook");
	assertEquals(hook.text.en.headline, "Plants forget nothing. You do.");
	assertEquals(hook.notes.length, 1);
	assertEquals(hook.directions[0].group, "oneByOne");
	const end = s.scenes[2].beats[0];
	assertEquals(end.hold, { value: 3, unit: "s" });
	assertEquals(end.text.en.sub, "Plant care that remembers for you.");
});

Deno.test("direction lines", () => {
	const s = parseOk(scenario(`
		scene a
		  beat b
		    en  Hi
		    card appears
		    and logo enters from the right, just after, slowly
		    then card.top pops with overshoot
		    logo moves to aside, quickly
		    card shows ui.x, ui.y
		    logo takes the stage
		    card types ui.x
	`));
	const d = s.scenes[0].beats[0].directions;
	assertEquals(d.length, 7);
	assertEquals(d[0].relation, "then");
	assertEquals(d[0].verb, "appears");
	assertEquals(d[1].relation, "and");
	assertEquals(d[1].args, { from: ["right"] });
	assertEquals(d[1].justAfter, true);
	assertEquals(d[1].modifiers, ["slowly"]);
	assertEquals(d[2].relation, "then");
	assertEquals(d[2].subject, "card");
	assertEquals(d[2].part, "top");
	assertEquals(d[2].modifiers, ["with overshoot"]);
	assertEquals(d[2].args, {});
	assertEquals(d[3].args, { to: ["aside"] });
	assertEquals(d[3].modifiers, ["quickly"]);
	assertEquals(d[4].words, ["ui.x", "ui.y"]);
	assertEquals(d[5].verb, "takes");
	assertEquals(d[5].words, ["the stage"]);
	assertEquals(d[6].words, ["ui.x"]);
	assertEquals(d[6].raw, "card types ui.x");
});

Deno.test("parseDirectionTail", () => {
	assertEquals(parseDirectionTail("pops")!.verb, "pops");
	assertEquals(parseDirectionTail("steps aside")!.words, ["aside"]);
	assertEquals(parseDirectionTail("enters from the left")!.args, { from: ["left"] });
	assertEquals(parseDirectionTail("moves to scanning, then some")!.args, {
		to: ["scanning", "then some"],
	});
	assertEquals(parseDirectionTail("pops, one by one")!.group, "oneByOne");
	assertEquals(parseDirectionTail("pops, together")!.group, "together");
	assertEquals(parseDirectionTail("appears slowly")!.modifiers, ["slowly"]);
	assertEquals(parseDirectionTail("appears, softly, slowly")!.modifiers, [
		"softly",
		"slowly",
	]);
	assertEquals(parseDirectionTail("scans card")!.words, ["card"]);
	assertEquals(parseDirectionTail("from nowhere"), null);
	assertEquals(parseDirectionTail(""), null);
	assertEquals(parseDirectionTail("fills with water")!.args, { with: ["water"] });
});

Deno.test("notes, holds, text lines", () => {
	const s = parseOk(scenario(`
		scene a
		  beat b
		    en  Hi
		    - card appears (this is a note, not a direction)
		    A plain prose note.
		    so this starts with a two-letter word and is still a note
		    hold 2 beats
		  beat c
		    hold 1 bars
	`));
	const b = s.scenes[0].beats[0];
	assertEquals(b.directions, []);
	assertEquals(b.notes, [
		"card appears (this is a note, not a direction)",
		"A plain prose note.",
		"so this starts with a two-letter word and is still a note",
	]);
	assertEquals(b.hold, { value: 2, unit: "beats" });
	assertEquals(s.scenes[0].beats[1].hold, { value: 1, unit: "bars" });
});

Deno.test("parseHold / parseMusic", () => {
	assertEquals(parseHold(["3", "s"]), { value: 3, unit: "s" });
	assertEquals(parseHold(["1.5", "bars"]), { value: 1.5, unit: "bars" });
	assertEquals(parseHold(["3"]), null);
	assertEquals(parseHold(["3", "ms"]), null);
	assertEquals(parseHold(["x", "s"]), null);
	assertEquals(parseMusic("silent"), { kind: "silent" });
	assertEquals(parseMusic("90 bpm"), { kind: "grid", bpm: 90, offset: 0, perBar: 4 });
	assertEquals(parseMusic("128 bpm offset 0.25 s 3 per bar"), {
		kind: "grid",
		bpm: 128,
		offset: 0.25,
		perBar: 3,
	});
	assertEquals(parseMusic("fast"), null);
	assertEquals(parseMusic("0 bpm"), null);
});

Deno.test("version line", () => {
	assertEquals(codes(parse("").errors), ["E_VERSION"]);
	assertEquals(codes(parse("video x\n").errors), ["E_VERSION"]);
	assertEquals(codes(parse("motion-scenario 2\n").errors), ["E_VERSION"]);
	assertEquals(
		codes(parse("# comment first\n\nmotion-scenario 1\n").errors).includes(
			"E_VERSION",
		),
		false,
	);
});

Deno.test("structural errors are collected, not thrown", () => {
	const r = parse(dedent(`
		motion-scenario 1
		video t
		  languages  en
		video again
		cast
		  card  X
		  card  Y
		cast
		ui k
		  en  a
		ui k
		  en  b
		fence
		scene s
		  beat a
		    en  x
		  beat a
		    en  y
		  wrong
		    en  z
	`));
	assertEquals(r.scenario, null);
	const c = codes(r.errors);
	assert(c.includes("E_DUPLICATE_BLOCK"));
	assert(c.includes("E_DUPLICATE_CAST"));
	assert(c.includes("E_DUPLICATE_UI"));
	assert(c.includes("E_UNKNOWN_BLOCK"));
	assert(c.includes("E_DUPLICATE_BEAT"));
	assertEquals(c.filter((x) => x === "E_DUPLICATE_BLOCK").length, 2);
	// errors sorted by line
	const lines = r.errors.map((e) => e.line ?? Infinity);
	assertEquals(lines, [...lines].sort((a, b) => a - b));
});

Deno.test("indentation", () => {
	const mixed = "motion-scenario 1\nvideo t\n \tlanguages  en\ncast\nscene s\n";
	assert(codes(parse(mixed).errors).includes("E_INDENT"));
	const tabsThenSpaces =
		"motion-scenario 1\nvideo t\n\tlanguages  en\ncast\n  card X\nscene s\n";
	assert(codes(parse(tabsThenSpaces).errors).includes("E_INDENT"));
	const odd = "motion-scenario 1\nvideo t\n  languages  en\ncast\n   card X\nscene s\n";
	assert(codes(parse(odd).errors).includes("E_INDENT"));
	const outside = "motion-scenario 1\n  languages  en\n";
	assert(codes(parse(outside).errors).includes("E_INDENT"));
	// tabs are fine
	const tabs =
		"motion-scenario 1\nvideo t\n\tlanguages  en\ncast\n\tcard  X\nscene s\n\tbeat a\n\t\ten  hi\n";
	assertEquals(parse(tabs).errors, []);
});

Deno.test("missing blocks and languages", () => {
	assert(codes(parse("motion-scenario 1\n").errors).includes("E_MISSING_BLOCK"));
	const noLang = "motion-scenario 1\nvideo t\n  music silent\ncast\nscene s\n";
	assert(codes(parse(noLang).errors).includes("E_MISSING_LANGUAGES"));
});

Deno.test("undeclared language", () => {
	const r = parse(scenario(`
		ui k
		  en  a
		  de  b
		scene s
		  beat a
		    en  x
		    de  y
	`));
	assertEquals(codes(r.errors), ["E_UNDECLARED_LANGUAGE", "E_UNDECLARED_LANGUAGE"]);
	assertEquals(r.errors[0].line, 10);
	assertEquals(r.errors[1].line, 14);
});

Deno.test("duplicate text, hold, empty text", () => {
	const r = parse(scenario(`
		scene s
		  beat a
		    en  x
		    en  y
		    en.sub  s
		    en.sub  t
		    hold 1 s
		    hold 2 s
		    en
	`));
	assertEquals(codes(r.errors), [
		"E_DUPLICATE_TEXT",
		"E_DUPLICATE_TEXT",
		"E_DUPLICATE_HOLD",
		"E_EMPTY_TEXT",
	]);
});

Deno.test("headers", () => {
	assertMatch(parse(scenario("scene\n")).errors[0].message, /expected `scene <name>/);
	assertMatch(
		parse(scenario("scene s ends sideways\n")).errors[0].message,
		/unexpected `ends`/,
	);
	assertMatch(
		parse(scenario("scene s\n  beat\n")).errors[0].message,
		/expected `beat <id>/,
	);
	assertMatch(
		parse(scenario("scene s\n  beat a hook\n")).errors[0].message,
		/unexpected `hook`/,
	);
	assertMatch(
		parse(scenario("scene s\n  beat a\n    card\n")).errors[0].message,
		/has no verb/,
	);
	const s = parseOk(
		scenario("scene s ends full transition slide\n  beat a role setup\n    en  x\n"),
	);
	assertEquals(s.scenes[0].ends, "full");
	assertEquals(s.scenes[0].transition, "slide");
	assertEquals(s.scenes[0].beats[0].role, "setup");
});

Deno.test("cast lines", () => {
	const s = parseOk(dedent(`
		motion-scenario 1
		video t
		  languages  en
		cast
		  a   Thing
		  b   Thing on a  ui.k extra
		  c   new: a thing that does not exist yet
		  d   2x a
		  e   new:
		scene s
		  beat x
		    en  y
	`));
	assertEquals(s.cast[1], {
		name: "b",
		type: "Thing",
		isNew: false,
		host: "a",
		args: ["ui.k", "extra"],
		line: 6,
	});
	assertEquals(s.cast[2].isNew, true);
	assertEquals(s.cast[2].description, "a thing that does not exist yet");
	assertEquals(s.cast[3].group, { count: 2, member: "a" });
	assertEquals(s.cast[4].description, undefined);
	assertMatch(
		parse(scenario("", { cast: ["x.y  T"] })).errors[0].message,
		/must not contain a dot/,
	);
	assertMatch(
		parse(scenario("", { cast: ["x  T on"] })).errors[0].message,
		/expected `on <host>`/,
	);
	assertMatch(
		parse(scenario("", { cast: ["x  2x"] })).errors[0].message,
		/<n>x <member>/,
	);
});
