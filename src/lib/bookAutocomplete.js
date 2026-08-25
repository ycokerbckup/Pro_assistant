/**
 * bookAutocomplete.js
 *
 * Deliberately separate from scriptureParser.js's deterministic regex
 * matching. This is fuzzy on purpose, but only ever surfaces as a visible,
 * clickable suggestion the operator chooses — it never silently corrects
 * or auto-applies anything. If this got merged into the core parser (the
 * one that will eventually run against live transcripts), a fuzzy guess
 * could get treated as a confident match with no human in the loop, which
 * is the exact false-positive risk the confirm-queue design was built to
 * avoid. Keep these two matchers apart.
 */

import Fuse from "fuse.js";
import { BOOKS } from "./scriptureParser";

const entries = Object.entries(BOOKS).flatMap(([canonical, aliases]) =>
  aliases.map((alias) => ({ canonical, alias }))
);

const fuse = new Fuse(entries, {
  keys: ["alias"],
  threshold: 0.4, // permissive enough to catch typos, not so loose it's noise
  ignoreLocation: true,
  minMatchCharLength: 2,
});

/**
 * @param {string} query - partial/misspelled book name text
 * @param {number} limit
 * @returns {string[]} canonical book names, deduped, ranked by fuzzy score
 */
export function suggestBooks(query, limit = 5) {
  const trimmed = query?.trim().toLowerCase();
  if (!trimmed || trimmed.length < 2) return [];

  const seen = new Set();
  const out = [];

  // Prefix matches first. This is what makes "by the 2nd or 3rd letter it
  // should know" actually true — fuzzy edit-distance scoring alone doesn't
  // rank "starts with" above "vaguely similar," so a short query like "ro"
  // was surfacing Deuteronomy and Proverbs ahead of Romans. Exact prefixes
  // always win before typo-tolerant fuzzy matching gets a say.
  for (const { canonical, alias } of entries) {
    if (alias.startsWith(trimmed) && !seen.has(canonical)) {
      seen.add(canonical);
      out.push(canonical);
    }
  }

  // Fuzzy fallback for actual typos, only filling remaining slots.
  if (out.length < limit) {
    const fuzzy = fuse.search(trimmed, { limit: limit * 3 });
    for (const r of fuzzy) {
      if (seen.has(r.item.canonical)) continue;
      seen.add(r.item.canonical);
      out.push(r.item.canonical);
      if (out.length >= limit) break;
    }
  }

  return out.slice(0, limit);
}
