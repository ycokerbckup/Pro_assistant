/**
 * scriptureParser.js
 *
 * Deterministic Bible reference parser. Deliberately NOT AI-based — this runs
 * against live STT transcripts (or manual search input) and needs to be fast,
 * predictable, and auditable. No hallucination risk, because it never
 * generates verse text — it only extracts (book, chapter, verse) locations.
 * Verse text itself should come from a licensed source (see README note in
 * schema.sql re: bible-api.com vs API.Bible).
 *
 * Handles the forms actually heard from a pulpit, not just typed shorthand:
 *   "Romans 8:28"
 *   "Romans chapter 8 verse 28"
 *   "Romans 8 28"                (STT often drops the colon/word "verse")
 *   "First Corinthians 13:4-7"
 *   "1 Corinthians chapter 13 verse 4 through 7"
 *   "John 3"                     (chapter only, no verse)
 *
 * Confidence is intentionally conservative — this feeds a suggest-then-confirm
 * queue (see live_suggestions table), not an auto-push pipeline. Low-confidence
 * matches should be shown to an operator, never pushed to a screen unconfirmed.
 */

// Canonical book name -> list of ways it may appear in a transcript
// (all lowercase, no punctuation). Longer/prefixed aliases are matched first.
const BOOKS = {
  Genesis: ["genesis", "gen"],
  Exodus: ["exodus", "exo", "ex"],
  Leviticus: ["leviticus", "lev"],
  Numbers: ["numbers", "num"],
  Deuteronomy: ["deuteronomy", "deut", "deu"],
  Joshua: ["joshua", "josh"],
  Judges: ["judges", "judg"],
  Ruth: ["ruth"],
  "1 Samuel": ["1 samuel", "first samuel", "1st samuel", "1 sam"],
  "2 Samuel": ["2 samuel", "second samuel", "2nd samuel", "2 sam"],
  "1 Kings": ["1 kings", "first kings", "1st kings", "1 kgs"],
  "2 Kings": ["2 kings", "second kings", "2nd kings", "2 kgs"],
  "1 Chronicles": ["1 chronicles", "first chronicles", "1st chronicles", "1 chron", "1 chr"],
  "2 Chronicles": ["2 chronicles", "second chronicles", "2nd chronicles", "2 chron", "2 chr"],
  Ezra: ["ezra"],
  Nehemiah: ["nehemiah", "neh"],
  Esther: ["esther", "esth"],
  Job: ["job"],
  Psalms: ["psalms", "psalm", "psa", "ps"],
  Proverbs: ["proverbs", "prov", "prv"],
  Ecclesiastes: ["ecclesiastes", "eccl", "eccles"],
  "Song of Solomon": ["song of solomon", "song of songs", "songs"],
  Isaiah: ["isaiah", "isa"],
  Jeremiah: ["jeremiah", "jer"],
  Lamentations: ["lamentations", "lam"],
  Ezekiel: ["ezekiel", "ezek", "eze"],
  Daniel: ["daniel", "dan"],
  Hosea: ["hosea", "hos"],
  Joel: ["joel"],
  Amos: ["amos"],
  Obadiah: ["obadiah", "obad"],
  Jonah: ["jonah"],
  Micah: ["micah", "mic"],
  Nahum: ["nahum", "nah"],
  Habakkuk: ["habakkuk", "hab"],
  Zephaniah: ["zephaniah", "zeph"],
  Haggai: ["haggai", "hag"],
  Zechariah: ["zechariah", "zech"],
  Malachi: ["malachi", "mal"],
  Matthew: ["matthew", "matt", "mat"],
  Mark: ["mark"],
  Luke: ["luke"],
  John: ["gospel of john", "the book of john", "john"],
  Acts: ["acts"],
  Romans: ["romans", "rom"],
  "1 Corinthians": ["1 corinthians", "first corinthians", "1st corinthians", "1 cor"],
  "2 Corinthians": ["2 corinthians", "second corinthians", "2nd corinthians", "2 cor"],
  Galatians: ["galatians", "gal"],
  Ephesians: ["ephesians", "eph"],
  Philippians: ["philippians", "phil"],
  Colossians: ["colossians", "col"],
  "1 Thessalonians": ["1 thessalonians", "first thessalonians", "1st thessalonians", "1 thess"],
  "2 Thessalonians": ["2 thessalonians", "second thessalonians", "2nd thessalonians", "2 thess"],
  "1 Timothy": ["1 timothy", "first timothy", "1st timothy", "1 tim"],
  "2 Timothy": ["2 timothy", "second timothy", "2nd timothy", "2 tim"],
  Titus: ["titus"],
  Philemon: ["philemon", "phlm"],
  Hebrews: ["hebrews", "heb"],
  James: ["james", "jas"],
  "1 Peter": ["1 peter", "first peter", "1st peter", "1 pet"],
  "2 Peter": ["2 peter", "second peter", "2nd peter", "2 pet"],
  "1 John": ["1 john", "first john", "1st john"],
  "2 John": ["2 john", "second john", "2nd john"],
  "3 John": ["3 john", "third john", "3rd john"],
  Jude: ["jude"],
  Revelation: ["revelation", "revelations", "rev"],
};

