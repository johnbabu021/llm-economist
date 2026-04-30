import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getModelById, getPricingForModel } from "../data.js";

export function registerFindCheapestProvider(server: McpServer): void {
	server.registerTool(
		"find_cheapest_provider",
		{
			title: "Find Cheapest Provider",
			description:
				"For a given model, find the cheapest provider including direct APIs and aggregators (OpenRouter, Bedrock, Fireworks, etc.).",
			inputSchema: z.object({
				model: z.string().describe("Model identifier (e.g., claude-4-sonnet, gpt-4o)"),
				workload: z
					.object({
						input_tokens_per_day: z.number(),
						output_tokens_per_day: z.number(),
					})
					.optional()
					.describe("Optional workload for cost projection"),
				include_aggregators: z
					.boolean()
					.optional()
					.describe("Include aggregator pricing (default: true)"),
			}),
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ model: modelId, workload, include_aggregators }) => {
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

			let pricing = getPricingForModel(model.id);
			if (include_aggregators === false) {
				pricing = pricing.filter((p) => p.provider_type === "direct");
			}

			if (pricing.length === 0) {
				return {
					content: [
						{ type: "text" as const, text: `No pricing data available for "${model.name}".` },
					],
				};
			}

			const ranked = pricing.sort((a, b) => a.input_price_per_1m - b.input_price_per_1m);

			const rows = ranked.map((p, i) => {
				let cost = "";
				if (workload) {
					const daily =
						(workload.input_tokens_per_day / 1_000_000) * p.input_price_per_1m +
						(workload.output_tokens_per_day / 1_000_000) * p.output_price_per_1m;
					cost = ` | **Monthly**: $${(daily * 30).toFixed(2)}`;
				}
				return [
					`${i + 1}. **${p.provider}** (${p.provider_type})`,
					`   Input: $${p.input_price_per_1m}/1M | Output: $${p.output_price_per_1m}/1M${cost}`,
					p.notes ? `   _${p.notes}_` : "",
					`   Last verified: ${p.last_verified}`,
				]
					.filter(Boolean)
					.join("\n");
			});

			return {
				content: [
					{
						type: "text" as const,
						text: `# Cheapest Providers for ${model.name}\n\n${rows.join("\n\n")}`,
					},
				],
			};
		},
	);
}
