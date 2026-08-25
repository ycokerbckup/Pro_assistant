/**
 * useAudioCapture.js
 *
 * Single capture layer covering both audio sources requested: a direct
 * sound-card/line feed from the board, and the device's own microphone.
 * Both are just entries in navigator.mediaDevices — no separate code paths,
 * just a device picker plus a constraint profile keyed to source type.
 *
 * Constraint profiles are NOT the same for both sources, deliberately:
 *   - 'mic'  : echoCancellation/noiseSuppression/autoGainControl ON.
 *              These are voice-call algorithms — they help when a room mic
 *              is picking up ambient noise and speaker bleed.
 *   - 'line' : all three OFF. A clean board feed has no echo problem to
 *              correct, and running it through voice-call processing
 *              degrades the signal you actually want full fidelity on.
 *
 * If you want suppression forced on for both sources regardless, change
 * CONSTRAINT_PROFILES.line to match .mic — but that's overriding a
 * deliberate default, not fixing an oversight.
 */

import { useState, useCallback, useRef } from "react";

export const CONSTRAINT_PROFILES = {
  mic: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  line: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

export function useAudioCapture() {
  const [devices, setDevices] = useState([]);
  const [activeDeviceId, setActiveDeviceId] = useState(null);
  const [activeSourceType, setActiveSourceType] = useState(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const streamRef = useRef(null);

  /**
   * Populate the device list. Device labels are blank until permission has
   * been granted at least once, so this requests (and immediately releases)
   * a throwaway stream first if nothing has been granted yet.
   */
  const refreshDevices = useCallback(async () => {
    try {
      if (!streamRef.current) {
        const temp = await navigator.mediaDevices.getUserMedia({ audio: true });
        temp.getTracks().forEach((t) => t.stop());
      }
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices(all.filter((d) => d.kind === "audioinput"));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  /**
   * @param {string} deviceId - from the `devices` list
   * @param {'mic'|'line'} sourceType - selects the constraint profile
   */
  const startCapture = useCallback(async (deviceId, sourceType = "mic") => {
    if (!CONSTRAINT_PROFILES[sourceType]) {
      throw new Error(`Unknown sourceType "${sourceType}" — expected "mic" or "line"`);
    }
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          ...CONSTRAINT_PROFILES[sourceType],
        },
      });
      streamRef.current = newStream;
      setStream(newStream);
      setActiveDeviceId(deviceId);
      setActiveSourceType(sourceType);
      setError(null);
      return newStream;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const stopCapture = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
    setActiveDeviceId(null);
    setActiveSourceType(null);
  }, []);

  return {
    devices,
    activeDeviceId,
    activeSourceType,
    stream,
    error,
    refreshDevices,
    startCapture,
    stopCapture,
  };
}
