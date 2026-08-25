import { useState, useEffect, useCallback } from "react";
import { parseScriptureReferences } from "./lib/scriptureParser";
import { useAudioCapture } from "./hooks/useAudioCapture";

// Public-domain source — see schema.sql header. Swap for API.Bible if the
// service reads from a copyrighted translation (NIV/AMP/NKJV).
const VERSE_API = "https://bible-api.com";

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
          }}
        />
      ))}
    </div>
  );
}

function AudioSourcePanel() {
  const { devices, activeDeviceId, activeSourceType, stream, error, refreshDevices, startCapture, stopCapture } =
    useAudioCapture();
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

      <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-muted)" }}>
        {stream ? (
          <span style={{ color: "var(--green)" }}>
            ● capturing — {activeSourceType} profile ({activeDeviceId?.slice(0, 8)})
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
        This panel only proves capture works end to end — device picked up, stream live. It does not
        transcribe yet. That's the STT service, next phase.
      </div>
    </section>
  );
}

function ScriptureSearchPanel() {
  const [text, setText] = useState("");
  const [lookup, setLookup] = useState({ status: "idle" }); // idle | loading | done | error

  const matches = parseScriptureReferences(text);

  const fetchVerse = useCallback(async (match) => {
    setLookup({ status: "loading" });
    try {
      const range = match.verseStart
        ? `${match.verseStart}${match.verseEnd ? "-" + match.verseEnd : ""}`
        : "";
      const ref = `${match.book}+${match.chapter}${range ? ":" + range : ""}`;
      const res = await fetch(`${VERSE_API}/${encodeURIComponent(ref)}?translation=kjv`);
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      const data = await res.json();
      setLookup({ status: "done", data });
    } catch (err) {
      setLookup({ status: "error", message: err.message });
    }
  }, []);

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
        MANUAL SEARCH
      </div>

      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setLookup({ status: "idle" });
        }}
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
                onClick={() => fetchVerse(m)}
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
                Look up
              </button>
            </div>
          </div>
        ))}
      </div>

      {lookup.status === "loading" && (
        <div style={{ marginTop: 16, color: "var(--text-muted)", fontSize: 14 }}>Fetching…</div>
      )}
      {lookup.status === "error" && (
        <div style={{ marginTop: 16, color: "var(--rose)", fontSize: 14 }}>{lookup.message}</div>
      )}
      {lookup.status === "done" && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 4,
          }}
        >
          <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
            {lookup.data.reference} · {lookup.data.translation_name || "KJV"}
          </div>
          <div style={{ marginTop: 8, fontSize: 16, lineHeight: 1.6 }}>{lookup.data.text?.trim()}</div>
        </div>
      )}
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