// Flatten to [canonicalName, alias] pairs, longest alias first so
// "1 corinthians" is tried before a bare "corinthians" would ever exist,
// and prefixed epistles are tried before "john" swallows "1 john".
const ALIAS_PAIRS = Object.entries(BOOKS)
  .flatMap(([canonical, aliases]) => aliases.map((a) => [canonical, a]))
  .sort((a, b) => b[1].length - a[1].length);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ALIAS_ALTERNATION = ALIAS_PAIRS.map(([, alias]) => escapeRegex(alias)).join("|");

// Chapter/verse tail: optional "chapter", number, optional verse marker +
// number, optional range ("-" / "to" / "through" + number).
// The verse marker ([:.]  /  "verse(s)") is optional so bare spoken forms
// like "Romans 8 28" (no colon, no "verse" — common when STT doesn't insert
// punctuation) still capture a verse number. This trades a small false-match
// risk (two unrelated numbers landing right next to a book name) for not
// silently dropping the verse. Adjacency is required — words between the two
// numbers break the match — and the no-marker case gets the lowest
// confidence score, so it surfaces in the queue but never outranks a clean
// match. This is a deliberate precision/recall tradeoff, not an oversight —
// re-tune against real service transcripts once you have some.
const REFERENCE_REGEX = new RegExp(
  `\\b(${ALIAS_ALTERNATION})\\b\\.?\\s+` +
    `(?:chapter\\s+)?(\\d{1,3})` +
    `(?:\\s*(?:([:.]|verses?)\\s*)?(\\d{1,3})` +
    `(?:\\s*(?:-|to|through)\\s*(\\d{1,3}))?)?`,
  "gi"
);

const aliasToCanonical = new Map(ALIAS_PAIRS.map(([canonical, alias]) => [alias, canonical]));

function canonicalFor(matchedAlias) {
  return aliasToCanonical.get(matchedAlias.toLowerCase().replace(/\.$/, ""));
}

/**
 * @param {string} text - transcript chunk or manual search input
 * @returns {Array<{
 *   book: string,
 *   chapter: number,
 *   verseStart: number|null,
 *   verseEnd: number|null,
 *   matchedText: string,
 *   confidence: number,   // 0-1, conservative by design
 * }>}
 */
export function parseScriptureReferences(text) {
  if (!text) return [];
  const results = [];
  let match;
  REFERENCE_REGEX.lastIndex = 0;

  while ((match = REFERENCE_REGEX.exec(text)) !== null) {
    const [full, aliasRaw, chapterRaw, markerRaw, verseStartRaw, verseEndRaw] = match;
    const book = canonicalFor(aliasRaw);
    if (!book) continue;

    const chapter = parseInt(chapterRaw, 10);
    const verseStart = verseStartRaw ? parseInt(verseStartRaw, 10) : null;
    const verseEnd = verseEndRaw ? parseInt(verseEndRaw, 10) : null;

    // Confidence tiers, never above 0.9 — this feeds a confirm queue, not
    // auto-push, so "useful but uncertain" is fine as long as it's labeled:
    //   0.5  chapter only, no verse ("turn to Romans 8") — safe, just less specific
    //   0.6  verse present but no colon/"verse" marker — could be two
    //        unrelated adjacent numbers, so ranked below a clean match
    //   0.9  verse present with an explicit colon/"verse" marker
    let confidence = 0.5;
    if (verseStart !== null) confidence = markerRaw ? 0.9 : 0.6;

    results.push({
      book,
      chapter,
      verseStart,
      verseEnd,
      matchedText: full.trim(),
      confidence,
    });
  }

  return results;
}

export { BOOKS };
