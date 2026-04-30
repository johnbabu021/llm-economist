/**
 * Fetches LiteLLM model pricing data and normalizes ALL chat models into our schema.
 * No hardcoded model allowlist — ingests everything from LiteLLM.
 * Merges with curated benchmark/use-case scores from data/curated-scores.json.
 *
 * Usage: npx tsx scripts/sync-litellm.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

const LITELLM_URL =
	"https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";
const LITELLM_PROVIDERS_URL =
	"https://raw.githubusercontent.com/BerriAI/litellm/main/provider_endpoints_support.json";

interface LiteLLMEntry {
	litellm_provider?: string;
	input_cost_per_token?: number;
	output_cost_per_token?: number;
	max_input_tokens?: number;
	max_output_tokens?: number;
	max_tokens?: number;
	mode?: string;
	supports_function_calling?: boolean;
	supports_vision?: boolean;
	supports_reasoning?: boolean;
	supports_response_schema?: boolean;
	supports_prompt_caching?: boolean;
	supports_web_search?: boolean;
	supports_audio_input?: boolean;
	supports_audio_output?: boolean;
	supports_system_messages?: boolean;
	supports_parallel_function_calling?: boolean;
	cache_read_input_token_cost?: number;
	deprecation_date?: string;
	source?: string;
}

// Map LiteLLM provider slugs to normalized names
const PROVIDER_MAP: Record<string, string> = {
	openai: "openai",
	anthropic: "anthropic",
	anthropic_text: "anthropic",
	vertex_ai: "google-vertex",
	"vertex_ai-anthropic_models": "google-vertex",
	"vertex_ai-ai21_models": "google-vertex",
	"vertex_ai-mistral_models": "google-vertex",
	"vertex_ai-llama_models": "google-vertex",
	gemini: "google",
	bedrock: "amazon-bedrock",
	bedrock_converse: "amazon-bedrock",
	azure: "azure-openai",
	azure_ai: "azure-openai",
	together_ai: "together-ai",
	fireworks_ai: "fireworks",
	groq: "groq",
	deepinfra: "deepinfra",
	mistral: "mistral",
	cohere: "cohere",
	cohere_chat: "cohere",
	deepseek: "deepseek",
	openrouter: "openrouter",
	replicate: "replicate",
	perplexity: "perplexity",
	ai21: "ai21",
	ai21_chat: "ai21",
	baseten: "baseten",
	anyscale: "anyscale",
	cerebras: "cerebras",
	sambanova: "sambanova",
	nvidia_nim: "nvidia",
	volcengine: "volcengine",
	aiml: "aiml",
	databricks: "databricks",
	cloudflare: "cloudflare",
	friendliai: "friendliai",
	github: "github",
	xai: "xai",
	novita: "novita",
	voyage: "voyage",
	jina_ai: "jina",
	text_completion_openai: "openai",
	text_completion_codestral: "mistral",
	codestral: "mistral",
	gmi: "gmi",
	vercel_ai_gateway: "vercel",
	oci: "oci",
};

const DIRECT_PROVIDERS = new Set([
	"openai",
	"anthropic",
	"google",
	"deepseek",
	"mistral",
	"cohere",
	"ai21",
	"perplexity",
	"xai",
]);

const OPEN_SOURCE_KEYWORDS = [
	"llama",
	"mixtral",
	"mistral-",
	"deepseek",
	"qwen",
	"command-r",
	"command-a",
	"gemma",
	"phi-",
	"dbrx",
	"yi-",
	"codestral",
	"starcoder",
	"falcon",
	"vicuna",
	"wizardlm",
	"solar",
	"internlm",
	"jamba",
];

interface NormalizedModel {
	id: string;
	name: string;
	provider: string;
	family: string;
	context_window: number;
	max_output_tokens: number;
	capabilities: string[];
	open_source: boolean;
}

interface NormalizedPricing {
	model_id: string;
	provider: string;
	provider_type: "direct" | "aggregator";
	input_price_per_1m: number;
	output_price_per_1m: number;
	cached_input_price_per_1m?: number;
	last_verified: string;
}

function resolveProvider(key: string, entry: LiteLLMEntry): string | null {
	if (entry.litellm_provider) {
		return PROVIDER_MAP[entry.litellm_provider] ?? entry.litellm_provider;
	}
	const prefix = key.split("/")[0];
	return PROVIDER_MAP[prefix] ?? null;
}

/**
 * Extract a normalized base model ID from a LiteLLM key.
 * e.g. "openai/gpt-4o-2024-05-13" → "gpt-4o-2024-05-13"
 *      "bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0" → "claude-3-5-sonnet-20241022-v2"
 *      "together_ai/meta-llama/Llama-3.3-70B-Instruct" → "llama-3.3-70b-instruct"
 */
