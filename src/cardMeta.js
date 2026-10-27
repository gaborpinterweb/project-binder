/** Board-card Impact / Effort (replaces boolean Priority). */

export const IMPACT_LEVELS = ["Low", "Medium", "High"];
export const EFFORT_LEVELS = ["Low", "Medium", "High"];

/** Legacy Difficulty → Effort. */
const LEGACY_DIFFICULTY_TO_EFFORT = {
  Easy: "Low",
  Medium: "Medium",
  Hard: "High",
};

/** Arrow stack height: Low = 1, High = 3 (impact ↑, effort ↓). */
const LEVEL_ICON_COUNT = { Low: 1, Medium: 2, High: 3 };
const IMPACT_COUNT = LEVEL_ICON_COUNT;
const EFFORT_ICON_COUNT = LEVEL_ICON_COUNT;
/** Higher = less effort (Low first for sort / weight). */
const EFFORT_EASE_RANK = { Low: 3, Medium: 2, High: 1 };

export function normalizeImpact(v) {
  const s = String(v || "");
  return IMPACT_LEVELS.includes(s) ? s : "";
}

export function normalizeEffort(v) {
  const s = String(v || "");
  if (EFFORT_LEVELS.includes(s)) return s;
  return LEGACY_DIFFICULTY_TO_EFFORT[s] || "";
}

export function impactIconCount(level) {
  return IMPACT_COUNT[normalizeImpact(level)] || 0;
}

export function effortIconCount(level) {
  return EFFORT_ICON_COUNT[normalizeEffort(level)] || 0;
}

/** Higher = more impact (High first). Missing → 0. */
export function impactSortRank(level) {
  return IMPACT_COUNT[normalizeImpact(level)] || 0;
}

/** Higher = less effort (Low first). Missing → 0. */
export function effortSortRank(level) {
  return EFFORT_EASE_RANK[normalizeEffort(level)] || 0;
}

/**
 * Priority score for "By priority" sort.
 * Both metrics → impact × ease (High impact + Low effort = 9).
 * Only one set → that metric's sort rank (so priority matches impact-only or effort-only sorts).
 */
export function cardWeight(row) {
  const impact = impactSortRank(row?.impact);
  const effort = effortSortRank(row?.effort);
  if (impact && effort) return impact * effort;
  return impact || effort;
}

/** Chip / a11y copy: "High impact". */
export function impactChipLabel(level) {
  const n = normalizeImpact(level);
  return n ? `${n} impact` : "";
}

/** Chip / a11y copy: "Low effort". */
export function effortChipLabel(level) {
  const n = normalizeEffort(level);
  return n ? `${n} effort` : "";
}
