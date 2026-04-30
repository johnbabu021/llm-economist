import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDataStore, getModelById, getModels, getPricing } from "./data.js";

export function registerResources(server: McpServer): void {
	server.registerResource("last-updated", "llm-economist://data/last-updated", {
		title: "Data Last Updated",
		description: "Timestamp and version of the bundled model/pricing data",
		mimeType: "application/json",
	}, async (uri) => ({
		contents: [{
			uri: uri.href,
			text: JSON.stringify({
				last_updated: getDataStore().last_updated,
				version: getDataStore().version,
				total_models: getModels().length,
				total_pricing_entries: getPricing().length,
			}),
		}],
	}));

	server.registerResource("providers", "llm-economist://data/providers", {
		title: "Supported Providers",
		description: "Full list of supported providers and aggregators",
		mimeType: "application/json",
	}, async (uri) => {
		const providers = [...new Set(getPricing().map((p) => p.provider))];
		const byType = {
			direct: providers.filter((p) => getPricing().find((pr) => pr.provider === p)?.provider_type === "direct"),
			aggregator: providers.filter((p) => getPricing().find((pr) => pr.provider === p)?.provider_type === "aggregator"),
		};
		return { contents: [{ uri: uri.href, text: JSON.stringify(byType) }] };
	});

	server.registerResource(
		"model-detail",
		new ResourceTemplate("llm-economist://data/models/{model_id}", {
			list: async () => ({
				resources: getModels().map((m) => ({
					uri: `llm-economist://data/models/${m.id}`,
					name: m.name,
				})),
			}),
		}),
		{ title: "Model Detail", description: "Complete data for a specific model", mimeType: "application/json" },
		async (uri, { model_id }) => {
			const model = getModelById(model_id as string);
			if (!model) {
				return { contents: [{ uri: uri.href, text: JSON.stringify({ error: "Model not found" }) }] };
			}
			return { contents: [{ uri: uri.href, text: JSON.stringify(model) }] };
		},
	);
}
