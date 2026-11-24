import { useRef, useState } from "react";

// Silence has to persist this long before an auto-stop-armed recording ends
// on its own, so a normal mid-sentence breath doesn't cut the student off.
const SILENCE_STOP_MS = 1200;
// Volume (0-1 RMS) above which we consider the student to be actively
// speaking. Below this is treated as silence/background noise.
const SPEECH_VOLUME_THRESHOLD = 0.04;
// Hard safety cap so a recording never runs forever if silence is never
// detected (e.g. a noisy room masking the student going quiet).
const MAX_RECORDING_MS = 20_000;

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const vadFrameRef = useRef<number | null>(null);
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function teardownVad() {
    if (vadFrameRef.current !== null) {
      cancelAnimationFrame(vadFrameRef.current);
      vadFrameRef.current = null;
    }
    if (maxDurationTimeoutRef.current !== null) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }

  function finishRecording(recorder: MediaRecorder): Promise<Blob> {
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        recorder.stream.getTracks().forEach((track) => track.stop());
        setIsRecording(false);
        resolve(blob);
      };
      recorder.stop();
    });
  }

  function armSilenceDetector(stream: MediaStream, recorder: MediaRecorder, onAutoStop: (blob: Blob) => void) {
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    audioContext.createMediaStreamSource(stream).connect(analyser);

    const samples = new Uint8Array(analyser.fftSize);
    let hasSpoken = false;
    let silenceStartedAt: number | null = null;

    function tick() {
      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / samples.length);

      if (rms >= SPEECH_VOLUME_THRESHOLD) {
        hasSpoken = true;
        silenceStartedAt = null;
      } else if (hasSpoken) {
        if (silenceStartedAt === null) silenceStartedAt = performance.now();
        if (performance.now() - silenceStartedAt >= SILENCE_STOP_MS) {
          teardownVad();
          finishRecording(recorder).then(onAutoStop);
          return;
        }
      }

      vadFrameRef.current = requestAnimationFrame(tick);
    }

    vadFrameRef.current = requestAnimationFrame(tick);
    maxDurationTimeoutRef.current = setTimeout(() => {
      teardownVad();
      finishRecording(recorder).then(onAutoStop);
    }, MAX_RECORDING_MS);
  }

  async function start(onAutoStop?: (blob: Blob) => void) {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      if (onAutoStop) armSilenceDetector(stream, recorder, onAutoStop);
    } catch {
      setError("Microphone access denied or unavailable.");
    }
  }

  function stop(): Promise<Blob | null> {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return Promise.resolve(null);
    teardownVad();
    return finishRecording(recorder);
  }

  return { isRecording, error, start, stop };
}
