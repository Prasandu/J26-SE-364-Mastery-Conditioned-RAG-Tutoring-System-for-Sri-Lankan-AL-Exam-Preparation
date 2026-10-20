import { useEffect, useRef, useState } from "react";

const LANGUAGE_PREFIX: Record<"en" | "si", string> = { en: "en", si: "si" };

export function useSpeechSynthesis() {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

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

  function speak(text: string, language: "en" | "si") {
    if (!supported) return;
    window.speechSynthesis.cancel();

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
    if (!supported) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }

  return { supported, isSpeaking, speak, stop, hasVoiceFor };
}
