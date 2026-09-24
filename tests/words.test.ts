import { assertEquals } from "@std/assert";
import { parse } from "../src/parser.ts";
import { words } from "../src/words.ts";
import { exampleText } from "./helpers.ts";

Deno.test("words per language", () => {
	const w = words(parse(exampleText()).scenario!);
	assertEquals(Object.keys(w), ["en", "sk"]);
	assertEquals(Object.keys(w.en.beats), ["hook", "add", "remind", "water", "end"]);
	assertEquals(w.en.beats.add, { headline: "Add a plant." });
	assertEquals(w.sk.beats.end, {
		headline: "Sprout",
		sub: "Starostlivosť o rastliny, ktorá si pamätá za vás.",
	});
	assertEquals(w.sk.ui.reminder, "Čas poliať monsteru");
});
