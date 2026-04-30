/**
 * Fetches LiteLLM model pricing data and normalizes it into our schema.
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

interface LiteLLMEntry {
	litellm_provider?: string;
	input_cost_per_token?: number;
	output_cost_per_token?: number;
	input_cost_per_audio_token?: number;
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

// Map LiteLLM provider names to our normalized provider names
const PROVIDER_MAP: Record<string, string> = {
	openai: "openai",
	anthropic: "anthropic",
	vertex_ai: "google-vertex",
	"vertex_ai-anthropic_models": "google-vertex",
	gemini: "google",
	bedrock: "amazon-bedrock",
	azure: "azure-openai",
	azure_ai: "azure-openai",
	together_ai: "together-ai",
	fireworks_ai: "fireworks",
	groq: "groq",
	deepinfra: "deepinfra",
	mistral: "mistral",
	cohere: "cohere",
	deepseek: "deepseek",
	openrouter: "openrouter",
	replicate: "replicate",
	perplexity: "perplexity",
	ai21: "ai21",
};

// Models we care about (chat mode, well-known families)
const MODEL_FAMILIES = [
	"gpt-4o",
	"gpt-4o-mini",
	"gpt-4-turbo",
	"gpt-4.1",
	"gpt-4.1-mini",
	"gpt-4.1-nano",
	"o1",
	"o1-mini",
	"o1-pro",
	"o3",
	"o3-mini",
	"o4-mini",
	"claude-3-5-sonnet",
	"claude-3-5-haiku",
	"claude-3-opus",
	"claude-sonnet-4",
	"claude-opus-4",
	"gemini-2.5-pro",
	"gemini-2.5-flash",
	"gemini-2.0-flash",
	"gemini-1.5-pro",
	"gemini-1.5-flash",
	"llama3-70b",
	"llama-3.3-70b",
	"llama-3.1-405b",
	"llama-3.1-70b",
	"llama-3.1-8b",
	"deepseek-chat",
	"deepseek-reasoner",
	"deepseek-v3",
	"deepseek-r1",
	"mistral-large",
	"mistral-small",
	"mixtral-8x22b",
	"mixtral-8x7b",
	"command-r-plus",
	"command-r",
	"command-a",
	"qwen-2.5-72b",
	"qwen-max",
];

function extractBaseModel(key: string): string | null {
	// Remove provider prefix (e.g., "openai/gpt-4o" -> "gpt-4o")
	const parts = key.split("/");
	const modelPart = parts.length > 1 ? parts.slice(1).join("/") : parts[0];

	// Match against known families
	for (const family of MODEL_FAMILIES) {
		if (modelPart.includes(family)) {
			return family;
		}
	}
	return null;
}

function resolveProvider(key: string, entry: LiteLLMEntry): string | null {
	if (entry.litellm_provider) {
		return PROVIDER_MAP[entry.litellm_provider] ?? entry.litellm_provider;
	}
	const prefix = key.split("/")[0];
	return PROVIDER_MAP[prefix] ?? null;
}

function getCapabilities(entry: LiteLLMEntry): string[] {
	const caps: string[] = [];
	if (entry.supports_vision) caps.push("vision");
	if (entry.supports_function_calling) caps.push("function_calling");
	if (entry.supports_response_schema) caps.push("json_mode");
	caps.push("streaming"); // virtually all chat models support streaming
	if (entry.supports_web_search) caps.push("web_search");
	if (entry.supports_audio_input) caps.push("audio_input");
	if (entry.supports_reasoning) caps.push("reasoning");
	return caps;
}

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

const DIRECT_PROVIDERS = new Set([
	"openai",
	"anthropic",
	"google",
	"deepseek",
	"mistral",
	"cohere",
	"ai21",
	"perplexity",
]);

const OPEN_SOURCE_FAMILIES = new Set([
	"llama3-70b",
	"llama-3.3-70b",
	"llama-3.1-405b",
	"llama-3.1-70b",
	"llama-3.1-8b",
	"deepseek-chat",
	"deepseek-reasoner",
	"deepseek-v3",
	"deepseek-r1",
	"mixtral-8x22b",
	"mixtral-8x7b",
	"command-r-plus",
	"command-r",
	"command-a",
	"qwen-2.5-72b",
	"qwen-max",
]);

const FRIENDLY_NAMES: Record<string, string> = {
	"gpt-4o": "GPT-4o",
	"gpt-4o-mini": "GPT-4o Mini",
	"gpt-4-turbo": "GPT-4 Turbo",
	"gpt-4.1": "GPT-4.1",
	"gpt-4.1-mini": "GPT-4.1 Mini",
	"gpt-4.1-nano": "GPT-4.1 Nano",
	o1: "o1",
	"o1-mini": "o1 Mini",
	"o1-pro": "o1 Pro",
	o3: "o3",
	"o3-mini": "o3 Mini",
	"o4-mini": "o4 Mini",
	"claude-3-5-sonnet": "Claude 3.5 Sonnet",
	"claude-3-5-haiku": "Claude 3.5 Haiku",
	"claude-3-opus": "Claude 3 Opus",
	"claude-sonnet-4": "Claude Sonnet 4",
	"claude-opus-4": "Claude Opus 4",
	"gemini-2.5-pro": "Gemini 2.5 Pro",
	"gemini-2.5-flash": "Gemini 2.5 Flash",
	"gemini-2.0-flash": "Gemini 2.0 Flash",
	"gemini-1.5-pro": "Gemini 1.5 Pro",
	"gemini-1.5-flash": "Gemini 1.5 Flash",
	"llama3-70b": "Llama 3 70B",
	"llama-3.3-70b": "Llama 3.3 70B",
	"llama-3.1-405b": "Llama 3.1 405B",
	"llama-3.1-70b": "Llama 3.1 70B",
	"llama-3.1-8b": "Llama 3.1 8B",
	"deepseek-chat": "DeepSeek V3",
	"deepseek-reasoner": "DeepSeek R1",
	"deepseek-v3": "DeepSeek V3",
	"deepseek-r1": "DeepSeek R1",
	"mistral-large": "Mistral Large",
	"mistral-small": "Mistral Small",
	"mixtral-8x22b": "Mixtral 8x22B",
	"mixtral-8x7b": "Mixtral 8x7B",
	"command-r-plus": "Command R+",
	"command-r": "Command R",
	"command-a": "Command A",
	"qwen-2.5-72b": "Qwen 2.5 72B",
	"qwen-max": "Qwen Max",
};

const PRIMARY_PROVIDER: Record<string, string> = {
	"gpt-4o": "openai",
	"gpt-4o-mini": "openai",
	"gpt-4-turbo": "openai",
	"gpt-4.1": "openai",
	"gpt-4.1-mini": "openai",
	"gpt-4.1-nano": "openai",
	o1: "openai",
	"o1-mini": "openai",
	"o1-pro": "openai",
	o3: "openai",
	"o3-mini": "openai",
	"o4-mini": "openai",
	"claude-3-5-sonnet": "anthropic",
	"claude-3-5-haiku": "anthropic",
	"claude-3-opus": "anthropic",
	"claude-sonnet-4": "anthropic",
	"claude-opus-4": "anthropic",
	"gemini-2.5-pro": "google",
	"gemini-2.5-flash": "google",
	"gemini-2.0-flash": "google",
	"gemini-1.5-pro": "google",
	"gemini-1.5-flash": "google",
	"llama3-70b": "meta",
	"llama-3.3-70b": "meta",
	"llama-3.1-405b": "meta",
	"llama-3.1-70b": "meta",
	"llama-3.1-8b": "meta",
	"deepseek-chat": "deepseek",
	"deepseek-reasoner": "deepseek",
	"deepseek-v3": "deepseek",
	"deepseek-r1": "deepseek",
	"mistral-large": "mistral",
	"mistral-small": "mistral",
	"mixtral-8x22b": "mistral",
	"mixtral-8x7b": "mistral",
	"command-r-plus": "cohere",
	"command-r": "cohere",
	"command-a": "cohere",
	"qwen-2.5-72b": "alibaba",
	"qwen-max": "alibaba",
};

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
		if (entry.deprecation_date) continue; // skip deprecated

		const baseModel = extractBaseModel(key);
		if (!baseModel) continue;

		const provider = resolveProvider(key, entry);
		if (!provider) continue;

		// Build model entry (first seen wins for capabilities/context)
		if (!models.has(baseModel)) {
			models.set(baseModel, {
				id: baseModel,
				name: FRIENDLY_NAMES[baseModel] ?? baseModel,
				provider: PRIMARY_PROVIDER[baseModel] ?? provider,
				family: baseModel.split("-")[0],
				context_window: entry.max_input_tokens ?? entry.max_tokens ?? 128000,
				max_output_tokens: entry.max_output_tokens ?? entry.max_tokens ?? 8192,
				capabilities: getCapabilities(entry),
				open_source: OPEN_SOURCE_FAMILIES.has(baseModel),
			});
		} else {
			// Update context window if this entry has a larger one
			const existing = models.get(baseModel)!;
			const ctx = entry.max_input_tokens ?? entry.max_tokens ?? 0;
			if (ctx > existing.context_window) existing.context_window = ctx;
			const maxOut = entry.max_output_tokens ?? 0;
			if (maxOut > existing.max_output_tokens) existing.max_output_tokens = maxOut;
		}

		// Build pricing entry (deduplicate by model+provider)
		const existingPricing = pricing.find(
			(p) => p.model_id === baseModel && p.provider === provider,
		);
		if (!existingPricing) {
			const inputPer1M = entry.input_cost_per_token * 1_000_000;
			const outputPer1M = entry.output_cost_per_token * 1_000_000;
			const pricingEntry: NormalizedPricing = {
				model_id: baseModel,
				provider,
				provider_type: DIRECT_PROVIDERS.has(provider) ? "direct" : "aggregator",
				input_price_per_1m: Math.round(inputPer1M * 100) / 100,
				output_price_per_1m: Math.round(outputPer1M * 100) / 100,
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

	// Build final models array with curated data merged in
	const finalModels = [...models.values()].map((m) => {
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
				version: "0.2.0",
				data_sources: [
					"LiteLLM model_prices_and_context_window.json",
					"Curated benchmark scores",
					"LMSYS Chatbot Arena",
				],
			},
			null,
			2,
		),
	);

	console.log(`✅ Synced: ${finalModels.length} models, ${pricing.length} pricing entries`);
}

main().catch((e) => {
	console.error("Sync failed:", e);
	process.exit(1);
});
