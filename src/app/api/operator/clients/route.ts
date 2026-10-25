import { assertSameOrigin } from "@/lib/http/csrf";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  buildDefaultTriageFlow,
  compileTriageFlowToEscalationRules,
} from "@/lib/triage-flow";

const MIN_INITIAL_PASSWORD_LENGTH = 8;

function creationError(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  const csrf = assertSameOrigin(request);
  if (csrf) return csrf;

  const user = await requireUser("operator");
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const vertical = String(form.get("vertical") ?? "").trim() || "general";
  const planTier = String(form.get("planTier") ?? "").trim() || "pilot";
  const status = "draft";
  const brandVoice = String(form.get("brandVoice") ?? "").trim() || defaultBrandVoice(name);
  const slug = normalizeSlug(String(form.get("slug") ?? "") || name);
  const initialUserName = String(form.get("initialUserName") ?? "").trim();
  const initialUserEmail = String(form.get("initialUserEmail") ?? "").trim().toLowerCase();
  const initialUserPassword = String(form.get("initialUserPassword") ?? "");
  const initialUserFields = [initialUserName, initialUserEmail, initialUserPassword];
  const anyInitialUserField = initialUserFields.some((value) => value.length > 0);
  const allInitialUserFields = initialUserFields.every((value) => value.length > 0);

  if (!name) {
    return creationError("Client name is required.");
  }
  if (!slug) {
    return creationError("Client slug is required.");
  }
  if (anyInitialUserField && !allInitialUserFields) {
    return creationError("Initial user requires name, email, and password.");
  }
  if (allInitialUserFields && initialUserPassword.length < MIN_INITIAL_PASSWORD_LENGTH) {
    return creationError(
      `Initial user password must be at least ${MIN_INITIAL_PASSWORD_LENGTH} characters.`,
    );
  }

  const initialUserPasswordHash = allInitialUserFields
    ? await hashPassword(initialUserPassword)
    : null;

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
      `insert into onboarding_stages (client_id, stage)
       select $1, stage from (values ('profile'), ('communications'), ('knowledge'), ('testing'), ('activation')) s(stage)`,
      [createdClientId],
    );

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
      "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'client.created', 'client', $1, $3::jsonb)",
      [
        createdClientId,
        user.userId,
        JSON.stringify({ name, slug: uniqueSlug, vertical, planTier, status }),
      ],
    );

    if (initialUserPasswordHash) {
      const existingEmail = await client.query<{ id: string }>(
        "select id from users where email = $1 limit 1",
        [initialUserEmail],
      );
      if (existingEmail.rows[0]) {
        throw new ClientCreationError("Initial user email is already in use.");
      }
      const userResult = await client.query<{ id: string }>(
        `insert into users (client_id, email, name, role, password_hash)
         values ($1, $2, $3, 'client', $4)
         returning id`,
        [createdClientId, initialUserEmail, initialUserName, initialUserPasswordHash],
      );
      await client.query(
        "insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata) values ($1, $2, 'client_user.created', 'user', $3, $4::jsonb)",
        [
          createdClientId,
          user.userId,
          userResult.rows[0].id,
          JSON.stringify({ email: initialUserEmail, name: initialUserName, role: "client" }),
        ],
      );
    }

    return createdClientId;
  }).catch((error) => {
    if (error instanceof ClientCreationError) {
      return { error: error.message } as const;
    }
    throw error;
  });

  if (typeof clientId !== "string") {
    return creationError(clientId.error);
  }

  return NextResponse.json({ ok: true, clientId });
}

class ClientCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientCreationError";
  }
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
