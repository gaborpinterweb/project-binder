/** Board-card Impact / Difficulty (replaces boolean Priority). */

export const IMPACT_LEVELS = ["Low", "Medium", "High"];
export const DIFFICULTY_LEVELS = ["Hard", "Medium", "Easy"];

const IMPACT_COUNT = { Low: 1, Medium: 2, High: 3 };
/** Easy is most visible (3 zaps); Hard is least (1). */
const DIFFICULTY_COUNT = { Hard: 1, Medium: 2, Easy: 3 };

export function normalizeImpact(v) {
  const s = String(v || "");
  return IMPACT_LEVELS.includes(s) ? s : "";
}

export function normalizeDifficulty(v) {
  const s = String(v || "");
  return DIFFICULTY_LEVELS.includes(s) ? s : "";
}

export function impactIconCount(level) {
  return IMPACT_COUNT[normalizeImpact(level)] || 0;
}

export function difficultyIconCount(level) {
  return DIFFICULTY_COUNT[normalizeDifficulty(level)] || 0;
}

/** Higher = more impact (High first). Missing → 0. */
export function impactSortRank(level) {
  return IMPACT_COUNT[normalizeImpact(level)] || 0;
}

/** Higher = easier (Easy first). Missing → 0. */
export function difficultySortRank(level) {
  return DIFFICULTY_COUNT[normalizeDifficulty(level)] || 0;
}

/** Impact × difficulty ranks; High+Easy = 9. Missing either → 0. */
export function cardWeight(row) {
  return impactSortRank(row?.impact) * difficultySortRank(row?.difficulty);
}
