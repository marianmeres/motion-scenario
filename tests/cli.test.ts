import { assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { BROKEN, EXAMPLE, EXAMPLE_CONFIG } from "./helpers.ts";

const CLI = fromFileUrl(new URL("../src/cli.ts", import.meta.url));
const example = fromFileUrl(EXAMPLE);
const config = fromFileUrl(EXAMPLE_CONFIG);
const broken = fromFileUrl(BROKEN);

async function run(...args: string[]) {
	const out = await new Deno.Command(Deno.execPath(), {
		args: ["run", "-A", CLI, ...args],
		stdout: "piped",
		stderr: "piped",
	}).output();
	return {
		code: out.code,
		stdout: new TextDecoder().decode(out.stdout),
		stderr: new TextDecoder().decode(out.stderr),
	};
}

Deno.test("cli check", async () => {
	const ok = await run("check", example, "--config", config);
	assertEquals(ok.code, 0);
	assertStringIncludes(ok.stdout, "0 error(s), 0 warning(s)");
	const warn = await run("check", example);
	assertEquals(warn.code, 0);
	assertStringIncludes(warn.stdout, "2 warning(s)");
	const strict = await run("check", example, "--strict");
	assertEquals(strict.code, 1);
	const bad = await run("check", broken);
	assertEquals(bad.code, 1);
	assertStringIncludes(bad.stdout, "7 error(s)");
	const json = await run("check", example, "--json");
	assertEquals(JSON.parse(json.stdout).ok, true);
});

Deno.test("cli resolve / words / board", async () => {
	const r = await run("resolve", example, "--config", config);
	assertEquals(r.code, 0);
	assertEquals(JSON.parse(r.stdout).timelines.en.total, 14.5);
	const w = await run("words", example);
	assertEquals(JSON.parse(w.stdout).sk.ui.plantName, "Monstera");
	const b = await run("board", example);
	assertStringIncludes(b.stdout, "# sprout-how-it-works");
	const bad = await run("resolve", broken);
	assertEquals(bad.code, 1);
	assertStringIncludes(bad.stderr, "7 error(s)");
});

Deno.test("cli usage errors", async () => {
	assertEquals((await run()).code, 2);
	assertEquals((await run("--help")).code, 0);
	assertEquals((await run("frobnicate", example)).code, 2);
	assertEquals((await run("check")).code, 2);
	assertEquals((await run("check", "/nonexistent.scenario")).code, 2);
	assertEquals((await run("check", example, "--config", "/nonexistent.json")).code, 2);
});
