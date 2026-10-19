import { useState } from "react";
import { ChatMessageItem } from "../components/tutor/ChatMessageItem";
import { MicButton } from "../components/voice/MicButton";
import { askTutor } from "../services/tutorApi";
import type { ChatMessage, Language } from "../types/tutor";

export function TutorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: question };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await askTutor(question, language);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: response.answer,
        citations: response.citations,
        grounded: response.grounded,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <h1 className="text-lg font-semibold">Chemistry Tutor</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setLanguage("en")}
            className={`rounded px-3 py-1 text-sm ${
              language === "en" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"
            }`}
          >
            English
          </button>
          <button
            onClick={() => setLanguage("si")}
            className={`rounded px-3 py-1 text-sm ${
              language === "si" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-700"
            }`}
          >
            සිංහල
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-gray-400 mt-10">
            Ask a Chemistry question in English or Sinhala to get started.
          </p>
        )}
        {messages.map((m) => (
          <ChatMessageItem key={m.id} message={m} language={language} />
        ))}
        {loading && <p className="text-sm text-gray-400">Thinking...</p>}
        {error && <p className="text-sm text-red-600">Error: {error}</p>}
      </main>

      <footer className="border-t bg-white p-3">
        <div className="flex gap-2">
          <textarea
            className="flex-1 resize-none rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            rows={2}
            placeholder={
              language === "en" ? "Ask a Chemistry question..." : "රසායන විද්‍යා ප්‍රශ්නයක් අසන්න..."
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <MicButton
            language={language}
            disabled={loading}
            onTranscribed={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
