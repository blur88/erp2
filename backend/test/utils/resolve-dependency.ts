import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Resolve an installed package's package.json through a chain of parents, as
// Node would from inside each one, so dependency compatibility specs reach the
// exact copy a consumer loads.
export const resolveVia = (...chain: string[]) =>
  chain.reduce(
    (from, name) => createRequire(from).resolve(`${name}/package.json`),
    fileURLToPath(import.meta.url),
  );

// Load the package at the end of the chain.
export const requireVia = (...chain: string[]): unknown =>
  createRequire(resolveVia(...chain))(".");

// The installed version of the package at the end of the chain.
export const versionVia = (...chain: string[]) =>
  (
    JSON.parse(readFileSync(resolveVia(...chain), "utf8")) as {
      version: string;
    }
  ).version;
