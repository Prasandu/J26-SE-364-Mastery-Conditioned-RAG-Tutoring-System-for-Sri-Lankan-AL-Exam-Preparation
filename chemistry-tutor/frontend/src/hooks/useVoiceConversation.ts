import { useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../services/voiceApi";
import type { Language } from "../types/tutor";
import { useAudioRecorder } from "./useAudioRecorder";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking" | "paused";

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

  // Set by pause() while a turn is already in flight (thinking/speaking) so
  // the in-progress step can finish — e.g. still speak an answer that's
  // already been asked for — without looping back into listening
  // afterward. Reset whenever a fresh turn actually starts listening.
  const pauseRequestedRef = useRef(false);

  // Keep the latest language/sendQuestion/active in refs so the recorder's
  // auto-stop callback (set up once per listening turn) always sees current
  // values without having to re-arm on every prop change.
  const latest = useRef({ language, sendQuestion, active });
  latest.current = { language, sendQuestion, active };

  function startListening() {
    pauseRequestedRef.current = false;
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
      // Likely background noise, not real speech — just listen again,
      // unless the student paused while this was in flight.
      if (pauseRequestedRef.current) {
        setPhase("paused");
        return;
      }
      startListening();
      return;
    }

    const answer = await latest.current.sendQuestion(transcript);
    if (!latest.current.active) return;

    if (answer === null) {
      setError("Something went wrong getting an answer. Listening again...");
      if (pauseRequestedRef.current) {
        setPhase("paused");
        return;
      }
      startListening();
      return;
    }

    setError(null);
    setPhase("speaking");
    speak(answer, latest.current.language);
  }

  // When speech finishes (isSpeaking flips true -> false) and we're still in
  // an active, unpaused conversation, loop back to listening for the next turn.
  const wasSpeakingRef = useRef(false);
  useEffect(() => {
    if (
      wasSpeakingRef.current &&
      !isSpeaking &&
      active &&
      phase === "speaking" &&
      !pauseRequestedRef.current
    ) {
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

  // Pause the current turn without ending the conversation — the main fix
  // for "I said the wrong thing": while listening, this discards whatever
  // has been recorded so far instead of letting it finish, transcribe and
  // get sent. While the assistant is speaking, it stops playback (barge-in)
  // instead of waiting for it to finish. Either way, the conversation does
  // NOT automatically start listening again — the student calls resume()
  // when ready, same as a deliberate "I need a second" button.
  function pause() {
    if (!active || phase === "paused") return;
    pauseRequestedRef.current = true;

    if (phase === "listening") {
      recorder.stop(); // finalizes the recording but its result is never used/sent
      setPhase("paused");
    } else if (phase === "speaking") {
      stopSpeaking();
      setPhase("paused");
    }
    // If phase === "thinking", a request is already in flight — let it
    // resolve; handleAutoStopBlob checks pauseRequestedRef and stops at
    // "paused" afterward instead of looping back into listening.
  }

  function resume() {
    if (!active || phase !== "paused") return;
    setError(null);
    startListening();
  }

  return { active, phase, error, start, stop, pause, resume };
}
