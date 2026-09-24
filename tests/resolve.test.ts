import { assertEquals } from "@std/assert";
import { DEFAULT_PRESET } from "../src/config.ts";
import { parse } from "../src/parser.ts";
import { holdSeconds, ms, readingTime, resolve, snapUp } from "../src/resolve.ts";
import { exampleText, parseOk, scenario } from "./helpers.ts";

Deno.test("snapUp", () => {
	assertEquals(snapUp(1.234, { kind: "silent" }), 1.234);
	const g = { kind: "grid" as const, bpm: 120, offset: 0, perBar: 4 };
	assertEquals(snapUp(0, g), 0);
	assertEquals(snapUp(0.5, g), 0.5);
	assertEquals(snapUp(0.501, g), 1);
	assertEquals(snapUp(2.3, g), 2.5);
	assertEquals(snapUp(1.2, { ...g, offset: 0.3 }), 1.3);
	assertEquals(snapUp(0.1, { ...g, offset: 0.3 }), 0.3);
});

Deno.test("readingTime / holdSeconds", () => {
	const r = { min: 1.8, base: 0.8, perWord: 0.3 };
	assertEquals(readingTime(0, r), 0);
	assertEquals(readingTime(1, r), 1.8);
	assertEquals(readingTime(5, r), 2.3);
	const g = { kind: "grid" as const, bpm: 120, offset: 0, perBar: 4 };
	assertEquals(holdSeconds({ value: 3, unit: "s" }, g), 3);
	assertEquals(holdSeconds({ value: 3, unit: "beats" }, g), 1.5);
	assertEquals(holdSeconds({ value: 1, unit: "bars" }, g), 2);
	assertEquals(holdSeconds({ value: 2, unit: "beats" }, { kind: "silent" }), 1);
});

Deno.test("example timeline", () => {
	const r = resolve(parse(exampleText()).scenario!);
	const en = r.timelines.en;
	assertEquals(en.total, 14.5);
	assertEquals(r.timelines.sk.total, 13.5);
	assertEquals(en.beats.map((b) => [b.id, b.start, b.duration, b.boundedBy]), [
		["hook", 0, 3, "words"],
		["add", 3, 2.5, "words"],
		["remind", 5.5, 3.5, "words"],
		["water", 9, 2.5, "words"],
		["end", 11.5, 3, "hold"],
	]);
	const hook = en.beats[0];
	assertEquals(hook.textReadableAt, 0);
	assertEquals(hook.readUntil, 2.3);
	assertEquals(hook.moments[0].directions[0].duration, 0.74); // pop + 2 × stagger
	assertEquals(hook.moments[0].directions[0].count, 3);
	assertEquals(hook.moments[0].directions[0].motion, "pops");
	assertEquals(hook.motionEnd, 0.74);
	assertEquals(hook.closeAt, 2.5); // snap(max(2.3, 0.74))
	assertEquals(hook.moments.map((m) => [m.phase, m.start, m.end]), [
		["opening", 0, 0.74],
		["closing", 2.5, 2.9],
	]);
	assertEquals(hook.end, 3); // snap(2.9)
	const add = en.beats[1];
	assertEquals(add.textReadableAt, 3.4);
	assertEquals(add.moments.length, 3);
	assertEquals(add.closeAt, add.end); // no `finally`
	const remind = en.beats[2];
	assertEquals(remind.moments[0].directions[1].offset, 0.15);
	assertEquals(remind.moments[0].end, 6.15);
	assertEquals(remind.moments[1].start, 6.15);
	const end = en.beats[4];
	assertEquals(end.holdSeconds, 3);
	assertEquals(r.grid, { beat: 0.5, bar: 2 });
});

Deno.test("moments: then / and / just after chain / groups / modifiers", () => {
	const s = parseOk(scenario(
		`
		scene a
		  beat b
		    en  x
		    card appears
		    and logo appears, just after
		    and cards pop, just after
		    then card leaves, slowly
		    cards leave, together
		    card shows ui.a, ui.b
		    card wobbles
		    card moves to aside, quickly
		ui a
		  en  a
		ui b
		  en  b
	`,
		{ cast: ["cards  4x card"] },
	));
	const b = resolve(s).timelines.en.beats[0];
	const p = DEFAULT_PRESET;
	assertEquals(b.moments.length, 6);
	const m0 = b.moments[0];
	assertEquals(m0.directions.map((d) => d.offset), [0, p.justAfter, 2 * p.justAfter]);
	assertEquals(m0.directions[2].duration, p.pop); // no `one by one` → not staggered
	assertEquals(m0.end, ms(2 * p.justAfter + p.pop));
	assertEquals(b.moments[1].duration, ms(p.leave * p.slowly));
	assertEquals(b.moments[2].directions[0].group, "together");
	assertEquals(b.moments[2].duration, p.leave);
	assertEquals(b.moments[3].directions[0].group, "oneByOne"); // shows staggers by default
	assertEquals(b.moments[3].directions[0].count, 2);
	assertEquals(b.moments[3].duration, ms(p.enter + p.stagger));
	assertEquals(b.moments[4].directions[0].motion, null);
	assertEquals(b.moments[4].duration, p.unknown);
	assertEquals(b.moments[5].duration, ms(p.move * p.quickly));
	assertEquals(b.boundedBy, "motion");
	assertEquals(b.end, b.motionEnd);
});

