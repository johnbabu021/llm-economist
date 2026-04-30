# Implementation Backlog — LLM Economist MCP Server

> TDD methodology: every task starts with a failing test (RED), then minimal implementation (GREEN), then refactor.
> Baseline: 15 models, 52 pricing entries, 6 tools, 3 resources, 7 passing tests.

---

## Phase 1: Test Coverage & Data Expansion

### 1.1 Unit Tests — `find_best_model` scoring algorithm

**File**: `tests/tools/find-best-model.test.ts`

- [ ] **RED**: Test `scoreModel` returns 0 when model has no `use_case_scores` entry for the given use case
  - Input: model with `use_case_scores: {}`, use case `"coding"`
  - Expected: `0`
- [ ] **RED**: Test `scoreModel` computes correct composite score for a known model
  - Input: `claude-4-sonnet`, use case `"coding"` (use_case_score=96, elo=1310, ctx=200K)
  - Expected: `round(96*0.7 + ((1310-1000)/400)*20 + min(200000/200000,1)*10)` = `93`
- [ ] **RED**: Test `scoreModel` uses default Elo midpoint (10) when `arena_elo` is missing
  - Input: model with no `benchmarks.arena_elo`, use_case_score=80, ctx=128K
  - Expected: `round(80*0.7 + 10 + min(128000/200000,1)*10)` = `round(56+10+6.4)` = `72`
- [ ] **RED**: Test context bonus caps at 10 for models with >200K context
  - Input: `gemini-2.5-pro` (ctx=1M), use case `"long_context"` (score=98)
  - Expected: context bonus = `10` (not 50)
- [ ] **RED**: Test constraint filtering — `open_source_only: true` excludes proprietary models
  - Call tool with `open_source_only: true`, verify no proprietary models in results
- [ ] **RED**: Test constraint filtering — `max_input_price` filters by cheapest provider pricing
  - Call tool with `max_input_price: 1.0`, verify all returned models have at least one provider ≤ $1/1M input
- [ ] **RED**: Test constraint filtering — `min_context_window` excludes small-context models
  - Call tool with `min_context_window: 200000`, verify all results have ≥200K context
- [ ] **RED**: Test returns empty result message when no models match constraints
  - Call tool with `max_input_price: 0.001`, expect "No models found" message
- [ ] **RED**: Test `top_k` limits output count
  - Call tool with `top_k: 2`, verify exactly 2 results returned
- [ ] **GREEN**: Export `scoreModel` from `src/tools/find-best-model.ts` (or extract to `src/scoring.ts`) so tests can import it directly
- [ ] **REFACTOR**: Extract scoring logic to `src/scoring.ts` if not already separated

### 1.2 Unit Tests — `compare_models` output

**File**: `tests/tools/compare-models.test.ts`

- [ ] **RED**: Test returns comparison markdown for 2 valid models
  - Input: `["gpt-4o", "claude-4-sonnet"]`
  - Expected: output contains both model names, pricing, capabilities
- [ ] **RED**: Test returns error when a model ID is not found
  - Input: `["gpt-4o", "nonexistent-model"]`
  - Expected: `isError: true`, message lists missing model
- [ ] **RED**: Test workload cost projection is included when `workload` is provided
  - Input: `["gpt-4o"]` with `workload: { input_tokens_per_day: 1000000, output_tokens_per_day: 500000 }`
  - Expected: output contains "Monthly Cost"
- [ ] **RED**: Test workload cost projection is absent when `workload` is omitted
  - Input: `["gpt-4o", "claude-4-sonnet"]`, no workload
  - Expected: output does NOT contain "Monthly Cost"
- [ ] **RED**: Test output includes benchmark data (Arena Elo, HumanEval, SWE-bench) when available
  - Input: `["claude-4-sonnet"]`
  - Expected: output contains "Arena Elo: 1310", "HumanEval: 93", "SWE-bench: 65.4"
- [ ] **GREEN**: Implement any missing behavior to pass tests

### 1.3 Unit Tests — `estimate_cost` math

