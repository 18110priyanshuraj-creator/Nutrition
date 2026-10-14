import {isAbsolute} from "node:path";

const patchExtensions = /\.(?:ts|tsx|js|jsx|mjs|cjs|css|sql|json|ya?ml|md)$/i;
const protectedPaths = [
  /(^|\/)\.env(?:\..*)?(?:\/|$)/i,
  /(^|\/)(?:node_modules|\.git|\.next|data|coverage|dist|\.agent|uploads|photos|exports)(?:\/|$)/i,
  /(^|\/)(?:.*\.sqlite(?:-wal|-shm)?|.*credentials.*|.*\.pem|.*\.key|.*\.p12)$/i,
  /(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i,
];

export function isAgentPatchAllowed(path: string, cleanTrackedPaths: ReadonlySet<string>): boolean {
  if (!path || path.includes("\0") || isAbsolute(path) || path !== path.replace(/\\/g, "/")) return false;
  if (path.split("/").some((part) => !part || part === "." || part === "..") || !cleanTrackedPaths.has(path)) return false;
  return patchExtensions.test(path) && !protectedPaths.some((pattern) => pattern.test(path));
}

export function preservesPreexistingChanges(original: string, diff: string, proposed: string): boolean {
  const additions = new Map<string, number>();
  const removals = new Map<string, number>();
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("+++") || line.startsWith("---") || !line) continue;
    const target = line.startsWith("+") ? additions : line.startsWith("-") ? removals : null;
    if (target) {
      const text = line.slice(1);
      target.set(text, (target.get(text) ?? 0) + 1);
    }
  }
  if (!additions.size && !removals.size) return false;
  const count = (text: string, line: string) => text.split(/\r?\n/).filter(value => value === line).length;
  return [...additions].every(([line, amount]) => count(proposed, line) >= amount) &&
    [...removals].every(([line, amount]) => count(proposed, line) <= count(original, line) - amount);
}
