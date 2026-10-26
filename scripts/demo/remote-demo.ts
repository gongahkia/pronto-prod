import { createHash, X509Certificate } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { chmod, lstat, mkdir, open, readFile, unlink, writeFile } from "node:fs/promises";
import https from "node:https";
import http from "node:http";
import net from "node:net";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs, parseEnv } from "node:util";
import { z } from "zod";
import { approvedEmails, demoGateway, originHeaders, privateFile, tunnelOrigin } from "./remote-boundary";

const configSchema = z.object({
  runtimeDirectory: z.string(), buildDirectory: z.string(), environmentFile: z.string(),
  providerEnvFile: z.string(), allowedEmailsFile: z.string(), cloudflared: z.string(),
  tlsKeyFile: z.string(), tlsCertFile: z.string(),
  webPort: z.number().int().min(1024).max(65535), gatewayPort: z.number().int().min(1024).max(65535),
  httpsPort: z.number().int().min(1024).max(65535), metricsPort: z.number().int().min(1024).max(65535),
}).strict();
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  config: { type: "string" }, remote: { type: "boolean", default: false },
} });
const children = new Set<ChildProcess>();
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const binaryDigest = "053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0"; // official 2026.10.3 linux-amd64

async function freePort(port: number) {
  const server = net.createServer();
  await new Promise<void>((ok, fail) => { server.once("error", fail); server.listen(port, "127.0.0.1", ok); });
  await new Promise<void>(ok => server.close(() => ok()));
}

