import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getModels, getPricingForModel } from "../data.js";
import type { Model, UseCase } from "../types.js";

export function registerFindBestModel(server: McpServer): void {
	server.registerTool(
		"find_best_model",
		{
			title: "Find Best Model",
			description:
				"Recommend the best LLM model(s) for a given use case. Returns ranked recommendations with pricing, benchmarks, and reasoning.",
			inputSchema: z.object({
				use_case: z
					.enum([
						"coding",
						"creative_writing",
						"summarization",
						"rag",
						"agents",
						"vision",
						"function_calling",
						"long_context",
						"math",
						"multilingual",
						"general",
					])
					.describe("The task or use case you need a model for"),
				constraints: z
					.object({
						max_input_price: z
							.number()
							.optional()
							.describe("Max input price per 1M tokens in USD"),
						max_output_price: z
							.number()
							.optional()
							.describe("Max output price per 1M tokens in USD"),
						min_context_window: z.number().optional().describe("Minimum context window in tokens"),
						open_source_only: z.boolean().optional().describe("Only recommend open-source models"),
						provider: z.string().optional().describe("Limit to a specific provider"),
					})
					.optional()
					.describe("Optional constraints to filter recommendations"),
				top_k: z.number().min(1).max(20).optional().describe("Number of recommendations (default: 5)"),
			}),
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ use_case, constraints, top_k }) => {
			const k = top_k ?? 5;
			let models = getModels();

			// Apply constraints
			if (constraints?.open_source_only) {
				models = models.filter((m) => m.open_source);
			}
			if (constraints?.min_context_window) {
				models = models.filter((m) => m.context_window >= constraints.min_context_window!);
			}
			if (constraints?.provider) {
				models = models.filter((m) => m.provider === constraints.provider);
			}
			if (constraints?.max_input_price || constraints?.max_output_price) {
				models = models.filter((m) => {
					const pricing = getPricingForModel(m.id);
					return pricing.some(
						(p) =>
							(!constraints.max_input_price || p.input_price_per_1m <= constraints.max_input_price) &&
							(!constraints.max_output_price ||
								p.output_price_per_1m <= constraints.max_output_price),
					);
				});
			}

			// Score and rank
			const scored = models
				.map((m) => ({ model: m, score: scoreModel(m, use_case) }))
				.filter((s) => s.score > 0)
				.sort((a, b) => b.score - a.score)
				.slice(0, k);

			if (scored.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `No models found matching your criteria for use case "${use_case}". Try relaxing your constraints.`,
						},
					],
				};
			}

			const results = scored.map(({ model, score }, i) => {
				const pricing = getPricingForModel(model.id);
				const cheapest = pricing.sort((a, b) => a.input_price_per_1m - b.input_price_per_1m)[0];
				return [
					`## #${i + 1}: ${model.name}`,
					`**Provider**: ${model.provider} | **Score**: ${score}/100`,
					`**Context**: ${(model.context_window / 1000).toFixed(0)}K tokens | **Max Output**: ${(model.max_output_tokens / 1000).toFixed(0)}K tokens`,
					`**Capabilities**: ${model.capabilities.join(", ")}`,
					cheapest
						? `**Best Price**: $${cheapest.input_price_per_1m}/1M input, $${cheapest.output_price_per_1m}/1M output (${cheapest.provider})`
						: "**Price**: Not available",
					`**Open Source**: ${model.open_source ? "Yes" : "No"}`,
					model.benchmarks.arena_elo ? `**Arena Elo**: ${model.benchmarks.arena_elo}` : "",
					`**Why**: Strong ${use_case.replace("_", " ")} performance${model.use_case_scores[use_case] ? ` (score: ${model.use_case_scores[use_case]}/100)` : ""}`,
				]
					.filter(Boolean)
					.join("\n");
			});

			return {
				content: [
					{
						type: "text" as const,
						text: `# Best Models for ${use_case.replace("_", " ")}\n\n${results.join("\n\n---\n\n")}`,
					},
				],
			};
		},
	);
}

function scoreModel(model: Model, useCase: UseCase): number {
	const useCaseScore = model.use_case_scores[useCase] ?? 0;
	if (useCaseScore === 0) return 0;

	// Weighted: 70% use case score, 20% arena elo normalized, 10% context bonus
	const eloNorm = model.benchmarks.arena_elo ? ((model.benchmarks.arena_elo - 1000) / 400) * 20 : 10;
	const ctxBonus = Math.min(model.context_window / 200000, 1) * 10;
	return Math.round(useCaseScore * 0.7 + eloNorm + ctxBonus);
}
