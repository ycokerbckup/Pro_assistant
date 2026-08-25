import { useState, useEffect } from "react";
import { parseScriptureReferences } from "./lib/scriptureParser";
import { useAudioCapture } from "./hooks/useAudioCapture";
import { useAudioLevel } from "./hooks/useAudioLevel";

// Public-domain source — see schema.sql header. Swap for API.Bible if the
// service reads from a copyrighted translation (NIV/AMP/NKJV).
const VERSE_API = "https://bible-api.com";

// Only public-domain translations bible-api.com actually serves — confirmed
// against its own docs, not guessed. NIV/AMP/NKJV aren't on this list because
// they're copyrighted; that needs API.Bible with a real license instead.
const TRANSLATIONS = [
  { id: "kjv", label: "King James Version" },
  { id: "web", label: "World English Bible" },
  { id: "asv", label: "American Standard Version" },
  { id: "bbe", label: "Bible in Basic English" },
  { id: "darby", label: "Darby Bible" },
];

function ConfidenceMeter({ confidence }) {
  // Five-tick readout instead of a percentage or progress bar — legible at
  // a glance from a few feet away in a dim booth, which a precise number
  // isn't. Color band communicates the same thing a number would, faster.
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
  // The actual fix for "nothing happens when I speak" — this is live signal,
  // not decoration. Bars that don't move while you're talking means the
  // capture itself is broken; bars that move confirm it's working and the
  // silence is just "no transcription yet," which is expected right now.
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 3,
          height: 48,
          padding: "0 2px",
        }}
        aria-hidden="true"
      >
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
    <section
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: 20,
      }}
    >
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

        <button
          onClick={refreshDevices}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 13 }}
        >
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

      {error && (
        <div style={{ marginTop: 10, color: "var(--rose)", fontSize: 13 }}>
          {error}
        </div>
      )}

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

function ScriptureSearchPanel() {
  const [text, setText] = useState("");
  const [translation, setTranslation] = useState("kjv");
  const [activeMatch, setActiveMatch] = useState(null); // what the preview is browsing
  const [slideIndex, setSlideIndex] = useState(0);
  const [lookup, setLookup] = useState({ status: "idle" }); // idle | loading | done | error
  const [liveSlide, setLiveSlide] = useState(null); // what's actually pushed live

  const matches = parseScriptureReferences(text);

  const selectMatch = (match) => {
    setLookup({ status: "loading" });
    setActiveMatch(match);
  };

  const handleTranslationChange = (e) => {
    if (activeMatch) setLookup({ status: "loading" });
    setTranslation(e.target.value);
  };

  // Fetches when a match is selected or translation changes while one's
  // active. `ignore` guards against a race: if translation is switched
  // again before a slower request resolves, that stale response is
  // dropped instead of overwriting the newer one. Loading state is set by
  // the event handlers above, not synchronously here — this effect's own
  // setState calls only ever fire inside the async callback, after a real
  // external system (the fetch) has actually resolved.
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
        if (!ignore) {
          setLookup({ status: "done", data });
          setSlideIndex(0);
        }
      } catch (err) {
        if (!ignore) setLookup({ status: "error", message: err.message });
      }
    })();

    return () => {
      ignore = true;
    };
  }, [activeMatch, translation]);

  const verses = lookup.status === "done" ? lookup.data.verses || [] : [];
  const currentVerse = verses[slideIndex];
  const translationName = lookup.status === "done" ? lookup.data.translation_name : "";

  const pushLive = () => {
    if (!currentVerse) return;
    setLiveSlide({ verse: currentVerse, translationName });
  };

  return (
    <section
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: 20,
      }}
    >
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

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {matches.length === 0 && text.trim() && (
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
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>“{m.matchedText}”</div>
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

      {/* Preview — updates as you browse or switch translation. Never what the congregation sees. */}
      <div
        style={{
          marginTop: 16,
          padding: 16,
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 4,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-muted)",
            letterSpacing: 1,
            marginBottom: 10,
          }}
        >
          PREVIEW
        </div>

        {!activeMatch && (
          <div style={{ color: "var(--text-muted)", fontSize: 14 }}>
            Hit Preview on a match above to browse it here.
          </div>
        )}
        {lookup.status === "loading" && <div style={{ color: "var(--text-muted)", fontSize: 14 }}>Fetching…</div>}
        {lookup.status === "error" && <div style={{ color: "var(--rose)", fontSize: 14 }}>{lookup.message}</div>}
        {lookup.status === "done" && currentVerse && (
          <>
            <VerseSlide verse={currentVerse} translationName={translationName} />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  disabled={slideIndex === 0}
                  onClick={() => setSlideIndex((i) => Math.max(0, i - 1))}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    padding: "6px 12px",
                    borderRadius: 4,
                    fontSize: 13,
                    opacity: slideIndex === 0 ? 0.4 : 1,
                  }}
                >
                  ← Previous
                </button>
                <button
                  disabled={slideIndex >= verses.length - 1}
                  onClick={() => setSlideIndex((i) => Math.min(verses.length - 1, i + 1))}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                    padding: "6px 12px",
                    borderRadius: 4,
                    fontSize: 13,
                    opacity: slideIndex >= verses.length - 1 ? 0.4 : 1,
                  }}
                >
                  Next →
                </button>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "var(--text-muted)",
                    alignSelf: "center",
                    marginLeft: 4,
                  }}
                >
                  {slideIndex + 1} / {verses.length}
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
      </div>

      {/* Live — only changes when Push live is clicked. This is the congregation-facing state. */}
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
          <VerseSlide verse={liveSlide.verse} translationName={liveSlide.translationName} />
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
