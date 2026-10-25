import { query } from "@/lib/db";
import { selectModel } from "@/lib/llm/catalog";
import { envApiKeyForProvider } from "@/lib/llm/credentials";
import { DemoError, DEMO_CLIENT_ID } from "@/lib/customer-demo-boundary";
import type { AgentConfig } from "@/lib/types";

export function realDemoConfiguration(config: AgentConfig) {
  const provider = process.env.PRONTO_LLM_PROVIDER ?? config.response_provider;
  const embeddingProvider = process.env.PRONTO_EMBEDDING_PROVIDER ?? config.embedding_provider;
  const missing: string[] = [];
  for (const current of new Set([provider, embeddingProvider])) {
    if (!["openai", "azure", "anthropic"].includes(current))
      missing.push("a real provider (mock is not allowed)");
    else if (!envApiKeyForProvider(current)) missing.push(current === "openai" ? "OPENAI_API_KEY" :
      current === "azure" ? "AZURE_OPENAI_API_KEY" : "ANTHROPIC_API_KEY");
    if (current === "azure") {
      for (const name of ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"])
        if (!process.env[name]?.trim()) missing.push(name);
      if (!process.env.AZURE_OPENAI_RESPONSE_DEPLOYMENT?.trim() && !process.env.AZURE_OPENAI_DEPLOYMENT?.trim())
        missing.push("AZURE_OPENAI_RESPONSE_DEPLOYMENT or AZURE_OPENAI_DEPLOYMENT");
    }
  }
  if (!["openai", "azure"].includes(embeddingProvider)) missing.push("PRONTO_EMBEDDING_PROVIDER=openai or azure");
  const choice = selectModel({ provider, configuredModel: config.response_model, task: "agent_answer" });
  return { provider, model: choice.model, embeddingProvider,
    embeddingModel: process.env.PRONTO_EMBEDDING_MODEL ?? config.embedding_model,
    missing: [...new Set(missing)] };
}

export async function requireRealDemoConfiguration(requireKnowledge = true) {
  const result = await query<AgentConfig>("select * from agent_configs where client_id=$1", [DEMO_CLIENT_ID]);
  if (!result.rows[0]) throw new DemoError("Set up the PS.Cafe demo tenant first.", 503);
  const config = realDemoConfiguration(result.rows[0]);
  if (config.missing.length) throw new DemoError(`Real AI is unavailable. Configure ${config.missing.join(", ")} securely on the server.`, 503);
  if (requireKnowledge) {
    const chunks = await query<{ count: string }>(`select count(*) from knowledge_chunks where client_id=$1
      and metadata->>'embeddingProvider'=$2 and embedding_model=$3`,
      [DEMO_CLIENT_ID, config.embeddingProvider, config.embeddingModel]);
    if (Number(chunks.rows[0]?.count ?? 0) === 0)
      throw new DemoError("Real AI knowledge is not prepared. Run the guarded demo:customer:embed command; mock vectors are not real embeddings.", 503);
  }
  return config;
}
