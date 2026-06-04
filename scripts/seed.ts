import { getPool, vectorLiteral } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";
import { deterministicEmbedding } from "../src/lib/llm/mock";
import { chunkText } from "../src/lib/knowledge/chunk";

const CLIENT_ID = "00000000-0000-4000-8000-000000000001";
const OPERATOR_ID = "00000000-0000-4000-8000-000000000101";
const CLIENT_USER_ID = "00000000-0000-4000-8000-000000000102";
const CONSOLE_CHANNEL_ID = "00000000-0000-4000-8000-000000000201";
const WHATSAPP_CHANNEL_ID = "00000000-0000-4000-8000-000000000202";
const TELEGRAM_CHANNEL_ID = "00000000-0000-4000-8000-000000000203";
const SOURCE_ID = "00000000-0000-4000-8000-000000000301";
const MENU_SOURCE_ID = "00000000-0000-4000-8000-000000000302";
const RESERVATION_SOURCE_ID = "00000000-0000-4000-8000-000000000303";
const DELIVERY_SOURCE_ID = "00000000-0000-4000-8000-000000000304";
const DIETARY_SOURCE_ID = "00000000-0000-4000-8000-000000000305";
const REFUND_SOURCE_ID = "00000000-0000-4000-8000-000000000306";
const CONVERSATION_ID = "00000000-0000-4000-8000-000000000401";

const fnbKnowledge = `
North Bridge Nasi is an independent F&B operator in Singapore serving modern nasi lemak bowls and kopi.

Opening hours:
Monday to Friday: 11:00 AM to 9:30 PM.
Saturday and Sunday: 10:00 AM to 10:00 PM.
Last orders are 30 minutes before closing.
Public holiday hours are posted on Instagram and should be escalated if not listed here.

Reservations:
Tables for 1 to 6 guests can be reserved for lunch or dinner.
Same-day reservations are accepted only if there is available capacity.
The agent may explain how to reserve but must not create, cancel, or modify a booking in v1.
For groups above 6 guests, private events, or urgent same-day timing changes, escalate to the owner.

Menu:
Signature Nasi Lemak Bowl is SGD 12.80 and includes coconut rice, ayam berempah, ikan bilis, peanuts, cucumber, egg, and sambal.
Grilled Chicken Rendang Bowl is SGD 14.50.
Sambal Prawn Bowl is SGD 15.80.
Vegetarian Tempeh Bowl is SGD 11.80.
Kopi is SGD 2.20. Iced Kopi is SGD 2.80. Bandung Spritz is SGD 4.50.
The default spice level is medium. Customers may request less spicy sambal.

Dietary notes:
Vegetarian option is available with tempeh.
Peanuts, egg, shellfish, and gluten may be present in the kitchen.
All allergy questions must be answered cautiously from this policy and escalated if the customer has severe allergies.
The food is not halal-certified yet, but no pork or lard is used.

Delivery:
Islandwide delivery is available through GrabFood and Deliveroo.
Direct corporate orders above SGD 150 can be arranged with one day notice.
The agent may provide delivery options but must not promise a delivery time that is not in the source data.

Refunds and complaints:
Refund disputes, missing item claims, late delivery complaints, and negative customer sentiment must be escalated to the owner.
The agent should not issue refunds, admit fault, or promise compensation.
`;

