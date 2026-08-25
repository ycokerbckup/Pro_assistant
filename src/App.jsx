import { useState, useEffect, useRef } from "react";
import { parseScriptureReferences } from "./lib/scriptureParser";
import { suggestBooks } from "./lib/bookAutocomplete";
import { useAudioCapture } from "./hooks/useAudioCapture";
import { useAudioLevel } from "./hooks/useAudioLevel";

// Public-domain source — see schema.sql header. Swap for API.Bible if the
// service reads from a copyrighted translation (NIV/AMP/NKJV).
const VERSE_API = "https://bible-api.com";

// Only public-domain translations bible-api.com actually serves — confirmed
// against its own docs, not guessed. NIV/AMP/NKJV/NLT/TPT/ESV/TLB/MSG/AMPC
// aren't on this list because they're copyrighted; each needs its own
// license (API.Bible or the publisher directly) before it can be added.
const TRANSLATIONS = [
  { id: "kjv", label: "King James Version" },
  { id: "web", label: "World English Bible" },
  { id: "asv", label: "American Standard Version" },
  { id: "bbe", label: "Bible in Basic English" },
  { id: "darby", label: "Darby Bible" },
];

function ConfidenceMeter({ confidence }) {
  const filled = Math.round(confidence * 5);
  const color = confidence >= 0.85 ? "var(--green)" : confidence >= 0.6 ? "var(--amber)" : "var(--rose)";
  return (
    <div style={{ display: "flex", gap: 3 }} aria-label={`Confidence ${Math.round(confidence * 100)}%`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 10,
            height: 14,
            background: i < filled ? color : "var(--border)",
            borderRadius: 1,
            transition: "background 200ms ease",
          }}
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
      <div
        style={{
          marginTop: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-muted)",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>INPUT LEVEL</span>
        <span style={{ color: active ? "var(--text)" : "var(--text-muted)" }}>{active ? `${level}%` : "—"}</span>
      </div>
    </div>
  );
}

function AudioSourcePanel() {
  const { devices, activeDeviceId, activeSourceType, stream, error, refreshDevices, startCapture, stopCapture } =
    useAudioCapture();
  const { bars, level } = useAudioLevel(stream);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [sourceType, setSourceType] = useState("line");

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  return (
    <section style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", letterSpacing: 1 }}>
        AUDIO SOURCE
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 4, minWidth: 220 }}
        >
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
            style={{
              background: "var(--green)",
              color: "#06140c",
              border: "none",
              padding: "8px 16px",
              borderRadius: 4,
              fontWeight: 600,
              opacity: selectedDevice ? 1 : 0.4,
            }}
          >
            Start capture
          </button>
        ) : (
          <button
            onClick={stopCapture}
            style={{
              background: "transparent",
              color: "var(--rose)",
              border: "1px solid var(--rose)",
              padding: "8px 16px",
              borderRadius: 4,
              fontWeight: 600,
            }}
          >
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
        Bars react to input level — that's proof capture is live. There's still no transcription
        yet (that's the STT service, next phase), so speaking won't produce text here, only movement
        in the meter above.
      </div>
    </section>
  );
}

function VerseSlide({ verse, translationName }) {
  return (
    <>
      <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
        {verse.book_name} {verse.chapter}:{verse.verse} · {translationName}
      </div>
      <div style={{ marginTop: 8, fontSize: 16, lineHeight: 1.6 }}>{verse.text?.trim()}</div>
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
        {slide.book_name} {slide.chapter}:{slide.verse}{" "}
        <span style={{ color: "var(--text-muted)" }}>· {slide.translationAbbrev}</span>
      </span>
      {isLive && <span className="pulse-dot pulse-dot--live" />}
    </button>
  );
}