**File**: `tests/tools/estimate-cost.test.ts`

- [ ] **RED**: Test daily cost calculation: `(input_tokens/1M * input_price) + (output_tokens/1M * output_price)`
  - Input: `gpt-4o`, 100K input/day, 50K output/day
  - Expected: verify daily cost matches manual calculation against actual pricing data
- [ ] **RED**: Test period total = daily × days
  - Input: `gpt-4o`, 100K input, 50K output, `days: 7`
  - Expected: period column = daily × 7
- [ ] **RED**: Test yearly projection = daily × 365
  - Verify yearly column in output
- [ ] **RED**: Test default period is 30 days when `days` is omitted
  - Expected: period column = daily × 30
- [ ] **RED**: Test providers are sorted by daily cost ascending (cheapest first)
  - Verify first row has lowest daily cost
- [ ] **RED**: Test returns error for unknown model
  - Input: `model: "nonexistent"`, expect `isError: true`
- [ ] **RED**: Test returns "no pricing data" message for model with no pricing entries
  - Requires a model in data with no pricing (or mock)
- [ ] **RED**: Test zero token input produces $0.00 costs
  - Input: `input_tokens_per_day: 0, output_tokens_per_day: 0`
  - Expected: all daily costs = $0.00
- [ ] **GREEN**: Fix any edge cases revealed by tests

### 1.4 Unit Tests — `detect_project_models` scanning

**File**: `tests/tools/detect-project-models.test.ts`

- [ ] **RED**: Test detects model references in `.env` file
  - Create temp dir with `.env` containing `OPENAI_MODEL=gpt-4o`
  - Expected: `gpt-4o` in detected models
- [ ] **RED**: Test detects model references in `package.json`
  - Create temp dir with `package.json` containing `"model": "claude-4-sonnet"`
  - Expected: `claude-4-sonnet` in detected models
- [ ] **RED**: Test detects gateway from config file presence
  - Create temp dir with `litellm_config.yaml`
  - Expected: `LiteLLM` in detected gateways
- [ ] **RED**: Test recursive `src/` scanning finds models in nested files (depth ≤ 3)
  - Create temp dir with `src/lib/ai/config.ts` containing `"gemini-2.5-pro"`
  - Expected: `gemini-2.5-pro` in detected models
- [ ] **RED**: Test scanning stops at depth > 3
  - Create temp dir with `src/a/b/c/d/config.ts` containing `"gpt-4o"`
  - Expected: `gpt-4o` NOT detected (depth 4)
- [ ] **RED**: Test skips `node_modules` and dotfiles
  - Create temp dir with `src/node_modules/lib.js` containing `"gpt-4o"`
  - Expected: `gpt-4o` NOT detected
- [ ] **RED**: Test returns "No models detected" for empty project
  - Create empty temp dir
  - Expected: output contains "No models detected"
- [ ] **RED**: Test all 10 MODEL_PATTERNS match expected strings
  - Unit test each regex pattern against known model strings
- [ ] **GREEN**: Ensure `scanDirectory` handles all edge cases

### 1.5 Unit Tests — `find_cheapest_provider`

**File**: `tests/tools/find-cheapest-provider.test.ts`

- [ ] **RED**: Test returns providers sorted by input price ascending
  - Input: `model: "gpt-4o"`
  - Expected: first provider has lowest `input_price_per_1m`
- [ ] **RED**: Test `include_aggregators: false` excludes aggregator entries
  - Input: `model: "gpt-4o", include_aggregators: false`
  - Expected: no aggregator-type providers in output
- [ ] **RED**: Test workload cost projection included when workload provided
  - Input: `model: "gpt-4o", workload: { input_tokens_per_day: 1000000, output_tokens_per_day: 500000 }`
  - Expected: output contains "Monthly"
- [ ] **RED**: Test returns error for unknown model
  - Input: `model: "nonexistent"`, expect `isError: true`
- [ ] **GREEN**: Implement any missing behavior

### 1.6 Unit Tests — `list_models`

**File**: `tests/tools/list-models.test.ts`

