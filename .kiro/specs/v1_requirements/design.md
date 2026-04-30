# Design Document: LLM Economist MCP Server

> Generated from source analysis on 2026-04-30. Covers architecture, algorithms, data design, distribution, and extension points.

---

## 1. Architecture Overview

The server follows a three-layer architecture: **Entry Point → Tools/Resources → Data Layer**.

```
┌─────────────────────────────────────────────────────┐
│                   MCP Client                        │
│  (Kiro, Claude Code, Cursor, Codex, etc.)           │
└──────────────────────┬──────────────────────────────┘
                       │ stdio (JSON-RPC)
                       ▼
┌─────────────────────────────────────────────────────┐
│              src/index.ts  (Entry Point)            │
│  - Creates McpServer instance                       │
│  - Registers tools via registerTools(server)        │
│  - Registers resources via registerResources(server)│
│  - Connects StdioServerTransport                    │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
           ▼                      ▼
┌─────────────────────┐ ┌────────────────────────────┐
│   src/tools/         │ │   src/resources.ts          │
│                      │ │                             │
│  find-best-model.ts  │ │  last-updated (static)      │
│  compare-models.ts   │ │  providers (static)         │
│  find-cheapest-      │ │  models/{model_id}          │
│    provider.ts       │ │    (ResourceTemplate)       │
│  estimate-cost.ts    │ │                             │
│  list-models.ts      │ └──────────┬─────────────────┘
│  detect-project-     │            │
│    models.ts         │            │
│  index.ts (barrel)   │            │
└──────────┬───────────┘            │
           │                        │
           ▼                        ▼
┌─────────────────────────────────────────────────────┐
│              src/data.ts  (Data Layer)              │
│  - Lazy-loads JSON files from data/ directory       │
│  - Singleton DataStore cache                        │
│  - Exports: getModels(), getPricing(), getGateways()│
│  - Exports: getModelById(), getPricingForModel()    │
└──────────────────────┬──────────────────────────────┘
                       │ readFileSync
                       ▼
┌─────────────────────────────────────────────────────┐
│              data/  (Bundled JSON)                   │
│  models.json    — 15 model entries                  │
│  pricing.json   — 50+ provider pricing entries      │
│  gateways.json  — 4 gateway definitions             │
│  meta.json      — version + last_updated timestamp  │
└─────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Single process, stdio transport**: The server runs as a child process of the MCP client. No HTTP server, no ports, no auth needed for the primary use case.
- **Lazy singleton data store**: `getDataStore()` loads JSON files on first call, then caches. This keeps startup fast and memory predictable.
- **Tool registration pattern**: Each tool lives in its own file and exports a `register*` function that receives the `McpServer` instance. The barrel `index.ts` calls all of them. This keeps tools isolated and easy to add/remove.
- **Zod for input schemas**: Each tool defines its input schema using Zod, which the MCP SDK converts to JSON Schema for client discovery.

---

## 2. Data Architecture

### File Layout

```
data/
├── models.json      # Array of Model objects
├── pricing.json     # Array of ProviderPricing objects
├── gateways.json    # Array of Gateway objects
└── meta.json        # { last_updated, version, data_sources[] }
```

### Schema Definitions (src/types.ts)

#### Model

| Field              | Type                              | Description                                    |
|--------------------|-----------------------------------|------------------------------------------------|
| `id`               | `string`                          | Unique slug, e.g. `"claude-4-sonnet"`          |
| `name`             | `string`                          | Display name                                   |
| `provider`         | `string`                          | Origin provider slug                           |
| `family`           | `string`                          | Model family, e.g. `"claude"`, `"gpt"`         |
| `release_date`     | `string`                          | ISO date                                       |
| `context_window`   | `number`                          | Max input tokens                               |
| `max_output_tokens`| `number`                          | Max generation length                          |
| `capabilities`     | `Capability[]`                    | Feature flags (vision, function_calling, etc.)  |
| `benchmarks`       | `Partial<Record<Benchmark, number>>` | Scores keyed by benchmark name              |
| `use_case_scores`  | `Partial<Record<UseCase, number>>`   | 0-100 scores per use case                   |
| `open_source`      | `boolean`                         | License type                                   |

#### ProviderPricing

| Field                        | Type     | Description                          |
|------------------------------|----------|--------------------------------------|
| `model_id`                   | `string` | FK → Model.id                        |
| `provider`                   | `string` | Provider slug                        |
| `provider_type`              | `enum`   | `"direct"` / `"aggregator"` / `"gateway"` |
| `input_price_per_1m`         | `number` | USD per 1M input tokens              |
| `output_price_per_1m`        | `number` | USD per 1M output tokens             |
| `cached_input_price_per_1m`  | `number?`| Cached/prompt-cache price            |
| `batch_input_price_per_1m`   | `number?`| Batch API price                      |
| `batch_output_price_per_1m`  | `number?`| Batch API price                      |
| `rate_limit_rpm`             | `number?`| Requests per minute                  |
| `rate_limit_tpm`             | `number?`| Tokens per minute                    |
| `notes`                      | `string?`| Human-readable notes                 |
| `last_verified`              | `string` | ISO date of last price verification  |

#### Gateway

| Field                | Type       | Description                              |
|----------------------|------------|------------------------------------------|
| `id`                 | `string`   | Unique slug                              |
| `name`               | `string`   | Display name                             |
| `type`               | `"gateway"`| Always `"gateway"`                       |
| `features`           | `string[]` | Capability list (caching, routing, etc.) |
| `supported_providers`| `string[]` | Provider slugs this gateway supports     |
| `detection_files`    | `string[]` | Config filenames to detect usage         |
| `detection_env_vars` | `string[]` | Env vars that indicate usage             |

### Entity Relationships

```
┌──────────┐       1:N       ┌─────────────────┐
│  Model   │────────────────▶│ ProviderPricing  │
│  (id)    │                 │ (model_id → id)  │
└──────────┘                 └─────────────────┘

