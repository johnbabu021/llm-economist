import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getModels } from "../data.js";

export function registerListModels(server: McpServer): void {
	server.registerTool(
		"list_models",
		{
			title: "List Models",
			description: "List all models in the database with optional filtering by provider, capability, or license.",
			inputSchema: z.object({
				provider: z.string().optional().describe("Filter by provider (e.g., openai, anthropic, google)"),
				capability: z
					.string()
					.optional()
					.describe("Filter by capability (e.g., vision, function_calling, json_mode)"),
				open_source_only: z.boolean().optional().describe("Only show open-source models"),
			}),
			annotations: { readOnlyHint: true, idempotentHint: true },
		},
		async ({ provider, capability, open_source_only }) => {
			let models = getModels();

			if (provider) {
				models = models.filter((m) => m.provider === provider.toLowerCase());
			}
			if (capability) {
				models = models.filter((m) => m.capabilities.includes(capability as any));
			}
			if (open_source_only) {
				models = models.filter((m) => m.open_source);
			}

			if (models.length === 0) {
				return {
					content: [{ type: "text" as const, text: "No models match your filters." }],
				};
			}

			const lines = models.map(
				(m) =>
					`- **${m.name}** (${m.provider}) — ${(m.context_window / 1000).toFixed(0)}K ctx | ${m.capabilities.slice(0, 3).join(", ")}${m.open_source ? " | OSS" : ""}`,
			);

			return {
				content: [
					{
						type: "text" as const,
						text: `# Available Models (${models.length})\n\n${lines.join("\n")}`,
					},
				],
			};
		},
	);
}