- [ ] **RED**: Test returns all models when no filters applied
  - Expected: count matches `getModels().length`
- [ ] **RED**: Test `provider` filter returns only matching models
  - Input: `provider: "openai"`
  - Expected: all results have provider "openai"
- [ ] **RED**: Test `capability` filter works
  - Input: `capability: "vision"`
  - Expected: all results include "vision" capability
- [ ] **RED**: Test `open_source_only` filter
  - Input: `open_source_only: true`
  - Expected: all results are open source
- [ ] **RED**: Test returns "No models match" for impossible filter
  - Input: `provider: "nonexistent-provider"`
  - Expected: "No models match your filters"
- [ ] **GREEN**: Verify all filters work correctly

### 1.7 Unit Tests — Data layer & resources

**File**: `tests/resources.test.ts`

- [ ] **RED**: Test `last-updated` resource returns valid JSON with expected fields
  - Expected: `last_updated`, `version`, `total_models`, `total_pricing_entries`
- [ ] **RED**: Test `providers` resource groups by type (direct/aggregator)
  - Expected: response has `direct` and `aggregator` arrays
- [ ] **RED**: Test `model-detail` resource returns full model for valid ID
  - Input: `model_id: "gpt-4o"`
  - Expected: complete model object with all fields
- [ ] **RED**: Test `model-detail` resource returns error for invalid ID
  - Input: `model_id: "nonexistent"`
  - Expected: `{ error: "Model not found" }`
- [ ] **GREEN**: Verify resource handlers

### 1.8 Data Expansion — Models to 50+

**File**: `data/models.json`

- [ ] Add Anthropic models: `claude-3-opus`, `claude-3-haiku`, `claude-3.5-haiku`
- [ ] Add OpenAI models: `gpt-3.5-turbo`, `o1`, `o1-mini`, `o1-pro`, `o3`, `o3-mini`, `o4-mini`
- [ ] Add Google models: `gemini-1.5-pro`, `gemini-1.5-flash`, `gemini-2.5-flash`
- [ ] Add Meta models: `llama-3.2-90b`, `llama-3.2-11b`, `llama-3.2-3b`, `llama-3.2-1b`, `llama-3.1-70b`, `llama-3.1-8b`
- [ ] Add Mistral models: `mistral-small`, `mistral-medium`, `codestral`, `pixtral-large`
- [ ] Add DeepSeek models: `deepseek-coder`
- [ ] Add Cohere models: `command-r`
- [ ] Add Qwen models: `qwen-2.5-72b`, `qwen-2.5-coder-32b`, `qwen-2.5-7b`
- [ ] Add xAI models: `grok-2`, `grok-2-mini`
- [ ] Add Amazon models: `nova-pro`, `nova-lite`, `nova-micro`
- [ ] **RED**: Test `getModels().length >= 50`
- [ ] **GREEN**: Ensure all new models pass `validate-data`

### 1.9 Data Expansion — Pricing entries

**File**: `data/pricing.json`

- [ ] Add pricing for all new models (direct providers)
- [ ] Add aggregator pricing: OpenRouter entries for top 20 models
- [ ] Add aggregator pricing: Amazon Bedrock entries for supported models
- [ ] Add aggregator pricing: Azure OpenAI entries for OpenAI models
- [ ] Add aggregator pricing: Fireworks entries for open-source models
- [ ] Add aggregator pricing: Together AI entries for open-source models
- [ ] Add aggregator pricing: Groq entries for supported models
- [ ] Add aggregator pricing: DeepInfra entries for open-source models
- [ ] **RED**: Test `getPricing().length >= 150`
- [ ] **RED**: Test every model in `models.json` has at least one pricing entry
- [ ] **GREEN**: Run `npm run validate-data` — all pass

---

## Phase 2: Robustness

### 2.1 Edge Case Handling — Empty & invalid inputs

**File**: `tests/edge-cases.test.ts`

