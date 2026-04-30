# Contributing to LLM Economist

Thanks for your interest in contributing! This project thrives on community contributions — especially keeping model/pricing data fresh.

## Ways to Contribute

### 1. Update Pricing Data

Pricing changes frequently. If you notice stale data:

1. Edit `data/curated-scores.json` for benchmark/use-case scores
2. Run `npm run sync` to refresh LiteLLM pricing data
3. Run `npm run validate-data` to verify integrity
4. Submit a PR

### 2. Add a New Model Family

To add a model not yet tracked:

1. Add the model ID to `MODEL_FAMILIES` in `scripts/sync-litellm.ts`
2. Add a friendly name in `FRIENDLY_NAMES`
3. Add the primary provider in `PRIMARY_PROVIDER`
4. Add curated scores in `data/curated-scores.json`
5. Run `npm run sync && npm run validate-data`

### 3. Add a New Gateway

Edit `data/gateways.json` following the existing schema:

```json
{
  "id": "your-gateway",
  "name": "Your Gateway",
  "type": "gateway",
  "features": ["fallback_routing", "caching"],
  "supported_providers": ["openai", "anthropic"],
  "detection_files": ["your-gateway.config.yaml"],
  "detection_env_vars": ["YOUR_GATEWAY_API_KEY"]
}
```

### 4. Improve Tools or Fix Bugs

- Check [open issues](https://github.com/johnbabu021/llm-economist/issues)
- Look for `good first issue` labels

## Development Setup

```bash
git clone https://github.com/johnbabu021/llm-economist.git
cd llm-economist
npm install
npm run sync          # Fetch latest pricing data
npm run dev           # Run server locally
npm test              # Run tests
npm run lint          # Check code style
```

## Pull Request Process

1. Fork the repo and create a branch from `main`
2. Make your changes
3. Run `npm run validate-data && npm test && npm run build`
4. Ensure all checks pass
5. Write a clear PR description explaining what and why
6. Submit the PR

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat: add qwen-3 model family`
- `fix: correct gemini-2.5-pro pricing`
- `data: update pricing for april 2026`
- `docs: improve README setup instructions`

## Code Style

- TypeScript strict mode
- Formatted with Biome (`npm run lint:fix`)
- Tab indentation, 100 char line width
- No `any` types unless absolutely necessary

## Data Contribution Guidelines

- Always include `last_verified` date in pricing entries
- Use official provider pricing pages as source of truth
- Benchmark scores should cite their source (LMSYS Arena, official papers, etc.)
- Use-case scores are subjective — provide reasoning in your PR description
- Run `npm run validate-data` before submitting

## Questions?

Open a [discussion](https://github.com/johnbabu021/llm-economist/discussions) or file an issue.
