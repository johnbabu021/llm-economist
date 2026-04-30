import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getModelById, getPricingForModel } from "../data.js";

export function registerEstimateCost(server: McpServer): void {
	server.registerTool(
		"estimate_cost",
		{
			title: "Estimate Cost",
			description:
				"Calculate estimated cost for a workload across all providers. Shows daily, monthly, and yearly projections.",
			inputSchema: z.object({
				model: z.string().describe("Model identifier"),
				input_tokens_per_day: z.number().min(0).describe("Input tokens consumed per day"),
				output_tokens_per_day: z.number().min(0).describe("Output tokens generated per day"),
				days: z.number().min(1).optional().describe("Projection period in days (default: 30)"),
			}),
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ model: modelId, input_tokens_per_day, output_tokens_per_day, days }) => {
			const model = getModelById(modelId);
			if (!model) {
				return {
					content: [
						{
							type: "text" as const,
							text: `Model "${modelId}" not found. Use list_models to see available models.`,
						},
					],
					isError: true,
				};
			}

			const pricing = getPricingForModel(model.id);
			if (pricing.length === 0) {
				return {
					content: [
						{ type: "text" as const, text: `No pricing data available for "${model.name}".` },
					],
				};
			}

			const period = days ?? 30;
			const rows = pricing
				.map((p) => {
					const daily =
						(input_tokens_per_day / 1_000_000) * p.input_price_per_1m +
						(output_tokens_per_day / 1_000_000) * p.output_price_per_1m;
					return { provider: p.provider, type: p.provider_type, daily };
				})
				.sort((a, b) => a.daily - b.daily)
				.map(
					(r) =>
						`| ${r.provider} | ${r.type} | $${r.daily.toFixed(2)} | $${(r.daily * period).toFixed(2)} | $${(r.daily * 365).toFixed(2)} |`,
				);

			const table = [
				`# Cost Estimate: ${model.name}`,
				`**Workload**: ${(input_tokens_per_day / 1000).toFixed(0)}K input + ${(output_tokens_per_day / 1000).toFixed(0)}K output tokens/day`,
				`**Period**: ${period} days\n`,
				"| Provider | Type | Daily | Period Total | Yearly |",
				"|----------|------|-------|-------------|--------|",
				...rows,
			].join("\n");

			return { content: [{ type: "text" as const, text: table }] };
		},
	);
}
