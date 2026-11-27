import { useEffect, useRef, useState } from "react";
import { synthesizeSinhalaSpeech } from "../services/voiceApi";

const LANGUAGE_PREFIX: Record<"en" | "si", string> = { en: "en", si: "si" };

// How fast the boundary-event "pulse" (English path, see below) decays back
// toward closed between words — higher = snappier open/close, lower = more
// lingering. Tuned by feel, not measured against anything.
const PULSE_DECAY = 0.82;

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mouthOpenness, setMouthOpenness] = useState(0);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Most browsers/OSes ship no Sinhala voice at all, so Sinhala falls back
  // to the backend's local MMS-based TTS model and plays the returned WAV
  // through a plain <audio> element instead of window.speechSynthesis.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Mouth-movement driving: for the Sinhala <audio> path we have a real
  // decoded audio buffer, so an AnalyserNode gives genuine amplitude-driven
  // movement. The browser's speechSynthesis API exposes no audio buffer at
  // all (a real platform limitation, not something fixable client-side) —
  // for that path we approximate using utterance.onboundary word-timing
  // events instead: each word boundary "pulses" the mouth open, and it
  // decays back toward closed between words, which reads as natural
  // chatter even without true per-phoneme sync.
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const pulseRef = useRef(0);

  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => {
    if (!supported) return;

    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
  }, [supported]);

  function hasVoiceFor(language: "en" | "si"): boolean {
    const prefix = LANGUAGE_PREFIX[language];
    return voices.some((v) => v.lang.toLowerCase().startsWith(prefix));
  }

  function stopMouthAnimation() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setMouthOpenness(0);
  }

  // Runs continuously while speaking. Reads real audio amplitude when an
  // AnalyserNode is active (Sinhala), otherwise decays the word-boundary
  // pulse value (English) — either way, one unified loop driving the same
  // mouthOpenness number the Avatar renders from.
  function runMouthAnimationLoop() {
    const analyser = analyserRef.current;
    if (analyser) {
      const samples = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(samples);
      let sumSquares = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sumSquares += centered * centered;
      }
      const rms = Math.sqrt(sumSquares / samples.length);
      // Amplitude is usually small for normal speech volume; scale up so
      // typical speech maps to a visually noticeable mouth movement.
      setMouthOpenness(Math.min(1, rms * 6));
    } else {
      pulseRef.current *= PULSE_DECAY;
      setMouthOpenness(pulseRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(runMouthAnimationLoop);
  }

  async function speakViaBackend(text: string) {
    try {
      const blob = await synthesizeSinhalaSpeech(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsSpeaking(true);
        try {
          const audioContext = new AudioContext();
          audioContextRef.current = audioContext;
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 1024;
          audioContext.createMediaElementSource(audio).connect(analyser);
          analyser.connect(audioContext.destination);
          analyserRef.current = analyser;
        } catch {
          // Amplitude analysis is a visual nicety — if it fails for any
          // reason (e.g. a very old browser), speech still plays normally.
        }
        animationFrameRef.current = requestAnimationFrame(runMouthAnimationLoop);
      };
      audio.onended = () => {
        setIsSpeaking(false);
        stopMouthAnimation();
        analyserRef.current = null;
        audioContextRef.current?.close().catch(() => {});
        audioContextRef.current = null;
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
        stopMouthAnimation();
        URL.revokeObjectURL(url);
      };

      await audio.play();
    } catch {
      setIsSpeaking(false);
    }
  }

  function speak(text: string, language: "en" | "si") {
    if (!supported) return;
    window.speechSynthesis.cancel();
    audioRef.current?.pause();
    stopMouthAnimation();

    if (language === "si" && !hasVoiceFor("si")) {
      void speakViaBackend(text);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const prefix = LANGUAGE_PREFIX[language];
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = language === "si" ? "si-LK" : "en-US";
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      analyserRef.current = null; // no real audio buffer on this path
      animationFrameRef.current = requestAnimationFrame(runMouthAnimationLoop);
    };
    utterance.onboundary = () => {
      pulseRef.current = 1;
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      stopMouthAnimation();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      stopMouthAnimation();
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel();
    audioRef.current?.pause();
    stopMouthAnimation();
    setIsSpeaking(false);
  }

  return { supported, isSpeaking, mouthOpenness, speak, stop, hasVoiceFor };
}
