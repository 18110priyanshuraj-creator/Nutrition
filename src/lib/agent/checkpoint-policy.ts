export type CheckStatus = {name: string; ok: boolean};

/**
 * A checkpoint must not regress any check that passed in the current best state,
 * and it must not reduce the total number of passing checks.
 */
export function isAtLeastAsGood(
  candidate: readonly CheckStatus[],
  best: readonly CheckStatus[],
): boolean {
  const candidateByName = new Map(candidate.map((item) => [item.name, item.ok]));
  const preservesPassingChecks = best.every((item) => !item.ok || candidateByName.get(item.name) === true);
  const candidatePassCount = candidate.filter((item) => item.ok).length;
  const bestPassCount = best.filter((item) => item.ok).length;
  return preservesPassingChecks && candidatePassCount >= bestPassCount;
}