const seedKnowledgeSources = [
  {
    id: SOURCE_ID,
    title: "North Bridge Nasi operating pack",
    sourceType: "seed",
    content: fnbKnowledge,
    metadata: { vertical: "fnb", seed: true },
  },
  {
    id: MENU_SOURCE_ID,
    title: "Menu and pricing",
    sourceType: "client_seed",
    content: `
Signature Nasi Lemak Bowl is SGD 12.80 and includes coconut rice, ayam berempah, ikan bilis, peanuts, cucumber, egg, and sambal.
Grilled Chicken Rendang Bowl is SGD 14.50.
Sambal Prawn Bowl is SGD 15.80.
Vegetarian Tempeh Bowl is SGD 11.80.
Kopi is SGD 2.20. Iced Kopi is SGD 2.80. Bandung Spritz is SGD 4.50.
The default spice level is medium. Customers may request less spicy sambal.
    `.trim(),
    metadata: { vertical: "fnb", category: "menu", seed: true },
  },
  {
    id: RESERVATION_SOURCE_ID,
    title: "Reservations policy",
    sourceType: "client_seed",
    content: `
Tables for 1 to 6 guests can be reserved for lunch or dinner.
Same-day reservations are accepted only if there is available capacity.
The agent may explain how to reserve but must not create, cancel, or modify a booking in v1.
For groups above 6 guests, private events, or urgent same-day timing changes, escalate to the owner.
    `.trim(),
    metadata: { vertical: "fnb", category: "reservations", seed: true },
  },
  {
    id: DELIVERY_SOURCE_ID,
    title: "Delivery and corporate orders",
    sourceType: "client_seed",
    content: `
Islandwide delivery is available through GrabFood and Deliveroo.
Direct corporate orders above SGD 150 can be arranged with one day notice.
The agent may provide delivery options but must not promise a delivery time that is not in the source data.
    `.trim(),
    metadata: { vertical: "fnb", category: "delivery", seed: true },
  },
  {
    id: DIETARY_SOURCE_ID,
    title: "Dietary and allergen notes",
    sourceType: "client_seed",
    content: `
Vegetarian option is available with tempeh.
Peanuts, egg, shellfish, and gluten may be present in the kitchen.
All allergy questions must be answered cautiously from this policy and escalated if the customer has severe allergies.
The food is not halal-certified yet, but no pork or lard is used.
    `.trim(),
    metadata: { vertical: "fnb", category: "dietary", seed: true },
  },
  {
    id: REFUND_SOURCE_ID,
    title: "Refunds and complaints policy",
    sourceType: "client_seed",
    content: `
Refund disputes, missing item claims, late delivery complaints, and negative customer sentiment must be escalated to the owner.
The agent should not issue refunds, admit fault, or promise compensation.
The owner should review the conversation and send the final customer reply.
    `.trim(),
    metadata: { vertical: "fnb", category: "complaints", seed: true },
  },
];

