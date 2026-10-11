import { useState } from "react";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { saveTeacherKey, saveTeacherRef } from "@/lib/teacher";

interface Props {
  initialRef: string;
  onReady: () => void;
}

/** Asks for the teacher key once per browser tab, plus who is marking. */
export function TeacherSignIn({ initialRef, onReady }: Props) {
  const [key, setKey] = useState("");
  const [teacherRef, setTeacherRef] = useState(initialRef);
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!key.trim() || !teacherRef.trim()) {
      setProblem("Both the key and your name are needed");
      return;
    }
    saveTeacherKey(key.trim());
    saveTeacherRef(teacherRef.trim());
    onReady();
  }

  return (
    <Card className="mx-auto max-w-md">
      <h1 className="font-medium">Teacher review</h1>
      <p className="mt-1 text-sm text-slate-500">
        The key is the <code className="font-mono">TEACHER_API_KEY</code> from the service settings.
        It is forgotten when you close this tab.
      </p>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <div className="space-y-1">
          <label htmlFor="teacher-ref" className="block text-sm text-slate-600">
            Your name or id
          </label>
          <input
            id="teacher-ref"
            value={teacherRef}
            onChange={(event) => setTeacherRef(event.target.value)}
            maxLength={64}
            placeholder="e.g. T01"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="teacher-key" className="block text-sm text-slate-600">
            Teacher key
          </label>
          <input
            id="teacher-key"
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-teal-500 focus:outline-none"
          />
        </div>

        {problem && <p className="text-sm text-rose-700">{problem}</p>}
        <Button type="submit" className="w-full">
          Open the review queue
        </Button>
      </form>
    </Card>
  );
}
