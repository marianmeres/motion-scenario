# motion-scenario — format specification

**Version 1. Normative.** This document defines what a `.scenario` file may contain, what every
line means, how timing is derived from it, and what a conforming reader must accept, refuse, and
report. It is written for two readers: the person who writes a scenario, and whoever (a person or
an agent) implements it in a renderer.

The examples are from the fictional video in [`examples/sprout.scenario`](./examples/sprout.scenario).
A gentler introduction is in [`docs/guide.md`](./docs/guide.md); the implementer's workflow is in
[`docs/implementing.md`](./docs/implementing.md).

---

## 0. What a scenario is

A scenario is a plain-text description of a motion-design video: its **beats**, the **words** on
screen in every language, and the **stage directions** for each beat. It is the contract between
the person who directs the video and whoever implements it. Tools parse it, check it, and compute
its timing. **Nothing in this package animates anything.**

| The file decides                                             | The code decides                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| What is on stage (the cast), and what each thing is called   | What each cast member looks like                                 |
| The words, in every language                                 | Fonts, sizes, layout of the words                                |
| What happens in each beat, and in what order                 | How pixels move: curves, coordinates, keyframes                  |
| Which things move together, one after another, or just after | Exact milliseconds (the resolver _estimates_ them from a preset) |
| Named poses (`aside`, `stage`)                               | Where a pose is, per output format                               |
| How long an end card holds                                   | Everything else about duration: derived from words and music     |
| Notes to the implementer                                     | Whether to follow them                                           |

Principles the format is built on:

1. **Intent in the file, mechanics in code.** No coordinates, easing, keyframes, or per-format
   poses. Poses are _named_ here and resolved in code.
2. **No absolute time in the source.** A beat lasts as long as its words need, snapped to the
   music grid. Only wordless beats and end cards state a `hold`.
3. **A verb is bound or it is new.** The project supplies the vocabulary it has implemented. An
   unbound verb parses, is kept, and is reported as a new motion to build.
4. **Degrades into prose.** A beat line that is not text, a hold, or a direction on a cast member
   is a note. It is kept and shown, never an error.
5. **Strict structure, loose content.** Duplicate ids, inconsistent indentation, undeclared
   languages, missing reference text: errors. Everything creative is free text.
6. **One style per project.** Durations and easings are a preset. A line may carry at most the
   modifiers `slowly`, `quickly`, `with overshoot`, `softly`.
7. **The system infers timing and defaults, never choreography.** Everything it infers, it prints.
8. **Small.** The grammar fits in §2.

---

## 1. File

- One file per video, extension `.scenario`, UTF-8, LF or CRLF line endings.
- Line-oriented. Indentation is significant.
- A line whose first non-blank character is `#` is a comment and is dropped. There are no inline
  comments.
- Blank lines are ignored everywhere.
- Trailing whitespace is ignored.

### 1.1 Indentation

- Indent with tabs **or** spaces, one kind per file. The first indented line sets the unit (one
  tab, or the exact run of spaces it uses). Every later indented line must use the same character
  and a whole multiple of that unit. Anything else is `E_INDENT`.
- Block headers are at level 0. Their lines are at level 1. Beat lines are at level 2. No deeper.

### 1.2 Two-column lines

Several line kinds are `<key>  <value>`: the key is the first run of non-blank characters, the
value is everything after the first run of whitespace, trimmed. One space is enough to separate
them; two or more is the convention, because it lines the values up.

---

## 2. Syntax

### 2.1 Version line

The first non-comment line must be exactly:

```
motion-scenario 1
```

Anything else, including a missing line or a different number, is `E_VERSION` and nothing else is
read.

### 2.2 Blocks

After the version line, the file is a sequence of level-0 blocks, in any order:

| Header                                                | Count                   | Content lines (level 1)                            |
| ----------------------------------------------------- | ----------------------- | -------------------------------------------------- |
| `video <slug>`                                        | exactly one             | `<key>  <value>`                                   |
| `cast`                                                | exactly one             | one cast member per line                           |
| `ui <key>`                                            | any number, unique keys | `<lang>  <text>`                                   |
| `scene <name> [ends full\|clean] [transition <kind>]` | one or more             | `beat` headers, each with its own lines at level 2 |