- [ ] **RED**: Test `find_best_model` with every valid `use_case` enum value returns results (no crashes)
- [ ] **RED**: Test `compare_models` with duplicate model IDs (e.g., `["gpt-4o", "gpt-4o"]`)
  - Expected: handles gracefully (either deduplicates or shows both)
- [ ] **RED**: Test `estimate_cost` with very large token counts (1 billion/day)
  - Expected: no overflow, returns valid numbers
- [ ] **RED**: Test `estimate_cost` with `days: 1` (minimum)
  - Expected: period total = daily cost
- [ ] **RED**: Test `find_cheapest_provider` for model with only one provider
  - Expected: returns single provider, no crash
- [ ] **RED**: Test `list_models` with all three filters combined
  - Input: `provider: "meta", capability: "function_calling", open_source_only: true`
  - Expected: returns only matching models
- [ ] **RED**: Test `detect_project_models` with unreadable files (permission denied)
  - Expected: skips gracefully, no crash
- [ ] **RED**: Test `getModelById` with special characters in ID (`"model/with:special"`)
  - Expected: returns `undefined`, no crash
- [ ] **RED**: Test `getModelById` with empty string
  - Expected: returns `undefined`
- [ ] **GREEN**: Add defensive checks where tests reveal gaps
- [ ] **REFACTOR**: Consolidate any repeated validation patterns

### 2.2 Integration Tests — MCP request/response cycle

**File**: `tests/integration/mcp-server.test.ts`

- [ ] **RED**: Test MCP server instantiation — server creates without error
  - Import `McpServer`, register tools/resources, verify no throw
- [ ] **RED**: Test `find_best_model` tool is registered and callable
  - Call via server's tool handler with valid input, verify structured response
- [ ] **RED**: Test `compare_models` tool returns valid MCP response format
  - Verify `content` array with `type: "text"` entries
- [ ] **RED**: Test `estimate_cost` tool returns valid MCP response format
- [ ] **RED**: Test `find_cheapest_provider` tool returns valid MCP response format
- [ ] **RED**: Test `list_models` tool returns valid MCP response format
- [ ] **RED**: Test `detect_project_models` tool returns valid MCP response format
- [ ] **RED**: Test `last-updated` resource returns valid JSON
- [ ] **RED**: Test `providers` resource returns valid JSON
- [ ] **RED**: Test `model-detail` resource template resolves correctly
- [ ] **GREEN**: Ensure all tools/resources follow MCP response contract

### 2.3 Data Validation in CI

**File**: `scripts/validate-data.ts` (enhance), `tests/data-integrity.test.ts`

- [ ] **RED**: Test every `model_id` in `pricing.json` exists in `models.json`
- [ ] **RED**: Test every model has required fields: `id`, `name`, `provider`, `family`, `context_window`, `max_output_tokens`
- [ ] **RED**: Test every pricing entry has required fields: `model_id`, `provider`, `provider_type`, `input_price_per_1m`, `output_price_per_1m`, `last_verified`
- [ ] **RED**: Test `provider_type` is one of `"direct"`, `"aggregator"`, `"gateway"`
- [ ] **RED**: Test no duplicate model IDs in `models.json`
- [ ] **RED**: Test no duplicate `(model_id, provider)` pairs in `pricing.json`
- [ ] **RED**: Test all `last_verified` dates are valid ISO date strings
- [ ] **RED**: Test all prices are non-negative numbers
- [ ] **RED**: Test `context_window` and `max_output_tokens` are positive integers
- [ ] **RED**: Test `meta.json` has `last_updated` and `version` fields
- [ ] **RED**: Test staleness warning — flag pricing entries with `last_verified` > 30 days old
- [ ] **GREEN**: Enhance `scripts/validate-data.ts` to cover all checks
- [ ] **GREEN**: Add `npm run validate-data` to test suite or as separate CI step

---

## Phase 3: Polish & Publishing

### 3.1 npm Publishing Setup

**Files**: `package.json`, `.npmignore`