┌──────────┐   references    ┌─────────────────┐
│ Gateway  │ ◇──────────────▶│ Provider slugs   │
│          │ supported_       │ (string match)   │
└──────────┘ providers        └─────────────────┘
```

- **Model → Pricing**: One model has many pricing entries (one per provider/aggregator).
- **Gateway → Providers**: Gateways list which provider slugs they support (loose coupling via string match).
- **No foreign key enforcement at runtime** — the `validate-data.ts` script checks referential integrity in CI.

---

## 3. Scoring Algorithm (`find_best_model`)

The `scoreModel(model, useCase)` function in `src/tools/find-best-model.ts` produces a composite score (0–100) used to rank models for a given use case.

### Formula

```
score = (use_case_score × 0.70) + elo_normalized + context_bonus
```

### Component Breakdown

| Component         | Weight | Calculation                                                        | Range   |
|-------------------|--------|--------------------------------------------------------------------|---------|
| **Use Case Score**| 70%    | `model.use_case_scores[useCase]` — curated 0-100 rating           | 0–70    |
| **Arena Elo**     | 20%    | `((arena_elo - 1000) / 400) × 20` — normalized from Elo range     | 0–~20   |
| **Context Bonus** | 10%    | `min(context_window / 200000, 1) × 10` — rewards large context    | 0–10    |

### Detailed Behavior

1. **Early exit**: If `use_case_scores[useCase]` is `0` or missing, the model scores `0` and is excluded from results. This prevents models without relevant capability from appearing.

2. **Elo normalization**: The Elo range in the dataset is roughly 1100–1350. The formula `(elo - 1000) / 400` maps this to ~0.25–0.875, then multiplied by 20 gives ~5–17.5 points. If no Elo data exists, a default of `10` (midpoint) is used.

3. **Context bonus**: Linear scale up to 200K tokens (the Anthropic standard). Models with 200K+ context get the full 10 points. Gemini's 1M context still caps at 10 — the bonus rewards "sufficient" context, not infinite.

4. **Final rounding**: `Math.round()` produces an integer score for clean display.

### Example Calculation

For `claude-4-sonnet` with `use_case = "coding"`:
```
use_case_score = 96
elo_normalized = ((1310 - 1000) / 400) × 20 = 15.5
context_bonus  = min(200000 / 200000, 1) × 10 = 10.0
score          = round(96 × 0.7 + 15.5 + 10.0) = round(92.7) = 93
```

### Constraint Filtering (Pre-Scoring)

Before scoring, models are filtered by optional constraints:
- `open_source_only` → `model.open_source === true`
- `min_context_window` → `model.context_window >= value`
- `provider` → `model.provider === value`
- `max_input_price` / `max_output_price` → checks if ANY provider pricing entry satisfies the price constraint (a model passes if at least one provider is cheap enough)

---

## 4. Project Detection Strategy (`detect_project_models`)

The `detect_project_models` tool scans a project directory to identify which LLM models, providers, and gateways are in use. It operates entirely via filesystem reads — no network calls.

### Detection Pipeline

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ 1. Gateway       │────▶│ 2. Config File   │────▶│ 3. Source Dir   │
│    Detection     │     │    Scanning      │     │    Scanning     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### Step 1: Gateway Detection

For each gateway in `gateways.json`, check if any of its `detection_files` exist in the project root:

| Gateway    | Detection Files                                              |
|------------|--------------------------------------------------------------|
| LiteLLM    | `litellm_config.yaml`, `litellm.yaml`, `litellm_proxy_config.yaml` |
| Portkey    | `portkey.config.json`, `.portkey`                            |
| Helicone   | _(none — env-var only)_                                      |
| OpenRouter | _(none — env-var only)_                                      |

### Step 2: Config File Scanning

Reads these files from the project root (if they exist):

```
.env, .env.local, .env.production, package.json,
pyproject.toml, litellm_config.yaml, litellm.yaml, portkey.config.json
```

Each file's content is matched against **10 regex patterns** covering major model families:

| Pattern                                    | Matches                                    |
|--------------------------------------------|--------------------------------------------|
| `/gpt-4o(?:-mini)?/g`                     | gpt-4o, gpt-4o-mini                       |
| `/gpt-4-turbo/g`                           | gpt-4-turbo                               |
| `/gpt-3\.5-turbo/g`                        | gpt-3.5-turbo                             |
| `/claude-(?:4\|3\.5\|3)-(?:opus\|sonnet\|haiku)/g` | claude-4-sonnet, claude-3.5-sonnet, etc. |
| `/gemini-(?:2\.5\|2\.0\|1\.5)-(?:pro\|flash\|ultra)/g` | gemini-2.5-pro, gemini-2.0-flash, etc. |
| `/llama-?3(?:\.3\|\.2\|\.1)?-\d+b/gi`     | llama-3.3-70b, llama3.1-405b, etc.        |
| `/mixtral-\d+x\d+b/gi`                    | mixtral-8x22b                              |
| `/mistral-(?:large\|medium\|small)/gi`     | mistral-large, mistral-small               |
| `/deepseek-(?:v3\|r1\|coder)/gi`          | deepseek-v3, deepseek-r1                   |
| `/command-r(?:-plus)?/gi`                  | command-r, command-r-plus                  |

### Step 3: Source Directory Scanning

Recursively scans `src/` (up to depth 3) for files matching `*.ts, *.js, *.py, *.yaml, *.yml, *.json, *.toml`. Applies the same regex patterns. Skips dotfiles and `node_modules`.

### Output

The tool returns:
- List of detected models (cross-referenced with the database for enrichment)
- List of detected gateways
- Actionable suggestions pointing to `find_best_model` and `find_cheapest_provider`

---

## 5. Distribution Strategy

### npm Package Structure

```
llm-economist/
├── dist/
│   ├── index.js       # Bundled ESM, with #!/usr/bin/env node shebang
│   ├── index.js.map   # Source map
│   └── index.d.ts     # Type declarations
├── data/
│   ├── models.json
│   ├── pricing.json
│   ├── gateways.json
│   └── meta.json
└── package.json
```

### Key package.json Fields

```json
{
  "bin": { "llm-economist": "./dist/index.js" },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "data"],
  "type": "module",
  "engines": { "node": ">=18.0.0" }
}
```

### How `npx llm-economist` Works

1. npm downloads the package to a temp cache
2. The `bin` entry maps `llm-economist` → `./dist/index.js`
3. tsup adds `#!/usr/bin/env node` shebang via the `banner` config
4. Node executes the ESM bundle, which starts the stdio MCP server
5. The MCP client communicates via stdin/stdout JSON-RPC

