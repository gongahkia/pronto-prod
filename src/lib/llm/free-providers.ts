export type FreeLlmProviderId =
  | "ai21"
  | "alibaba"
  | "cohere"
  | "deepseek"
  | "gemini"
  | "mistral"
  | "zai"
  | "cerebras"
  | "cloudflare"
  | "github_models"
  | "groq"
  | "huggingface"
  | "kilo"
  | "llm7"
  | "modelscope"
  | "nebius"
  | "nscale"
  | "nvidia"
  | "ollama_cloud"
  | "openrouter"
  | "ovhcloud"
  | "siliconflow"
  | "aionlabs"
  | "xai";

export type FreeLlmProvider = {
  id: FreeLlmProviderId;
  name: string;
  country: string;
  url: string;
  baseUrl: string;
  description: string;
  defaultModel: string;
  models: string[];
  openAiCompatible: boolean;
  requiresAccount: boolean;
  requiresApiKey: boolean;
  priority: "no-key" | "key-only" | "account";
};

export const FREE_LLM_PROVIDERS: FreeLlmProvider[] = [
  {
    id: "llm7",
    name: "LLM7.io",
    country: "GB",
    url: "https://api.llm7.io/",
    baseUrl: "https://api.llm7.io/v1",
    description: "No-registration basic access, 30+ models, OpenAI-compatible.",
    defaultModel: "deepseek-r1-0528",
    models: ["deepseek-r1-0528"],
    openAiCompatible: true,
    requiresAccount: false,
    requiresApiKey: false,
    priority: "no-key",
  },
  {
    id: "ovhcloud",
    name: "OVHcloud AI Endpoints",
    country: "FR",
    url: "https://endpoints.ai.cloud.ovh.net/",
    baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
    description: "Anonymous free tier, 2 RPM per IP per model, OpenAI-compatible.",
    defaultModel: "Meta-Llama-3_3-70B-Instruct",
    models: ["Meta-Llama-3_3-70B-Instruct"],
    openAiCompatible: true,
    requiresAccount: false,
    requiresApiKey: false,
    priority: "no-key",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    country: "US",
    url: "https://openrouter.ai/",
    baseUrl: "https://openrouter.ai/api/v1",
    description: "Free models use the :free suffix. OpenAI-compatible.",
    defaultModel: "deepseek/deepseek-r1-0528:free",
    models: ["deepseek/deepseek-r1-0528:free"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "groq",
    name: "Groq",
    country: "US",
    url: "https://console.groq.com/keys",
    baseUrl: "https://api.groq.com/openai/v1",
    description: "Free tier, no credit card, fast LPU inference.",
    defaultModel: "llama-3.3-70b-versatile",
    models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "qwen3-32b"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "github_models",
    name: "GitHub Models",
    country: "US",
    url: "https://github.com/marketplace/models",
    baseUrl: "https://models.github.ai/inference",
    description: "Free prototyping for GitHub users with per-request limits.",
    defaultModel: "openai/gpt-4.1-mini",
    models: ["openai/gpt-4.1-mini", "openai/gpt-4o", "meta/Meta-Llama-3.3-70B"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "huggingface",
    name: "Hugging Face Router",
    country: "US",
    url: "https://huggingface.co/settings/tokens",
    baseUrl: "https://router.huggingface.co/v1",
    description: "Free monthly inference credits through Hugging Face Router.",
    defaultModel: "meta-llama/Meta-Llama-3.1-8B-Instruct",
    models: ["meta-llama/Meta-Llama-3.1-8B-Instruct"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    country: "US",
    url: "https://cloud.cerebras.ai/",
    baseUrl: "https://api.cerebras.ai/v1",
    description: "Free tier, no credit card, 1M tokens/day cap.",
    defaultModel: "llama-3.3-70b",
    models: ["llama-3.3-70b", "gpt-oss-120b", "qwen-3-32b"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    country: "CN",
    url: "https://platform.deepseek.com/api_keys",
    baseUrl: "https://api.deepseek.com/v1",
    description: "Signup credits, no credit card; prompts may be used for training unless opted out.",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "mistral",
    name: "Mistral AI",
    country: "FR",
    url: "https://console.mistral.ai/api-keys",
    baseUrl: "https://api.mistral.ai/v1",
    description: "Free experiment plan, no credit card.",
    defaultModel: "mistral-small-2603",
    models: ["mistral-small-2603", "mistral-medium-2505", "open-mistral-nemo"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "zai",
    name: "Z AI",
    country: "CN",
    url: "https://open.bigmodel.cn/usercenter/apikeys",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    description: "Permanent free models, no credit card required.",
    defaultModel: "glm-4.5-flash",
    models: ["glm-4.7-flash", "glm-4.5-flash", "glm-4.6v-flash"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "alibaba",
    name: "Alibaba Cloud Model Studio",
    country: "CN",
    url: "https://bailian.console.alibabacloud.com/?apiKey=1",
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    description: "International/Singapore signup tokens, no credit card.",
    defaultModel: "qwen3-plus",
    models: ["qwen3-max", "qwen3-plus", "qwen3-coder-plus"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "account",
  },
  {
    id: "kilo",
    name: "Kilo Code",
    country: "US",
    url: "https://kilo.ai/",
    baseUrl: "https://api.kilo.ai/api/gateway",
    description: "Free models and auto-router, no credit card required.",
    defaultModel: "kilo-auto/free",
    models: ["kilo-auto/free", "x-ai/grok-code-fast-1:free"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "modelscope",
    name: "ModelScope",
    country: "CN",
    url: "https://modelscope.cn/my/myaccesstoken",
    baseUrl: "https://api-inference.modelscope.cn/v1",
    description: "Free registered API inference; may require Alibaba account binding.",
    defaultModel: "Qwen/Qwen3.5-35B-A3B",
    models: ["Qwen/Qwen3.5-35B-A3B"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "account",
  },
  {
    id: "nebius",
    name: "Nebius",
    country: "NL",
    url: "https://studio.nebius.com/",
    baseUrl: "https://api.studio.nebius.com/v1",
    description: "$1 signup credits, no credit card.",
    defaultModel: "meta-llama/Meta-Llama-3.3-70B-Instruct",
    models: ["meta-llama/Meta-Llama-3.3-70B-Instruct"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "nscale",
    name: "Nscale",
    country: "GB",
    url: "https://platform.nscale.com/",
    baseUrl: "https://inference.api.nscale.com/v1",
    description: "$5 signup credits, no credit card.",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    models: ["meta-llama/Llama-3.3-70B-Instruct"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    country: "US",
    url: "https://build.nvidia.com/",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    description: "Free with NVIDIA Developer Program membership.",
    defaultModel: "deepseek-ai/deepseek-r1",
    models: ["deepseek-ai/deepseek-r1"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "account",
  },
  {
    id: "siliconflow",
    name: "SiliconFlow",
    country: "CN",
    url: "https://cloud.siliconflow.cn/account/ak",
    baseUrl: "https://api.siliconflow.cn/v1",
    description: "Permanent free models with daily request caps.",
    defaultModel: "Qwen/Qwen3-8B",
    models: ["Qwen/Qwen3-8B"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "account",
  },
  {
    id: "aionlabs",
    name: "Aion Labs",
    country: "US",
    url: "https://aionlabs.ai/",
    baseUrl: "https://api.aionlabs.ai/v1",
    description: "Free daily token allowance, no credit card.",
    defaultModel: "aion-2.0",
    models: ["aion-2.0"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "xai",
    name: "xAI",
    country: "US",
    url: "https://console.x.ai/",
    baseUrl: "https://api.x.ai/v1",
    description: "Signup credit, no credit card.",
    defaultModel: "grok-4.3",
    models: ["grok-4.3"],
    openAiCompatible: true,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "ai21",
    name: "AI21 Labs",
    country: "IL",
    url: "https://studio.ai21.com/account/api-key",
    baseUrl: "https://api.ai21.com/studio/v1",
    description: "$10 signup credits, no credit card; expires in 3 months.",
    defaultModel: "jamba-mini",
    models: ["jamba-large", "jamba-mini"],
    openAiCompatible: false,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "account",
  },
  {
    id: "cohere",
    name: "Cohere",
    country: "CA",
    url: "https://dashboard.cohere.com/api-keys",
    baseUrl: "https://api.cohere.com/v2",
    description: "Free trial key, 1,000 API calls/month, non-commercial use only.",
    defaultModel: "command-r7b-12-2024",
    models: ["command-a-03-2025", "command-r-08-2024", "command-r7b-12-2024"],
    openAiCompatible: false,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    country: "US",
    url: "https://aistudio.google.com/app/apikey",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    description: "Free tier availability varies by region; prompts may be used to improve products.",
    defaultModel: "gemini-2.5-flash-lite",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    openAiCompatible: false,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "key-only",
  },
  {
    id: "cloudflare",
    name: "Cloudflare Workers AI",
    country: "US",
    url: "https://dash.cloudflare.com/profile/api-tokens",
    baseUrl: "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run",
    description: "10,000 Neurons/day free; account-specific endpoint.",
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    models: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast"],
    openAiCompatible: false,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "account",
  },
  {
    id: "ollama_cloud",
    name: "Ollama Cloud",
    country: "US",
    url: "https://ollama.com/",
    baseUrl: "https://api.ollama.com",
    description: "Free tier with qualitative limits; uses Ollama API, not OpenAI-compatible.",
    defaultModel: "gpt-oss:120b-cloud",
    models: ["gpt-oss:120b-cloud"],
    openAiCompatible: false,
    requiresAccount: true,
    requiresApiKey: true,
    priority: "account",
  },
];

export function freeProviderById(id: string | null | undefined): FreeLlmProvider | undefined {
  return FREE_LLM_PROVIDERS.find((provider) => provider.id === id);
}

export function isFreeLlmProviderId(id: string | null | undefined): id is FreeLlmProviderId {
  return Boolean(freeProviderById(id));
}

export function selectableFreeProviders(): FreeLlmProvider[] {
  return FREE_LLM_PROVIDERS.filter((provider) => provider.openAiCompatible);
}
