import { useMemo, useState } from "react";
import catalogue from "../../../../shared/contracts/topics.json";
import type { DashboardTopicTrend } from "../../api/planning";

/** Sub-topics below this need attention (matches the legend's "75% or higher" = strong). */
const ATTENTION_THRESHOLD = 0.75;

interface CatalogueNode {
  id: string;
  name: string;
  code?: string;
  topics?: CatalogueNode[];
}

interface UnitInfo {
  id: string;
  label: string;
}

interface UnitGroup {
  unit: UnitInfo;
  topics: DashboardTopicTrend[];
  average: number;
  needsAttention: number;
}

function isNode(value: unknown): value is CatalogueNode {
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  return typeof node.id === "string" && typeof node.name === "string";
}

/** Map every topic ID in the catalogue to its name and its unit. */
function buildCatalogueIndex() {
  const names = new Map<string, string>();
  const unitOf = new Map<string, UnitInfo>();
  const units = (catalogue as { units?: unknown[] }).units ?? [];
  for (const raw of units) {
    if (!isNode(raw)) continue;
    const unit: UnitInfo = {
      id: raw.id,
      label: raw.code ? `${raw.code} · ${raw.name}` : raw.name,
    };
    const visit = (node: CatalogueNode) => {
      names.set(node.id, node.name);
      unitOf.set(node.id, unit);
      for (const child of node.topics ?? []) if (isNode(child)) visit(child);
    };
    visit(raw);
  }
  return { names, unitOf };
}

const catalogueIndex = buildCatalogueIndex();

function readableId(id: string): string {
  const words = id.replace(/^chem-u\d+-?/i, "").split(/[-_]/).filter(Boolean);
  return words.length ? words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ") : id;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function barColor(mastery: number): string {
  if (mastery >= 0.75) return "bg-emerald-600";
  if (mastery >= 0.55) return "bg-emerald-300";
  if (mastery >= 0.35) return "bg-amber-400";
  return "bg-rose-400";
}

function level(mastery: number): string {
  if (mastery >= 0.75) return "strong";
  if (mastery >= 0.55) return "developing";
  if (mastery >= 0.35) return "needs work";
  return "weak";
}

function groupByUnit(topics: DashboardTopicTrend[]): UnitGroup[] {
  const groups = new Map<string, { unit: UnitInfo; topics: DashboardTopicTrend[] }>();
  for (const topic of topics) {
    if (topic.parent_topic_id === null) continue;
    const unit =
      catalogueIndex.unitOf.get(topic.topic_id) ??
      catalogueIndex.unitOf.get(topic.parent_topic_id) ?? {
        id: topic.parent_topic_id,
        label: readableId(topic.parent_topic_id),
      };
    const group = groups.get(unit.id) ?? { unit, topics: [] };
    group.topics.push(topic);
    groups.set(unit.id, group);
  }
  return [...groups.values()]
    .map(({ unit, topics: unitTopics }) => ({
      unit,
      topics: [...unitTopics].sort((left, right) => left.mastery - right.mastery),
      average: unitTopics.reduce((sum, topic) => sum + topic.mastery, 0) / unitTopics.length,
      needsAttention: unitTopics.filter((topic) => topic.mastery < ATTENTION_THRESHOLD).length,
    }))
    .sort((left, right) => left.average - right.average);
}

function Bar({ value }: { value: number }) {
  return (
    <span className="block h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <span
        className={`block h-full rounded-full ${barColor(value)}`}
        style={{ width: `${Math.max(2, Math.round(value * 100))}%` }}
      />
    </span>
  );
}

export default function UnitMastery({ topics }: { topics: DashboardTopicTrend[] }) {
  const groups = useMemo(() => groupByUnit(topics), [topics]);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set(groups[0] ? [groups[0].unit.id] : []));

  if (groups.length === 0) {
    return (
      <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
        Not enough sub-topic data yet. Mastery will appear here after topic assessments are recorded.
      </p>
    );
  }

  const visible = showAll ? groups : groups.filter((group) => group.needsAttention > 0);
  const toggle = (unitId: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });

  return (
    <div>
      <div aria-label="Which units to show" className="mb-4 flex w-fit gap-1 rounded-full bg-slate-100 p-1" role="group">
        {(
          [
            [false, "Needs attention"],
            [true, "All units"],
          ] as const
        ).map(([value, label]) => (
          <button
            aria-pressed={showAll === value}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              showAll === value ? "bg-white text-brand shadow-sm" : "text-slate-600"
            }`}
            key={label}
            onClick={() => setShowAll(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900">
          Every unit is at 75% or higher. Switch to "All units" to see the details.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
          {visible.map((group) => {
            const expanded = open.has(group.unit.id);
            const panelId = `unit-mastery-${group.unit.id}`;
            return (
              <li key={group.unit.id}>
                <button
                  aria-controls={panelId}
                  aria-expanded={expanded}
                  className="grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 sm:grid-cols-[1rem_minmax(0,1.4fr)_minmax(6rem,1fr)_auto]"
                  onClick={() => toggle(group.unit.id)}
                  type="button"
                >
                  <span aria-hidden="true" className={`text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`}>
                    ▸
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold text-ink">{group.unit.label}</span>
                  <span className="hidden sm:block">
                    <Bar value={group.average} />
                  </span>
                  <span className="flex items-center gap-2 text-sm">
                    <span className="font-semibold tabular-nums text-ink">{percent(group.average)}</span>
                    {group.needsAttention > 0 ? (
                      <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {group.needsAttention} to work on
                      </span>
                    ) : null}
                  </span>
                </button>
                {expanded ? (
                  <ul className="space-y-2 bg-slate-50/60 px-4 pb-4 pl-11 pt-1" id={panelId}>
                    {group.topics.map((topic) => {
                      const name =
                        topic.topic_name ?? catalogueIndex.names.get(topic.topic_id) ?? readableId(topic.topic_id);
                      return (
                        <li
                          aria-label={`${name}: ${percent(topic.mastery)} mastery`}
                          className="grid grid-cols-[minmax(0,1.4fr)_minmax(4rem,1fr)_3rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,1.4fr)_minmax(6rem,1fr)_3rem_6rem]"
                          key={topic.topic_id}
                        >
                          <span className="min-w-0 truncate text-slate-700" title={name}>
                            {name}
                          </span>
                          <Bar value={topic.mastery} />
                          <span className="text-right font-medium tabular-nums text-ink">{percent(topic.mastery)}</span>
                          <span className="hidden text-xs text-slate-500 sm:block">{level(topic.mastery)}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
        {[
          ["bg-rose-400", "Below 35%"],
          ["bg-amber-400", "35–54%"],
          ["bg-emerald-300", "55–74%"],
          ["bg-emerald-600", "75% or higher"],
        ].map(([color, label]) => (
          <span className="inline-flex items-center gap-1.5" key={label}>
            <span className={`size-3 rounded-sm ${color}`} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
