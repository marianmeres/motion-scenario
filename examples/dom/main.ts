/**
 * DOM example — a renderer for `.scenario` files made of CSS classes.
 *
 * What this shows: the package is a pure description. The player below never reads the
 * scenario's words or verbs directly; it consumes the *resolved* timeline (absolute seconds,
 * bound vocabulary phrases) and maps each phrase to a CSS class in `style.css`. Swap the stage
 * markup and the stylesheet and the same scenario plays in a different look; swap the player and
 * it plays in a different engine.
 *
 * Bundled by `deno task example:build` into ./dist/bundle.js; served by `deno task example`.
 */

import { delegate, observable, reactTo, refs } from "@marianmeres/vanilla";
import {
	analyze,
	formatReport,
	type ResolvedBeat,
	type ResolvedDirection,
} from "../../src/mod.ts";

const app = document.getElementById("app") as HTMLElement;
const R = refs(app);
const stage = R.stage;

// ---- load, analyze -------------------------------------------------------

const [text, config] = await Promise.all([
	fetch("../sprout.scenario").then((r) => r.text()),
	fetch("../sprout.config.json").then((r) => r.json()),
]);
const a = analyze(text, config);
R.report.textContent = formatReport(a, { file: "sprout.scenario" });
if (!a.ok || !a.scenario || !a.resolved || !a.words) {
	app.dataset.state = "error";
	throw new Error("sprout.scenario has errors — see the report on the page");
}
const { scenario, resolved, words } = a;
const preset = resolved.preset;
for (const k of ["textIn", "enter", "leave", "move", "pop", "scale", "accent"] as const) {
	document.documentElement.style.setProperty(`--${k}`, `${preset[k]}s`);
}

// ---- state ---------------------------------------------------------------

const lang = observable(resolved.reference);
const current = observable(-1);
const playing = observable(false);

for (const l of resolved.languages) {
	const b = document.createElement("button");
	b.textContent = l;
	b.dataset.on = "click:lang";
	b.dataset.lang = l;
	R.langs.append(b);
}

reactTo([lang], () => {
	const tl = resolved.timelines[lang.get()];
	R.total.textContent = `${tl.total.toFixed(2)} s in ${lang.get()}`;
	R.beats.replaceChildren(...tl.beats.map(beatItem));
	R.langs.querySelectorAll("button").forEach((b) =>
		b.classList.toggle("active", b.dataset.lang === lang.get())
	);
});
reactTo([current], () => {
	R.beats.querySelectorAll("li").forEach((li) =>
		li.classList.toggle("current", li.dataset.index === String(current.get()))
	);
});
reactTo([playing], () => {
	R.play.textContent = playing.get() ? "↺ restart" : "▶ play";
});

delegate(app, {
	play: () => play(),
	lang: (_e, el) => {
		lang.set(el.dataset.lang!);
		if (playing.get()) play();
		else reset();
	},
});

function beatItem(b: ResolvedBeat): HTMLLIElement {
	const li = document.createElement("li");
	li.dataset.index = String(b.index);
	const head = document.createElement("div");
	head.innerHTML = `<b>${b.index + 1}. ${b.id}</b> <span class="meta">${
		b.start.toFixed(2)
	} → ${b.end.toFixed(2)} s · by ${b.boundedBy}${
		b.role ? ` · role ${b.role}` : ""
	}</span>`;
	const text = document.createElement("div");
	text.textContent = b.text?.headline ?? "—";
	const dirs = document.createElement("div");
	dirs.className = "dirs";
	dirs.textContent = b.moments
		.map((m) => m.directions.map((d) => d.raw).join(" · "))
		.join("  →  ");
	li.append(head, text, dirs);
	return li;
}

// ---- player --------------------------------------------------------------

let timers: number[] = [];
let raf = 0;
const at = (seconds: number, fn: () => void) =>
	timers.push(setTimeout(fn, seconds * 1000));

function stop() {
	timers.forEach(clearTimeout);
	timers = [];
	cancelAnimationFrame(raf);
}

function reset() {
	stop();
	current.set(-1);
	playing.set(false);
	R.headline.textContent = "";
	R.sub.textContent = "";
	R.text.classList.remove("in");
	stage.classList.remove("has-focus");
	stage.querySelectorAll<HTMLElement>("[data-cast]").forEach((el) => {
		el.classList.remove("on", "pop", "blink", "focus", "big", "small");
		delete el.dataset.pose;
		delete el.dataset.from;
		delete el.dataset.to;
		el.style.removeProperty("--dur");
	});
	stage.querySelectorAll<HTMLElement>("[data-field]").forEach((f) => {
		f.textContent = "";
		f.classList.remove("on");
	});
	stage.querySelectorAll<HTMLElement>("[data-ui]").forEach((f) =>
		f.classList.remove("on")
	);
	// cast members declared with a `ui.<key>` argument carry that string
	for (const c of scenario.cast) {
		for (const arg of c.args) {
			const key = /^ui\.(.+)$/.exec(arg)?.[1];
			if (key) els(c.name).forEach((el) => (el.textContent = uiText(key)));
		}
	}
	R.clock.textContent = "0.00 s";
}