async function main() {
  const pool = getPool();
  const operatorHash = await hashPassword("pronto-operator");
  const clientHash = await hashPassword("pronto-client");

  await pool.query(
    `
      insert into clients (id, name, slug, vertical, plan_tier, status, business_profile, brand_voice)
      values ($1, 'North Bridge Nasi', 'north-bridge-nasi', 'fnb', 'trial', 'pilot', $2, $3)
      on conflict (id) do update set
        business_profile = excluded.business_profile,
        brand_voice = excluded.brand_voice,
        updated_at = now()
    `,
    [
      CLIENT_ID,
      {
        location: "North Bridge Road, Singapore",
        ownerName: "Mei",
        notificationPreference: "telegram",
        responseSla: "Pilot support, business hours",
      },
      `Warm, quick, practical, and Singapore-aware. Keep replies concise, use plain English with light Singlish only when natural, never sound like a generic chatbot, and avoid over-promising. If unsure, say the team will check.`,
    ],
  );

  await pool.query(
    `
      insert into users (id, client_id, email, name, role, password_hash)
      values
        ($1, null, 'operator@pronto.sg', 'Pronto Operator', 'operator', $2),
        ($3, $4, 'owner@northbridgenasi.sg', 'Mei Tan', 'client', $5)
      on conflict (email) do update set password_hash = excluded.password_hash
    `,
    [OPERATOR_ID, operatorHash, CLIENT_USER_ID, CLIENT_ID, clientHash],
  );

  await pool.query(
    `
      insert into agent_configs (client_id, prompt_preamble, escalation_rules, retrieval_threshold, response_provider, embedding_provider)
      values ($1, $2, $3, 0.0500, 'openai', 'openai')
      on conflict (client_id) do update set
        prompt_preamble = excluded.prompt_preamble,
        escalation_rules = excluded.escalation_rules,
        retrieval_threshold = excluded.retrieval_threshold,
        response_provider = excluded.response_provider,
        embedding_provider = excluded.embedding_provider,
        updated_at = now()
    `,
    [
      CLIENT_ID,
      "You are the scoped customer-service agent for North Bridge Nasi. Answer only from verified source material. Escalate instead of guessing.",
      {
        alwaysEscalateTopics: [
          "refund_dispute",
          "complaint",
          "medical_or_legal",
          "booking_mutation",
          "payment",
          "severe_allergy",
        ],
        sentimentTriggers: ["angry", "urgent", "frustrated"],
      },
    ],
  );

  await pool.query(
    `
      insert into channels (id, client_id, kind, name, status, external_id, credentials, settings)
      values
        ($1, $2, 'console', 'Pilot console', 'active', 'local-console', '{}'::jsonb, '{}'::jsonb),
        ($3, $2, 'whatsapp', 'WhatsApp Cloud API', 'draft', 'demo-phone-number-id', '{"phoneNumberId":"demo-phone-number-id"}'::jsonb, '{"verifyToken":"local-pronto-verify-token"}'::jsonb),
        ($4, $2, 'telegram', 'Telegram bot', 'draft', 'demo-telegram-bot', '{}'::jsonb, '{"webhookSecret":"local-pronto-telegram-secret"}'::jsonb)
      on conflict (id) do update set
        status = excluded.status,
        external_id = excluded.external_id,
        credentials = excluded.credentials,
        settings = excluded.settings,
        updated_at = now()
    `,
    [CONSOLE_CHANNEL_ID, CLIENT_ID, WHATSAPP_CHANNEL_ID, TELEGRAM_CHANNEL_ID],
  );

  for (const source of seedKnowledgeSources) {
    await pool.query(
      `
        insert into knowledge_sources (id, client_id, title, source_type, content, metadata)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (id) do update set
          title = excluded.title,
          source_type = excluded.source_type,
          content = excluded.content,
          metadata = excluded.metadata
      `,
      [
        source.id,
        CLIENT_ID,
        source.title,
        source.sourceType,
        source.content,
        source.metadata,
      ],
    );

    await pool.query("delete from knowledge_chunks where source_id = $1", [
      source.id,
    ]);

    await pool.query(
      `
        insert into knowledge_source_versions (
          source_id,
          client_id,
          version_number,
          title,
          content,
          metadata,
          change_type,
          actor_user_id
        )
        values ($1, $2, 1, $3, $4, $5, 'created', null)
        on conflict (source_id, version_number) do update set
          title = excluded.title,
          content = excluded.content,
          metadata = excluded.metadata
      `,
      [
        source.id,
        CLIENT_ID,
        source.title,
        source.content,
        source.metadata,
      ],
    );

    const chunks = chunkText(source.content, { maxCharacters: 900, overlap: 120 });
    for (const [index, chunk] of chunks.entries()) {
      const embedding = deterministicEmbedding(chunk.content);
      await pool.query(
        `
          insert into knowledge_chunks (source_id, client_id, chunk_index, content, token_estimate, embedding, metadata)
          values ($1, $2, $3, $4, $5, $6::vector, $7)
        `,
        [
          source.id,
          CLIENT_ID,
          index,
          chunk.content,
          chunk.tokenEstimate,
          vectorLiteral(embedding),
          { seed: true },
        ],
      );
    }
  }

  await pool.query(
    `
      insert into conversations (id, client_id, channel_id, external_thread_id, customer_name, customer_handle, status)
      values ($1, $2, $3, 'seed-console-thread', 'Alicia', '+6590000000', 'active')
      on conflict (id) do nothing
    `,
    [CONVERSATION_ID, CLIENT_ID, CONSOLE_CHANNEL_ID],
  );

  await pool.query(
    `
      insert into messages (conversation_id, client_id, channel_id, external_message_id, sender_role, body, metadata)
      values
        ($1, $2, $3, 'seed-1', 'customer', 'Are you open this Sunday?', '{}'::jsonb),
        ($1, $2, $3, 'seed-2', 'agent', 'Yes. We open Saturday and Sunday from 10:00 AM to 10:00 PM, with last orders 30 minutes before closing.', '{"source":"seed"}'::jsonb)
      on conflict (channel_id, external_message_id) do nothing
    `,
    [CONVERSATION_ID, CLIENT_ID, CONSOLE_CHANNEL_ID],
  );

  console.log("Seeded Pronto demo client.");
  console.log("Operator login: operator@pronto.sg / pronto-operator");
  console.log("Client login: owner@northbridgenasi.sg / pronto-client");

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
