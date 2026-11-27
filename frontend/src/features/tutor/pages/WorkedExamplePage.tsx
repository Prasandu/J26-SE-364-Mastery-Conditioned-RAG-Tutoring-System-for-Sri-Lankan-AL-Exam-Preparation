import { useState, type FormEvent } from "react";

import { Whiteboard } from "../components/whiteboard/Whiteboard";
import { getSolutionConcentrationExample } from "../services/teachingApi";
import type { ValidatedTeaching } from "../types/teaching";

/** TUT-014 Mode B: concentration of a solution, worked and checked step by step. */
export function WorkedExamplePage() {
  const [solute, setSolute] = useState("Na2CO3");
  const [mass, setMass] = useState("26.5");
  const [molarMass, setMolarMass] = useState("106");
  const [volume, setVolume] = useState("250");
  const [result, setResult] = useState<ValidatedTeaching | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);
    try {
      setResult(
        await getSolutionConcentrationExample({
          solute,
          mass_g: Number(mass),
          molar_mass_g_per_mol: Number(molarMass),
          volume_cm3: Number(volume),
        }),
      );
    } catch {
      setError("Could not work this out. Check the values and try again.");
    } finally {
      setLoading(false);
    }
  }

  const field = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2";
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-ink">Worked example: concentration of a solution</h2>
      <p className="text-sm text-slate-600">
        Enter your own values. Every step is calculated and checked by the server, not written by
        an AI.
      </p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
        <label className="text-sm">
          Solute formula
          <input className={field} onChange={(e) => setSolute(e.target.value)} value={solute} />
        </label>
        <label className="text-sm">
          Mass (g)
          <input className={field} inputMode="decimal" onChange={(e) => setMass(e.target.value)} value={mass} />
        </label>
        <label className="text-sm">
          Molar mass (g mol⁻¹)
          <input
            className={field}
            inputMode="decimal"
            onChange={(e) => setMolarMass(e.target.value)}
            value={molarMass}
          />
        </label>
        <label className="text-sm">
          Volume of solution (cm³)
          <input className={field} inputMode="decimal" onChange={(e) => setVolume(e.target.value)} value={volume} />
        </label>
        <button
          className="rounded-lg bg-brand px-4 py-2 font-semibold text-white disabled:opacity-60 sm:col-span-2"
          disabled={loading}
          type="submit"
        >
          {loading ? "Working it out..." : "Show worked steps"}
        </button>
      </form>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {result ? <Whiteboard result={result} /> : null}
    </div>
  );
}
