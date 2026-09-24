/**
 * @marianmeres/motion-scenario
 *
 * A plain-text format for describing a motion-design video — its beats, the words on screen
 * in every language, and the stage directions for each beat — plus the parser, checker, timing
 * resolver and words extractor that make the file a checkable contract between the person who
 * directs the video and whoever implements it. It animates nothing.
 *
 * @module
 */

export * from "./model.ts";
export * from "./config.ts";
export * from "./parser.ts";
export * from "./bind.ts";
export * from "./check.ts";
export * from "./resolve.ts";
export * from "./words.ts";
export * from "./report.ts";
export * from "./analyze.ts";