An unknown header is `E_UNKNOWN_BLOCK`; a second `video` or `cast` is `E_DUPLICATE_BLOCK`; a
missing `video`, `cast` or `scene` is `E_MISSING_BLOCK`.

### 2.3 `video`

```
video sprout-how-it-works
  formats    wide, reel
  languages  en, sk
  music      120 bpm
  style      calm
  status     proposed
  audience   people who keep forgetting to water their plants
```

| Key           | Required | Value                                                                                                                                                    |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `languages`   | yes      | Comma-separated language codes. **The first is the reference language.**                                                                                 |
| `formats`     | no       | Comma-separated output format names the project knows (`wide`, `reel`, …). Free names; the project config gives each a budget. Default: none.            |
| `music`       | no       | `silent` (default), or `<bpm> bpm`, optionally followed by `offset <seconds> s` and/or `<n> per bar` (default 4). Holds and beat ends snap to this grid. |
| `style`       | no       | The name of the project's style preset. Not interpreted by this package.                                                                                 |
| anything else | no       | Kept as a note (`status`, `audience`, `remember`, `cta`, …). Printed on the board's title card, never interpreted.                                       |

Language codes are free strings without whitespace or dots. `E_MISSING_LANGUAGES` if none;
`E_MUSIC` for a malformed `music` value.

### 2.4 `cast`

Everything that can be the subject of a direction is declared here, once.

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

| Form                               | Meaning                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<name>  <Type> [args…]`           | A component of type `Type` from the project's registry. Remaining tokens are arguments (a URL, a `ui.<key>` reference, …); binding them to component props is code. |
| `<name>  <Type> on <host> [args…]` | The same, living inside another cast member. `on` must directly follow the type.                                                                                    |
| `<name>  <n>x <member>`            | A group: `n` copies of the member `member`. Directions on the group apply to every copy; `, one by one` staggers them.                                              |
| `<name>  new: <description>`       | A component that does not exist yet. Accepted, and reported as a component to build.                                                                                |

Names must be unique (`E_DUPLICATE_CAST`) and must not contain a dot (the dot addresses parts:
`card.button`). Hosts and group members must be declared (`E_UNDECLARED_CAST`).

**The headline is not cast.** Every beat's text is shown at the beat's start and replaced at the
next beat; nobody writes "headline changes".

### 2.5 `ui`

Translated strings that live _inside_ the stylised UI (a field value, a button label, a
notification). Not timed, but translated, so they belong to the scenario. One block per key:

```
ui waterEvery
  en  Water every 7 days
  sk  Polievať každých 7 dní
```

Every declared language must be present (`E_UI_TEXT_MISSING`); an undeclared one is
`E_UNDECLARED_LANGUAGE`. Directions and cast lines refer to them as `ui.<key>`; a reference to an
undefined key is `E_UI_MISSING`.

### 2.6 `scene`

```
scene workflow ends full
scene outro transition push
```

| Part                   | Meaning                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<name>`               | Unique (`E_DUPLICATE_SCENE`).                                                                                                                      |
| `ends clean` (default) | The scene's own directions leave an empty background.                                                                                              |
| `ends full`            | The scene ends with things on stage; the next scene must declare a `transition` that pushes them away (`E_CLEAN_PLATE`). The last scene is exempt. |
| `transition <kind>`    | How this scene enters: `cut`, `push`, `slide`, `crossfade`, or a project-defined kind (unknown kinds are `W_NEW_TRANSITION`).                      |

### 2.7 `beat`

```
beat remind
beat hook role hook
```

A beat is one unit of meaning: one headline, one focal point, one duration. Ids are unique across
the whole file (`E_DUPLICATE_BEAT`). The optional `role` is a tag; `hook` and `end` carry rules
(§9), any other word is documentation (`setup`, `mechanism`, `payoff`, …).

Each line under a beat (level 2) is classified **in this order**; the first matching rule wins:

