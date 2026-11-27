import { useEffect, useState, type FormEvent } from "react";

import { listUsers } from "../../api/admin";
import {
  archiveClass,
  createClass,
  listClasses,
  setClassStudents,
  setClassTeachers,
  type SchoolClass,
} from "../../api/classes";
import type { AdminUser } from "../../api/types";

type MemberKind = "teachers" | "students";

/** Admin: class rosters. Teachers review only scripts of students in their classes. */
export function ClassesPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [name, setName] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([listClasses(controller.signal), listUsers(controller.signal)])
      .then(([loadedClasses, loadedUsers]) => {
        setClasses(loadedClasses);
        setUsers(loadedUsers);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(String(reason));
      });
    return () => controller.abort();
  }, []);

  function replace(updated: SchoolClass) {
    setClasses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      const created = await createClass({ name: name.trim(), academic_year: year.trim() || null });
      setClasses((current) => [...current, created]);
      setName("");
      setYear("");
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function save(schoolClass: SchoolClass, kind: MemberKind, ids: number[]) {
    setError("");
    setSaved("");
    try {
      const updated =
        kind === "teachers"
          ? await setClassTeachers(schoolClass.id, ids)
          : await setClassStudents(schoolClass.id, ids);
      replace(updated);
      setSaved(`Saved ${kind} for ${schoolClass.name}.`);
    } catch (reason) {
      setError(String(reason));
    }
  }

  const teachers = users.filter((user) => user.role === "teacher" || user.role === "admin");
  const students = users.filter((user) => user.role === "student");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Classes</h1>
        <p className="mt-1 text-sm text-slate-600">
          A teacher reviews only the scripts of students in a class they teach. Admins see every
          script. A teacher with no class sees no scripts.
        </p>
      </header>
      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-emerald-700" role="status">
          {saved}
        </p>
      ) : null}
      <form className="flex flex-wrap items-end gap-3" onSubmit={add}>
        <label className="text-sm">
          Class name
          <input
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label className="text-sm">
          Academic year
          <input
            className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2"
            onChange={(event) => setYear(event.target.value)}
            value={year}
          />
        </label>
        <button className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" type="submit">
          Add class
        </button>
      </form>
      {classes.map((schoolClass) => (
        <ClassCard
          key={schoolClass.id}
          onArchive={async () => replace(await archiveClass(schoolClass.id))}
          onSave={save}
          schoolClass={schoolClass}
          students={students}
          teachers={teachers}
        />
      ))}
    </div>
  );
}

function ClassCard({
  schoolClass,
  teachers,
  students,
  onSave,
  onArchive,
}: {
  schoolClass: SchoolClass;
  teachers: AdminUser[];
  students: AdminUser[];
  onSave: (schoolClass: SchoolClass, kind: MemberKind, ids: number[]) => Promise<void>;
  onArchive: () => Promise<void>;
}) {
  return (
    <section
      aria-label={`Class ${schoolClass.name}`}
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">
          {schoolClass.name}
          {schoolClass.academic_year ? (
            <span className="ml-2 text-sm text-slate-500">{schoolClass.academic_year}</span>
          ) : null}
          {schoolClass.archived ? <span className="ml-2 text-sm text-amber-700">(archived)</span> : null}
        </h2>
        {!schoolClass.archived ? (
          <button className="text-sm text-slate-600 underline" onClick={() => void onArchive()} type="button">
            Archive
          </button>
        ) : null}
      </div>
      <MemberPicker
        initial={schoolClass.teacher_ids}
        kind="teachers"
        onSave={(ids) => onSave(schoolClass, "teachers", ids)}
        people={teachers}
        title="Teachers"
      />
      <MemberPicker
        initial={schoolClass.student_ids}
        kind="students"
        onSave={(ids) => onSave(schoolClass, "students", ids)}
        people={students}
        title="Students"
      />
    </section>
  );
}

function MemberPicker({
  title,
  kind,
  people,
  initial,
  onSave,
}: {
  title: string;
  kind: MemberKind;
  people: AdminUser[];
  initial: number[];
  onSave: (ids: number[]) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(initial));
  const toggle = (id: number) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <fieldset>
      <legend className="text-sm font-semibold">{title}</legend>
      {people.length === 0 ? <p className="text-sm text-slate-500">No {kind} accounts yet.</p> : null}
      <ul className="mt-1 grid gap-1 sm:grid-cols-2">
        {people.map((person) => (
          <li key={person.id}>
            <label className="flex items-center gap-2 text-sm">
              <input checked={chosen.has(person.id)} onChange={() => toggle(person.id)} type="checkbox" />
              {person.name} <span className="text-slate-500">{person.email}</span>
            </label>
          </li>
        ))}
      </ul>
      <button
        className="mt-2 rounded-lg border border-slate-300 px-3 py-1 text-sm"
        onClick={() => void onSave([...chosen].sort((a, b) => a - b))}
        type="button"
      >
        Save {kind}
      </button>
    </fieldset>
  );
}