### Data Bundling

The `"files": ["dist", "data"]` field ensures the `data/` directory is included in the npm tarball. At runtime, `src/data.ts` resolves the data directory relative to the built file:

```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
```

This works because `dist/index.js` is one level deep, and `data/` is at the package root.

### Build Pipeline

```
tsup (src/index.ts)
  → ESM bundle (dist/index.js)
  → Type declarations (dist/index.d.ts)
  → Source maps (dist/index.js.map)
  → Shebang injected via banner config
```

The `prepublishOnly` script ensures a fresh build before every `npm publish`.

---

## 6. Extension Points

The system is designed so that adding new models, providers, and gateways requires **only data file changes** — no code modifications.

### Adding a New Model

1. Add an entry to `data/models.json`:
```json
{
  "id": "new-model-id",
  "name": "New Model Name",
  "provider": "provider-slug",
  "family": "family-name",
  "release_date": "2026-05-01",
  "context_window": 128000,
  "max_output_tokens": 8192,
  "capabilities": ["vision", "function_calling"],
  "benchmarks": { "arena_elo": 1250 },
  "use_case_scores": { "coding": 85, "general": 80 },
  "open_source": false
}
```

2. Add pricing entries to `data/pricing.json` (one per provider).
3. Run `npm run validate-data` to check referential integrity.