| # | Line                                                                                                                                | Kind                                                                                                                                  |
| - | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | starts with `-`                                                                                                                     | **Note.** The dash and following whitespace are stripped.                                                                             |
| 2 | starts with `hold`                                                                                                                  | **Hold**: `hold <n> s` \| `<n> beats` \| `<n> bars`. Anything else is `E_HOLD`. One per beat.                                         |
| 3 | first token is a declared language, or `<lang>.sub`                                                                                 | **Text**: the headline, or the optional second line. One of each per language (`E_DUPLICATE_TEXT`); an empty value is `E_EMPTY_TEXT`. |
| 4 | first token (after an optional `then` / `and`) is a cast name, optionally `.part`                                                   | **Direction** (§2.8).                                                                                                                 |
| 5 | first token looks like a language code (`xx`, `xxx`, `xx-YY`, optionally `.sub`) **and** is followed by two or more spaces or a tab | `E_UNDECLARED_LANGUAGE`.                                                                                                              |
| 6 | anything else                                                                                                                       | **Note**, kept verbatim.                                                                                                              |

Rule 4 means a prose note that happens to start with a cast name is read as a direction and ends
up reported as a new motion. Start such a note with `-`.

Every beat needs text in the reference language or a `hold` (`E_EMPTY_BEAT`). If a beat has text
in any language, it must have a headline in every language (`E_TEXT_MISSING`), and a `sub` in all
or none (`E_SUB_MISMATCH`).

### 2.8 Directions

```
[then|and] <subject>[.<part>] <verb> [words…] [from|to|on|with <value>]… [, <tail>]…
```

```
card appears
and phone enters from the right, just after
plants pop, one by one
card shows ui.plantName, ui.waterEvery
logo takes the stage
sprout grows, slowly
card.button pops with overshoot
```

| Element                                              | Meaning                                                                                                                                                                                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `then` (default, may be omitted)                     | Starts a new **moment** after the previous moment completes.                                                                                                                                                                                         |
| `and`                                                | Joins the previous moment: starts together with it.                                                                                                                                                                                                  |
| `<subject>`                                          | A cast name. `<subject>.<part>` addresses an anchor the component type knows (`card.button`).                                                                                                                                                        |
| `<verb> [words…]`                                    | The verb phrase: the first word plus any bare words before a keyword or comma. Which of the bare words belong to the verb is decided by the vocabulary (§7): `takes the stage` is one phrase; in `types ui.plantName`, `ui.plantName` is the object. |
| `from`, `to`, `on`, `with <value>`                   | Keyword arguments. A value runs to the next keyword or comma. A leading article (`the`, `a`, `an`) is dropped: `from the right` → `right`.                                                                                                           |
| `, just after`                                       | With `and`: start one `justAfter` offset after the line above (chains accumulate). On a `then` line it has no effect (`W_JUST_AFTER_THEN`).                                                                                                          |
| `, one by one`                                       | On a group or several objects: stagger the members.                                                                                                                                                                                                  |
| `, together`                                         | The members start at once. This is the default, except for verbs the vocabulary marks as staggered (`shows`).                                                                                                                                        |
| `, slowly` `, quickly` `, with overshoot` `, softly` | The four modifiers. `slowly` and `quickly` scale the duration by the preset's factors; the other two are passed to the renderer. A modifier may also be written without a comma.                                                                     |
| any other `, <segment>`                              | Continues the previous list: a further keyword value if a keyword was open, otherwise a further object (`shows ui.a, ui.b`).                                                                                                                         |

Verbs may be written in the plural for plural subjects: `plants pop` binds to `pops`. The
resolver reports the vocabulary form.

A direction line with no verb is `E_DIRECTION`.

### 2.9 Complete example

```
# Sprout — how it works. A fictional plant-care app; the example every doc refers to.
motion-scenario 1

video sprout-how-it-works
  formats    wide, reel
  languages  en, sk
  music      120 bpm
  style      calm
  status     proposed
  audience   people who keep forgetting to water their plants
  remember   add a plant once, get nudged at the right time

cast
  card      FormCard
  plant     Plant
  plants    3x plant
  phone     Phone
  reminder  Notification on phone  ui.reminder
  sprout    Plant on phone
  logo      Logo

ui plantName
  en  Monstera
  sk  Monstera
ui waterEvery
  en  Water every 7 days
  sk  Polievať každých 7 dní
ui reminder
  en  Time to water Monstera
  sk  Čas poliať monsteru

scene intro ends clean
  beat hook role hook
    en  Plants forget nothing. You do.
    sk  Rastliny nezabúdajú. Vy áno.
    plants pop, one by one
    - Three plants in a row; the middle one slightly wilted would sell the line.

scene workflow ends full
  beat add
    en  Add a plant.
    sk  Pridajte rastlinu.
    card appears
    card types ui.plantName
    card types ui.waterEvery

  beat remind
    en  Get a nudge when it is thirsty.
    sk  Dostanete štuchanec, keď je smädná.
    card steps aside
    and phone enters from the right, just after
    reminder pops
    reminder blinks once

  beat water
    en  Water it. Done.
    sk  Polejte ju. Hotovo.
    card leaves
    and reminder leaves
    and phone takes the stage
    sprout appears
    sprout grows, slowly

scene outro transition push
  beat end role end
    en      Sprout
    en.sub  Plant care that remembers for you.
    sk      Sprout
    sk.sub  Starostlivosť o rastliny, ktorá si pamätá za vás.
    logo appears
    logo blinks once
    hold 3 s
```

