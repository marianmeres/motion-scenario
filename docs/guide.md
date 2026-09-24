# Writing a scenario

For the person directing the video. This is the friendly walkthrough; the rules are in
[SPEC.md](../SPEC.md). Start by copying [`examples/sprout.scenario`](../examples/sprout.scenario)
and changing it.

## The idea in one paragraph

You write what the viewer sees and reads, beat by beat, in plain text. A **beat** is one
thought: one headline, one focal point. Under each beat you list the words in every language and
the **directions**: which thing does what, in what order. You never write numbers, coordinates or
easing. The implementer decides how pixels move; the tool works out how long each beat lasts from
the words and the music, and checks that nothing is missing.

## Step 1 — the header

```
motion-scenario 1

video sprout-how-it-works
	formats    wide, reel
	languages  en, sk
	music      120 bpm
	style      calm
	status     proposed
	audience   people who keep forgetting to water their plants
```

- Indent with tabs, one per level. Spaces work too, as long as the whole file uses the same
  kind.
- `languages`: the first one is the **reference**. Write that one first; the check tells you
  what the others are missing.
- `music`: the beats per minute of the track, or `silent`. Beat lengths snap to the music.
- Anything else you write here (`status`, `audience`, `remember`, `cta`) is kept and shown on the
  review board but never interpreted. Use it for the brief.

## Step 2 — the cast

Everything that will move gets a name, once.

```
cast
	card      FormCard
	plant     Plant
	plants    3x plant
	phone     Phone
	reminder  Notification on phone  ui.reminder
	sprout    Plant on phone
	logo      Logo
	wilted    new: a plant that visibly droops
```

- The second column is the component the project already has. Ask the implementer for the list,
  or just write what you mean and use `new:` when it does not exist yet; it becomes a work item.
- `3x plant` makes a group. `on phone` puts something inside something else.
- Extra words after the type (a `ui.<key>`, a URL) are handed to the component as-is.
- The headline is **not** cast. It is always there; you never direct it.

## Step 3 — the words inside the UI

Words that appear _inside_ the stylised interface (a typed field, a notification) are translated
too, so they live here, not in code:

```
ui waterEvery
	en  Water every 7 days
	sk  Polievať každých 7 dní
```

Refer to them in directions as `ui.waterEvery`.

## Step 4 — scenes and beats

```
scene workflow ends full
	beat remind
		en  Get a nudge when it is thirsty.
		sk  Dostanete štuchanec, keď je smädná.
		card steps aside
		and phone enters from the right, just after
		reminder pops
		reminder blinks once
```

- A **scene** is a group of beats on one background. Say how it ends: `ends clean` (the stage is
  empty, the default) or `ends full` (things stay, and the next scene must say how it enters:
  `transition push`).
- A **beat** has an id (unique in the file), its words per language, and its directions.
- Directions read top to bottom. A line **without** a leading word happens **after** the line
  above finishes. A line starting with **`and`** happens **together** with the line above.
  **`, just after`** on an `and` line means "a hair later". `, one by one` staggers a group.
- Keep to **one focal point per beat** and about **seven words per headline**. The check warns
  when you go over.
- A second, smaller line: `en.sub  …`. Both lines count toward reading time.

## Step 5 — the verbs

Use the vocabulary and the implementer never has to guess:

| Say                                                 | For                                                           |
| --------------------------------------------------- | ------------------------------------------------------------- |
| `appears` / `enters from the left`                  | something arrives calmly                                      |
| `pops`                                              | something arrives with a little bounce (things that _arrive_) |
| `leaves` / `exits to the right`                     | something goes                                                |
| `moves to <pose>`, `steps aside`, `takes the stage` | something changes place; poses are named, not measured        |
| `becomes the focus`                                 | everything else recedes                                       |
| `grows` / `shrinks`                                 | scale                                                         |
| `blinks once`                                       | one accent, for the end card                                  |
| `shows ui.a, ui.b`                                  | content reveals, one after another                            |
| project verbs (`types`, `submits`, `scans`, …)      | whatever your project has built                               |

Any other verb is allowed: it is reported as a **new motion** for the implementer to build. So
write what you mean (`card wobbles`) and let the report carry it.

You can nudge a line with exactly four modifiers: `, slowly`, `, quickly`, `, with overshoot`,
`, softly`. There are no other adjectives: the _feel_ of the motion is a style the project sets
once, so that every video of the project moves the same way.

## Step 6 — holds, roles, notes

- A beat with no words (a pure visual) or an end card needs a **hold**: `hold 3 s`,
  `hold 4 beats`, `hold 1 bars`.
- `beat hook role hook` on the very first beat: its text is on screen at frame 0 and something
  must move in the first second. `role end` on the last beat: it holds still.
- Anything else you write under a beat is a **note** to the implementer. It is kept and shown on
  the board. Start a note with `-` if it begins with a cast name, so it is not read as a direction.
- Lines starting with `#` are comments and disappear.

## Step 7 — check, board, iterate

```sh
deno run -A jsr:@marianmeres/motion-scenario/cli check my-video.scenario
deno run -A jsr:@marianmeres/motion-scenario/cli board my-video.scenario > board.md
```

`check` refuses structural mistakes (a missing translation, an undeclared name, an unknown
block) and warns about the rest (long headlines, new motions, running time outside the budget).
`board` is the review document: every beat with its words, its estimated timing, its moments and
your notes. Edit the file, run again. When it reads right, flip `status` to `approved` and hand it
over; the implementer's side is [implementing.md](./implementing.md).

## Cheat sheet

```
motion-scenario 1                         # first line, always
video <slug>                              # one; keys: formats, languages, music, style, + free keys
cast                                      # one; <name>  <Type> [on <host>] [args] | <n>x <member> | new: <text>
ui <key>                                  # any; <lang>  <text>
scene <name> [ends full|clean] [transition <kind>]
	beat <id> [role hook|end|<tag>]
		<lang>      <headline>
		<lang>.sub  <second line>
		[then|and] <name>[.part] <verb…> [from|to|on|with <x>] [, just after] [, one by one|together] [, slowly|quickly|with overshoot|softly]
		hold <n> s|beats|bars
		- a note
```