function ScriptureSearchPanel() {
  const [text, setText] = useState("");
  const [translation, setTranslation] = useState("kjv");
  const [activeMatch, setActiveMatch] = useState(null);
  const [lookupStatus, setLookupStatus] = useState("idle"); // idle | loading | error
  const [lookupError, setLookupError] = useState("");

  // The whole slide deck — every verse ever opened this session, in order.
  // Preview and Live each get an independent pointer into it, mirroring a
  // broadcast preview/program bus rather than a single shared cursor.
  const [deck, setDeck] = useState([]);
  const [previewIndex, setPreviewIndex] = useState(null);
  const [liveIndex, setLiveIndex] = useState(null);
  const deckRef = useRef([]);

  useEffect(() => {
    deckRef.current = deck;
  }, [deck]);

  const matches = parseScriptureReferences(text);

  // Fuzzy, visible, clickable — never auto-applied. See bookAutocomplete.js.
  const bookQuery = (text.match(/^[^\d]*/)?.[0] || "").trim();
  const suggestions = matches.length === 0 && bookQuery.length >= 2 ? suggestBooks(bookQuery) : [];

  const applySuggestion = (book) => {
    const rest = text.slice(bookQuery.length).replace(/^\s+/, "");
    setText(`${book} ${rest}`);
  };

  const selectMatch = (match) => {
    setLookupStatus("loading");
    setActiveMatch(match);
  };

  const handleTranslationChange = (e) => {
    if (activeMatch) setLookupStatus("loading");
    setTranslation(e.target.value);
  };

  // Race-guarded fetch: switching translation or match again before a
  // slower request resolves drops the stale response instead of letting
  // it overwrite a newer one.
  useEffect(() => {
    if (!activeMatch) return;
    let ignore = false;

    (async () => {
      try {
        const range = activeMatch.verseStart
          ? `${activeMatch.verseStart}${activeMatch.verseEnd ? "-" + activeMatch.verseEnd : ""}`
          : "";
        const ref = `${activeMatch.book}+${activeMatch.chapter}${range ? ":" + range : ""}`;
        const res = await fetch(`${VERSE_API}/${encodeURIComponent(ref)}?translation=${translation}`);
        if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
        const data = await res.json();
        if (ignore) return;

        const translationAbbrev = (data.translation_id || translation).toUpperCase();
        const newSlides = (data.verses || []).map((v) => ({
          book_name: v.book_name,
          chapter: v.chapter,
          verse: v.verse,
          text: v.text,
          translationName: data.translation_name,
          translationAbbrev,
        }));

        const startIndex = deckRef.current.length;
        setDeck((prev) => [...prev, ...newSlides]);
        setPreviewIndex(startIndex);
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

  // Global arrow-key handler advances Live directly, matching how a single
  // operator actually drives ProPresenter during a live service — but never
  // while focus is in a text input or select, or typing "2" for a verse
  // number would also nudge the live slide.
  useEffect(() => {
    function handleKey(e) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        setLiveIndex((i) => (i === null ? null : Math.min(deck.length - 1, i + 1)));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        setLiveIndex((i) => (i === null ? null : Math.max(0, i - 1)));
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [deck.length]);

  const previewSlide = previewIndex !== null ? deck[previewIndex] : null;
  const liveSlide = liveIndex !== null ? deck[liveIndex] : null;

  const previewPrev = () => setPreviewIndex((i) => (i === null ? null : Math.max(0, i - 1)));
  const previewNext = () => setPreviewIndex((i) => (i === null ? null : Math.min(deck.length - 1, i + 1)));
  const livePrev = () => setLiveIndex((i) => (i === null ? null : Math.max(0, i - 1)));
  const liveNext = () => setLiveIndex((i) => (i === null ? null : Math.min(deck.length - 1, i + 1)));
  const pushLive = () => {
    if (previewIndex !== null) setLiveIndex(previewIndex);
  };

  const navBtnStyle = (disabled) => ({
    background: "transparent",
    border: "1px solid var(--border)",
    color: "var(--text)",
    padding: "6px 12px",
    borderRadius: 4,
    fontSize: 13,
    opacity: disabled ? 0.4 : 1,
  });

  return (
    <section style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", letterSpacing: 1 }}>
          MANUAL SEARCH
        </div>
        <select
          value={translation}
          onChange={handleTranslationChange}
          style={{ padding: "5px 8px", borderRadius: 4, fontSize: 12 }}
        >
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
        placeholder='Try: "turn to Romans chapter 8 verse 28"'
        style={{ width: "100%", padding: "10px 12px", borderRadius: 4, marginTop: 12, fontSize: 15 }}
      />

      {suggestions.length > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {suggestions.map((b) => (
            <button
              key={b}
              onClick={() => applySuggestion(b)}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                color: "var(--text-muted)",
                padding: "4px 10px",
                borderRadius: 12,
                fontSize: 12,
                cursor: "pointer",
              }}
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
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "10px 14px",
            }}
          >
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
                onClick={() => selectMatch(m)}
                style={{
                  background: "var(--amber)",
                  color: "#241703",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Preview
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview — updates as you browse, switch translation, or click a past slide. Never what the congregation sees. */}
      <div style={{ marginTop: 16, padding: 16, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 10 }}>
          PREVIEW
        </div>

        {!previewSlide && lookupStatus === "idle" && (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Hit Preview on a match above to browse it here.</div>
        )}
        {lookupStatus === "loading" && <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Fetching…</div>}
        {lookupStatus === "error" && <div style={{ color: "var(--rose)", fontSize: 14 }}>{lookupError}</div>}

        {previewSlide && (
          <>
            <VerseSlide verse={previewSlide} translationName={previewSlide.translationName} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button disabled={previewIndex === 0} onClick={previewPrev} style={navBtnStyle(previewIndex === 0)}>
                  ← Previous
                </button>
                <button
                  disabled={previewIndex >= deck.length - 1}
                  onClick={previewNext}
                  style={navBtnStyle(previewIndex >= deck.length - 1)}
                >
                  Next →
                </button>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)", marginLeft: 4 }}>
                  {previewIndex + 1} / {deck.length}
                </span>
              </div>
              <button
                onClick={pushLive}
                style={{
                  background: "var(--rose)",
                  color: "#2a0a12",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                Push live
              </button>
            </div>
          </>
        )}

        {deck.length > 0 && (
          <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontFamily: "var(--font-mono)" }}>
              OPENED SLIDES ({deck.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
              {deck.map((s, i) => (
                <SlideRow key={i} slide={s} isPreview={i === previewIndex} isLive={i === liveIndex} onClick={() => setPreviewIndex(i)} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Live — only changes on Push live, its own Prev/Next, or the arrow keys. This is the congregation-facing state. */}
      <div
        style={{
          marginTop: 12,
          padding: 16,
          background: "var(--bg)",
          border: liveSlide ? "1px solid var(--rose)" : "1px solid var(--border)",
          borderRadius: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: liveSlide ? "var(--rose)" : "var(--text-muted)",
            letterSpacing: 1,
            marginBottom: liveSlide ? 10 : 0,
          }}
        >
          {liveSlide && <span className="pulse-dot pulse-dot--live" />}
          LIVE
        </div>
        {liveSlide ? (
          <>
            <VerseSlide verse={liveSlide} translationName={liveSlide.translationName} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button disabled={liveIndex === 0} onClick={livePrev} style={navBtnStyle(liveIndex === 0)}>
                  ← Previous
                </button>
                <button disabled={liveIndex >= deck.length - 1} onClick={liveNext} style={navBtnStyle(liveIndex >= deck.length - 1)}>
                  Next →
                </button>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                ← → keys also work (not while typing)
              </span>
            </div>
          </>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Nothing live yet.</div>
        )}
      </div>
    </section>
  );
}

export default function App() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)", letterSpacing: 1 }}>
          HARVESTERS LEKKI — PHASE 1
        </div>
        <h1 style={{ margin: "6px 0 4px", fontSize: 26 }}>Scripture &amp; Lyrics Assistant</h1>
        <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>
          Manual search + audio capture smoke test. No live transcription or Supabase writes yet —
          this proves the parser and the capture layer work before the next phase wires them together.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <AudioSourcePanel />
        <ScriptureSearchPanel />
      </div>
    </div>
  );
}
