export interface Model {
	id: string;
	name: string;
	provider: string;
	family: string;
	release_date: string;
	context_window: number;
	max_output_tokens: number;
	capabilities: Capability[];
	benchmarks: Partial<Record<Benchmark, number>>;
	use_case_scores: Partial<Record<UseCase, number>>;
	open_source: boolean;
}

export interface ProviderPricing {
	model_id: string;
	provider: string;
	provider_type: "direct" | "aggregator" | "gateway";
	input_price_per_1m: number;
	output_price_per_1m: number;
	cached_input_price_per_1m?: number;
	batch_input_price_per_1m?: number;
	batch_output_price_per_1m?: number;
	rate_limit_rpm?: number;
	rate_limit_tpm?: number;
	notes?: string;
	last_verified: string;
}

export interface Gateway {
	id: string;
	name: string;
	type: "gateway";
	features: string[];
	supported_providers: string[];
	detection_files: string[];
	detection_env_vars: string[];
}

export type Capability =
	| "vision"
	| "function_calling"
	| "json_mode"
	| "streaming"
	| "pdf_input"
	| "audio_input"
	| "image_generation"
	| "code_execution"
	| "web_search";

export type Benchmark =
	| "mmlu"
	| "humaneval"
	| "swe_bench"
	| "arena_elo"
	| "math"
	| "gpqa"
	| "ifeval";

export type UseCase =
	| "coding"
	| "creative_writing"
	| "summarization"
	| "rag"
	| "agents"
	| "vision"
	| "function_calling"
	| "long_context"
	| "math"
	| "multilingual"
	| "general";

export interface DataStore {
	models: Model[];
	pricing: ProviderPricing[];
	gateways: Gateway[];
	last_updated: string;
	version: string;
}