function extractBaseModel(key: string): string {
	// Remove provider prefix
	const parts = key.split("/");
	let modelPart = parts.length > 1 ? parts.slice(1).join("/") : parts[0];

	// Remove bedrock-style prefixes (e.g., "anthropic.", "meta.", "us-east-1/")
	modelPart = modelPart.replace(/^(us|eu|ap|me|sa|ca|af)-[a-z]+-\d+\//, "");
	modelPart = modelPart.replace(/^(anthropic|meta|mistral|cohere|ai21|amazon|stability)\./i, "");

	// Remove version suffixes like ":0", ":1"
	modelPart = modelPart.replace(/:\d+$/, "");

	// Remove org prefixes in path-style (e.g., "meta-llama/", "mistralai/")
	modelPart = modelPart.replace(
		/^(meta-llama|mistralai|deepseek-ai|Qwen|CohereForAI|NousResearch|microsoft|google|databricks)\//i,
		"",
	);

	return modelPart.toLowerCase().trim();
}

/**
 * Normalize a base model ID to a canonical form for grouping.
 * Groups date-stamped variants together.
 * e.g. "gpt-4o-2024-05-13" → "gpt-4o"
 *      "claude-3-5-sonnet-20241022-v2" → "claude-3-5-sonnet"
 */
function canonicalize(baseModel: string): string {
	// Remove date stamps (YYYYMMDD or YYYY-MM-DD patterns)
	let canonical = baseModel.replace(/-?\d{4}-?\d{2}-?\d{2}(-v\d+)?/g, "");
	// Remove trailing version like -v2, -v1
	canonical = canonical.replace(/-v\d+$/, "");
	// Remove trailing hyphens
	canonical = canonical.replace(/-+$/, "");
	// Remove "-latest" suffix
	canonical = canonical.replace(/-latest$/, "");
	return canonical;
}

function getCapabilities(entry: LiteLLMEntry): string[] {
	const caps: string[] = ["streaming"];
	if (entry.supports_vision) caps.push("vision");
	if (entry.supports_function_calling) caps.push("function_calling");
	if (entry.supports_response_schema) caps.push("json_mode");
	if (entry.supports_web_search) caps.push("web_search");
	if (entry.supports_audio_input) caps.push("audio_input");
	if (entry.supports_reasoning) caps.push("reasoning");
	if (entry.supports_prompt_caching) caps.push("prompt_caching");
	return caps;
}

function isOpenSource(modelId: string): boolean {
	return OPEN_SOURCE_KEYWORDS.some((kw) => modelId.includes(kw));
}

function inferFamily(modelId: string): string {
	if (modelId.startsWith("gpt-")) return "gpt";
	if (modelId.startsWith("o1") || modelId.startsWith("o3") || modelId.startsWith("o4")) return "openai-reasoning";
	if (modelId.startsWith("claude")) return "claude";
	if (modelId.startsWith("gemini")) return "gemini";
	if (modelId.startsWith("gemma")) return "gemma";
	if (modelId.includes("llama")) return "llama";
	if (modelId.includes("mixtral") || modelId.startsWith("mistral")) return "mistral";
	if (modelId.includes("deepseek")) return "deepseek";
	if (modelId.includes("qwen")) return "qwen";
	if (modelId.includes("command")) return "cohere";
	if (modelId.includes("phi-")) return "phi";
	if (modelId.includes("jamba")) return "jamba";
	if (modelId.includes("dbrx")) return "dbrx";
	if (modelId.startsWith("grok")) return "xai";
	return "other";
}

function friendlyName(canonicalId: string): string {
	return canonicalId
		.split("-")
		.map((w) => {
			if (/^\d+b$/i.test(w)) return w.toUpperCase();
			if (w === "ai") return "AI";
			return w.charAt(0).toUpperCase() + w.slice(1);
		})
		.join(" ")
		.replace(/Gpt /i, "GPT-")
		.replace(/^O(\d)/, "o$1")
		.replace("Deepseek", "DeepSeek");
}

function inferPrimaryProvider(canonicalId: string): string {
	if (canonicalId.startsWith("gpt-") || canonicalId.startsWith("o1") || canonicalId.startsWith("o3") || canonicalId.startsWith("o4")) return "openai";
	if (canonicalId.startsWith("claude")) return "anthropic";
	if (canonicalId.startsWith("gemini") || canonicalId.startsWith("gemma")) return "google";
	if (canonicalId.includes("llama")) return "meta";
	if (canonicalId.includes("mixtral") || canonicalId.startsWith("mistral") || canonicalId.includes("codestral")) return "mistral";
	if (canonicalId.includes("deepseek")) return "deepseek";
	if (canonicalId.includes("qwen")) return "alibaba";
	if (canonicalId.includes("command")) return "cohere";
	if (canonicalId.includes("phi-")) return "microsoft";
	if (canonicalId.includes("jamba")) return "ai21";
	if (canonicalId.startsWith("grok")) return "xai";
	return "unknown";
}

async function main() {
	console.log("Fetching LiteLLM pricing data...");
	const res = await fetch(LITELLM_URL);
	if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
	const raw = (await res.json()) as Record<string, LiteLLMEntry>;

	const models = new Map<string, NormalizedModel>();
	const pricing: NormalizedPricing[] = [];
	const today = new Date().toISOString().split("T")[0];

	for (const [key, entry] of Object.entries(raw)) {
		if (key === "sample_spec") continue;
		if (entry.mode && entry.mode !== "chat") continue;
		if (!entry.input_cost_per_token || !entry.output_cost_per_token) continue;
		if (entry.deprecation_date) continue;

		const provider = resolveProvider(key, entry);
		if (!provider) continue;

		const baseModel = extractBaseModel(key);
		if (!baseModel) continue;

		const canonical = canonicalize(baseModel);
		if (!canonical) continue;

		// Build/update model entry
		if (!models.has(canonical)) {
			models.set(canonical, {
				id: canonical,
				name: friendlyName(canonical),
				provider: inferPrimaryProvider(canonical),
				family: inferFamily(canonical),
				context_window: entry.max_input_tokens ?? entry.max_tokens ?? 4096,
				max_output_tokens: entry.max_output_tokens ?? entry.max_tokens ?? 4096,
				capabilities: getCapabilities(entry),
				open_source: isOpenSource(canonical),
			});
		} else {
			const existing = models.get(canonical)!;
			const ctx = entry.max_input_tokens ?? entry.max_tokens ?? 0;
			if (ctx > existing.context_window) existing.context_window = ctx;
			const maxOut = entry.max_output_tokens ?? 0;
			if (maxOut > existing.max_output_tokens) existing.max_output_tokens = maxOut;
			// Merge capabilities
			for (const cap of getCapabilities(entry)) {
				if (!existing.capabilities.includes(cap)) existing.capabilities.push(cap);
			}
		}

		// Build pricing entry — keep unique price points per model+provider
		const inputPer1M = Math.round(entry.input_cost_per_token * 1_000_000 * 100) / 100;
		const outputPer1M = Math.round(entry.output_cost_per_token * 1_000_000 * 100) / 100;

		if (inputPer1M === 0 && outputPer1M === 0) continue; // skip free/broken entries

		const exists = pricing.some(
			(p) =>
				p.model_id === canonical &&
				p.provider === provider &&
				p.input_price_per_1m === inputPer1M &&
				p.output_price_per_1m === outputPer1M,
		);
		if (!exists) {
			const pricingEntry: NormalizedPricing = {
				model_id: canonical,
				provider,
				provider_type: DIRECT_PROVIDERS.has(provider) ? "direct" : "aggregator",
				input_price_per_1m: inputPer1M,
				output_price_per_1m: outputPer1M,
				last_verified: today,
			};
			if (entry.cache_read_input_token_cost) {
				pricingEntry.cached_input_price_per_1m =
					Math.round(entry.cache_read_input_token_cost * 1_000_000 * 100) / 100;
			}
			pricing.push(pricingEntry);
		}
	}

	// Load curated scores and merge
	let curatedScores: Record<string, any> = {};
	try {
		curatedScores = JSON.parse(readFileSync(join(dataDir, "curated-scores.json"), "utf-8"));
	} catch {
		console.log("No curated-scores.json found, models will have no benchmark/use_case data.");
	}

	// Build final models array
	const finalModels = [...models.values()]
		.filter((m) => {
			// Only keep models that have at least one pricing entry
			return pricing.some((p) => p.model_id === m.id);
		})
		.map((m) => {
			const curated = curatedScores[m.id] ?? {};
			return {
				...m,
				release_date: curated.release_date ?? "",
				benchmarks: curated.benchmarks ?? {},
				use_case_scores: curated.use_case_scores ?? {},
			};
		});

	// Write outputs
	writeFileSync(join(dataDir, "models.json"), JSON.stringify(finalModels, null, 2));
	writeFileSync(join(dataDir, "pricing.json"), JSON.stringify(pricing, null, 2));
	writeFileSync(
		join(dataDir, "meta.json"),
		JSON.stringify(
			{
				last_updated: today,
				version: "0.3.0",
				data_sources: [
					"LiteLLM model_prices_and_context_window.json",
					"LiteLLM provider_endpoints_support.json",
					"Curated benchmark scores (data/curated-scores.json)",
				],
			},
			null,
			2,
		),
	);

	// Fetch provider endpoint support data
	console.log("Fetching provider endpoint support data...");
	const provRes = await fetch(LITELLM_PROVIDERS_URL);
	if (provRes.ok) {
		const provRaw = (await provRes.json()) as any;
		const providers = provRaw.providers ?? {};
		const providerEndpoints = Object.entries(providers).map(([slug, data]: [string, any]) => ({
			id: slug,
			name: data.display_name ?? slug,
			url: data.url ?? null,
			endpoints: data.endpoints ?? {},
		}));
		writeFileSync(
			join(dataDir, "provider-endpoints.json"),
			JSON.stringify(providerEndpoints, null, 2),
		);
		console.log(`✅ Provider endpoints: ${providerEndpoints.length} providers`);
	} else {
		console.log("⚠️  Could not fetch provider endpoints (non-critical)");
	}

	console.log(`✅ Synced: ${finalModels.length} models, ${pricing.length} pricing entries`);
}

main().catch((e) => {
	console.error("Sync failed:", e);
	process.exit(1);
});
