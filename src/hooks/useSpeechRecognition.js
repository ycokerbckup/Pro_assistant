/**
 * useSpeechRecognition.js
 *
 * Zero-cost, zero-backend live transcription via the browser's built-in
 * Web Speech API. This is a deliberate first pass, not the final answer —
 * real limitations, stated plainly rather than discovered live:
 *
 * 1. Chrome/Edge have full support. Safari works via the webkitSpeechRecognition
 *    prefix (macOS 14.1+). Firefox ships it disabled behind a flag — won't
 *    work there without the operator changing about:config.
 * 2. This API manages its OWN microphone access internally — it does NOT
 *    take the MediaStream from useAudioCapture. It ignores the board/line
 *    vs mic device picker entirely and listens on the browser/OS default
 *    input device. The operator may see a second, separate mic permission
 *    prompt distinct from the one for the level meter.
 * 3. No custom vocabulary support — unlike Deepgram's keyword boosting,
 *    there's no way to bias recognition toward Bible book names, so
 *    accuracy on less common ones (Habakkuk, Zephaniah) will likely be
 *    worse than a purpose-built STT provider.
 *
 * Chrome stops the recognizer after a period of silence or ~60s in some
 * versions — this restarts it automatically while the operator has it
 * toggled on, so it behaves like one continuous session instead of
 * silently going quiet mid-service.
 */

import { useState, useRef, useCallback } from "react";

export function useSpeechRecognition(onFinalTranscript) {
  const [supported] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  const [listening, setListening] = useState(false);
  const [interimText, setInterimText] = useState("");
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  const start = useCallback(() => {
    if (!supported) {
      setError("Speech recognition isn't supported in this browser. Try Chrome, Edge, or Safari.");
      return;
    }
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          onFinalTranscript(result[0].transcript);
        } else {
          interim += result[0].transcript;
        }
      }
      setInterimText(interim);
    };

    recognition.onerror = (event) => {
      // 'no-speech' fires constantly during normal pauses between sentences
      // — that's not a real error, just silence, and surfacing it would
      // make the UI flash a scary message every few seconds during normal use.
      if (event.error !== "no-speech") setError(event.error);
    };

    recognition.onend = () => {
      // Only restart if this is still the active recognizer — stop()
      // clears the ref first specifically so this check prevents a
      // just-stopped session from restarting itself.
      if (recognitionRef.current === recognition) {
        try {
          recognition.start();
        } catch {
          // Already starting — benign, ignore.
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setError(null);
  }, [supported, onFinalTranscript]);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      const r = recognitionRef.current;
      recognitionRef.current = null; // clear first so onend doesn't auto-restart it
      r.stop();
    }
    setListening(false);
    setInterimText("");
  }, []);

  return { supported, listening, interimText, error, start, stop };
}
