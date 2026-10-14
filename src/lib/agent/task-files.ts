export type TaskFileSnapshot = Record<string, string | null>;

export function porcelainStatusPaths(output: string): string[] {
  return output.split(/\r?\n/).filter(Boolean).map((line) => {
    if (line.length < 4 || line[2] !== " ") {
      throw new Error("Git returned an invalid porcelain status line.");
    }
    return line.slice(3).replace(/^"(.*)"$/, "$1");
  });
}

export function changedTaskFiles(baselineJson: string, current: TaskFileSnapshot): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(baselineJson);
  } catch {
    throw new Error("The saved repository-agent file baseline is invalid.");
  }

  if (Array.isArray(parsed)) {
    if (!parsed.every((path): path is string => typeof path === "string")) {
      throw new Error("The saved repository-agent file baseline is invalid.");
    }
    const baselinePaths = new Set(parsed);
    return Object.keys(current).filter((path) => !baselinePaths.has(path)).sort();
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("The saved repository-agent file baseline is invalid.");
  }
  const before = new Map<string, string | null>();
  for (const [path, fingerprint] of Object.entries(parsed)) {
    if (fingerprint !== null && typeof fingerprint !== "string") {
      throw new Error("The saved repository-agent file baseline is invalid.");
    }
    before.set(path, fingerprint);
  }

  const paths = new Set([...before.keys(), ...Object.keys(current)]);
  return [...paths].filter((path) =>
    before.has(path) !== Object.hasOwn(current, path) || before.get(path) !== current[path],
  ).sort();
}