### Adding a New Provider/Aggregator

Add pricing entries to `data/pricing.json` with the new provider slug. The provider automatically appears in:
- `find_cheapest_provider` results
- `estimate_cost` projections
- `compare_models` pricing data
- The `providers` resource listing

### Adding a New Gateway

Add an entry to `data/gateways.json` with detection files and env vars. The `detect_project_models` tool will automatically check for it.

### Adding a New Tool

1. Create `src/tools/my-new-tool.ts` with a `registerMyNewTool(server: McpServer)` function.
2. Import and call it from `src/tools/index.ts`.
3. The tool is immediately available to all MCP clients.

### Adding Detection Patterns

To detect new model families in `detect_project_models`, add a regex to the `MODEL_PATTERNS` array in `src/tools/detect-project-models.ts`. This is the one extension that requires a code change.

### Data Versioning

The `meta.json` file tracks `version` and `last_updated`. Data releases can be decoupled from code releases — bump the version in `meta.json` and publish a new npm version with only data changes.

---

## 7. Data Flow Diagrams

### find_best_model

```
Client                    MCP Server                    Data Layer
  │                          │                              │
  │  find_best_model         │                              │
  │  { use_case: "coding",   │                              │
  │    constraints: {...},   │                              │
  │    top_k: 5 }            │                              │
  │─────────────────────────▶│                              │
  │                          │  getModels()                 │
  │                          │─────────────────────────────▶│
  │                          │◀─────── Model[] ────────────│
  │                          │                              │
  │                          │  Filter by constraints       │
  │                          │  (open_source, context,      │
  │                          │   provider, price)           │
  │                          │                              │
  │                          │  For price constraints:      │
  │                          │  getPricingForModel(id)      │
  │                          │─────────────────────────────▶│
  │                          │◀─── ProviderPricing[] ──────│
  │                          │                              │
  │                          │  scoreModel() for each       │
  │                          │  Sort by score, take top_k   │
  │                          │                              │
  │                          │  getPricingForModel(id)      │
  │                          │  for each result (cheapest)  │
  │                          │─────────────────────────────▶│
  │                          │◀─── ProviderPricing[] ──────│
  │                          │                              │
  │◀── Markdown response ───│                              │
  │    with ranked models    │                              │
```

### estimate_cost

```
Client                    MCP Server                    Data Layer
  │                          │                              │
  │  estimate_cost           │                              │
  │  { model: "gpt-4o",     │                              │
  │    input_tokens: 100000, │                              │
  │    output_tokens: 50000, │                              │
  │    days: 30 }            │                              │
  │─────────────────────────▶│                              │
  │                          │  getModelById("gpt-4o")      │
  │                          │─────────────────────────────▶│
  │                          │◀─────── Model ──────────────│
  │                          │                              │
  │                          │  getPricingForModel("gpt-4o")│
  │                          │─────────────────────────────▶│
  │                          │◀─── ProviderPricing[] ──────│
  │                          │                              │
  │                          │  For each provider:          │
  │                          │  daily = (input/1M × price)  │
  │                          │        + (output/1M × price) │
  │                          │  Sort by daily cost          │
  │                          │                              │
  │◀── Markdown table ──────│                              │
  │    Provider|Daily|Period │                              │
  │    |Yearly columns       │                              │
```

### detect_project_models

```
Client                    MCP Server                    Filesystem
  │                          │                              │
  │  detect_project_models   │                              │
  │  { project_path: "." }   │                              │
  │─────────────────────────▶│                              │
  │                          │  getGateways()               │
  │                          │  For each gateway:           │
  │                          │    existsSync(detection_file)│
  │                          │───────────────────────────── ▶│
  │                          │◀──── true/false ────────────│
  │                          │                              │
  │                          │  For each CONFIG_FILE:       │
  │                          │    readFileSync(file)        │
  │                          │───────────────────────────── ▶│
  │                          │◀──── file content ──────────│
  │                          │    Match MODEL_PATTERNS      │
  │                          │                              │
  │                          │  scanDirectory("src/", d≤3)  │
  │                          │───────────────────────────── ▶│
  │                          │◀──── file contents ─────────│
  │                          │    Match MODEL_PATTERNS      │
  │                          │                              │
  │                          │  getModelById() for each     │
  │                          │  detected model slug         │
  │                          │                              │
  │◀── Markdown report ─────│                              │
  │    Models, Gateways,     │                              │
  │    Suggestions           │                              │
```

---

## 8. Decision Log

### Why TypeScript?

