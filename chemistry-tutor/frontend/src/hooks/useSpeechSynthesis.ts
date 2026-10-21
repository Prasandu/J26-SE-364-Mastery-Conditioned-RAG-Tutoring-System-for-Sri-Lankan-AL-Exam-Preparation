import { useEffect, useRef, useState } from "react";
import { synthesizeSinhalaSpeech } from "../services/voiceApi";

const LANGUAGE_PREFIX: Record<"en" | "si", string> = { en: "en", si: "si" };

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Most browsers/OSes ship no Sinhala voice at all, so Sinhala falls back
  // to the backend's local MMS-based TTS model and plays the returned WAV
  // through a plain <audio> element instead of window.speechSynthesis.
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  async function speakViaBackend(text: string) {
    try {
      const blob = await synthesizeSinhalaSpeech(text);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
        setIsSpeaking(false);
        URL.revokeObjectURL(url);
      };
      audio.onerror = () => {
        setIsSpeaking(false);
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

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }

  function stop() {
    if (supported) window.speechSynthesis.cancel();
    audioRef.current?.pause();
    setIsSpeaking(false);
  }

  return { supported, isSpeaking, speak, stop, hasVoiceFor };
}
