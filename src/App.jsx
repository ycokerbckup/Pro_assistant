import { useState, useEffect, useRef } from "react";
import { parseScriptureReferences } from "./lib/scriptureParser";
import { suggestBooks } from "./lib/bookAutocomplete";
import { useAudioCapture } from "./hooks/useAudioCapture";
import { useAudioLevel } from "./hooks/useAudioLevel";

const VERSE_API = "https://bible-api.com";

const TRANSLATIONS = [
  { id: "kjv", label: "King James Version" },
  { id: "web", label: "World English Bible" },
  { id: "asv", label: "American Standard Version" },
  { id: "bbe", label: "Bible in Basic English" },
  { id: "darby", label: "Darby Bible" },
];

async function fetchVerseByRef(bookName, chapter, verse, translationId) {
  const ref = `${bookName}+${chapter}:${verse}`;
  const res = await fetch(`${VERSE_API}/${encodeURIComponent(ref)}?translation=${translationId}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.verses || data.verses.length === 0) return null;
  return data;
}

async function fetchChapter(bookName, chapter, translationId) {
  const ref = `${bookName}+${chapter}`;
  const res = await fetch(`${VERSE_API}/${encodeURIComponent(ref)}?translation=${translationId}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.verses || data.verses.length === 0) return null;
  return data;
}

function slideFromVerse(v, data, translationId) {
  return {
    book_name: v.book_name,
    chapter: v.chapter,
    verse: v.verse,
    text: v.text,
    translationName: data.translation_name,
    translationAbbrev: (data.translation_id || translationId).toUpperCase(),
    translationId,
  };
}

function ConfidenceMeter({ confidence }) {
  const filled = Math.round(confidence * 5);
  const color = confidence >= 0.85 ? "var(--green)" : confidence >= 0.6 ? "var(--amber)" : "var(--rose)";
  return (
    <div style={{ display: "flex", gap: 3 }} aria-label={`Confidence ${Math.round(confidence * 100)}%`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{ width: 10, height: 14, background: i < filled ? color : "var(--border)", borderRadius: 1, transition: "background 200ms ease" }}
        />
      ))}
    </div>
  );
}

