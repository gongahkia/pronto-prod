import { query, transaction } from "@/lib/db";
import type { BrandVoiceDocument, BrandVoiceExample, Client } from "@/lib/types";
import { VOICE_EXAMPLE_LIMIT } from "@/lib/voice-style";

export type BrandVoiceProfile = {
  document: BrandVoiceDocument | null;
  examples: BrandVoiceExample[];
};

export async function getBrandVoiceProfile(
  clientId: string,
): Promise<BrandVoiceProfile> {
  const [documentResult, examplesResult] = await Promise.all([
    query<BrandVoiceDocument>(
      "select * from brand_voice_documents where client_id = $1",
      [clientId],
    ),
    query<BrandVoiceExample>(
      `
        select *
        from brand_voice_examples
        where client_id = $1
        order by is_active desc, created_at desc, id
      `,
      [clientId],
    ),
  ]);

  return {
    document: documentResult.rows[0] ?? null,
    examples: examplesResult.rows,
  };
}

export async function getPromptBrandVoiceProfile(
  clientId: string,
  limit = VOICE_EXAMPLE_LIMIT,
): Promise<BrandVoiceProfile> {
  const [documentResult, examplesResult] = await Promise.all([
    query<BrandVoiceDocument>(
      "select * from brand_voice_documents where client_id = $1",
      [clientId],
    ),
    query<BrandVoiceExample>(
      `
        select *
        from brand_voice_examples
        where client_id = $1 and is_active = true
        order by created_at desc, id
        limit $2
      `,
      [clientId, limit],
    ),
  ]);

  return {
    document: documentResult.rows[0] ?? null,
    examples: examplesResult.rows,
  };
}

export async function updateBrandVoiceDocument(input: {
  clientId: string;
  title: string;
  content: string;
  attributes: Record<string, unknown>;
  sourceNotes?: string | null;
  actorUserId: string;
}): Promise<BrandVoiceDocument | null> {
  return transaction(async (client) => {
    const clientResult = await client.query<Client>(
      "select * from clients where id = $1",
      [input.clientId],
    );
    if (!clientResult.rows[0]) {
      return null;
    }

    const updated = await client.query<BrandVoiceDocument>(
      `
        insert into brand_voice_documents (
          client_id,
          title,
          content,
          attributes,
          source_notes
        )
        values ($1, $2, $3, $4, $5)
        on conflict (client_id) do update set
          title = excluded.title,
          content = excluded.content,
          attributes = excluded.attributes,
          source_notes = excluded.source_notes,
          updated_at = now()
        returning *
      `,
      [
        input.clientId,
        input.title,
        input.content,
        input.attributes,
        input.sourceNotes ?? null,
      ],
    );

    await client.query(
      `
        update clients
        set brand_voice = $2,
            updated_at = now()
        where id = $1
      `,
      [input.clientId, input.content],
    );

    await client.query(
      `
        insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata)
        values ($1, $2, 'brand_voice.updated', 'brand_voice_document', $3, $4)
      `,
      [
        input.clientId,
        input.actorUserId,
        updated.rows[0].id,
        { title: input.title },
      ],
    );

    return updated.rows[0];
  });
}

export async function addBrandVoiceExample(input: {
  clientId: string;
  customerMessage: string;
  idealResponse: string;
  notes?: string | null;
  actorUserId: string;
}): Promise<BrandVoiceExample | null> {
  return transaction(async (client) => {
    const clientResult = await client.query<Client>(
      "select * from clients where id = $1",
      [input.clientId],
    );
    if (!clientResult.rows[0]) {
      return null;
    }

    const inserted = await client.query<BrandVoiceExample>(
      `
        insert into brand_voice_examples (
          client_id,
          customer_message,
          ideal_response,
          notes
        )
        values ($1, $2, $3, $4)
        returning *
      `,
      [
        input.clientId,
        input.customerMessage,
        input.idealResponse,
        input.notes ?? null,
      ],
    );

    await client.query(
      `
        insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata)
        values ($1, $2, 'brand_voice_example.created', 'brand_voice_example', $3, $4)
      `,
      [
        input.clientId,
        input.actorUserId,
        inserted.rows[0].id,
        { customerMessage: input.customerMessage.slice(0, 120) },
      ],
    );

    return inserted.rows[0];
  });
}

export async function setBrandVoiceExampleActive(input: {
  clientId: string;
  exampleId: string;
  isActive: boolean;
  actorUserId: string;
}): Promise<boolean> {
  const result = await query(
    `
      update brand_voice_examples
      set is_active = $3,
          updated_at = now()
      where id = $1 and client_id = $2
    `,
    [input.exampleId, input.clientId, input.isActive],
  );
  if (!result.rowCount) {
    return false;
  }
  await query(
    `
      insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata)
      values ($1, $2, 'brand_voice_example.toggled', 'brand_voice_example', $3, $4)
    `,
    [
      input.clientId,
      input.actorUserId,
      input.exampleId,
      { isActive: input.isActive },
    ],
  );
  return true;
}

export async function deleteBrandVoiceExample(input: {
  clientId: string;
  exampleId: string;
  actorUserId: string;
}): Promise<boolean> {
  const result = await query(
    "delete from brand_voice_examples where id = $1 and client_id = $2",
    [input.exampleId, input.clientId],
  );
  if (!result.rowCount) {
    return false;
  }
  await query(
    `
      insert into audit_logs (client_id, actor_user_id, action, target_type, target_id, metadata)
      values ($1, $2, 'brand_voice_example.deleted', 'brand_voice_example', $3, '{}'::jsonb)
    `,
    [input.clientId, input.actorUserId, input.exampleId],
  );
  return true;
}

export function parseBrandVoiceAttributes(value: string): Record<string, unknown> {
  if (!value.trim()) {
    return {};
  }
  const parsed = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Brand voice attributes must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export function buildBrandVoiceDraft(input: {
  clientName: string;
  sourceText: string;
}): {
  title: string;
  content: string;
  attributes: Record<string, unknown>;
  sourceNotes: string;
} {
  const text = input.sourceText.trim();
  const lowered = text.toLowerCase();
  const traits = [
    lowered.includes("friendly") || lowered.includes("warm") ? "warm" : "practical",
    lowered.includes("quick") || lowered.includes("short") || lowered.includes("concise")
      ? "concise"
      : "clear",
    lowered.includes("singlish") || lowered.includes("lah") || lowered.includes("can")
      ? "Singapore-aware"
      : "plain-English",
  ];
  const bannedPhrases = [
    "as an AI language model",
    "I guarantee",
    "I have processed",
    "I have cancelled",
    "I have refunded",
  ];

  return {
    title: `${input.clientName} brand voice guide`,
    content: [
      `${input.clientName} should sound ${traits.join(", ")}.`,
      "Keep replies short, factual, and grounded in approved business sources.",
      "Use light local phrasing only when it is natural for the customer's wording.",
      "Do not over-promise, admit fault, process refunds, mutate bookings, or imply human identity.",
      "If the source material is missing or the request needs owner judgement, say the team will check and escalate.",
    ].join("\n"),
    attributes: {
      formality: "casual-professional",
      energy: traits.includes("warm") ? "warm" : "practical",
      vocabulary: traits,
      bannedPhrases,
    },
    sourceNotes: `Drafted from ${Math.min(text.length, 5000)} characters of operator-provided brand samples.`,
  };
}
