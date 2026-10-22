// Lightweight inline-markdown renderer for chat/explanation text — no
// markdown library dependency, just the formatting the LLM actually emits:
// **bold** and *italic*. Line breaks are handled by the parent's
// whitespace-pre-wrap, not here.
const INLINE_PATTERN = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

export function FormattedText({ text }: { text: string }) {
  const parts = text.split(INLINE_PATTERN);

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        return part;
      })}
    </>
  );
}
