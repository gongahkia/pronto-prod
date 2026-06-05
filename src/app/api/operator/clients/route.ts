import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import {
  buildDefaultTriageFlow,
  compileTriageFlowToEscalationRules,
} from "@/lib/triage-flow";

const VALID_STATUS = new Set(["draft", "pilot", "live", "paused"]);

export async function POST(request: Request) {
  const user = await requireUser("operator");
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const vertical = String(form.get("vertical") ?? "").trim() || "general";
  const planTier = String(form.get("planTier") ?? "").trim() || "pilot";
  const submittedStatus = String(form.get("status") ?? "draft").trim();
  const status = VALID_STATUS.has(submittedStatus) ? submittedStatus : "draft";
  const brandVoice = String(form.get("brandVoice") ?? "").trim() || defaultBrandVoice(name);
  const slug = normalizeSlug(String(form.get("slug") ?? "") || name);

  if (!name) {
    return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ error: "Client slug is required." }, { status: 400 });
  }

  const triageFlow = buildDefaultTriageFlow();
  const compiledRules = compileTriageFlowToEscalationRules(triageFlow.nodes);

  const clientId = await transaction(async (client) => {
    let uniqueSlug = slug;
    for (let suffix = 2; suffix < 100; suffix += 1) {
      const existing = await client.query<{ id: string }>(
        "select id from clients where slug = $1 limit 1",
        [uniqueSlug],
      );
      if (!existing.rows[0]) {
        break;
      }
      uniqueSlug = `${slug}-${suffix}`;
    }

    const clientResult = await client.query<{ id: string }>(
      `
        insert into clients (name, slug, vertical, plan_tier, status, business_profile, brand_voice)
        values ($1, $2, $3, $4, $5, '{}'::jsonb, $6)
        returning id
      `,
      [name, uniqueSlug, vertical, planTier, status, brandVoice],
    );
    const createdClientId = clientResult.rows[0].id;

    await client.query(
      `
        insert into agent_configs (
          client_id,
          prompt_preamble,
          escalation_rules,
          response_provider,
          embedding_provider
        )
        values ($1, $2, $3::jsonb, 'openai', 'openai')
      `,
      [
        createdClientId,
        `You are the scoped customer-service agent for ${name}. Answer only from verified source material. Escalate instead of guessing.`,
        JSON.stringify(compiledRules),
      ],
    );

    await client.query(
      `
        insert into channels (client_id, kind, name, status, settings, credentials)
        values ($1, 'console', 'Test console', 'active', '{}'::jsonb, '{}'::jsonb)
      `,
      [createdClientId],
    );

    await client.query(
      `
        insert into triage_flows (
          client_id,
          nodes,
          edges,
          compiled_escalation_rules,
          version,
          published_at
        )
        values ($1, $2::jsonb, $3::jsonb, $4::jsonb, 1, now())
      `,
      [
        createdClientId,
        JSON.stringify(triageFlow.nodes),
        JSON.stringify(triageFlow.edges),
        JSON.stringify(compiledRules),
      ],
    );

    await client.query(
      `
        insert into brand_voice_documents (client_id, title, content, attributes, source_notes)
        values ($1, 'Brand voice guide', $2, $3::jsonb, 'Created from operator new-client workflow.')
      `,
      [
        createdClientId,
        brandVoice,
        JSON.stringify({
          formality: "professional",
          energy: "clear and practical",
          vocabulary: ["plain English", "concise", "customer-service"],
          bannedPhrases: ["as an AI language model", "I guarantee"],
        }),
      ],
    );

    await client.query(
      `
        insert into client_launch_milestones (client_id, signed_contract_at, target_live_at)
        values ($1, now(), now() + interval '7 days')
      `,
      [createdClientId],
    );

    await client.query(
      "insert into client_commercial_assumptions (client_id) values ($1)",
      [createdClientId],
    );

    await client.query(
      "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'client.created', 'client', $1, $3::jsonb)",
      [
        createdClientId,
        user.userId,
        JSON.stringify({ name, slug: uniqueSlug, vertical, planTier, status }),
      ],
    );

    return createdClientId;
  });

  return NextResponse.redirect(new URL(`/operator/clients/${clientId}`, request.url), 303);
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function defaultBrandVoice(name: string): string {
  return `Clear, practical, and professional. Keep ${name || "the client"} replies concise, answer only from verified source material, and escalate instead of guessing.`;
}