async function main() {
  if (!values.config) throw new Error("Use pnpm demo:remote verify|serve|status|revoke|stop --config /private/config.json [--remote].");
  const config = configSchema.parse(JSON.parse((await privateFile(resolve(values.config))).toString()));
  for (const value of Object.values(config)) if (typeof value === "string" && !isAbsolute(value))
    throw new Error("Configuration paths must be absolute.");
  const dir = config.runtimeDirectory;
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink() || info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700)
    throw new Error("Runtime directory must be owned, private (700), and not a symlink.");
  const controlPath = join(dir, "control.sock");
  if (["status", "revoke", "stop"].includes(positionals[0])) {
    await new Promise<void>((ok, fail) => {
      const socket = net.connect(controlPath); socket.setTimeout(5000);
      socket.once("connect", () => socket.write(positionals[0] + "\n"));
      socket.on("data", data => process.stdout.write(data)); socket.once("end", ok);
      socket.once("error", fail); socket.once("timeout", () => socket.destroy(new Error("Control request timed out.")));
    }); return;
  }
  if (!["verify", "serve"].includes(positionals[0])) throw new Error("Unknown remote demo command.");

  const base = JSON.parse((await privateFile(config.environmentFile)).toString()) as Record<string, string>;
  const provider = parseEnv((await privateFile(config.providerEnvFile)).toString());
  if (!provider.GROQ_API_KEY || provider.PRONTO_DEMO_REAL_AI_APPROVED !== "1" || provider.PRONTO_GROQ_FREE_TIER_CONFIRMED !== "1")
    throw new Error("Private Groq configuration requires the key, explicit testing approval and Free-tier attestation.");
  // No inherited provider, SMTP, Meta, test guard or Next development settings.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(config.webPort),
    NEXT_TELEMETRY_DISABLED: "1", PRONTO_DEPLOYMENT_PROFILE: "protected-demo", PRONTO_CUSTOMER_DEMO_ENABLED: "1",
    PRONTO_DEMO_ONLY_DELIVERY: "1", PRONTO_USE_MOCK_AI: "1", PRONTO_ENFORCE_TENANT_SQL: "1", PRONTO_DISABLE_TENANT_SQL_GATE: "0",
    PRONTO_DISABLE_CSAT_HOOK: "1", // Keep the short-lived tunnel limited to the two requested interfaces.
    PRONTO_CHOPE_LIVE_READS: "0", CHOPE_LIVE_READ_APPROVED: "0", PRONTO_DB_POOL_MAX: "4",
    PRONTO_WORKER_INBOUND_LIMIT: "1", PRONTO_WORKER_OUTBOX_LIMIT: "5", PRONTO_WORKER_OUTBOX_INTERVAL_MS: "1000",
    APP_BASE_URL: `https://localhost:${config.httpsPort}`,
    GROQ_API_KEY: provider.GROQ_API_KEY, PRONTO_DEMO_REAL_AI_APPROVED: "1", PRONTO_GROQ_FREE_TIER_CONFIRMED: "1",
  };
  for (const name of ["DATABASE_URL", "PRONTO_DATABASE_CA", "AUTH_SECRET", "PRONTO_SECRETS_KEY", "PRONTO_DEMO_DATABASE_ID", "PRONTO_DEMO_ALLOWED_USER_IDS"])
    if (base[name]) env[name] = base[name];
  const db = new URL(env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(db.hostname) || !db.port || db.pathname === "/pronto_test")
    throw new Error("This launcher requires a separate, identified local protected-demo database.");
  const ports = [config.webPort, config.gatewayPort, config.httpsPort, config.metricsPort];
  if (new Set(ports).size !== ports.length || ports.includes(Number(db.port))) throw new Error("Demo service ports must be distinct.");
  const standalone = join(config.buildDirectory, ".next/standalone");
  if ((await readFile(join(config.buildDirectory, ".next/BUILD_ID"), "utf8")) !== (await readFile(join(standalone, ".next/BUILD_ID"), "utf8")))
    throw new Error("Standalone production build identity does not match.");
  const tls = { key: await privateFile(config.tlsKeyFile), cert: await privateFile(config.tlsCertFile) };
  const certificate = new X509Certificate(tls.cert);
  if (Date.now() >= Date.parse(certificate.validTo) || Date.now() < Date.parse(certificate.validFrom))
    throw new Error("Local TLS certificate is expired or not yet valid; renew it and update the private CA configuration.");
  // Explicit trust of the local certificate is for CLI/local acceptance only.
  const certPath = config.tlsCertFile;
  env.NODE_EXTRA_CA_CERTS = certPath;
  const logDir = join(dir, "logs"); await mkdir(logDir, { recursive: true, mode: 0o700 });
  let stopping = false;
  const launch = async (command: string, args: string[], label: string, childEnv = env, cwd = process.cwd()) => {
    const log = await open(join(logDir, label + ".log"), "a", 0o600);
    const child = spawn(command, args, { cwd, env: childEnv, detached: true, stdio: ["ignore", log.fd, log.fd] });
    const started = new Promise<void>((ok, fail) => { child.once("spawn", ok); child.once("error", () => fail(new Error("Owned demo process failed to start."))); });
    await log.close(); children.add(child);
    await started;
    return child;
  };
  const runPreflight = async () => {
    const child = await launch("pnpm", ["demo:protected", "preflight"], "preflight");
    const code = await new Promise<number | null>(ok => child.once("exit", ok));
    if (code !== 0) throw new Error("Protected database/Groq preflight failed. Review the private preflight log.");
  };
  await runPreflight();
  let emails: string[] = [];
  if (values.remote) {
    emails = approvedEmails(JSON.parse((await privateFile(config.allowedEmailsFile)).toString()));
    if (createHash("sha256").update(await readFile(config.cloudflared)).digest("hex") !== binaryDigest)
      throw new Error("Cloudflared must match the verified protected-tunnel binary (2026.10.3 linux-amd64).");
  }
  if (positionals[0] === "verify") { console.log("Production build, private configuration, marked database and Groq preflight passed. No tunnel opened; no inference requested."); return; }
  for (const port of ports) await freePort(port);
  // Do not replace a running controller or an unidentified stale socket.
  try { await lstat(controlPath); throw new Error("A control socket already exists. Use status/stop or investigate its owner."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const gateway = demoGateway(config.webPort);
  let tunnel: ChildProcess | undefined;
  let remoteUrl: string | undefined;
  const local = https.createServer(tls, (req, res) => {
    const upstream = http.request({ hostname: "127.0.0.1", port: config.webPort, path: req.url, method: req.method,
      headers: originHeaders(req.headers, env.APP_BASE_URL!) }, response => { res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res); });
    upstream.on("error", () => { res.writeHead(502); res.end("Local demo unavailable."); }); req.pipe(upstream);
  });
  const terminate = (child: ChildProcess | undefined) => {
    if (child?.pid && child.exitCode === null) { try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ } }
  };
  const revoke = () => { gateway.revoke(); terminate(tunnel); remoteUrl = undefined; };
  const control = net.createServer(socket => {
    socket.setTimeout(5000, () => socket.destroy());
    socket.once("data", data => {
      const action = data.toString().trim();
      if (action === "status") socket.end(JSON.stringify({ remoteUrl: remoteUrl ?? null, localUrl: `https://localhost:${config.httpsPort}`, remoteEnabled: Boolean(remoteUrl) }) + "\n");
      else if (action === "revoke") { revoke(); socket.end("Remote gateway closed and tunnel termination requested. Local application remains running.\n"); }
      else if (action === "stop") { socket.end("Stopping only the owned remote-demo web, worker and tunnel. Database and original development stack remain running.\n"); void shutdown(0); }
      else socket.end("Unknown command.\n");
    });
  });
  async function shutdown(code: number) {
    if (stopping) return; stopping = true;
    gateway.revoke(); for (const child of children) terminate(child);
    gateway.server.closeAllConnections(); gateway.server.close(); local.closeAllConnections(); local.close(); control.close();
    await delay(1500);
    for (const child of children) if (child.pid && child.exitCode === null) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* Owned process exited. */ } }
    await unlink(controlPath).catch(() => {}); process.exit(code);
  }
  process.once("SIGINT", () => void shutdown(0)); process.once("SIGTERM", () => void shutdown(0));
  process.once("uncaughtException", () => { console.error("Remote demo stopped after a runtime failure; inspect private logs."); void shutdown(1); });
  try {
    await new Promise<void>(ok => control.listen(controlPath, ok)); await chmod(controlPath, 0o600);
    await new Promise<void>(ok => gateway.server.listen(config.gatewayPort, "127.0.0.1", ok));
    if (values.remote) {
      const configPath = join(dir, "cloudflared-empty.yml"); await writeFile(configPath, "{}\n", { mode: 0o600 });
      const logPath = join(logDir, "tunnel.log");
      await writeFile(logPath, "", { mode: 0o600 });
      // Empty explicit config, clean environment, fixed destination, no public fallback.
      tunnel = await launch(config.cloudflared, ["tunnel", "--config", configPath, "--no-autoupdate", "--management-diagnostics=false",
        "--metrics", `127.0.0.1:${config.metricsPort}`, "--grace-period", "1s", "--loglevel", "info",
        "--url", `http://127.0.0.1:${config.gatewayPort}`, ...emails.flatMap(email => ["--allowed-mail", email])],
      "tunnel", { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production" });
      tunnel.once("exit", () => { gateway.revoke(); remoteUrl = undefined; });
      let assigned: string | undefined;
      for (let i = 0; i < 120; i++) {
        if (tunnel.exitCode !== null) throw new Error("Protected tunnel could not start. No public fallback attempted.");
        const log = await readFile(logPath, "utf8");
        if (log.includes("Your quick Tunnel has been created!")) throw new Error("Public tunnel refused.");
        if (log.includes("Your protected quick Tunnel has been created!") && log.includes("Authentication: One-Time PIN")) {
          const match = log.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/); if (match) { assigned = tunnelOrigin(match[0]); break; }
        }
        await delay(500);
      }
      if (!assigned) throw new Error("Protected tunnel assignment timed out; remote origin stays closed.");
      // Probe without cookies while the origin is still closed. A public or broken
      // auth configuration must never receive the actual application.
      let protectedGate = false;
      for (let i = 0; i < 15; i++) {
        try {
          const probe = await fetch(assigned + "/demo/customer", { redirect: "manual", signal: AbortSignal.timeout(3000) });
          const location = new URL(probe.headers.get("location") ?? "/", assigned);
          protectedGate = probe.status === 302 && location.origin === "https://login.trycloudflare.com" &&
            location.pathname === "/authorize" && location.searchParams.get("hostname") === new URL(assigned).hostname;
          if (protectedGate) break;
        } catch { /* DNS/connector propagation; the gateway remains closed. */ }
        await delay(1000);
      }
      if (!protectedGate) throw new Error("Unauthenticated email-PIN gateway verification failed. Origin remains closed.");
      env.APP_BASE_URL = assigned;
    }
    const web = await launch(process.execPath, [join(standalone, "server.js")], "web", env, standalone);
    const worker = await launch("pnpm", ["demo:protected:worker"], "worker");
    for (const child of [web, worker]) child.once("exit", () => { if (!stopping) { console.error("Owned web/worker stopped; remote access revoked."); void shutdown(1); } });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      try { ready = (await fetch(`http://127.0.0.1:${config.webPort}/api/readiness`, { signal: AbortSignal.timeout(3000) })).ok; } catch { /* Bounded startup polling. */ }
      if (ready) break; await delay(500);
    }
    if (!ready) throw new Error("Production web/worker readiness failed; remote access stays closed.");
    await new Promise<void>(ok => local.listen(config.httpsPort, "127.0.0.1", ok));
    if (values.remote) {
      if (tunnel?.exitCode !== null) throw new Error("Protected tunnel exited before readiness.");
      gateway.enable(env.APP_BASE_URL!); remoteUrl = env.APP_BASE_URL;
    }
    console.log(JSON.stringify({ status: "ready", mode: "production", remoteUrl: remoteUrl ?? null,
      localUrl: `https://localhost:${config.httpsPort}`, note: "App authentication remains required; no reservation or live customer transport is enabled." }));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Remote demo failed safely."); await shutdown(1);
  }
}

main().catch(error => {
  console.error("Remote demo command failed. Check private configuration, ports and logs; no public fallback was attempted.");
  // Stack locations help diagnose startup without printing config values or error payloads.
  if (error instanceof Error) console.error(error.stack?.split("\n").slice(1, 3).join("\n"));
  process.exitCode = 1;
});