---

## 3. Model

The parser produces this engine-free structure (TypeScript in [`src/model.ts`](./src/model.ts),
documented in [`API.md`](./API.md)):

```
Scenario
  version                        1
  video      slug, formats[], languages[] (first = reference), music, style?, notes{}
  cast[]     name, type | new(description), host?, group?(count × member), args[]
  ui{}       key → language → text
  scenes[]   name, ends(full | clean), transition?, beats[]
    beats[]  id, role?, text{language → headline, sub?}, hold?, directions[], notes[]
      directions[]  relation(then | and), subject, part?, verb, words[], args{from,to,on,with},
                    justAfter, group?(oneByOne | together), modifiers[]
```

Every element records its source `line`. Directions keep the line as written in `raw`.

---

## 4. Words

Two kinds, both per language, both owned by the scenario:

- **Beat text**: the headline and the optional `sub` line. Both count toward reading time.
- **`ui` strings**: words inside the UI. Translated, not timed.

The first declared language is the **reference**: every text must exist in it, and every other
language must have exactly the same keys. The `words` output (§8) is the whole set as data,
per language, so the words never have to be copied into code.

---

## 5. Timing

The resolver computes an **estimate** per language. The render is the truth; the estimate exists
so that reports, boards and animatics agree with each other and are close to the final. Formats
do not change the estimate; format budgets are checked against it.

### 5.1 Reading time

```
readingTime(words) = words = 0 ? 0 : max(min, base + perWord × words)
```

with `words` the count of whitespace-separated tokens in headline + sub. Defaults: `min 1.8 s`,
`base 0.8 s`, `perWord 0.3 s`. The project config may change them.

### 5.2 Music grid and holds

With `music <bpm> bpm`, one grid beat is `60 / bpm` seconds and the grid points are
`offset + k × beat` for every integer `k`. `snap(t)` is the first grid point at or after `t`.
With `music silent`, `snap(t) = t`.

A `hold` replaces the reading time as the beat's word-side bound:

| Hold           | Seconds             |
| -------------- | ------------------- |
| `hold n s`     | `n`                 |
| `hold n beats` | `n × beat`          |
| `hold n bars`  | `n × perBar × beat` |

`beats` and `bars` require a music grid (`E_HOLD_NO_GRID`).

### 5.3 Moments

The directions of a beat form moments in file order:

- A `then` line (or a line with no relation word) opens a new moment that starts when the
  previous moment ends. The first direction always opens the first moment.
- An `and` line joins the current moment.
- Each direction has an `offset` inside its moment: 0, or with `, just after`, the offset of the
  line above plus the preset's `justAfter`.
- Each direction has a `duration`:

  ```
  base     = motion.duration           (a preset key or a fixed number of seconds;
                                        preset.unknown for an unbound verb)
  factor   = slowly ? preset.slowly : 1  ×  quickly ? preset.quickly : 1
  count    = group size for a group subject, else the number of objects, else 1
  stagger  = one by one ? (count − 1) × preset.stagger : 0
  duration = base × factor + stagger
  ```

  `one by one` is implied for a staggered verb (`shows`) with more than one object, unless
  `, together` is written.
- A moment ends at the largest `offset + duration` of its directions.
- The beat's text change belongs to the first moment; it adds no time beyond `textIn`.

### 5.4 Beat duration