| Factor          | Rationale                                                                 |
|-----------------|---------------------------------------------------------------------------|
| MCP SDK         | `@modelcontextprotocol/sdk` is TypeScript-first with full type definitions |
| Ecosystem       | npm is the natural distribution channel for MCP servers                    |
| Type safety     | Strict mode catches data schema mismatches at compile time                 |
| Developer reach | Most MCP tool authors use TypeScript; lowers contribution barrier          |

### Why Bundled Data vs API Calls?

| Factor              | Bundled JSON (chosen)                    | Live API calls                          |
|---------------------|------------------------------------------|-----------------------------------------|
| **Latency**         | <1ms lookups (in-memory)                 | 100-500ms per request                   |
| **Reliability**     | Works offline, no API keys needed        | Depends on third-party uptime           |
| **Privacy**         | No data leaves the user's machine        | Sends queries to external services      |
| **Freshness**       | Stale until npm update                   | Always current                          |
| **Complexity**      | Zero runtime dependencies                | Auth, rate limiting, error handling      |
| **NFR-1.4 compliance** | ✅ "Zero external API dependencies"   | ❌ Violates requirement                 |

The bundled approach was chosen because the requirements explicitly mandate zero network calls at runtime (NFR-1.4). Staleness is mitigated by community PRs, frequent data-only releases, and the `last_verified` field on pricing entries.

### Why Zod (v3, with v4 planned)?

| Factor           | Rationale                                                              |
|------------------|------------------------------------------------------------------------|
| MCP SDK compat   | The SDK's `registerTool` accepts Zod schemas directly for `inputSchema`|
| Validation       | Runtime validation of tool inputs before processing                    |
| JSON Schema gen  | Zod schemas auto-convert to JSON Schema for MCP client discovery       |
| Bundle size      | Zod is already a transitive dependency of the MCP SDK                  |

> Note: The requirements specify "Zod v4" but the current implementation uses `zod@^3.25.1` (latest v3). Migration to Zod v4 is planned when the MCP SDK adds v4 support.

### Why tsup?

| Factor           | Rationale                                                              |
|------------------|------------------------------------------------------------------------|
| Zero config      | Works with a 6-line config file                                        |
| ESM output       | Native ESM bundle matching `"type": "module"` in package.json          |
| Shebang support  | `banner` option injects `#!/usr/bin/env node` for CLI execution        |
| DTS generation   | Produces `.d.ts` files for library consumers                           |
| Speed            | esbuild-based, builds in <1 second                                     |
| Single file      | Bundles all source into one `index.js` — simpler distribution          |

Alternatives considered:
- **tsc only**: No bundling, would ship multiple files and require runtime module resolution
- **esbuild directly**: No DTS generation, would need a separate tsc step
- **rollup**: More configuration overhead for the same result

### Why Biome over ESLint + Prettier?

| Factor     | Rationale                                                                  |
|------------|----------------------------------------------------------------------------|
| Speed      | Single Rust binary, 10-100x faster than ESLint + Prettier                  |
| Unified    | Linting + formatting in one tool, one config file                          |
| Zero deps  | No plugin ecosystem to manage                                              |

### Why Vitest over Jest?

| Factor     | Rationale                                                                  |
|------------|----------------------------------------------------------------------------|
| ESM native | First-class ESM support matching the project's `"type": "module"`          |
| Speed      | Vite-based, faster test execution                                          |
| Compat     | Jest-compatible API (`describe`, `it`, `expect`) — low learning curve      |

---

## Appendix: Tool Summary

| Tool                    | Input                              | Data Sources Used                | Output Format     |
|-------------------------|------------------------------------|----------------------------------|--------------------|
| `find_best_model`       | use_case, constraints?, top_k?     | models.json, pricing.json        | Ranked markdown    |
| `compare_models`        | model IDs[], workload?             | models.json, pricing.json        | Comparison markdown|
| `find_cheapest_provider`| model ID, workload?                | models.json, pricing.json        | Ranked list        |
| `estimate_cost`         | model ID, tokens/day, days?        | models.json, pricing.json        | Markdown table     |
| `list_models`           | provider?, capability?, oss?       | models.json                      | Bullet list        |
| `detect_project_models` | project_path?                      | gateways.json + filesystem scan  | Detection report   |

| Resource                              | URI Pattern                          | Returns              |
|---------------------------------------|--------------------------------------|----------------------|
| `last-updated`                        | `llm-economist://data/last-updated`  | Version + counts     |
| `providers`                           | `llm-economist://data/providers`     | Providers by type    |
| `model-detail`                        | `llm-economist://data/models/{id}`   | Full model object    |