- [ ] **RED**: Test `package.json` has required fields: `name`, `version`, `description`, `bin`, `main`, `types`, `files`, `license`, `engines`
- [ ] **RED**: Test `package.json` `bin` entry points to `./dist/index.js`
- [ ] **RED**: Test `package.json` `files` includes `["dist", "data"]`
- [ ] **RED**: Test `prepublishOnly` script runs build
- [ ] **GREEN**: Create `.npmignore` excluding: `src/`, `tests/`, `scripts/`, `.kiro/`, `biome.json`, `tsconfig.json`, `vitest.config.ts`, `tsup.config.ts`
- [ ] **GREEN**: Verify `npm pack --dry-run` includes only `dist/`, `data/`, `package.json`, `README.md`, `LICENSE`
- [ ] **GREEN**: Add `repository`, `bugs`, `homepage` fields to `package.json`
- [ ] **GREEN**: Add `keywords` covering: mcp, llm, ai, pricing, model-comparison, cost-estimation

### 3.2 GitHub Actions CI

**File**: `.github/workflows/ci.yml`

- [ ] **RED**: Test CI workflow file is valid YAML (lint in test)
- [ ] **GREEN**: Create workflow with jobs:
  - `lint`: `npm run lint`
  - `test`: `npm test`
  - `validate-data`: `npm run validate-data`
  - `build`: `npm run build`
- [ ] **GREEN**: Matrix test on Node 18, 20, 22
- [ ] **GREEN**: Cache `node_modules` for speed
- [ ] **GREEN**: Run on push to `main` and all PRs
- [ ] **GREEN**: Add badge to README

### 3.3 CONTRIBUTING.md

**File**: `CONTRIBUTING.md`

- [ ] **GREEN**: Write guide sections:
  - How to add a new model (data-only, with example JSON)
  - How to add a new provider/pricing entry (data-only)
  - How to add a new gateway (data-only)
  - How to add a new tool (code change, with template)
  - How to add detection patterns (code change)
  - How to run tests: `npm test`
  - How to validate data: `npm run validate-data`
  - How to lint: `npm run lint`
  - PR checklist (tests pass, data validates, lint clean)
- [ ] **GREEN**: Add link from README to CONTRIBUTING.md

### 3.4 Gateway Detection Expansion

**Files**: `data/gateways.json`, `src/tools/detect-project-models.ts`

- [ ] **RED**: Test detection of Martian gateway config files
- [ ] **RED**: Test detection of AI Gateway (Cloudflare) config
- [ ] **RED**: Test detection of Braintrust proxy config
- [ ] **GREEN**: Add gateway entries for: Martian, Cloudflare AI Gateway, Braintrust
- [ ] **GREEN**: Add MODEL_PATTERNS for: `phi-3`, `gemma-2`, `yi-large`, `jamba`
- [ ] **RED**: Test new patterns match expected strings
- [ ] **GREEN**: Implement pattern additions

### 3.5 README Enhancement

**File**: `README.md`

- [ ] **GREEN**: Add setup instructions for each MCP client:
  - Kiro (`mcp.json` config)
  - Claude Code (`claude_desktop_config.json`)
  - Cursor (settings.json)
  - Codex (MCP config)
  - Generic stdio client
- [ ] **GREEN**: Add tool usage examples with sample outputs
- [ ] **GREEN**: Add "Data Freshness" section explaining `last_verified` and staleness
- [ ] **GREEN**: Add badges: npm version, CI status, license

---

## Phase 4: Advanced Features

### 4.1 Batch Pricing Comparison

**Files**: `src/tools/batch-compare-pricing.ts`, `tests/tools/batch-compare-pricing.test.ts`

- [ ] **RED**: Test batch comparison for 3+ models returns pricing table
  - Input: `models: ["gpt-4o", "claude-4-sonnet", "gemini-2.5-pro"], workload: { input: 1M, output: 500K }`
  - Expected: table with all models × all providers, sorted by total cost
- [ ] **RED**: Test handles mix of found and not-found models
  - Expected: warns about missing models, shows data for found ones
