import type { VoicePhase } from "../../hooks/useVoiceConversation";

interface AvatarProps {
  phase: VoicePhase;
}

const PHASE_LABEL: Record<VoicePhase, string> = {
  idle: "Ready",
  listening: "Listening...",
  thinking: "Thinking...",
  speaking: "Speaking...",
};

export function Avatar({ phase }: AvatarProps) {
  return (
    <div className="flex flex-col items-center gap-1 py-3">
      <div className="relative flex h-20 w-20 items-center justify-center">
        {phase === "listening" && (
          <span className="avatar-ring-listening absolute inset-0 rounded-full bg-blue-400" />
        )}
        <svg viewBox="0 0 100 100" className="relative h-20 w-20">
          <circle cx="50" cy="50" r="46" fill="#FDE68A" stroke="#F59E0B" strokeWidth="3" />
          <circle cx="35" cy="42" r="5" fill="#374151" />
          <circle cx="65" cy="42" r="5" fill="#374151" />
          {phase === "thinking" ? (
            <g>
              <circle cx="40" cy="68" r="3" fill="#374151">
                <animate attributeName="opacity" values="0.2;1;0.2" dur="1s" begin="0s" repeatCount="indefinite" />
              </circle>
              <circle cx="50" cy="68" r="3" fill="#374151">
                <animate
                  attributeName="opacity"
                  values="0.2;1;0.2"
                  dur="1s"
                  begin="0.2s"
                  repeatCount="indefinite"
                />
              </circle>
              <circle cx="60" cy="68" r="3" fill="#374151">
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
            <ellipse
              cx="50"
              cy="68"
              rx="12"
              ry="2"
              fill="#374151"
              className={phase === "speaking" ? "avatar-mouth-speaking" : undefined}
            />
          )}
        </svg>
      </div>
      <span className="text-xs font-medium text-gray-500">{PHASE_LABEL[phase]}</span>
    </div>
  );
}
