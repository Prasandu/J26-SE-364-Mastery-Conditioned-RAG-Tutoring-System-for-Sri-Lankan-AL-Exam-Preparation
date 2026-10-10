import { useEffect, useRef, useState } from "react";

const SAVE_AFTER_MS = 800;

interface Props {
  value: string;
  disabled: boolean;
  questionId: number;
  onSave: (text: string) => void;
}

/**
 * A written answer box for structured and essay questions.
 *
 * Typing does not save on every key. It saves once the student stops for a
 * moment, and immediately when they click away, so slow typing never floods
 * the backend but nothing is lost either.
 */
export function WrittenAnswer({ value, disabled, questionId, onSave }: Props) {
  const [text, setText] = useState(value);
  const saved = useRef(value);

  // A fresh question, or answers arriving from the server, replace the box.
  useEffect(() => {
    setText(value);
    saved.current = value;
  }, [questionId, value]);

  useEffect(() => {
    if (text === saved.current) {
      return;
    }
    const timer = setTimeout(() => {
      saved.current = text;
      onSave(text);
    }, SAVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [text, onSave]);

  function saveNow() {
    if (text !== saved.current) {
      saved.current = text;
      onSave(text);
    }
  }

  return (
    <textarea
      value={text}
      disabled={disabled}
      onChange={(event) => setText(event.target.value)}
      onBlur={saveNow}
      rows={4}
      maxLength={20000}
      placeholder="Write your answer here"
      aria-label="Your answer"
      className="w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-sm leading-relaxed focus:border-teal-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
    />
  );
}
