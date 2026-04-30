# Requirements: LLM Economist MCP Server

## Overview
A public MCP (Model Context Protocol) server that helps developers find the optimal LLM model for their use case, compare pricing across providers and aggregators, and understand where to purchase models most cost-effectively. Designed to work with any MCP-compatible client (Kiro, Claude Code, Codex, Cursor, etc.).

## Problem Statement
Developers face decision paralysis when choosing LLM models. There are 100+ models across dozens of providers, each with different pricing, capabilities, context windows, and performance characteristics. Aggregators (OpenRouter, Amazon Bedrock, Fireworks, Together AI, etc.) add another layer of complexity with markup fees, routing, and availability differences. Gateways (LiteLLM, Portkey, Helicone) further complicate the picture.

## Target Users
- Developers building AI-powered applications
- Teams evaluating LLM costs for production workloads
- Anyone using MCP-compatible AI assistants who needs model selection guidance

## Functional Requirements

### FR-1: Model Discovery & Recommendation
- **FR-1.1**: Given a use case (coding, creative writing, summarization, RAG, agents, vision, function calling, long-context, math/reasoning, multilingual, etc.), return ranked model recommendations with reasoning.
- **FR-1.2**: Support filtering by constraints: max price, min context window, open-source only, specific provider, latency requirements.
- **FR-1.3**: Include benchmark scores (MMLU, HumanEval/SWE-bench, Arena Elo, etc.) in recommendations where available.
- **FR-1.4**: Detect and consider models already used in the user's project (via config files, environment variables, or explicit input).

### FR-2: Provider & Pricing Comparison
- **FR-2.1**: For any given model, list all providers where it's available with per-token pricing (input/output).
- **FR-2.2**: Include direct providers (OpenAI, Anthropic, Google, etc.) and aggregators (OpenRouter, Amazon Bedrock, Azure OpenAI, Fireworks, Together AI, Groq, DeepInfra, Replicate, etc.).
- **FR-2.3**: Show markup/fees for aggregators vs direct provider pricing.
- **FR-2.4**: Calculate estimated cost for a given workload (tokens/day, requests/day).

### FR-3: Gateway Awareness
- **FR-3.1**: Detect if the user is using a gateway (LiteLLM, Portkey, Helicone, Martian, etc.) from project configuration.
- **FR-3.2**: Factor gateway capabilities into recommendations (fallback routing, caching, load balancing).
- **FR-3.3**: Suggest gateway configurations that optimize cost/reliability for the recommended models.

### FR-4: Model Comparison
- **FR-4.1**: Compare 2+ specific models side-by-side on: price, quality benchmarks, speed/latency, context window, features (vision, function calling, JSON mode, streaming).
- **FR-4.2**: Provide a clear winner recommendation with trade-off explanation.

### FR-5: Data Freshness
- **FR-5.1**: Ship with a curated, versioned dataset of model capabilities and pricing.
- **FR-5.2**: Dataset must be easily updatable (JSON/YAML files in the repo).
- **FR-5.3**: Include a `last_updated` timestamp so users know data freshness.
- **FR-5.4**: Support community contributions to keep data current.

## Non-Functional Requirements

### NFR-1: Distribution & Compatibility
- **NFR-1.1**: Published as an npm package (`llm-economist`) for easy installation.
- **NFR-1.2**: Works with stdio transport (local MCP clients) — primary mode.
- **NFR-1.3**: Optionally supports HTTP/SSE transport for remote usage.
- **NFR-1.4**: Zero external API dependencies at runtime (all data bundled, no network calls required).
- **NFR-1.5**: Compatible with: Kiro, Claude Code/Desktop, Codex, Cursor, Windsurf, Continue, and any MCP-compliant client.

### NFR-2: Performance
- **NFR-2.1**: All tool responses must complete in <500ms (local data lookups).
- **NFR-2.2**: Server startup in <2 seconds.
- **NFR-2.3**: Memory footprint <100MB.

### NFR-3: Scalability of Data
- **NFR-3.1**: Data schema must support 500+ models without performance degradation.
- **NFR-3.2**: Adding a new model or provider should require only a data file change, no code changes.
- **NFR-3.3**: Versioned data releases decoupled from code releases.

### NFR-4: Developer Experience
- **NFR-4.1**: Single command installation: `npx llm-economist` or add to MCP config.
- **NFR-4.2**: Clear, actionable tool descriptions so AI assistants know when to invoke each tool.
- **NFR-4.3**: Rich, formatted responses optimized for AI assistant consumption.
- **NFR-4.4**: Comprehensive README with setup instructions for every major MCP client.

### NFR-5: Open Source & Community
- **NFR-5.1**: MIT licensed.
- **NFR-5.2**: Contributing guide for adding models/providers/pricing data.
- **NFR-5.3**: CI/CD pipeline to validate data integrity on PRs.
- **NFR-5.4**: Automated staleness detection (flag pricing data older than 30 days).

## MCP Tools Specification

### Tool 1: `find_best_model`
**Purpose**: Recommend the best model(s) for a given use case.
**Input**:
- `use_case` (required): string — The task/use case (e.g., "coding", "creative writing", "RAG", "agents", "summarization", "vision", "function calling", "long-context", "math", "multilingual", "general")
- `constraints` (optional): object — Filters like `max_input_price`, `max_output_price`, `min_context_window`, `open_source_only`, `provider`, `max_latency_ms`
- `top_k` (optional): number — How many recommendations to return (default: 5)