```
textReadableAt = start + (hook ? 0 : text ? preset.textIn : 0)
readUntil      = hold ? start + holdSeconds : textReadableAt + readingTime(words)
motionEnd      = end of the last moment (start if there are no directions)
end            = snap(max(readUntil, motionEnd))
boundedBy      = readUntil ≥ motionEnd ? (hold ? "hold" : "words") : "motion"
```

Beats follow each other without gaps; the video's running time is the last beat's `end`.
All results are rounded to milliseconds.

### 5.5 Style preset

A duration table the resolver and the renderer share. The project defines it once (config
`preset`); the same numbers live in its motion library, so the estimate and the render cannot
disagree by design, only by drift, which the report makes visible.

| Key         | Default | Used by                                                           |
| ----------- | ------- | ----------------------------------------------------------------- |
| `textIn`    | 0.4 s   | the headline animating in (0 for a hook beat)                     |
| `enter`     | 0.5 s   | `appears`, `enters`, `shows`                                      |
| `leave`     | 0.4 s   | `leaves`, `exits`                                                 |
| `move`      | 0.5 s   | `moves to`, `steps aside`, `takes the stage`, `becomes the focus` |
| `pop`       | 0.5 s   | `pops`                                                            |
| `scale`     | 0.4 s   | `grows`, `shrinks`                                                |
| `accent`    | 0.3 s   | `blinks once`                                                     |
| `unknown`   | 0.5 s   | any unbound verb                                                  |
| `stagger`   | 0.12 s  | between members of a `one by one` group                           |
| `justAfter` | 0.15 s  | the `, just after` offset                                         |
| `slowly`    | × 1.6   | modifier factor                                                   |
| `quickly`   | × 0.6   | modifier factor                                                   |

### 5.6 Worked example

The `remind` beat above, in `en`, with the defaults, 120 bpm (0.5 s grid), starting at 5.00 s:

|                |                                                                                       |
| -------------- | ------------------------------------------------------------------------------------- |
| words          | 7 → reading time `max(1.8, 0.8 + 7 × 0.3)` = 2.9 s                                    |
| textReadableAt | 5.00 + 0.4 = 5.40                                                                     |
| readUntil      | 5.40 + 2.9 = 8.30                                                                     |
| moment 1       | `card steps aside` (0.5 s) **and** `phone enters` (+0.15 offset, 0.5 s) → 5.00 → 5.65 |
| moment 2       | `reminder pops` (0.5 s) → 5.65 → 6.15                                                 |
| moment 3       | `reminder blinks once` (0.3 s) → 6.15 → 6.45                                          |
| motionEnd      | 6.45                                                                                  |
| end            | snap(max(8.30, 6.45)) = snap(8.30) = **8.50**, bounded by words                       |

---

## 6. Checks

Two severities. **Errors** stop every tool: no timeline, no words, no board. **Warnings** are
printed and the tools continue (`check --strict` turns them into a failing exit code).

### 6.1 Errors

| Code                                                                                                             | Rule                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `E_VERSION`                                                                                                      | Missing or unsupported version line                                        |
| `E_UNKNOWN_BLOCK` `E_DUPLICATE_BLOCK` `E_MISSING_BLOCK`                                                          | Block structure (§2.2)                                                     |
| `E_INDENT`                                                                                                       | Mixed or inconsistent indentation; a line at an unexpected level           |
| `E_SYNTAX`                                                                                                       | A malformed header or two-column line (the message says what was expected) |
| `E_MISSING_LANGUAGES` `E_MUSIC`                                                                                  | `video` values                                                             |
| `E_DUPLICATE_CAST` `E_DUPLICATE_SCENE` `E_DUPLICATE_BEAT` `E_DUPLICATE_UI` `E_DUPLICATE_TEXT` `E_DUPLICATE_HOLD` | Duplicates                                                                 |
| `E_UNDECLARED_LANGUAGE`                                                                                          | Text in a language `video` does not declare                                |
| `E_UNDECLARED_CAST` `E_CAST`                                                                                     | A host or group member that is not declared; a group of size 0             |
| `E_UI_MISSING` `E_UI_TEXT_MISSING`                                                                               | A `ui.<key>` that does not exist; a `ui` key missing a language            |
| `E_TEXT_MISSING` `E_SUB_MISMATCH` `E_EMPTY_TEXT` `E_EMPTY_BEAT`                                                  | Beat text rules (§2.7)                                                     |
| `E_HOLD` `E_HOLD_NO_GRID`                                                                                        | A hold without a valid unit; `beats`/`bars` without music                  |
| `E_DIRECTION`                                                                                                    | A direction with no verb                                                   |
| `E_CLEAN_PLATE`                                                                                                  | A scene that ends full not followed by a scene with a transition           |
| `E_HOOK_POSITION`                                                                                                | `role hook` not on the first beat of the first scene                       |

