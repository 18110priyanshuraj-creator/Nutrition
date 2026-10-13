export type PlannedTerminalCommand = {
  program: "git" | "npm" | "rg";
  args: string[];
  reason: string;
};

export type TerminalCommandDecision =
  | {allowed: true; program: PlannedTerminalCommand["program"]; args: string[]; timeoutMs: number; display: string}
  | {allowed: false; display: string; reason: string};

const SAFE_GIT_ARGUMENTS = [
  ["status", "--short"],
  ["diff", "--check"],
  ["diff", "--stat"],
  ["diff", "--name-only"],
  ["branch", "--show-current"],
  ["ls-files"],
  ["log", "-5", "--oneline"],
] as const;

const SAFE_NPM_ARGUMENTS = [
  ["test"],
  ["run", "lint"],
  ["run", "typecheck"],
  ["run", "test"],
  ["run", "build"],
  ["run", "agent", "--", "--help"],
  ["run", "agent", "--", "status"],
  ["run", "agent:doctor"],
  ["run", "agent:memory"],
  ["run", "agent:upgrade", "--", "--help"],
] as const;

const SEARCH_ROOTS = new Set(["app", "src", "tests", "scripts", "docs"]);

export function validatePlannedTerminalCommand(input: PlannedTerminalCommand): TerminalCommandDecision {
  const printable = [input?.program, ...(Array.isArray(input?.args) ? input.args : [])]
    .map((part) => String(part ?? "").replace(/[\r\n\0]/g, "?"))
    .join(" ");
  if (!input || !["git", "npm", "rg"].includes(input.program)) {
    return {allowed: false, display: printable, reason: "Only git, npm, and rg tools are available."};
  }
  if (!Array.isArray(input.args) || input.args.length > 4 ||
      input.args.some((arg) => typeof arg !== "string" || arg.length > 240 || /[\r\n\0]/.test(arg))) {
    return {allowed: false, display: printable, reason: "Invalid command argument shape or size."};
  }
  if (typeof input.reason !== "string" || input.reason.trim().length < 3 || input.reason.length > 500) {
    return {allowed: false, display: printable, reason: "Every command needs a concise reason."};
  }

  const args = [...input.args];
  if (input.program === "git") {
    const allowed = SAFE_GIT_ARGUMENTS.some((candidate) =>
      candidate.length === args.length && candidate.every((part, index) => part === args[index])
    );
    return allowed
      ? {allowed: true, program: "git", args, timeoutMs: 30_000, display: "git " + args.join(" ")}
      : {allowed: false, display: printable, reason: "Git is restricted to exact read-only status, diff-check, inventory, branch-name, and short-log commands."};
  }
  if (input.program === "npm") {
    const allowed = SAFE_NPM_ARGUMENTS.some((candidate) =>
      candidate.length === args.length && candidate.every((part, index) => part === args[index])
    );
    return allowed
      ? {allowed: true, program: "npm", args, timeoutMs: 900_000, display: "npm " + args.join(" ")}
      : {allowed: false, display: printable, reason: "npm is restricted to the fixed test, lint, typecheck, build, and agent status/help scripts; installs and migrations are blocked."};
  }

  if (args.length !== 2 || !args[0] || args[0].length > 120 || args[0].startsWith("-") ||
      /[\r\n\0]/.test(args[0]) || !SEARCH_ROOTS.has(args[1])) {
    return {allowed: false, display: printable, reason: "rg may search a short pattern inside app, src, tests, scripts, or docs only."};
  }
  return {
    allowed: true,
    program: "rg",
    args: ["--max-count", "20", "--", args[0], args[1]],
    timeoutMs: 30_000,
    display: "rg --max-count 20 -- " + args[0] + " " + args[1],
  };
}
