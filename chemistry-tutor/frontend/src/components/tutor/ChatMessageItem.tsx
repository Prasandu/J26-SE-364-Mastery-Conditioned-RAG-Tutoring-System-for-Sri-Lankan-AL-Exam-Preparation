import { SpeakButton } from "../voice/SpeakButton";
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
          isUser ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        <p className="whitespace-pre-wrap">{message.text}</p>

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
          <div className="mt-2 border-t border-gray-300 pt-2 text-xs text-gray-500">
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