**Output**: Ranked list of models with: name, provider(s), pricing, benchmark scores, reasoning for recommendation, trade-offs.

### Tool 2: `compare_models`
**Purpose**: Side-by-side comparison of specific models.
**Input**:
- `models` (required): string[] — Model identifiers to compare (e.g., ["claude-4-sonnet", "gpt-4o", "gemini-2.5-pro"])
- `workload` (optional): object — `{ tokens_per_day_input, tokens_per_day_output }` for cost projection

**Output**: Comparison table with pricing, benchmarks, features, context window, and cost projection if workload provided.

### Tool 3: `find_cheapest_provider`
**Purpose**: For a given model, find the cheapest place to use it.
**Input**:
- `model` (required): string — Model identifier
- `workload` (optional): object — For cost projection
- `include_aggregators` (optional): boolean — Include aggregator pricing (default: true)

**Output**: Ranked list of providers by price, including direct and aggregator options, with notes on trade-offs (latency, rate limits, features).

### Tool 4: `estimate_cost`
**Purpose**: Calculate estimated cost for a workload across providers.
**Input**:
- `model` (required): string — Model identifier
- `input_tokens_per_day` (required): number
- `output_tokens_per_day` (required): number
- `days` (optional): number — Projection period (default: 30)

**Output**: Cost breakdown by provider (daily, monthly, yearly projections).

### Tool 5: `list_models`
**Purpose**: List all models in the database with optional filtering.
**Input**:
- `provider` (optional): string — Filter by provider
- `capability` (optional): string — Filter by capability (vision, function_calling, json_mode, streaming, etc.)
- `open_source_only` (optional): boolean

**Output**: List of models with basic info (name, provider, pricing tier, key capabilities).

### Tool 6: `detect_project_models`
**Purpose**: Analyze the current project to detect which models/providers/gateways are in use.
**Input**:
- `project_path` (optional): string — Path to scan (defaults to cwd)

**Output**: Detected models, providers, gateways, and configuration. Suggestions for optimization.

## MCP Resources

### Resource 1: `llm-economist://data/last-updated`
Returns the timestamp of the last data update and version info.

### Resource 2: `llm-economist://data/providers`
Returns the full list of supported providers and aggregators.

### Resource 3: `llm-economist://data/models/{model_id}`
Returns complete data for a specific model.

## Data Model (High-Level)

### Model Entry
```yaml
id: "claude-4-sonnet"
name: "Claude 4 Sonnet"
provider: "anthropic"
family: "claude"
release_date: "2025-03-01"
context_window: 200000
max_output_tokens: 8192
capabilities:
  - vision
  - function_calling
  - json_mode
  - streaming
  - pdf_input
benchmarks:
  mmlu: 89.5
  humaneval: 92.0
  swe_bench: 62.3
  arena_elo: 1290
use_case_scores:
  coding: 95
  creative_writing: 88
  summarization: 90
  rag: 92
  agents: 94
  math: 87
open_source: false
```

### Provider Pricing Entry
```yaml
model_id: "claude-4-sonnet"
provider: "anthropic"
provider_type: "direct"  # direct | aggregator | gateway
input_price_per_1m: 3.00
output_price_per_1m: 15.00
cached_input_price_per_1m: 0.30
batch_input_price_per_1m: 1.50
batch_output_price_per_1m: 7.50
rate_limit_rpm: 4000
rate_limit_tpm: 400000
notes: "Direct API access, highest rate limits"
last_verified: "2026-04-28"
```

### Gateway Entry
```yaml
id: "litellm"
name: "LiteLLM"
type: "gateway"
features:
  - fallback_routing
  - load_balancing
  - caching
  - cost_tracking
  - rate_limit_handling
supported_providers:
  - openai
  - anthropic
  - google
  - bedrock
  - azure
detection_files:
  - "litellm_config.yaml"
  - "litellm.yaml"
detection_env_vars:
  - "LITELLM_API_KEY"
```

## Technology Stack
- **Runtime**: Node.js (>=18)
- **Language**: TypeScript (strict mode)
- **MCP SDK**: `@modelcontextprotocol/sdk` (latest)
- **Schema Validation**: Zod v4
- **Data Format**: JSON files (models, providers, gateways)
- **Build**: tsup (fast, zero-config bundler)
- **Testing**: Vitest
- **Linting**: Biome (fast, all-in-one)
- **Package Manager**: npm

## Success Criteria
- [ ] All 6 tools respond correctly with curated data for 50+ models
- [ ] Works out-of-the-box with `npx llm-economist` in any MCP client
- [ ] Data covers all major providers (OpenAI, Anthropic, Google, Meta, Mistral, Cohere) and aggregators (OpenRouter, Bedrock, Azure, Fireworks, Together, Groq, DeepInfra)
- [ ] Response time <500ms for all tools
- [ ] Community can contribute model/pricing data via PRs with CI validation
- [ ] README includes setup instructions for Kiro, Claude Code, Codex, Cursor, and generic MCP clients
- [ ] Published to npm with proper bin entry for npx usage

## Risks & Mitigations
- **Risk**: Pricing data goes stale quickly
  - Mitigation: Automated staleness warnings, community contribution model, frequent data releases
- **Risk**: Benchmark scores are subjective/contested
  - Mitigation: Use multiple benchmarks, cite sources, allow users to weight by preference
- **Risk**: Too many models overwhelm recommendations
  - Mitigation: Smart ranking algorithm, sensible defaults, top_k limiting
- **Risk**: Project detection may miss configurations
  - Mitigation: Support common patterns, allow explicit input as fallback
