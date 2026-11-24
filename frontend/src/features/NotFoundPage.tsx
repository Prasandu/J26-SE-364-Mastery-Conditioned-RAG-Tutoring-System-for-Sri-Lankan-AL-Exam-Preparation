import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-3xl font-bold">Page not found</h1>
      <Link className="mt-4 inline-block text-brand underline" to="/">
        Return to papers
      </Link>
    </main>
  );
}