function play() {
	reset();
	playing.set(true);
	const tl = resolved.timelines[lang.get()];
	const t0 = performance.now();
	const tick = () => {
		R.clock.textContent = `${((performance.now() - t0) / 1000).toFixed(2)} s`;
		raf = requestAnimationFrame(tick);
	};
	tick();

	let prevScene: string | undefined;
	for (const b of tl.beats) {
		if (prevScene !== undefined && prevScene !== b.scene) {
			const prev = scenario.scenes.find((s) => s.name === prevScene)!;
			const next = scenario.scenes.find((s) => s.name === b.scene)!;
			at(b.start, () => sceneBoundary(prev.ends, next.transition));
		}
		prevScene = b.scene;
		at(b.start, () => {
			current.set(b.index);
			showText(b);
		});
		for (const m of b.moments) {
			for (const d of m.directions) at(d.start, () => apply(d));
		}
	}
	at(tl.total, () => {
		cancelAnimationFrame(raf);
		R.clock.textContent = `${tl.total.toFixed(2)} s`;
		playing.set(false);
	});
}

function showText(b: ResolvedBeat) {
	R.text.classList.remove("in");
	void R.text.offsetWidth; // restart the CSS animation
	R.headline.textContent = b.text?.headline ?? "";
	R.sub.textContent = b.text?.sub ?? "";
	if (b.text && b.role !== "hook") R.text.classList.add("in");
}

/**
 * A scene ends `clean` (its own directions emptied the stage) or `full` (the next scene's
 * transition pushes it away). A real renderer honours that distinction; this illustration
 * clears whatever is still on stage at the boundary, sliding it out for a `push`.
 */
function sceneBoundary(_ends: "clean" | "full", transition?: string) {
	stage.classList.remove("has-focus");
	stage.querySelectorAll<HTMLElement>("[data-cast].on").forEach((el) => {
		el.style.setProperty("--dur", `${preset.leave}s`);
		if (transition === "push" || transition === "slide") el.dataset.to = "left";
		el.classList.remove("on");
	});
}

/** One resolved direction → its elements, staggered for `one by one`. */
function apply(d: ResolvedDirection) {
	const targets = els(d.subject);
	const stagger = d.group === "oneByOne" ? preset.stagger : 0;
	const each = d.duration - (d.count - 1) * stagger;
	targets.forEach((el, i) => at(i * stagger, () => motion(el, d, each)));
}

/** The verb → CSS table. Every core phrase, plus this project's `types`. */
function motion(el: HTMLElement, d: ResolvedDirection, duration: number) {
	el.style.setProperty("--dur", `${duration}s`);
	const cls = el.classList;
	switch (d.motion) {
		case "appears":
		case "enters":
			if (d.args.from?.[0]) el.dataset.from = d.args.from[0];
			void el.offsetWidth;
			cls.add("on");
			break;
		case "pops":
			cls.add("on");
			replay(el, "pop");
			break;
		case "leaves":
		case "exits":
			if (d.args.to?.[0]) el.dataset.to = d.args.to[0];
			cls.remove("on");
			break;
		case "moves":
			el.dataset.pose = d.args.to?.[0] ?? "center";
			break;
		case "steps aside":
			el.dataset.pose = "aside";
			break;
		case "takes the stage":
			el.dataset.pose = "stage";
			break;
		case "becomes the focus":
			stage.classList.add("has-focus");
			cls.add("focus");
			break;
		case "grows":
			cls.remove("small");
			cls.add("big");
			break;
		case "shrinks":
			cls.remove("big");
			cls.add("small");
			break;
		case "blinks once":
			replay(el, "blink");
			break;
		case "shows":
			d.object.forEach((o, i) => {
				const child = el.querySelector<HTMLElement>(`[data-ui="${uiKey(o)}"]`);
				if (child) at(i * preset.stagger, () => child.classList.add("on"));
			});
			break;
		case "types": {
			// a project verb from sprout.config.json: fill the next empty field
			const field = el.querySelector<HTMLElement>("[data-field]:not(.on)");
			if (field) {
				field.textContent = uiText(uiKey(d.object[0] ?? ""));
				field.classList.add("on");
			}
			break;
		}
		default:
			console.warn(
				`no CSS motion for \`${d.phrase}\` (line ${d.line}); showing the subject`,
			);
			cls.add("on");
	}
}

function replay(el: HTMLElement, cls: string) {
	el.classList.remove(cls);
	void el.offsetWidth;
	el.classList.add(cls);
}

/** Elements for a cast name. A group's members share the member's name. */
function els(name: string): HTMLElement[] {
	const member = scenario.cast.find((c) => c.name === name);
	const target = member?.group ? member.group.member : name;
	return [...stage.querySelectorAll<HTMLElement>(`[data-cast="${target}"]`)];
}

const uiKey = (o: string) => o.replace(/^ui\./, "");
const uiText = (key: string) => words[lang.get()]?.ui[key] ?? key;

reset();
app.dataset.state = "ready";
// `?autoplay` (optionally `&lang=sk`) starts playing on load, for sharing a link or screenshots.
const q = new URLSearchParams(location.search);
if (q.has("autoplay")) {
	const l = q.get("lang");
	if (l && resolved.languages.includes(l)) lang.set(l);
	play();
}
