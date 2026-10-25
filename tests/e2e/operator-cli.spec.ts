import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { getPool } from "../../src/lib/db";
import { verifyTestDatabase } from "../../scripts/test-db-safety";

const execute = promisify(execFile);
test("authenticated CLI replaces onboarding, knowledge publication and local channel activation without bypassing business approvals", async ({ playwright }) => {
  test.setTimeout(240_000); await verifyTestDatabase();
  const directory = await mkdtemp(join(tmpdir(), "pronto-admin-acceptance-"));
  const origin = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const sessionFile = join(directory, "session.json"); let clientId = "";
  const privateJson = async (name: string, data: unknown) => {
    const path = join(directory, name); await writeFile(path, JSON.stringify(data), { mode: 0o600 }); return path;
  };
  const cli = async (args: string[], succeeds = true) => {
    const output = join(directory, `response-${randomUUID()}.json`);
    const command = ["admin", ...args, "--base-url", origin, "--session-file", sessionFile, "--output-file", output];
    if (succeeds) await execute("pnpm", command, { timeout: 60_000 });
    else await expect(execute("pnpm", command, { timeout: 60_000 })).rejects.toThrow();
    return JSON.parse(await readFile(output, "utf8").catch(() => "null"));
  };
  const mutate = async (path: string, data: unknown, succeeds = true) => cli(["request", path,
    "--form-file", await privateJson(`${randomUUID()}.json`, data)], succeeds);
  const owner = await playwright.request.newContext({ baseURL: origin, extraHTTPHeaders: { origin } });
  try {
    const credentials = await privateJson("operator.json", { email: "operator@pronto.sg", password: "pronto-operator" });
    await cli(["login", "--credentials-file", credentials]);
    expect((await stat(sessionFile)).mode & 0o777).toBe(0o600);
    const created = await mutate("/api/operator/clients", { name: `CLI acceptance ${randomUUID()}`,
      initialUserName: "Synthetic business reviewer", initialUserEmail: `cli-${randomUUID()}@example.test`,
      initialUserPassword: "local-cli-review-password" });
    clientId = created.clientId; expect(clientId).toBeTruthy();
    let details = await cli(["inspect", "client", "--client-id", clientId]);
    expect(details.client.status).toBe("draft"); expect(details.onboarding).toHaveLength(5);
    const user = details.users[0];
    for (const capability of ["knowledge.approve", "channel.activate"])
      await mutate(`/api/operator/clients/${clientId}/permissions`, { userId: user.id, capability, action: "grant", evidence: "Synthetic isolated CLI acceptance delegation" });
    const login = await owner.post("/api/auth/login", { form: { email: user.email, password: "local-cli-review-password" }, maxRedirects: 0 });
    expect(login.status()).toBe(303);
    expect((await owner.get("/api/operator/inspect?view=clients")).status()).toBe(403);
    const stages = {
      profile: { "detail.businessName": "CLI test", "detail.timezone": "Asia/Singapore", "detail.serviceScope": "FAQ", "evidence.sourceReview": "Synthetic fixture" },
      communications: { "detail.customerChannels": "Local email", "detail.staffPreference": "Email", "evidence.identityReview": "Synthetic identity" },
      knowledge: { "detail.knowledgeScope": "Hours", "detail.escalationRules": "Ask staff", "evidence.sourceReview": "Synthetic source" },
      testing: { "detail.testPlan": "Local isolated checks", "evidence.localTest": "Synthetic fixture", "evidence.handoffTest": "Local only" },
      activation: { "detail.monitorOwner": "Test reviewer", "detail.rollbackContact": "Test operator", "evidence.approvalRecord": "Synthetic approval" },
    };
    for (const [stage, fields] of Object.entries(stages)) {
      await mutate("/api/operator/onboarding", { clientId, stage, action: "submit", revision: "1", ...fields });
      const approval = await owner.post("/api/client/onboarding/approve", { form: { stage, revision: "2" }, maxRedirects: 0 });
      expect(approval.status()).toBe(303);
    }
    expect((await mutate("/api/operator/onboarding", { clientId, stage: "profile", action: "save", revision: "1" }, false)).error).toContain("changed");
    await mutate("/api/operator/knowledge", { clientId, title: "Synthetic opening hours", content: "The synthetic CLI restaurant closes at 10:00pm." });
    const knowledge = await cli(["inspect", "knowledge", "--client-id", clientId]);
    const submission = knowledge.submissions[0];
    expect((await mutate("/api/operator/knowledge-submissions", { clientId, submissionId: submission.id, revision: "1" }, false)).error).toContain("business approval");
    const sourceApproval = await owner.post("/api/client/knowledge-submissions", { form: { submissionId: submission.id, revision: "1", action: "approve", note: "Synthetic business source review" }, maxRedirects: 0 });
    expect(sourceApproval.status()).toBe(303);
    await mutate("/api/operator/knowledge-submissions", { clientId, submissionId: submission.id, revision: "1" });
    const draft = (await cli(["inspect", "knowledge", "--client-id", clientId])).draft;
    const preview = await privateJson("preview.json", { clientId, channelId: "preview", message: "What time do you close?" });
    await cli(["request", "/api/operator/assistant-test", "--json-file", preview]);
    const assistantApproval = await owner.post("/api/client/approvals", { form: { kind: "assistant", revision: String(draft.edit_version), evidence: "Reviewed synthetic tested assistant" }, maxRedirects: 0 });
    expect(assistantApproval.status()).toBe(303);
    await mutate("/api/operator/assistant/publish", { clientId });
    expect((await cli(["inspect", "knowledge", "--client-id", clientId])).sources).toHaveLength(1);
    const channelId = randomUUID();
    await getPool().query(`insert into channels(id,client_id,kind,name,status,credentials,last_health_status,last_health_check_at)
      values($1,$2,'email','Synthetic local SMTP','draft','{"provider":"local_smtp"}','healthy',now())`, [channelId, clientId]);
    details = await cli(["inspect", "client", "--client-id", clientId]); const revision = details.channels[0].revision;
    expect(details.channels[0].credentials).toBeUndefined();
    expect((await mutate("/api/operator/channels/activation", { clientId, channelId, revision, action: "activate" }, false)).error).toContain("business approval");
    const channelApproval = await owner.post("/api/client/approvals", { form: { kind: "channel", targetId: channelId, revision, evidence: "Synthetic local SMTP approval" }, maxRedirects: 0 });
    expect(channelApproval.status()).toBe(303);
    for (const checkKind of ["ownership", "local_test"]) await mutate("/api/operator/channels/activation", { clientId, channelId, revision,
      action: "evidence", checkKind, details: "Synthetic isolated local-only acceptance; no provider account" });
    await mutate("/api/operator/channels/activation", { clientId, channelId, revision, action: "activate" });
    await mutate("/api/operator/onboarding", { clientId, stage: "activation", action: "activate", revision: "2" });
    details = await cli(["inspect", "client", "--client-id", clientId]);
    expect(details.channels[0].status).toBe("active"); expect(details.client.status).toBe("live");
    const audit = await getPool().query("select action from audit_logs where client_id=$1", [clientId]);
    expect(audit.rows.map(row => row.action)).toEqual(expect.arrayContaining(["client.created", "onboarding.approved", "channel.activated_by_operator", "knowledge_source.approved"]));
    // Storage/removal only: no provider test, real account or external request.
    const credentialInput = await privateJson("integration.json", { clientId, provider: "custom_inventory", apiKey: "synthetic-cli-fixture-key", label: "CLI isolated fixture" });
    await cli(["request", "/api/operator/integrations", "--json-file", credentialInput]);
    expect((await cli(["inspect", "channels", "--client-id", clientId])).integrations).toHaveLength(1);
    const deletion = await privateJson("integration-delete.json", { clientId, provider: "custom_inventory", label: "CLI isolated fixture" });
    await cli(["request", "/api/operator/integrations", "--method", "DELETE", "--json-file", deletion]);
    expect((await cli(["inspect", "channels", "--client-id", clientId])).integrations).toHaveLength(0);
    await cli(["logout"]);
    await expect(stat(sessionFile)).rejects.toThrow();
    const businessCredentials = await privateJson("business.json", { email: user.email, password: "local-cli-review-password" });
    await cli(["login", "--credentials-file", businessCredentials], false);
    await expect(stat(sessionFile)).rejects.toThrow();
  } finally {
    await owner.dispose();
    if (clientId) await getPool().query("delete from clients where id=$1", [clientId]);
    await rm(directory, { recursive: true, force: true });
  }
});
