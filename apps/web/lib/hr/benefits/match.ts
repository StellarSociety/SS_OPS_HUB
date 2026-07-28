/** Normalize person names for fuzzy waiter ↔ staff matching. */

export function normalizePersonName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesLikelyMatch(a: string, b: string): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  const ta = na.split(" ").filter(Boolean);
  const tb = nb.split(" ").filter(Boolean);
  if (ta.length === 0 || tb.length === 0) return false;

  // Same first + last token
  if (ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1]) return true;

  // One name fully contains the other (e.g. "Juan" vs "Juan Perez")
  if (na.includes(nb) || nb.includes(na)) {
    return Math.min(na.length, nb.length) >= 4;
  }

  return false;
}

export type StaffMatchCandidate = {
  id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
};

/**
 * Map waiter id → staff id using explicit staff_id first, then name match.
 */
export function matchWaitersToStaff(
  waiters: Array<{
    id: string;
    name: string;
    staff_id?: string | null;
  }>,
  staff: StaffMatchCandidate[],
): Map<string, string> {
  const out = new Map<string, string>();
  const usedStaff = new Set<string>();

  for (const w of waiters) {
    if (w.staff_id) {
      out.set(w.id, w.staff_id);
      usedStaff.add(w.staff_id);
    }
  }

  for (const w of waiters) {
    if (out.has(w.id)) continue;
    const hit = staff.find(
      (s) =>
        !usedStaff.has(s.id) &&
        (namesLikelyMatch(w.name, s.full_name) ||
          namesLikelyMatch(
            w.name,
            [s.first_name, s.last_name].filter(Boolean).join(" "),
          )),
    );
    if (hit) {
      out.set(w.id, hit.id);
      usedStaff.add(hit.id);
    }
  }

  return out;
}

export function isBarRole(position: string | null | undefined, departmentName?: string | null): boolean {
  const hay = `${position ?? ""} ${departmentName ?? ""}`.toLowerCase();
  return /\bbar\b|\bbartend|\bbeverage\b|\bbarista\b/.test(hay);
}

export function isWaiterFloorRole(position: string | null | undefined): boolean {
  const hay = (position ?? "").toLowerCase();
  if (isBarRole(hay)) return false;
  return /\bwait|\bserver|\bcaptain\b|\bhost\b|\brunner\b/.test(hay) || hay.trim() === "";
}

/** Guess tip points tier from position / department title. */
export function inferPointTierKey(
  positionName: string | null | undefined,
  departmentName?: string | null,
): string {
  const hay = `${positionName ?? ""} ${departmentName ?? ""}`.toLowerCase();
  if (/\b(manager|management|hod|director|head chef|executive)\b/.test(hay)) {
    return "management";
  }
  if (/\b(supervisor|supervisory|sous|assistant manager)\b/.test(hay)) {
    return "supervisory";
  }
  if (/\b(commis|helper|steward|dishwasher|cleaner)\b/.test(hay)) {
    return "commis_helper";
  }
  if (/\b(wait|server)\b/.test(hay)) {
    return "general"; // exclusive waiters — pool uses other depts; still usable for bar
  }
  return "general";
}

export function matchDepartmentShareKey(
  departmentName: string | null | undefined,
  shares: Array<{ key: string; label: string }>,
): string | null {
  const name = normalizePersonName(departmentName);
  if (!name) return null;

  for (const share of shares) {
    const key = normalizePersonName(share.key);
    const label = normalizePersonName(share.label);
    if (name === key || name === label) return share.key;
    if (name.includes(label) || label.includes(name)) return share.key;
    if (name.includes(key) || key.includes(name)) return share.key;
  }

  // Heuristic aliases for Orilla SOP keys
  if (/kitchen|culinary|chef|pastry/.test(name)) return "kitchen";
  if (/beverage|bar|sommelier/.test(name)) return "beverage";
  if (/floor|foh|service|restaurant manager/.test(name)) return "floor_manager";
  if (/reception|host|reservation/.test(name)) return "reception";
  if (/office|admin|accounts|hr|finance/.test(name)) return "office";

  return null;
}
