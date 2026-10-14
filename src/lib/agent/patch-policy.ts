import {isAbsolute} from "node:path";

const patchExtensions = /\.(?:ts|tsx)$/;
const protectedPaths = [
  /(^|\/)\.env(?:\..*)?(?:\/|$)/i,
  /(^|\/)(?:node_modules|\.git|\.next|data|coverage|dist|\.agent)(?:\/|$)/i,
  /(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|.*\.sqlite.*|.*credentials.*|.*secret.*|.*photo.*|.*export.*)$/i,
  /(^|\/)(?:auth|server-auth|db)\.tsx?$/i,
  /^proxy\.ts$/i,
  /^db\//i,
  /^app\/api\/(?:auth|restore|data|provider-status|agent)\//i,
  /^src\/lib\/agent\//i,
  /^scripts\/(?:agent|agent-upgrade|migrate|import-foods|configure-local)\.ts$/i,
];

export function isAgentPatchAllowed(path: string, cleanTrackedPaths: ReadonlySet<string>): boolean {
  if (!path || path.includes("\0") || isAbsolute(path) || path !== path.replace(/\\/g, "/")) return false;
  if (path.split("/").some((part) => !part || part === "." || part === "..") || !cleanTrackedPaths.has(path)) return false;
  return patchExtensions.test(path) && !protectedPaths.some((pattern) => pattern.test(path));
}