- [ ] **RED**: Test output includes cheapest option highlighted
- [ ] **GREEN**: Implement `registerBatchComparePricing` in new tool file
- [ ] **GREEN**: Register in `src/tools/index.ts`
- [ ] **GREEN**: Add Zod input schema with `models: string[]`, `workload` object

### 4.2 Cost Optimization Suggestions

**Files**: `src/tools/suggest-optimization.ts`, `tests/tools/suggest-optimization.test.ts`

- [ ] **RED**: Test suggests cheaper alternative when a cheaper model scores within 5% for the use case
  - Input: user currently using `claude-4-opus` for `"summarization"`
  - Expected: suggests `claude-4-sonnet` or `gemini-2.5-pro` as cheaper with similar quality
- [ ] **RED**: Test suggests aggregator when direct provider is more expensive
  - Input: model with cheaper aggregator pricing
  - Expected: suggests switching to aggregator
- [ ] **RED**: Test suggests caching when gateway supports it
  - Input: project using LiteLLM
  - Expected: mentions caching as optimization
- [ ] **RED**: Test returns "already optimized" when no better option exists
- [ ] **GREEN**: Implement `registerSuggestOptimization`
- [ ] **GREEN**: Register in `src/tools/index.ts`

### 4.3 Model Deprecation Warnings

**Files**: `data/models.json` (schema extension), `tests/tools/deprecation.test.ts`

- [ ] **RED**: Test models with `deprecated: true` flag are excluded from `find_best_model` results by default
- [ ] **RED**: Test `compare_models` shows deprecation warning for deprecated models
- [ ] **RED**: Test `list_models` marks deprecated models in output
- [ ] **RED**: Test `detect_project_models` warns when project uses deprecated models
- [ ] **GREEN**: Add optional `deprecated` and `deprecated_by` fields to `Model` type in `src/types.ts`
- [ ] **GREEN**: Add deprecation data for known deprecated models (e.g., `gpt-4-turbo` → `gpt-4o`)
- [ ] **GREEN**: Update tool handlers to check deprecation status

### 4.4 Latency Data Integration

**Files**: `data/pricing.json` (schema extension), `src/types.ts`, `tests/tools/latency.test.ts`

- [ ] **RED**: Test `compare_models` includes latency data when available
  - Expected: output shows "TTFT" and "TPS" columns
- [ ] **RED**: Test `find_best_model` with `max_latency_ms` constraint filters by latency
  - Input: `constraints: { max_latency_ms: 500 }`
  - Expected: only models with TTFT ≤ 500ms
- [ ] **RED**: Test latency data is optional — tools work without it
  - Expected: no crash when `latency_ttft_ms` is undefined
- [ ] **GREEN**: Add optional fields to `ProviderPricing`: `latency_ttft_ms`, `latency_tps`
- [ ] **GREEN**: Populate latency data for major providers (Anthropic, OpenAI, Google direct)
- [ ] **GREEN**: Update `find_best_model` constraint filtering to support `max_latency_ms`
- [ ] **GREEN**: Update `compare_models` output to show latency when available

---

## Test Coverage Target

After all phases:

| Metric     | Target |
|------------|--------|
| Statements | ≥ 80%  |
| Branches   | ≥ 80%  |
| Functions  | ≥ 80%  |
| Lines      | ≥ 80%  |

Run: `npx vitest run --coverage`

Add to `vitest.config.ts`:
```ts
coverage: {
  provider: 'v8',
  thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
  include: ['src/**/*.ts'],
  exclude: ['src/index.ts'], // entry point is hard to unit test
}
```

---

## Execution Order

1. **Phase 1.1–1.6** (tool unit tests) — can be parallelized across tools
2. **Phase 1.7** (resource tests)
3. **Phase 1.8–1.9** (data expansion) — do after tool tests confirm logic is correct
4. **Phase 2.1** (edge cases) — builds on Phase 1 tests
5. **Phase 2.2** (integration tests) — requires all tools working
6. **Phase 2.3** (data validation) — requires expanded data
7. **Phase 3.1–3.5** (polish) — can be parallelized
8. **Phase 4.1–4.4** (advanced features) — each is independent, can be parallelized
