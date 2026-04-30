import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools/index.js";

const server = new McpServer(
	{
		name: "llm-economist",
		version: "0.1.0",
	},
	{
		instructions:
			"LLM Economist helps you find the best AI model for your use case, compare pricing across providers and aggregators, and estimate costs. Use find_best_model for recommendations, compare_models for side-by-side analysis, find_cheapest_provider to minimize costs, estimate_cost for budget planning, list_models to browse available models, and detect_project_models to analyze your current setup.",
	},
);

registerTools(server);
registerResources(server);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
	console.error("LLM Economist MCP Server running on stdio");
}

main().catch((error) => {
	console.error("Fatal error:", error);
	process.exit(1);
});
