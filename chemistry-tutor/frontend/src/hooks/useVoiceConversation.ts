import { useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../services/voiceApi";
import type { Language } from "../types/tutor";
import { useAudioRecorder } from "./useAudioRecorder";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

interface UseVoiceConversationOptions {
  language: Language;
  sendQuestion: (question: string) => Promise<string | null>;
  speak: (text: string, language: Language) => void;
  stopSpeaking: () => void;
  isSpeaking: boolean;
}

export function useVoiceConversation({
  language,
  sendQuestion,
  speak,
  stopSpeaking,
  isSpeaking,
}: UseVoiceConversationOptions) {
  const [active, setActive] = useState(false);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorder = useAudioRecorder();

  // Keep the latest language/sendQuestion/active in refs so the recorder's
  // auto-stop callback (set up once per listening turn) always sees current
  // values without having to re-arm on every prop change.
  const latest = useRef({ language, sendQuestion, active });
  latest.current = { language, sendQuestion, active };

  function startListening() {
    setPhase("listening");
    recorder.start(handleAutoStopBlob);
  }

  async function handleAutoStopBlob(blob: Blob) {
    if (!latest.current.active) return;
    setPhase("thinking");

    let transcript = "";
    try {
      transcript = await transcribeAudio(blob, latest.current.language);
    } catch {
      setError("Could not transcribe audio. Listening again...");
    }

    if (!latest.current.active) return;

    if (!transcript.trim()) {
      // Likely background noise, not real speech — just listen again.
      startListening();
      return;
    }

    const answer = await latest.current.sendQuestion(transcript);
    if (!latest.current.active) return;

    if (answer === null) {
      setError("Something went wrong getting an answer. Listening again...");
      startListening();
      return;
    }

    setError(null);
    setPhase("speaking");
    speak(answer, latest.current.language);
  }

  // When speech finishes (isSpeaking flips true -> false) and we're still in
  // an active conversation, loop back to listening for the next turn.
  const wasSpeakingRef = useRef(false);
  useEffect(() => {
    if (wasSpeakingRef.current && !isSpeaking && active && phase === "speaking") {
      startListening();
    }
    wasSpeakingRef.current = isSpeaking;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSpeaking, active, phase]);

  function start() {
    setError(null);
    setActive(true);
    startListening();
  }

  function stop() {
    setActive(false);
    setPhase("idle");
    recorder.stop();
    stopSpeaking();
  }

  return { active, phase, error, start, stop };
}
