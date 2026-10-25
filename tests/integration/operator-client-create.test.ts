import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPool } from "@/lib/db";

const fakes = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: fakes.requireUser }));
import { POST } from "@/app/api/operator/clients/route";

const dbDescribe = process.env.PRONTO_RUN_DB_TESTS === "1" ? describe : describe.skip;
dbDescribe("canonical Pronto business creation", () => {
  let createdId: string | null = null;
  let operatorId: string;
  beforeEach(async () => {
    operatorId = randomUUID();
    await getPool().query("insert into users (id, email, name, role, password_hash) values ($1, $2, 'Test operator', 'operator', 'unused')",
      [operatorId, `create-${operatorId}@example.test`]);
  });
  afterEach(async () => {
    if (createdId) await getPool().query("delete from clients where id = $1", [createdId]);
    await getPool().query("delete from users where id = $1", [operatorId]);
    createdId = null;
  });
  afterAll(async () => { await getPool().end(); });

  it("ignores a submitted live status and creates five draft onboarding stages", async () => {
    fakes.requireUser.mockResolvedValue({ userId: operatorId, role: "operator", clientId: null,
      email: "test-operator@example.test", name: "Test operator" });
    const slug = `create-${randomUUID()}`;
    const form = new FormData();
    form.set("name", "Creation test"); form.set("slug", slug);
    form.set("status", "live");
    const response = await POST(new Request("http://localhost/api/operator/clients", {
      method: "POST", headers: { origin: "http://localhost", host: "localhost" }, body: form,
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    const row = (await getPool().query<{ id: string; status: string }>(
      "select id, status from clients where slug = $1", [slug])).rows[0];
    createdId = row.id;
    expect(row.status).toBe("draft");
    const stages = await getPool().query<{ stage: string; state: string }>(
      "select stage, state from onboarding_stages where client_id = $1", [createdId]);
    expect(stages.rows).toHaveLength(5);
    expect(stages.rows.every((stage) => stage.state === "draft")).toBe(true);
  });
});
