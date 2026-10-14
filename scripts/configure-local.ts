import {randomBytes} from "node:crypto";
import {existsSync, lstatSync, readFileSync} from "node:fs";
import {writeFile, rename, unlink} from "node:fs/promises";
import {join, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {emitKeypressEvents, createInterface} from "node:readline";
import {config as loadDotenv, parse} from "dotenv";
import {configuredGeminiModel} from "../src/lib/agent/gemini-provider";

const slotNames = Array.from({length: 7}, (_, index) => `GEMINI_API_KEY_${index + 1}`);
const placeholderPassword = "replace-with-a-long-unique-password-at-least-12-characters";
const placeholderSession = "replace-with-a-random-secret-at-least-32-characters";

export function encodeEnvValue(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error("Environment values cannot contain line breaks or NUL characters.");
  const candidates = [
    value,
    `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
    `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`,
    `\`${value.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``,
  ];
  for (const candidate of candidates) {
    if (parse(`MYNUTRI_VALUE=${candidate}`).MYNUTRI_VALUE === value) return candidate;
  }
  throw new Error("This value cannot be safely represented in a dotenv file; use a different value.");
}

export function mergeEnvText(
  existing: string,
  updates: ReadonlyMap<string, string | null>,
): string {
  const pending = new Map(updates);
  const emitted = new Set<string>();
  const output: string[] = [];
  for (const line of existing.split(/\r?\n/)) {
    const match = line.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    const key = match?.[2];
    if (!key || !pending.has(key)) {
      output.push(line);
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    const value = pending.get(key);
    if (value !== null) output.push(`${key}=${encodeEnvValue(value ?? "")}`);
  }
  for (const [key, value] of pending) {
    if (emitted.has(key) || value === null) continue;
    if (output.length && output[output.length - 1] !== "") output.push("");
    output.push(`${key}=${encodeEnvValue(value)}`);
  }
  while (output.length && output[output.length - 1] === "") output.pop();
  return output.length ? output.join("\n") + "\n" : "";
}

export function readEnvFile(path: string): Record<string, string> {
  try {
    return parse(readFileSync(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

export function loadPrivateEnvFiles(root = process.cwd()): NodeJS.ProcessEnv {
  const runtime = {...process.env};
  for (const [index, file] of [join(root, ".env"), join(root, ".env.local")].entries()) {
    if (!existsSync(file)) continue;
    loadDotenv({path: file, override: index > 0});
  }
  for (const [key, value] of Object.entries(runtime)) {
    process.env[key] = value;
  }
  return process.env;
}

function ignoredLocalFile(root: string): boolean {
  const result = spawnSync("git", ["check-ignore", "--quiet", "--", ".env.local"], {
    cwd: root,
    shell: false,
    stdio: "ignore",
  });
  return result.status === 0;
}

function sourceFor(key: string, local: Record<string, string>, base: Record<string, string>, runtime: NodeJS.ProcessEnv): string {
  if (runtime[key] !== undefined) return "process/Codespaces environment";
  if (local[key] !== undefined) return ".env.local";
  if (base[key] !== undefined) return ".env";
  return "not set";
}

function validPassword(value: string | undefined): boolean {
  return Boolean(value && value.length >= 12 && value !== placeholderPassword);
}

function validSession(value: string | undefined): boolean {
  return Boolean(value && value.length >= 32 && value !== placeholderSession);
}

function showStatus(local: Record<string, string>, base: Record<string, string>, runtime: NodeJS.ProcessEnv): void {
  const effective = {...base, ...local, ...runtime};
  console.log("Secret values are masked and will not be printed.");
  console.log(`APP_PASSWORD: ${validPassword(effective.APP_PASSWORD) ? "configured" : "missing or invalid"} (${sourceFor("APP_PASSWORD", local, base, runtime)})`);
  console.log(`SESSION_SECRET: ${validSession(effective.SESSION_SECRET) ? "configured" : "missing or invalid"} (${sourceFor("SESSION_SECRET", local, base, runtime)})`);
  for (const key of slotNames) {
    console.log(`${key}: ${effective[key]?.trim() ? "configured" : "empty"}`);
  }
  console.log(`GEMINI_API_KEY legacy fallback: ${effective.GEMINI_API_KEY?.trim() ? "configured" : "empty"}`);
  const modelId = configuredGeminiModel(effective as NodeJS.ProcessEnv);
  console.log(`GEMINI_MODEL: ${modelId ? "configured (model ID format accepted; availability not tested)" : effective.GEMINI_MODEL?.trim() ? "invalid model ID format" : "not set"}`);
}

function askLine(question: string): Promise<string> {
  const rl = createInterface({input: process.stdin, output: process.stdout});
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("Secret entry requires an interactive terminal; no value was changed.");
  }
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(question);
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      process.stdin.removeListener("keypress", onKeypress);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };
    const onKeypress = (input: string, key: {name?: string; ctrl?: boolean}) => {
      if (key.ctrl && key.name === "c") {
        finish(new Error("Configuration cancelled."));
      } else if (key.name === "return" || input === "\r" || input === "\n") {
        finish();
      } else if (key.name === "backspace" || key.name === "delete") {
        if (value.length) {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else if (!key.ctrl && input && !/[\x00-\x1f\x7f]/.test(input)) {
        value += input;
        process.stdout.write("•");
      }
    };
    process.stdin.on("keypress", onKeypress);
  });
}

async function secretUpdate(key: string, current: string | undefined, minimumLength = 1): Promise<string | null | undefined> {
  const status = current ? "currently configured" : "currently empty";
  while (true) {
    const value = await askHidden(`${key} (${status}; Enter keeps it, - clears local value): `);
    if (!value) {
      if (minimumLength > 1 && !current) {
        console.log(`${key} must be set and contain at least ${minimumLength} characters.`);
        continue;
      }
      return undefined;
    }
    if (value === "-") {
      if (minimumLength > 1) {
        console.log(`${key} is required.`);
        continue;
      }
      return null;
    }
    if (value.length < minimumLength || /[\r\n\0]/.test(value)) {
      console.log(`${key} must contain at least ${minimumLength} characters and no line breaks.`);
      continue;
    }
    encodeEnvValue(value);
    return value;
  }
}

async function writePrivateFile(path: string, contents: string): Promise<void> {
  const tempPath = `${path}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
  try {
    await writeFile(tempPath, contents, {encoding: "utf8", mode: 0o600, flag: "wx"});
    await rename(tempPath, path);
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new AggregateError([error, cleanupError], "Could not safely clean up the temporary secrets file.");
      }
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const path = join(root, ".env.local");
  const exists = existsSync(path);
  if (exists) {
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(".env.local must be a regular file, not a symlink.");
  }
  if (!ignoredLocalFile(root)) {
    console.error("WARNING: .env.local is not confirmed Git-ignored. Add an ignore rule before storing secrets; no changes were made.");
    process.exitCode = 1;
    return;
  }

  const local = readEnvFile(path);
  const base = readEnvFile(join(root, ".env"));
  const runtime = {...process.env};
  showStatus(local, base, runtime);
  if (process.argv.includes("--status")) return;

  if (exists) {
    const answer = (await askLine("Update the existing .env.local while preserving unrelated settings? [y/N] ")).trim().toLowerCase();
    if (answer !== "y" && answer !== "yes") {
      console.log("No changes made.");
      return;
    }
  }

  const effective = {...base, ...local, ...runtime};
  const updates = new Map<string, string | null>();
  let password: string | null | undefined;
  while (true) {
    password = await secretUpdate("APP_PASSWORD", validPassword(effective.APP_PASSWORD) ? effective.APP_PASSWORD : undefined, 12);
    if (typeof password !== "string") break;
    const confirmation = await askHidden("Confirm new APP_PASSWORD: ");
    if (password === confirmation) break;
    console.log("Passwords did not match; no password value was displayed.");
  }
  if (password !== undefined) updates.set("APP_PASSWORD", password);

  if (!validSession(effective.SESSION_SECRET)) {
    updates.set("SESSION_SECRET", randomBytes(32).toString("base64url"));
    console.log("A new random SESSION_SECRET will be written privately; its value will not be displayed.");
  }

  for (const key of slotNames) {
    const value = await secretUpdate(key, effective[key]);
    if (value !== undefined) updates.set(key, value);
  }
  const legacy = await secretUpdate("GEMINI_API_KEY", effective.GEMINI_API_KEY);
  if (legacy !== undefined) updates.set("GEMINI_API_KEY", legacy);
  const model = await askLine(`GEMINI_MODEL (${configuredGeminiModel(effective as NodeJS.ProcessEnv) ? "valid model ID" : effective.GEMINI_MODEL?.trim() ? "invalid model ID" : "not set"}; Enter keeps it, - clears local value): `);
  if (model === "-") updates.set("GEMINI_MODEL", null);
  else if (model.trim()) updates.set("GEMINI_MODEL", model.trim());

  if (!updates.size) {
    console.log("No settings changed.");
    return;
  }
  console.log("Settings to update: " + [...updates.keys()].join(", "));
  const shadowed = [...updates.keys()].filter((key) => runtime[key] !== undefined);
  if (shadowed.length) {
    console.log(`Process/Codespaces values for ${shadowed.join(", ")} take precedence over .env.local; change those values in private Codespaces Secrets when applicable.`);
  }
  const answer = (await askLine("Write these settings to the ignored local .env.local? [y/N] ")).trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") {
    console.log("No changes made.");
    return;
  }
  const existing = exists ? readFileSync(path, "utf8") : "";
  await writePrivateFile(path, mergeEnvText(existing, updates));
  console.log("Updated .env.local without printing secret values. Restart the local app for changes to take effect.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Local configuration failed.");
    process.exitCode = 1;
  });
}