### 6.2 Warnings

| Code                               | Rule                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------- |
| `W_NEW_MOTION`                     | An unbound verb phrase. Listed under "new motions" with its subject's type and line.     |
| `W_NEW_COMPONENT` `W_UNKNOWN_TYPE` | A `new:` member; a type the registry does not know (only when the config declares types) |
| `W_UNKNOWN_PART`                   | `<subject>.<part>` where the type declares parts and not this one                        |
| `W_NEW_TRANSITION`                 | A transition kind the config does not list                                               |
| `W_HEADLINE_LONG`                  | A headline over `headline.maxWords` words (default 7)                                    |
| `W_HEADLINE_LINES`                 | A headline estimated over `maxLines` (default 2) at a format's `charsPerLine`            |
| `W_BLACKLIST`                      | A blacklisted word in text, per language (whole words, case-insensitive)                 |
| `W_BUDGET`                         | Running time outside a format's `budget`                                                 |
| `W_HOOK_NO_DIRECTION`              | A hook beat with nothing moving                                                          |
| `W_END_NO_HOLD` `W_END_BUSY`       | An end beat without a hold; with more than two moments                                   |
| `W_DOUBLE_POP`                     | Two `pops` in one moment (one focal point per frame)                                     |
| `W_JUST_AFTER_THEN`                | `, just after` on a `then` line                                                          |
| `W_UNUSED_CAST` `W_UNUSED_UI`      | Declared but never used                                                                  |
| `W_EMPTY_SCENE`                    | A scene without beats                                                                    |

---

## 7. Vocabulary

A verb is a word of the language only when it is bound to a motion a renderer implements. The
core vocabulary below is what every renderer is expected to implement; a project extends it.

### 7.1 Core verbs

| Phrase                        | Duration         | Meaning                                                         |
| ----------------------------- | ---------------- | --------------------------------------------------------------- |
| `appears`                     | enter            | eases in and travels into place                                 |
| `enters [from <side>]`        | enter            | like `appears`, from a named side                               |
| `pops`                        | pop              | arrives with overshoot; for things that _arrive_                |
| `leaves`                      | leave            | eases out                                                       |
| `exits [to <side>]`           | leave            | like `leaves`, to a named side                                  |
| `moves to <pose>`             | move             | position tween to a named pose; the pose is per format, in code |
| `steps aside`                 | move             | shorthand for `moves to aside`                                  |
| `takes the stage`             | move             | shorthand for `moves to stage`                                  |
| `becomes the focus`           | move             | rack focus: the subject holds, everything else dims and recedes |
| `grows` / `shrinks`           | scale            | scale tween                                                     |
| `blinks once`                 | accent           | one accent, for end cards                                       |
| `shows ui.<key>[, ui.<key>]…` | enter, staggered | reveals content, one item after another                         |

### 7.2 Project verbs

The config adds phrases in two places:

- `verbs`: phrases every type understands.
- `types.<Type>.verbs`: phrases only that component type understands (`types`, `submits`,
  `scans`, …). A **composite** verb (`scans`) is a pattern the renderer implements as several
  steps; to override its inside, the director writes the smaller verbs as separate lines. That is
  how a direction is refined without numbers.

Each phrase maps to a `MotionDef`: a preset key or a fixed number of seconds, an optional
description, and `staggered` for verbs that spread over several objects by default.

### 7.3 Binding

For a direction on subject `S` with verb `v` and bare words `w₁ … wₙ`:

1. Find `S`'s component type (a group resolves to its member's type).
2. For `k` from `n` down to `0`, form the candidate `v w₁ … wₖ`. Try it, then its
   third-person-singular forms (`v` + `s`, `v` + `es`), against the type's verbs, then the project's
   and core verbs. The first hit wins: the longest phrase, type before project before core.
