import { useMemo, useState } from "react";

export interface TopicNode {
  id: string;
  name: string;
  code?: string;
  topics?: TopicNode[];
}

interface TopicTreeProps {
  topics: TopicNode[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export default function TopicTree({
  topics,
  selectedIds,
  onChange,
}: TopicTreeProps) {
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function selectableDescendants(node: TopicNode): string[] {
    const children = node.topics ?? [];
    return children.length === 0
      ? [node.id]
      : children.flatMap(selectableDescendants);
  }

  function toggle(node: TopicNode) {
    const ids = selectableDescendants(node);
    const next = new Set(selected);
    if (ids.every((id) => next.has(id))) {
      ids.forEach((id) => next.delete(id));
    } else {
      ids.forEach((id) => next.add(id));
    }
    onChange([...next]);
  }

  function renderNode(node: TopicNode, depth = 0) {
    const children = node.topics ?? [];
    const nodeIds = selectableDescendants(node);
    const checkedCount = nodeIds.filter((id) => selected.has(id)).length;
    const checked = checkedCount === nodeIds.length;
    const partiallyChecked = checkedCount > 0 && !checked;
    const isExpanded = expanded.has(node.id);

    return (
      <li key={node.id}>
        <div
          className="flex items-center gap-2 rounded-lg py-1.5 pr-2 hover:bg-slate-50"
          style={{ paddingLeft: `${depth * 1.25}rem` }}
        >
          {children.length > 0 ? (
            <button
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.name}`}
              aria-expanded={isExpanded}
              className="grid size-7 shrink-0 place-items-center rounded text-slate-600 hover:bg-slate-200"
              onClick={() =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                })
              }
              type="button"
            >
              {isExpanded ? "−" : "+"}
            </button>
          ) : (
            <span aria-hidden="true" className="size-7 shrink-0" />
          )}
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-slate-800">
            <input
              aria-checked={partiallyChecked ? "mixed" : checked}
              aria-label={`Select ${node.name}`}
              checked={checked}
              className="size-4 shrink-0 accent-brand"
              onChange={() => toggle(node)}
              type="checkbox"
            />
            <span>
              {node.name}
              {node.code ? (
                <span className="ml-2 text-xs text-slate-500">{node.code}</span>
              ) : null}
            </span>
          </label>
          {partiallyChecked ? (
            <span className="text-xs text-slate-500">
              {checkedCount}/{nodeIds.length}
            </span>
          ) : null}
        </div>
        {children.length > 0 && isExpanded ? (
          <ul>{children.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  }

  return (
    <ul aria-label="Topic catalogue" className="max-h-96 space-y-0.5 overflow-auto">
      {topics.map((topic) => renderNode(topic))}
    </ul>
  );
}
