import { SpeakButton } from "../voice/SpeakButton";
import { FormattedText } from "./FormattedText";
import type { ChatMessage, Language } from "../../types/tutor";

export function ChatMessageItem({
  message,
  language,
}: {
  message: ChatMessage;
  language: Language;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          isUser ? "bg-blue-800 text-white" : "bg-slate-100 text-slate-900"
        }`}
      >
        <p className="whitespace-pre-wrap">
          <FormattedText text={message.text} />
        </p>

        {!isUser && (
          <div className="mt-2">
            <SpeakButton text={message.text} language={language} />
          </div>
        )}

        {!isUser && message.grounded === false && (
          <p className="mt-2 text-xs text-amber-600">
            Not found in the textbook — this answer may be incomplete.
          </p>
        )}

        {!isUser && message.citations && message.citations.length > 0 && (
          <div className="mt-2 border-t border-slate-300 pt-2 text-xs text-slate-500">
            <p className="font-semibold">Sources:</p>
            <ul className="list-disc list-inside">
              {message.citations.map((c, i) => (
                <li key={i}>
                  {c.document_title}
                  {c.unit && `, Unit ${c.unit}`}
                  {c.page_number && `, page ${c.page_number}`}
                  {c.section && ` — ${c.section}`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
