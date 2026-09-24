import { npmBuild, versionizeDeps } from "@marianmeres/npmbuild";

const denoJson = JSON.parse(Deno.readTextFileSync("deno.json"));

// The npm artifact is the runtime-agnostic core only. cli.ts uses Deno APIs
// and @std/cli and is JSR-only (`jsr:@marianmeres/motion-scenario/cli`).

await npmBuild({
	name: denoJson.name,
	version: denoJson.version,
	repository: denoJson.name.replace(/^@/, ""),
	sourceFiles: [
		"mod.ts",
		"model.ts",
		"config.ts",
		"parser.ts",
		"bind.ts",
		"check.ts",
		"resolve.ts",
		"words.ts",
		"report.ts",
		"analyze.ts",
	],
	dependencies: versionizeDeps([""], denoJson),
});
