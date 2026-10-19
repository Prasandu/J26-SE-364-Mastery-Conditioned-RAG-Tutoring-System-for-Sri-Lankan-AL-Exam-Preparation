import { useState } from "react";
import { useAudioRecorder } from "../../hooks/useAudioRecorder";
import { transcribeAudio } from "../../services/voiceApi";

interface MicButtonProps {
  language: "en" | "si";
  onTranscribed: (text: string) => void;
  disabled?: boolean;
}

export function MicButton({ language, onTranscribed, disabled }: MicButtonProps) {
  const { isRecording, error, start, stop } = useAudioRecorder();
  const [transcribing, setTranscribing] = useState(false);

  async function handleClick() {
    if (isRecording) {
      const blob = await stop();
      if (!blob) return;
      setTranscribing(true);
      try {
        const text = await transcribeAudio(blob, language);
        onTranscribed(text);
      } catch {
        // surfaced via the error state below on next render is not ideal;
        // keep it simple for now and just leave the input unchanged.
      } finally {
        setTranscribing(false);
      }
    } else {
      start();
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || transcribing}
        title={isRecording ? "Stop recording" : "Record a question"}
        className={`rounded-full p-2 text-lg disabled:opacity-50 ${
          isRecording ? "animate-pulse bg-red-600 text-white" : "bg-gray-200 text-gray-700"
        }`}
      >
        {transcribing ? "..." : "🎤"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
