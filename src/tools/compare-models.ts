import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getModelById, getPricingForModel } from "../data.js";

export function registerCompareModels(server: McpServer): void {
	server.registerTool(
		"compare_models",
		{
			title: "Compare Models",
			description:
				"Side-by-side comparison of specific LLM models on pricing, benchmarks, features, and context window.",
			inputSchema: z.object({
				models: z
					.array(z.string())
					.min(2)
					.max(10)
					.describe('Model identifiers to compare (e.g., ["claude-4-sonnet", "gpt-4o"])'),
				workload: z
					.object({
						input_tokens_per_day: z.number().describe("Input tokens per day"),
						output_tokens_per_day: z.number().describe("Output tokens per day"),
					})
					.optional()
					.describe("Optional workload for cost projection"),
			}),
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ models: modelIds, workload }) => {
			const found = modelIds.map((id) => ({ id, model: getModelById(id) }));
			const missing = found.filter((f) => !f.model);

			if (missing.length > 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Models not found: ${missing.map((m) => m.id).join(", ")}. Use list_models to see available models.`,
						},
					],
					isError: true,
				};
			}

			const rows = found.map(({ model }) => {
				const m = model!;
				const pricing = getPricingForModel(m.id);
				const cheapest = pricing.sort((a, b) => a.input_price_per_1m - b.input_price_per_1m)[0];

				let costProjection = "";
				if (workload && cheapest) {
					const daily =
						(workload.input_tokens_per_day / 1_000_000) * cheapest.input_price_per_1m +
						(workload.output_tokens_per_day / 1_000_000) * cheapest.output_price_per_1m;
					costProjection = `\n**Monthly Cost** (cheapest): $${(daily * 30).toFixed(2)}`;
				}

				return [
					`### ${m.name}`,
					`- **Provider**: ${m.provider}`,
					`- **Context**: ${(m.context_window / 1000).toFixed(0)}K | **Max Output**: ${(m.max_output_tokens / 1000).toFixed(0)}K`,
					`- **Capabilities**: ${m.capabilities.join(", ")}`,
					`- **Open Source**: ${m.open_source ? "Yes" : "No"}`,
					cheapest
						? `- **Best Price**: $${cheapest.input_price_per_1m}/$${cheapest.output_price_per_1m} per 1M tokens (${cheapest.provider})`
						: "- **Price**: N/A",
					m.benchmarks.arena_elo ? `- **Arena Elo**: ${m.benchmarks.arena_elo}` : "",
					m.benchmarks.humaneval ? `- **HumanEval**: ${m.benchmarks.humaneval}` : "",
					m.benchmarks.swe_bench ? `- **SWE-bench**: ${m.benchmarks.swe_bench}` : "",
					costProjection,
				]
					.filter(Boolean)
					.join("\n");
			});

			return {
				content: [
					{
						type: "text" as const,
						text: `# Model Comparison\n\n${rows.join("\n\n---\n\n")}`,
					},
				],
			};
		},
	);
}
