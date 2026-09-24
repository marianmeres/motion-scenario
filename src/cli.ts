/**
 * CLI (Deno only)
 *
 *   motion-scenario check   <file> [--config <path>] [--strict] [--json]
 *   motion-scenario resolve <file> [--config <path>]
 *   motion-scenario words   <file>
 *   motion-scenario board   <file> [--config <path>]
 *
 * Exit codes: 0 ok · 1 errors (or warnings with --strict) · 2 usage or I/O error.
 *
 * @module
 */

import { parseArgs } from "@std/cli/parse-args";
import { resolve as resolvePath, toFileUrl } from "@std/path";
import { analyze } from "./analyze.ts";
import type { ProjectConfig } from "./config.ts";
import { formatBoard, formatIssues, formatReport } from "./report.ts";

const USAGE = `motion-scenario — check, resolve and read .scenario files

Usage:
  motion-scenario check   <file> [--config <path>] [--strict] [--json]
  motion-scenario resolve <file> [--config <path>]
  motion-scenario words   <file>
  motion-scenario board   <file> [--config <path>]

Commands:
  check     Errors, warnings, new motions and components, and the timing estimate
  resolve   The resolved timeline per language, as JSON (everything an implementer needs)
  words     Every translated string per language, as JSON
  board     A markdown board: title card, cast, ui strings, one section per beat

Options:
  --config <path>   Project config: a .json file, or a .ts/.js module whose default export
                    (or \`config\` export) is the ProjectConfig
  --strict          check: exit 1 on warnings too
  --json            check: print the full analysis as JSON instead of the report
  -h, --help        This text

Exit codes: 0 ok · 1 errors (or warnings with --strict) · 2 usage or I/O error
`;

/**
 * Load a `ProjectConfig` from a `.json` file, or from a `.ts`/`.js` module's default (or
 * `config`) export. Throws when the module has neither.
 */
export async function loadConfig(path: string): Promise<ProjectConfig> {
	const abs = resolvePath(path);
	if (abs.endsWith(".json")) return JSON.parse(await Deno.readTextFile(abs));
	const mod = await import(toFileUrl(abs).href);
	const cfg = mod.default ?? mod.config;
	if (!cfg || typeof cfg !== "object") {
		throw new Error(`config module ${path} has no default (or \`config\`) export`);
	}
	return cfg as ProjectConfig;
}

/** Run the CLI with `argv` (without the executable and script) and return the exit code. */
export async function main(argv: string[]): Promise<number> {
	const args = parseArgs(argv, {
		boolean: ["strict", "json", "help"],
		string: ["config"],
		alias: { h: "help" },
	});
	if (args.help || !args._.length) {
		console.log(USAGE);
		return args.help ? 0 : 2;
	}
	const [command, file] = args._.map(String);
	if (!["check", "resolve", "words", "board"].includes(command)) {
		console.error(`unknown command \`${command}\`\n\n${USAGE}`);
		return 2;
	}
	if (!file) {
		console.error(`missing <file>\n\n${USAGE}`);
		return 2;
	}

	let text: string;
	let config: ProjectConfig | undefined;
	try {
		text = await Deno.readTextFile(file);
		if (args.config) config = await loadConfig(args.config);
	} catch (e) {
		console.error(`${(e as Error).message}`);
		return 2;
	}

	const a = analyze(text, config);

	switch (command) {
		case "check": {
			if (args.json) console.log(JSON.stringify(a, null, 2));
			else console.log(formatReport(a, { file }).trimEnd());
			if (!a.ok) return 1;
			return args.strict && a.warnings.length ? 1 : 0;
		}
		case "resolve":
		case "words": {
			if (!a.ok) {
				console.error(
					`${file}: ${a.errors.length} error(s)\n${formatIssues(a.errors)}`,
				);
				return 1;
			}
			console.log(
				JSON.stringify(command === "resolve" ? a.resolved : a.words, null, 2),
			);
			return 0;
		}
		case "board": {
			if (!a.ok) {
				console.error(
					`${file}: ${a.errors.length} error(s)\n${formatIssues(a.errors)}`,
				);
				return 1;
			}
			console.log(formatBoard(a).trimEnd());
			return 0;
		}
	}
	return 2;
}

if (import.meta.main) {
	Deno.exit(await main(Deno.args));
}
