import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, resolve, join, basename } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { deploymentAccessHeaders } from "../src/lib/deployment-access";

type Session = { origin: string; cookie: string; expiresAt: number };
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  "base-url": { type: "string", default: "http://localhost:3000" },
  "session-file": { type: "string" }, "credentials-file": { type: "string" },
  "client-id": { type: "string" }, "conversation-id": { type: "string" },
  "source-id": { type: "string" }, "offset": { type: "string" },
  "method": { type: "string", default: "POST" },
  "form-file": { type: "string" }, "json-file": { type: "string" },
  "upload": { type: "string" }, "output-file": { type: "string" },
} });

async function privateRead(path: string): Promise<string> {
  const file = await open(resolve(path), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size > 1_000_000)
      throw new Error("Input files must be owned by you, private (chmod 600), regular files under 1 MB.");
    return await file.readFile("utf8");
  } finally { await file.close(); }
}

async function privateWrite(path: string, value: string) {
  const target = resolve(path);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const parentStat = await lstat(parent);
  if (!parentStat.isDirectory() || parentStat.uid !== process.getuid?.() || (parentStat.mode & 0o022) !== 0)
    throw new Error("Output directory must be owned by you and not writable by other users.");
  const existing = await lstat(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (existing && (!existing.isFile() || existing.uid !== process.getuid?.() || (existing.mode & 0o077) !== 0))
    throw new Error("Refusing to replace an unsafe output file.");
  const temporary = join(parent, `.${basename(target)}-${randomUUID()}`);
  const file = await open(temporary, "wx", 0o600);
  try { await file.writeFile(value); await file.close(); await rename(temporary, target); }
  catch (error) { await file.close().catch(() => {}); await unlink(temporary).catch(() => {}); throw error; }
}

async function credentials(): Promise<{ email: string; password: string }> {
  if (values["credentials-file"]) {
    const input = JSON.parse(await privateRead(values["credentials-file"]));
    if (typeof input.email !== "string" || typeof input.password !== "string") throw new Error("Credentials file requires email and password fields.");
    return input;
  }
  if (!process.stdin.isTTY) throw new Error("Use an interactive terminal or a private --credentials-file. Never put passwords in command arguments.");
  const emailPrompt = createInterface({ input: process.stdin, output: process.stdout });
  const email = await emailPrompt.question("Operator email: "); emailPrompt.close();
  const muted = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const passwordPrompt = createInterface({ input: process.stdin, output: muted, terminal: true });
  process.stdout.write("Password (hidden): ");
  try { return { email, password: await passwordPrompt.question("") }; }
  finally { passwordPrompt.close(); process.stdout.write("\n"); }
}

async function main() {
  const command = positionals[0];
  if (!command || command === "help") {
    console.log("Pronto operator CLI: login | inspect <clients|client|knowledge|source|channels|configuration|conversations|conversation|operations> | request /api/operator/<path> --form-file <private.json> | logout\nOptions: --base-url, --session-file, --client-id, --conversation-id, --source-id, --offset, --method POST|DELETE, --json-file, --upload (PDF form field: file), --output-file. See docs/ops/operator-cli.md.");
    return;
  }
  const base = new URL(values["base-url"]!);
  if (base.username || base.password || base.pathname !== "/" || base.search || base.hash ||
      (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))))
    throw new Error("Use an HTTPS application origin, or HTTP on loopback only, without credentials or a path.");
  const origin = base.origin;
  const sessionPath = values["session-file"] ?? join(homedir(), ".local/state/pronto", `operator-${createHash("sha256").update(origin).digest("hex").slice(0,16)}.json`);
  const send = (path: string, cookie?: string, body?: BodyInit, json = false, method = body ? "POST" : "GET") => fetch(origin + path, {
    method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(45_000),
    headers: { ...deploymentAccessHeaders(origin), Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(json ? { "Content-Type": "application/json" } : {}) }, body,
  });
  if (command === "login") {
    const input = await credentials();
    const response = await send("/api/auth/login", undefined, new URLSearchParams(input));
    const cookie = response.headers.getSetCookie().find(value => value.startsWith("pronto_session="))?.split(";")[0];
    if (response.status !== 303 || !cookie || (await send("/api/operator/inspect?view=clients", cookie)).status !== 200)
      throw new Error("Operator sign-in failed. Business accounts cannot use this CLI.");
    await privateWrite(sessionPath, JSON.stringify({ origin, cookie, expiresAt: Date.now() + 7 * 86400_000 }));
    console.log("Operator authenticated. Session stored in a private file; no business role was assumed.");
    return;
  }
  const session = JSON.parse(await privateRead(sessionPath)) as Session;
  if (session.origin !== origin || session.expiresAt <= Date.now() || !/^pronto_session=[a-zA-Z0-9_.-]+$/.test(session.cookie))
    throw new Error("Session missing, expired or for a different origin. Sign in again.");
  if (command === "logout") {
    const response = await send("/api/auth/logout", session.cookie, new URLSearchParams());
    if (response.status !== 303) throw new Error("Server sign-out failed; no automatic retry performed.");
    await unlink(sessionPath); console.log("CLI session removed."); return;
  }
  let path: string, body: BodyInit | undefined, json = false;
  if (command === "inspect") {
    const params = new URLSearchParams({ view: positionals[1] ?? "clients" });
    if (values["client-id"]) params.set("clientId", values["client-id"]);
    if (values["conversation-id"]) params.set("conversationId", values["conversation-id"]);
    if (values["source-id"]) params.set("sourceId", values["source-id"]);
    if (values.offset) params.set("offset", values.offset);
    path = `/api/operator/inspect?${params}`;
  } else if (command === "request") {
    if (!["POST", "DELETE"].includes(values.method!)) throw new Error("Administrative mutations support POST or DELETE only.");
    path = positionals[1] ?? "";
    if (!/^\/api\/operator\/[a-zA-Z0-9/-]+$/.test(path) && path !== "/api/escalations")
      throw new Error("Request path must be an administrative API path, without a query, traversal or host.");
    if (Boolean(values["form-file"]) === Boolean(values["json-file"])) throw new Error("Provide exactly one private --form-file or --json-file.");
    const input = JSON.parse(await privateRead((values["form-file"] ?? values["json-file"])!));
    if (values["json-file"]) { body = JSON.stringify(input); json = true; }
    else {
      if (!input || Array.isArray(input) || typeof input !== "object") throw new Error("Form input must be a JSON object of string fields.");
      const form = new FormData();
      for (const [key, value] of Object.entries(input)) {
        const entries = Array.isArray(value) ? value : [value];
        if (!entries.every(entry => typeof entry === "string")) throw new Error("Form values must be strings or arrays of strings; encode structured fields as JSON strings.");
        for (const entry of entries) form.append(key, entry);
      }
      if (values.upload) {
        const upload = resolve(values.upload); const stat = await lstat(upload);
        if (!stat.isFile() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0 || stat.size > 10_000_000)
          throw new Error("Upload must be a private regular file under 10 MB.");
        form.set("file", new File([await readFile(upload)], basename(upload), { type: "application/pdf" }));
      }
      body = form;
    }
  } else throw new Error("Unknown command. Use pnpm admin help.");
  const response = await send(path, session.cookie, body, json, command === "request" ? values.method : "GET");
  // Never follow redirects or automatically replay mutations after a timeout.
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : null;
  if (values["output-file"] && data) await privateWrite(values["output-file"], JSON.stringify(data, null, 2));
  if (!response.ok || !data) throw new Error(`Administrative request failed (HTTP ${response.status}). Check a private output file if supplied; no automatic retry performed.`);
  if (values["output-file"]) console.log("Administrative response saved to the private output file.");
  else console.log(JSON.stringify(data, null, 2));
}

main().catch(error => {
  // Do not print fetch causes, request bodies, cookies, or provider payloads.
  console.error(error instanceof Error && !["TypeError", "SyntaxError"].includes(error.name)
    ? error.message : "Administrative request failed. Check the origin, private files and local server.");
  process.exitCode = 1;
});
