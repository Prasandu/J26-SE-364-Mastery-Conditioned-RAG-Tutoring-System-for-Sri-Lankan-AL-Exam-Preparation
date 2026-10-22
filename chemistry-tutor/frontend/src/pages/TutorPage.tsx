import { useState } from "react";
import { Avatar } from "../components/tutor/Avatar";
import { ChatMessageItem } from "../components/tutor/ChatMessageItem";
import { MicButton } from "../components/voice/MicButton";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useVoiceConversation } from "../hooks/useVoiceConversation";
import { askTutor } from "../services/tutorApi";
import type { ChatMessage, Language } from "../types/tutor";

export function TutorPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synth = useSpeechSynthesis();

  // Shared by the manual Send button and voice-chat mode. Returns the
  // assistant's answer text so voice mode can speak it aloud, or null on
  // failure so voice mode can recover instead of breaking the loop.
  // concise=true (voice mode only) asks the backend for a short,
  // spoken-style answer — faster to generate and shorter to listen to.
  async function sendQuestion(question: string, concise = false): Promise<string | null> {
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", text: question };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setError(null);

    try {
      const response = await askTutor(question, language, concise);
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        text: response.answer,
        citations: response.citations,
        grounded: response.grounded,
      };
      setMessages((prev) => [...prev, assistantMessage]);
      return response.answer;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      return null;
    } finally {
      setLoading(false);
    }
  }

  const voiceConversation = useVoiceConversation({
    language,
    sendQuestion: (question) => sendQuestion(question, true),
    speak: synth.speak,
    stopSpeaking: synth.stop,
    isSpeaking: synth.isSpeaking,
  });

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    await sendQuestion(question);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex h-full flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <h1 className="text-lg font-semibold">Chemistry Tutor</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setLanguage("en")}
            className={`rounded px-3 py-1 text-sm ${
              language === "en" ? "bg-blue-800 text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            English
          </button>
          <button
            onClick={() => setLanguage("si")}
            className={`rounded px-3 py-1 text-sm ${
              language === "si" ? "bg-blue-800 text-white" : "bg-slate-200 text-slate-700"
            }`}
          >
            සිංහල
          </button>
          <button
            onClick={() => (voiceConversation.active ? voiceConversation.stop() : voiceConversation.start())}
            className={`rounded px-3 py-1 text-sm ${
              voiceConversation.active ? "bg-red-600 text-white" : "bg-green-600 text-white"
            }`}
          >
            {voiceConversation.active ? "⏹ End Voice Chat" : "🎙️ Start Voice Chat"}
          </button>
        </div>
      </header>

      {voiceConversation.active && (
        <div className="border-b bg-white pb-3">
          <Avatar phase={voiceConversation.phase} />
          <div className="flex justify-center gap-2">
            {voiceConversation.phase === "paused" ? (
              <button
                onClick={voiceConversation.resume}
                className="rounded bg-green-600 px-3 py-1 text-xs text-white"
              >
                ▶ Resume
              </button>
            ) : (
              <button
                onClick={voiceConversation.pause}
                disabled={voiceConversation.phase === "thinking"}
                title={
                  voiceConversation.phase === "listening"
                    ? "Discard what's being recorded and pause"
                    : "Pause"
                }
                className="rounded bg-amber-500 px-3 py-1 text-xs text-white disabled:opacity-50"
              >
                ⏸ Pause
              </button>
            )}
          </div>
          {voiceConversation.error && (
            <p className="pt-1 text-center text-xs text-red-600">{voiceConversation.error}</p>
          )}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-slate-400 mt-10">
            Ask a Chemistry question in English or Sinhala to get started.
          </p>
        )}
        {messages.map((m) => (
          <ChatMessageItem key={m.id} message={m} language={language} />
        ))}
        {loading && <p className="text-sm text-slate-400">Thinking...</p>}
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
            disabled={voiceConversation.active}
          />
          <MicButton
            language={language}
            disabled={loading || voiceConversation.active}
            onTranscribed={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim() || voiceConversation.active}
            className="rounded bg-blue-800 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
