import { query, transaction, vectorLiteral } from "@/lib/db";
import { assertCustomerDemoEnabled, DEMO_CLIENT_ID, DEMO_CHANNEL_ID, DEMO_SLUG, DemoError } from "@/lib/customer-demo-boundary";
import { requireRealDemoConfiguration } from "@/lib/customer-demo-ai";
import { getEmbeddingProvider } from "@/lib/llm";
import { withAiExecutionMode } from "@/lib/llm/execution-mode";
import { recordAuditLog } from "@/lib/audit";

export async function setupCustomerSimulator() {
  await assertCustomerDemoEnabled();
  await transaction(async db => {
    const client = await db.query<{ id: string }>(`select id from clients where id=$1 and slug=$2
      and business_profile->>'demoSeed'='ps-cafe-raffles-city-v1' for update`, [DEMO_CLIENT_ID, DEMO_SLUG]);
    if (!client.rows[0]) throw new DemoError("Set up the guarded PS.Cafe demo tenant first.");
    const channel = await db.query<{ client_id: string; kind: string; settings: Record<string, unknown> }>(
      "select client_id,kind,settings from channels where id=$1", [DEMO_CHANNEL_ID]);
    if (channel.rows[0] && (channel.rows[0].client_id !== DEMO_CLIENT_ID || channel.rows[0].kind !== "console" ||
        channel.rows[0].settings.transport !== "customer_simulator")) throw new DemoError("Simulator channel identity is occupied.");
    await db.query(`insert into channels (id,client_id,kind,name,status,settings)
      values ($1,$2,'console','Simulated Instagram DM','active','{"transport":"customer_simulator"}'::jsonb)
      on conflict (id) do nothing`, [DEMO_CHANNEL_ID, DEMO_CLIENT_ID]);
    await recordAuditLog({ clientId: DEMO_CLIENT_ID, actorUserId: null, action: "demo.simulator_prepared", targetType: "channel", targetId: DEMO_CHANNEL_ID }, db);
  });
}

export async function prepareRealDemoEmbeddings() {
  await assertCustomerDemoEnabled();
  const config = await requireRealDemoConfiguration(false);
  const chunks = await query<{ id: string; content: string; source_id: string }>(`select k.id,k.content,k.source_id
    from knowledge_chunks k join knowledge_sources s on s.id=k.source_id and s.client_id=k.client_id
    where k.client_id=$1 and coalesce(s.metadata->>'archived','false')<>'true' order by k.id`, [DEMO_CLIENT_ID]);
  if (!chunks.rows.length) throw new DemoError("No published demo knowledge chunks exist.");
  const vectors = await withAiExecutionMode("real", () => getEmbeddingProvider(config.embeddingProvider)
    .embed(chunks.rows.map(row => row.content), config.embeddingModel, { clientId: DEMO_CLIENT_ID, operation: "embedding" }));
  if (vectors.length !== chunks.rows.length || vectors.some(vector => ![1536, 3072].includes(vector.length) || vector.some(value => !Number.isFinite(value))))
    throw new DemoError("Provider returned invalid embedding dimensions.");
  await transaction(async db => {
    for (const [index, chunk] of chunks.rows.entries()) {
      const updated = await db.query(`update knowledge_chunks k set embedding=$4::vector, embedding_model=$5,
        embedding_dimensions=$6, metadata=k.metadata || jsonb_build_object('embeddingProvider',$7::text)
        where k.id=$1 and k.client_id=$2 and k.content=$3 and exists(select 1 from knowledge_sources s
          where s.id=k.source_id and s.client_id=$2 and coalesce(s.metadata->>'archived','false')<>'true') returning k.id`,
        [chunk.id, DEMO_CLIENT_ID, chunk.content, vectorLiteral(vectors[index]), config.embeddingModel, vectors[index].length, config.embeddingProvider]);
      if (!updated.rowCount) throw new DemoError("Published knowledge changed during embedding preparation. Retry against the current revision.");
    }
    await recordAuditLog({ clientId: DEMO_CLIENT_ID, actorUserId: null, action: "demo.real_embeddings_prepared",
      targetType: "knowledge", metadata: { provider: config.embeddingProvider, model: config.embeddingModel, count: vectors.length } }, db);
  });
  return { provider: config.embeddingProvider, model: config.embeddingModel, count: vectors.length };
}
