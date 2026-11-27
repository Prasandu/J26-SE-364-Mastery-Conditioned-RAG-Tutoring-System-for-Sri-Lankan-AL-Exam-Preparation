/** TUT-014: split a checked chemical formula into plain-text, subscript and superscript runs. */

export type FormulaPart = { text: string; kind: "base" | "sub" | "sup" };

/**
 * "Na2CO3" -> Na, 2 (sub), CO, 3 (sub); "SO4^2-" -> ..., 2- (sup); "5H2O" keeps the
 * leading 5 on the line. Returns text pieces only; the caller renders them as React text.
 */
export function formulaParts(formula: string): FormulaPart[] {
  let rest = formula.trim();
  let state = "";
  const stateMatch = /\((s|l|g|aq)\)$/.exec(rest);
  if (stateMatch) {
    state = stateMatch[0];
    rest = rest.slice(0, stateMatch.index);
  }
  let charge = "";
  const chargeMatch = /(?:\^(\d*))?([+-])$/.exec(rest);
  if (chargeMatch) {
    charge = `${chargeMatch[1] ?? ""}${chargeMatch[2]}`;
    rest = rest.slice(0, chargeMatch.index);
  }
  const parts: FormulaPart[] = [];
  const push = (text: string, kind: FormulaPart["kind"]) => {
    const last = parts[parts.length - 1];
    if (last && last.kind === kind) last.text += text;
    else parts.push({ text, kind });
  };
  for (let i = 0; i < rest.length; i += 1) {
    const ch = rest[i];
    const previous = i > 0 ? rest[i - 1] : "";
    const lastKind = parts[parts.length - 1]?.kind;
    const afterSymbol = /[A-Za-z)\]]/.test(previous) || (lastKind === "sub" && /\d/.test(previous));
    push(ch, /\d/.test(ch) && afterSymbol ? "sub" : "base");
  }
  if (charge) push(charge, "sup");
  if (state) push(state, "base");
  return parts;
}
