import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";

interface SpeakButtonProps {
  text: string;
  language: "en" | "si";
}

export function SpeakButton({ text, language }: SpeakButtonProps) {
  const { supported, isSpeaking, speak, stop, hasVoiceFor } = useSpeechSynthesis();

  if (!supported) return null;

  const voiceAvailable = hasVoiceFor(language);

  return (
    <button
      type="button"
      onClick={() => (isSpeaking ? stop() : speak(text, language))}
      title={
        voiceAvailable || language === "si"
          ? isSpeaking
            ? "Stop"
            : "Listen"
          : "No English voice found on this device — will use default voice"
      }
      className={`rounded px-2 py-1 text-xs ${
        isSpeaking ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {isSpeaking ? "⏹ Stop" : "🔊 Listen"}
    </button>
  );
}
