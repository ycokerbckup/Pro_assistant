/**
 * useAudioLevel.js
 *
 * This is the direct fix for "I spoke and nothing happened": the capture
 * panel proved a MediaStream connects, but gave zero visual feedback that
 * it was actually receiving signal. There's still no transcription here —
 * that's the STT service, a later phase — but you should be able to SEE
 * the mic react when you speak, which this provides via a live frequency
 * readout from a Web Audio AnalyserNode.
 */

import { useState, useEffect, useRef } from "react";

const BAR_COUNT = 28;

export function useAudioLevel(stream) {
  const [bars, setBars] = useState(() => new Array(BAR_COUNT).fill(0));
  const [level, setLevel] = useState(0); // 0-100, overall input level
  const rafRef = useRef(null);

  useEffect(() => {
    if (!stream) {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioContextClass();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64; // 32 frequency bins — enough for a readable bar spread
    analyser.smoothingTimeConstant = 0.75; // damps jitter without feeling laggy
    source.connect(analyser);

    const freqData = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(freqData);
      const scaled = Array.from(freqData.slice(0, BAR_COUNT)).map((v) => Math.round((v / 255) * 100));
      setBars(scaled);
      setLevel(Math.round(scaled.reduce((a, b) => a + b, 0) / scaled.length));
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      source.disconnect();
      ctx.close();
      // Reset here, on teardown of the real audio graph — not by calling
      // setState directly in the effect body when stream is falsy, which
      // is a render-during-effect anti-pattern oxlint correctly flagged.
      setBars(new Array(BAR_COUNT).fill(0));
      setLevel(0);
    };
  }, [stream]);

  return { bars, level };
}