3. The words after the phrase, plus any further comma-separated bare segments, are the
   **object** (`ui.<key>` references, a cast name, a pose).
4. No hit: the phrase is the bare verb, the motion is `null`, and the direction is a **new motion**.

---

## 8. Project config

Everything project-specific, passed to the library or to the CLI with `--config`. Every field is
optional; defaults are the values in §5.5 and §7.1.

```jsonc
{
	"types": { // the component registry
		"FormCard": {
			"description": "a form card with two fields",
			"parts": ["name", "schedule", "button"],
			"verbs": {
				"types": {
					"duration": 0.8,
					"description": "types a ui string into the next field"
				},
				"submits": {
					"duration": "pop",
					"description": "presses the button, fields lock"
				}
			}
		},
		"Phone": { "parts": ["screen"] }
	},
	"verbs": {}, // phrases every type understands
	"poses": ["aside", "stage", "center"], // informational
	"transitions": ["cut", "push", "slide", "crossfade"],
	"preset": { "enter": 0.5 }, // partial; merged over the defaults
	"reading": { "min": 1.8, "base": 0.8, "perWord": 0.3 },
	"formats": {
		"wide": { "budget": [10, 30], "charsPerLine": 36, "maxLines": 2 },
		"reel": { "budget": [10, 25], "charsPerLine": 22 }
	},
	"headline": { "maxWords": 7 },
	"blacklist": { "en": ["easy", "simply", "just"] }
}
```

The CLI accepts a `.json` file or a `.ts`/`.js` module whose default export (or `config` export)
is the object.

---

## 9. Roles

| Role           | Defaults                                                      | Rules                                                                                                           |
| -------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `hook`         | The text is _set_ at frame 0, not animated in (`textIn` = 0). | Only on the first beat of the first scene (`E_HOOK_POSITION`). Should have a direction (`W_HOOK_NO_DIRECTION`). |
| `end`          | —                                                             | Should state a `hold` (`W_END_NO_HOLD`). Should have at most one moment after its entrance (`W_END_BUSY`).      |
| any other word | none                                                          | none; documentation for the reviewer                                                                            |

---

## 10. Outputs

| Tool      | Produces                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check`   | Errors, warnings, new motions and components, and the timing table per language. `--json` gives the full analysis.                                                                                                                                                                                                                                                                                                                                             |
| `resolve` | The resolved timeline as JSON: for every language, every beat with `start`, `end`, `duration`, `textReadableAt`, `readUntil`, `motionEnd`, `boundedBy`, its text, hold, moments and directions with absolute `start`, `offset`, `duration`, `end`, the bound `motion` (or `null`), `object`, `args`, `modifiers`, `count`, `group`, `line`, `raw`. Plus the preset, reading constants, music and grid. **This is the document an implementer schedules from.** |
| `words`   | `{ [language]: { beats: { [id]: { headline, sub? } }, ui: { [key]: text } } }`.                                                                                                                                                                                                                                                                                                                                                                                |
| `board`   | A markdown board: title card (the `video` block), cast, ui strings, then one section per beat with its words in every language, its timing, its moments and its notes. The review artifact.                                                                                                                                                                                                                                                                    |

Time values are seconds, rounded to milliseconds.

---

## 11. Conformance

A **reader** of this format:

- accepts every file this specification allows and refuses every file it forbids, reporting every
  structural error it finds (not just the first) with a line number;
- never interprets a note, a free `video` key, or a modifier it merely passes on;
- never guesses: an unbound verb is reported, not silently timed as something else (it is timed as
  `preset.unknown` and marked `motion: null`).

A **renderer** implementing a scenario:

- implements every core verb (§7.1) and every project verb its config declares, with the preset's
  durations;
- shows each beat's text at `textReadableAt` (at `start` for a hook) and replaces it at the next
  beat;
- starts each direction at its resolved `start` and gives it its resolved `duration`, staggering
  `one by one` groups by the preset's `stagger`;
- honours `ends clean` / `ends full` + `transition` at scene boundaries;
- resolves named poses per output format in its own code;
- where it departs from a direction, says so in review, and the scenario is updated to what was
  built. After that, the scenario is both the reviewed intent and the words; the code is the
  mechanics.
