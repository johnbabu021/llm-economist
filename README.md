# llm-economist

An MCP server that helps you find the best LLM model for any use case, compare pricing across providers and aggregators, and estimate costs.

Works with **Kiro**, **Claude Code**, **Claude Desktop**, **Codex**, **Cursor**, **Windsurf**, **Continue**, and any MCP-compatible client.

## Features

- 🎯 **Find Best Model** — Get ranked recommendations for any use case (coding, RAG, agents, creative writing, etc.)
- ⚖️ **Compare Models** — Side-by-side comparison with benchmarks and pricing
- 💰 **Find Cheapest Provider** — Compare direct APIs vs aggregators (OpenRouter, Bedrock, Fireworks, Together AI, Groq, etc.)
- 📊 **Estimate Cost** — Project daily/monthly/yearly costs for your workload
- 📋 **List Models** — Browse all models with filtering
- 🔍 **Detect Project Models** — Scan your project to find what models/gateways you're using

## Quick Start

### npx (no install)

```bash
npx llm-economist
```

### Install globally

```bash
npm install -g llm-economist
```

## MCP Client Setup

### Kiro / Claude Code / Claude Desktop

Add to your MCP config (`~/.config/claude/claude_desktop_config.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "llm-economist": {
      "command": "npx",
      "args": ["-y", "llm-economist"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "llm-economist": {
      "command": "npx",
      "args": ["-y", "llm-economist"]
    }
  }
}
```

### Generic MCP Client

The server communicates over stdio. Run `npx llm-economist` and connect via stdin/stdout.

## Available Tools

| Tool | Description |
|------|-------------|
| `find_best_model` | Recommend models for a use case with optional constraints |
| `compare_models` | Side-by-side comparison of specific models |
| `find_cheapest_provider` | Find cheapest provider for a model |
| `estimate_cost` | Calculate cost projections for a workload |
| `list_models` | List/filter all available models |
| `detect_project_models` | Scan project for model/gateway usage |

## Data Coverage

**Providers**: OpenAI, Anthropic, Google, Meta, DeepSeek, Mistral, Cohere

**Aggregators**: OpenRouter, Amazon Bedrock, Azure OpenAI, Google Vertex, Together AI, Fireworks, Groq, DeepInfra

**Gateways**: LiteLLM, Portkey, Helicone, OpenRouter

## Contributing

### Adding a Model

Edit `data/models.json` and add an entry following the existing schema. Then add pricing entries in `data/pricing.json`.

Run validation:

```bash
npm run validate-data
```

### Data Freshness

All pricing data includes a `last_verified` date. If you notice stale data, PRs are welcome!

## Development

```bash
npm install
npm run dev          # Run with tsx (hot reload)
npm run build        # Build with tsup
npm test             # Run tests
npm run validate-data # Validate data integrity
```

## License

MIT
