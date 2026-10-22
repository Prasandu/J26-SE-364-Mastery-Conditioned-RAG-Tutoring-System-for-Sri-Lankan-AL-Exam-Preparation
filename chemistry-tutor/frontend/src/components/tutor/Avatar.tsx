import type { VoicePhase } from "../../hooks/useVoiceConversation";

interface AvatarProps {
  phase: VoicePhase;
  // 0 (closed) to 1 (wide open), driven by useSpeechSynthesis — real audio
  // amplitude for Sinhala, word-boundary pulses for English. Only used
  // while phase === "speaking"; ignored otherwise.
  mouthOpenness?: number;
}

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: "Ready",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking...",
  paused: "Paused",
};

export function Avatar({ phase, mouthOpenness = 0 }: AvatarProps) {
  // Mouth height in SVG units: a thin closed line at rest, growing with
  // mouthOpenness while speaking. Clamped so it never looks flat-lipped
  // during speech even at low amplitude.
  const mouthRy = phase === "speaking" ? 2 + Math.max(0, Math.min(1, mouthOpenness)) * 10 : 2;

  return (
    <div className="flex flex-col items-center gap-1 py-3">
      <div className="relative flex h-24 w-24 items-center justify-center">
        {phase === "listening" && (
          <span className="avatar-ring-listening absolute inset-0 rounded-full bg-blue-400" />
        )}
        <svg viewBox="0 0 100 100" className="relative h-24 w-24">
          {/* Head */}
          <circle cx="50" cy="50" r="46" fill="#DBEAFE" stroke="#1E3A8A" strokeWidth="3" />
          {/* Ears/side accents give it a touch more "character" than a plain circle */}
          <circle cx="8" cy="50" r="7" fill="#DBEAFE" stroke="#1E3A8A" strokeWidth="3" />
          <circle cx="92" cy="50" r="7" fill="#DBEAFE" stroke="#1E3A8A" strokeWidth="3" />

          {/* Eyebrows — only while thinking, for a subtle "considering" look */}
          {phase === "thinking" && (
            <>
              <path d="M 27 32 Q 35 27 43 31" stroke="#1E3A8A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M 57 31 Q 65 27 73 32" stroke="#1E3A8A" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </>
          )}

          {/* Eyes */}
          <g className={phase !== "speaking" ? "avatar-eye-blinking" : undefined}>
            <circle cx="35" cy="42" r="6" fill="#1E3A8A" />
            <circle cx="37" cy="40" r="1.6" fill="white" />
            <circle cx="65" cy="42" r="6" fill="#1E3A8A" />
            <circle cx="67" cy="40" r="1.6" fill="white" />
          </g>

          {/* Mouth */}
          {phase === "thinking" ? (
            <g>
              <circle cx="40" cy="68" r="3" fill="#1E3A8A">
                <animate attributeName="opacity" values="0.2;1;0.2" dur="1s" begin="0s" repeatCount="indefinite" />
              </circle>
              <circle cx="50" cy="68" r="3" fill="#1E3A8A">
                <animate
                  attributeName="opacity"
                  values="0.2;1;0.2"
                  dur="1s"
                  begin="0.2s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx="60" cy="68" r="3" fill="#1E3A8A">
                <animate
                  attributeName="opacity"
                  values="0.2;1;0.2"
                  dur="1s"
                  begin="0.4s"
                  repeatCount="indefinite"
                />
              </circle>
            </g>
          ) : (
            <ellipse cx="50" cy="68" rx="12" ry={mouthRy} fill="#1E3A8A" />
          )}
        </svg>
      </div>
      <span className="text-xs font-medium text-slate-500">{PHASE_LABEL[phase]}</span>
    </div>
  );
}