function AudioLevelMeter({ bars, level, active }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 48, padding: "0 2px" }} aria-hidden="true">
        {bars.map((v, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${Math.max(4, v)}%`,
              background: !active ? "var(--border)" : v > 60 ? "var(--rose)" : v > 25 ? "var(--amber)" : "var(--green)",
              borderRadius: 1,
              transition: "height 60ms linear, background 120ms ease",
            }}
          />
        ))}
      </div>
      <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
        <span>INPUT LEVEL</span>
        <span style={{ color: active ? "var(--text)" : "var(--text-muted)" }}>{active ? `${level}%` : "—"}</span>
      </div>
    </div>
  );
}

function AudioSourcePanel() {
  const { devices, activeDeviceId, activeSourceType, stream, error, refreshDevices, startCapture, stopCapture } = useAudioCapture();
  const { bars, level } = useAudioLevel(stream);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [sourceType, setSourceType] = useState("line");

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  return (
    <section style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", letterSpacing: 1 }}>AUDIO SOURCE</div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <select value={selectedDevice} onChange={(e) => setSelectedDevice(e.target.value)} style={{ padding: "8px 10px", borderRadius: 4, minWidth: 220 }}>
          <option value="">Select input device…</option>
          {devices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Input ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" checked={sourceType === "line"} onChange={() => setSourceType("line")} />
            Board / line feed
          </label>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="radio" checked={sourceType === "mic"} onChange={() => setSourceType("mic")} />
            Device mic
          </label>
        </div>
        {!stream ? (
          <button
            disabled={!selectedDevice}
            onClick={() => startCapture(selectedDevice, sourceType)}
            style={{ background: "var(--green)", color: "#06140c", border: "none", padding: "8px 16px", borderRadius: 4, fontWeight: 600, opacity: selectedDevice ? 1 : 0.4 }}
          >
            Start capture
          </button>
        ) : (
          <button onClick={stopCapture} style={{ background: "transparent", color: "var(--rose)", border: "1px solid var(--rose)", padding: "8px 16px", borderRadius: 4, fontWeight: 600 }}>
            Stop
          </button>
        )}
        <button onClick={refreshDevices} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13 }}>
          Refresh devices
        </button>
      </div>
      <div style={{ marginTop: 18 }}>
        <AudioLevelMeter bars={bars} level={level} active={!!stream} />
      </div>
      <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>
        {stream ? (
          <span style={{ color: "var(--green)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="pulse-dot" />
            capturing — {activeSourceType} profile ({activeDeviceId?.slice(0, 8)})
          </span>
        ) : (
          <span>○ idle</span>
        )}
      </div>
      {error && <div style={{ marginTop: 10, color: "var(--rose)", fontSize: 13 }}>{error}</div>}
      <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
        Bars react to input level — that's proof capture is live. There's still no transcription yet, so speaking won't produce text here, only movement in the meter above.
      </div>
    </section>
  );
}

function VerseSlide({ verse, translationName, size = "normal" }) {
  return (
    <>
      <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {verse.book_name} {verse.chapter}:{verse.verse} · {translationName}
      </div>
      <div style={{ marginTop: 8, fontSize: size === "large" ? 20 : 16, lineHeight: 1.6, textAlign: size === "large" ? "center" : "left" }}>
        {verse.text?.trim()}
      </div>
    </>
  );
}

function SlideRow({ slide, isPreview, isLive, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        textAlign: "left",
        background: isPreview ? "var(--bg)" : "transparent",
        border: `1px solid ${isPreview ? "var(--amber)" : "var(--border)"}`,
        borderRadius: 4,
        padding: "6px 10px",
        fontSize: 12,
        cursor: "pointer",
        color: "var(--text)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)" }}>
        {slide.book_name} {slide.chapter}:{slide.verse} <span style={{ color: "var(--text-muted)" }}>· {slide.translationAbbrev}</span>
      </span>
      {isLive && <span className="pulse-dot pulse-dot--live" />}
    </button>
  );
}

function NavButton({ children, disabled, onClick }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text)", padding: "6px 12px", borderRadius: 4, fontSize: 13, opacity: disabled ? 0.4 : 1 }}
    >
      {children}
    </button>
  );
}

function LiveScreen({ liveSlide, liveBusy, liveBoundaryMsg, onPrev, onNext, deckHasEntries }) {
  return (
    <div style={{ position: "sticky", top: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: liveSlide ? "var(--rose)" : "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
        {liveSlide && <span className="pulse-dot pulse-dot--live" />}
        LIVE
      </div>

      <div
        style={{
          aspectRatio: "16 / 9",
          background: "#000",
          border: `2px solid ${liveSlide ? "var(--rose)" : "var(--border)"}`,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
          overflow: "hidden",
        }}
      >
        {liveSlide ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 16, lineHeight: 1.5, color: "#fff" }}>{liveSlide.text?.trim()}</div>
            <div style={{ marginTop: 12, fontSize: 11, fontFamily: "var(--font-mono)", color: "rgba(255,255,255,0.5)" }}>
              {liveSlide.book_name} {liveSlide.chapter}:{liveSlide.verse} · {liveSlide.translationAbbrev}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>Nothing live yet</div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <NavButton disabled={!deckHasEntries || liveBusy} onClick={onPrev}>
            ← Prev
          </NavButton>
          <NavButton disabled={!deckHasEntries || liveBusy} onClick={onNext}>
            Next →
          </NavButton>
        </div>
        {liveBusy && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>…</span>}
      </div>

      {liveBoundaryMsg && <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>{liveBoundaryMsg}</div>}

      <div style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
        ← → keys move this directly (not while typing in a field).
      </div>
    </div>
  );
}

function SearchPanel({
  text,
  setText,
  translation,
  onTranslationChange,
  matches,
  suggestions,
  onApplySuggestion,
  onSelectMatch,
  onEnter,
  previewSlide,
  previewIndex,
  previewBusy,
  previewBoundaryMsg,
  lookupStatus,
  lookupError,
  deck,
  liveIndex,
  onPreviewPrev,
  onPreviewNext,
  onPushLive,
  onJumpPreview,
}) {
  return (
    <section style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", letterSpacing: 1 }}>MANUAL SEARCH</div>
        <select value={translation} onChange={onTranslationChange} style={{ padding: "5px 8px", borderRadius: 4, fontSize: 12 }}>
          {TRANSLATIONS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onEnter}
        placeholder='Try: "turn to Romans chapter 8 verse 28" — press Enter to preview'
        style={{ width: "100%", padding: "10px 12px", borderRadius: 4, marginTop: 12, fontSize: 15 }}
      />

      {suggestions.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {suggestions.map((b) => (
            <button
              key={b}
              onClick={() => onApplySuggestion(b)}
              style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-muted)", padding: "4px 10px", borderRadius: 12, fontSize: 12, cursor: "pointer" }}
            >
              {b}
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {matches.length === 0 && text.trim() && suggestions.length === 0 && (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>No reference detected in that text.</div>
        )}
        {matches.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid var(--border)", borderRadius: 4, padding: "10px 14px" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 15 }}>
                {m.book} {m.chapter}
                {m.verseStart ? `:${m.verseStart}${m.verseEnd ? "-" + m.verseEnd : ""}` : ""}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>"{m.matchedText}"</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <ConfidenceMeter confidence={m.confidence} />
              <button
                onClick={() => onSelectMatch(m)}
                style={{ background: "var(--amber)", color: "#241703", border: "none", padding: "6px 12px", borderRadius: 4, fontWeight: 600, fontSize: 13 }}
              >
                Preview
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: 16, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 10 }}>PREVIEW</div>

        {!previewSlide && lookupStatus === "idle" && <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Hit Preview on a match above, or press Enter.</div>}
        {lookupStatus === "loading" && <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Fetching…</div>}
        {lookupStatus === "error" && <div style={{ color: "var(--rose)", fontSize: 14 }}>{lookupError}</div>}

        {previewSlide && (
          <>
            <VerseSlide verse={previewSlide} translationName={previewSlide.translationName} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <NavButton disabled={previewBusy} onClick={onPreviewPrev}>
                  ← Previous
                </NavButton>
                <NavButton disabled={previewBusy} onClick={onPreviewNext}>
                  Next →
                </NavButton>
                {previewBusy && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>…</span>}
              </div>
              <button onClick={onPushLive} style={{ background: "var(--rose)", color: "#2a0a12", border: "none", padding: "8px 16px", borderRadius: 4, fontWeight: 600, fontSize: 13 }}>
                Push live
              </button>
            </div>
            {previewBoundaryMsg && <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)" }}>{previewBoundaryMsg}</div>}
          </>
        )}

        {deck.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontFamily: "var(--font-mono)" }}>OPENED SLIDES ({deck.length})</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
              {deck.map((s, i) => (
                <SlideRow key={i} slide={s} isPreview={i === previewIndex} isLive={i === liveIndex} onClick={() => onJumpPreview(i)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function App() {
  const [text, setText] = useState("");
  const [translation, setTranslation] = useState("kjv");
  const [activeMatch, setActiveMatch] = useState(null);
  const [lookupStatus, setLookupStatus] = useState("idle");
  const [lookupError, setLookupError] = useState("");

  const [deck, setDeck] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [liveIndex, setLiveIndex] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [previewBoundaryMsg, setPreviewBoundaryMsg] = useState("");
  const [liveBoundaryMsg, setLiveBoundaryMsg] = useState("");

  const deckRef = useRef([]);
  const previewIndexRef = useRef(null);
  const liveIndexRef = useRef(null);
  useEffect(() => { deckRef.current = deck; }, [deck]);
  useEffect(() => { previewIndexRef.current = previewIndex; }, [previewIndex]);
  useEffect(() => { liveIndexRef.current = liveIndex; }, [liveIndex]);

  const matches = parseScriptureReferences(text);

  // Includes a leading 1/2/3 (optionally "1st"/"2nd"/"3rd") as part of the
  // book query — without this, numbered books like "1 John" extracted an
  // empty query (the very first character is a digit) and could never
  // trigger a suggestion at all.
  const bookQueryRaw = text.match(/^([123](?:st|nd|rd)?\s*)?[^\d]*/)?.[0] || "";
  const bookQuery = bookQueryRaw.trim();
  const suggestions = matches.length === 0 && bookQuery.length >= 2 ? suggestBooks(bookQuery) : [];

  const applySuggestion = (book) => {
    const rest = text.slice(bookQueryRaw.length).replace(/^\s+/, "");
    setText(`${book} ${rest}`);
  };

  const selectMatch = (match) => {
    setPreviewBoundaryMsg("");
    setLookupStatus("loading");
    setActiveMatch(match);
  };

  const handleTranslationChange = (e) => {
    if (activeMatch) setLookupStatus("loading");
    setTranslation(e.target.value);
  };

  const handleEnter = (e) => {
    if (e.key !== "Enter" || matches.length === 0) return;
    const best = matches.reduce((a, b) => (b.confidence > a.confidence ? b : a), matches[0]);
    selectMatch(best);
  };

  const findInDeck = (bookName, chapter, verse, translationId) =>
    deckRef.current.findIndex((s) => s.book_name === bookName && s.chapter === chapter && s.verse === verse && s.translationId === translationId);

  const appendSlide = (slide, setIndex) => {
    const idx = deckRef.current.length;
    setDeck((prev) => [...prev, slide]);
    setIndex(idx);
  };

  // Single-verse fetch on match selection or translation change — the
  // deck only ever grows one verse at a time, via this or stepPane below,
  // never bulk-loaded from a range. That's the direct fix for "the slides
  // that should be open are the ones opened by clicking next or previous."
  useEffect(() => {
    if (!activeMatch) return;
    let ignore = false;
    (async () => {
      try {
        const verseNum = activeMatch.verseStart || 1;
        const data = await fetchVerseByRef(activeMatch.book, activeMatch.chapter, verseNum, translation);
        if (ignore) return;
        if (!data) throw new Error("Verse not found");
        const slide = slideFromVerse(data.verses[0], data, translation);
        const existing = findInDeck(slide.book_name, slide.chapter, slide.verse, slide.translationId);
        if (existing !== -1) setPreviewIndex(existing);
        else appendSlide(slide, setPreviewIndex);
        setLookupStatus("idle");
      } catch (err) {
        if (!ignore) {
          setLookupStatus("error");
          setLookupError(err.message);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [activeMatch, translation]);

  // Shared stepping logic for both Preview and Live nav, and the keyboard
  // handler. Reads current indices via refs so it's always safe to call
  // from any closure regardless of when that closure was created.
  const stepPane = async (which, direction) => {
    const index = which === "preview" ? previewIndexRef.current : liveIndexRef.current;
    const setIndex = which === "preview" ? setPreviewIndex : setLiveIndex;
    const setBusy = which === "preview" ? setPreviewBusy : setLiveBusy;
    const setBoundary = which === "preview" ? setPreviewBoundaryMsg : setLiveBoundaryMsg;
    if (index === null) return;
    const current = deckRef.current[index];
    if (!current) return;
    setBoundary("");

    const targetVerse = current.verse + direction;

    if (targetVerse >= 1) {
      const existing = findInDeck(current.book_name, current.chapter, targetVerse, current.translationId);
      if (existing !== -1) {
        setIndex(existing);
        return;
      }
      setBusy(true);
      const data = await fetchVerseByRef(current.book_name, current.chapter, targetVerse, current.translationId);
      setBusy(false);
      if (data) {
        appendSlide(slideFromVerse(data.verses[0], data, current.translationId), setIndex);
        return;
      }
      if (direction === 1) {
        const existingNextCh = findInDeck(current.book_name, current.chapter + 1, 1, current.translationId);
        if (existingNextCh !== -1) {
          setIndex(existingNextCh);
          return;
        }
        setBusy(true);
        const chData = await fetchVerseByRef(current.book_name, current.chapter + 1, 1, current.translationId);
        setBusy(false);
        if (chData) appendSlide(slideFromVerse(chData.verses[0], chData, current.translationId), setIndex);
        else setBoundary(`End of ${current.book_name}`);
      }
      return;
    }

    // Crossing backward over a chapter boundary — fetch the whole previous
    // chapter since we have no local way to know how many verses it has,
    // then take its last verse.
    if (current.chapter <= 1) {
      setBoundary(`Start of ${current.book_name}`);
      return;
    }
    setBusy(true);
    const chData = await fetchChapter(current.book_name, current.chapter - 1, current.translationId);
    setBusy(false);
    if (chData) {
      const lastVerse = chData.verses[chData.verses.length - 1];
      const existing = findInDeck(current.book_name, lastVerse.chapter, lastVerse.verse, current.translationId);
      if (existing !== -1) setIndex(existing);
      else appendSlide(slideFromVerse(lastVerse, chData, current.translationId), setIndex);
    } else {
      setBoundary(`Start of ${current.book_name}`);
    }
  };

  // Mount-once listener — safe because stepPane only ever reads fresh
  // state via refs, so a "stale" closure over it behaves identically to a
  // fresh one. Never fires while typing in an input or select.
  useEffect(() => {
    function handleKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        stepPane("live", 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        stepPane("live", -1);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previewSlide = previewIndex !== null ? deck[previewIndex] : null;
  const liveSlide = liveIndex !== null ? deck[liveIndex] : null;

  const pushLive = () => {
    if (previewIndex !== null) {
      setLiveIndex(previewIndex);
      setLiveBoundaryMsg("");
    }
  };

  return (
    <div style={{ maxWidth: 1160, margin: "0 auto", padding: "40px 20px" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)", letterSpacing: 1 }}>HARVESTERS LEKKI — PHASE 1</div>
        <h1 style={{ margin: "6px 0 4px", fontSize: 26 }}>Scripture &amp; Lyrics Assistant</h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>
          Manual search + audio capture smoke test. No live transcription or Supabase writes yet.
        </p>
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 640px", display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <AudioSourcePanel />
          <SearchPanel
            text={text}
            setText={setText}
            translation={translation}
            onTranslationChange={handleTranslationChange}
            matches={matches}
            suggestions={suggestions}
            onApplySuggestion={applySuggestion}
            onSelectMatch={selectMatch}
            onEnter={handleEnter}
            previewSlide={previewSlide}
            previewIndex={previewIndex}
            previewBusy={previewBusy}
            previewBoundaryMsg={previewBoundaryMsg}
            lookupStatus={lookupStatus}
            lookupError={lookupError}
            deck={deck}
            liveIndex={liveIndex}
            onPreviewPrev={() => stepPane("preview", -1)}
            onPreviewNext={() => stepPane("preview", 1)}
            onPushLive={pushLive}
            onJumpPreview={(i) => setPreviewIndex(i)}
          />
        </div>

        <div style={{ flex: "0 0 320px", minWidth: 280 }}>
          <LiveScreen
            liveSlide={liveSlide}
            liveBusy={liveBusy}
            liveBoundaryMsg={liveBoundaryMsg}
            deckHasEntries={liveIndex !== null}
            onPrev={() => stepPane("live", -1)}
            onNext={() => stepPane("live", 1)}
          />
        </div>
      </div>
    </div>
  );
}