Deno.test("finally: closing moments start at closeAt, bounded by words", () => {
	const s = parseOk(scenario(
		`
		scene a
		  beat b
		    en  Five words in this line
		    card appears
		    finally card leaves
		    and logo leaves, just after
		    then logo appears
		  beat c
		    en  x
	`,
		{ music: "120 bpm" },
	));
	const [b, c] = resolve(s).timelines.en.beats;
	const p = DEFAULT_PRESET;
	assertEquals(b.readUntil, 2.7); // 0.4 textIn + 2.3 reading
	assertEquals(b.motionEnd, p.enter); // opening moments only
	assertEquals(b.closeAt, 3); // snap(max(2.7, 0.5))
	assertEquals(b.boundedBy, "words");
	assertEquals(b.moments.map((m) => [m.index, m.phase]), [
		[0, "opening"],
		[1, "closing"],
		[2, "closing"],
	]);
	const [, m1, m2] = b.moments;
	assertEquals(m1.directions.map((d) => [d.index, d.relation, d.start]), [
		[1, "finally", 3],
		[2, "and", ms(3 + p.justAfter)], // `and` joins the closing moment
	]);
	assertEquals(m1.end, ms(3 + p.justAfter + p.leave));
	assertEquals(m2.start, m1.end); // `then` chains after it
	assertEquals(m2.end, ms(m1.end + p.enter));
	assertEquals(b.end, 4.5); // snap(4.05)
	assertEquals(c.start, b.end);
});

Deno.test("finally: bounded by motion, by hold, and with no opening direction", () => {
	const s = parseOk(scenario(`
		scene a
		  beat m
		    en  x
		    card lingers
		    finally card leaves
		  beat h
		    hold 2 s
		    finally logo leaves
	`));
	const [m, h] = resolve(s, { verbs: { lingers: { duration: 3 } } }).timelines.en.beats;
	const p = DEFAULT_PRESET;
	assertEquals(m.readUntil, 2.2);
	assertEquals(m.motionEnd, 3);
	assertEquals(m.closeAt, 3); // silent: no snapping
	assertEquals(m.boundedBy, "motion");
	assertEquals(m.end, ms(3 + p.leave));
	assertEquals(h.start, m.end);
	assertEquals(h.motionEnd, h.start); // no opening moment
	assertEquals(h.closeAt, ms(h.start + 2));
	assertEquals(h.boundedBy, "hold");
	assertEquals(h.moments.map((x) => [x.index, x.phase]), [[0, "closing"]]);
	assertEquals(h.duration, ms(2 + p.leave));
});

Deno.test("hook has no textIn; hold replaces reading time; snapping", () => {
	const s = parseOk(scenario(
		`
		scene a
		  beat h role hook
		    en  Five words in this line
		    card appears
		  beat t
		    en  Two words
		    hold 1.1 s
		  beat w
		    hold 3 beats
	`,
		{ music: "60 bpm" },
	));
	const [h, t, w] = resolve(s).timelines.en.beats;
	assertEquals(h.textReadableAt, 0);
	assertEquals(h.readUntil, 2.3);
	assertEquals(h.end, 3); // snapped to 1 s grid
	assertEquals(t.holdSeconds, 1.1);
	assertEquals(t.readUntil, 4.1);
	assertEquals(t.end, 5);
	assertEquals(t.boundedBy, "hold");
	assertEquals(w.words, 0);
	assertEquals(w.duration, 3);
	assertEquals(w.text, undefined);
});

Deno.test("project verbs and fixed durations", () => {
	const s = parseOk(scenario(`
		scene a
		  beat b
		    en  x
		    card types ui.k
		    card submits
		    logo submits
		ui k
		  en  k
	`));
	const r = resolve(s, {
		types: {
			FormCard: {
				verbs: { types: { duration: 0.8 }, submits: { duration: "pop" } },
			},
		},
		preset: { pop: 1 },
	});
	const [m0, m1, m2] = r.timelines.en.beats[0].moments;
	assertEquals(m0.directions[0].motion, "types");
	assertEquals(m0.directions[0].object, ["ui.k"]);
	assertEquals(m0.duration, 0.8);
	assertEquals(m1.duration, 1);
	assertEquals(m2.directions[0].motion, null); // Logo has no `submits`
});
