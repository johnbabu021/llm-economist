import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCompareModels } from "./compare-models.js";
import { registerDetectProjectModels } from "./detect-project-models.js";
import { registerEstimateCost } from "./estimate-cost.js";
import { registerFindBestModel } from "./find-best-model.js";
import { registerFindCheapestProvider } from "./find-cheapest-provider.js";
import { registerListModels } from "./list-models.js";

export function registerTools(server: McpServer): void {
	registerFindBestModel(server);
	registerCompareModels(server);
	registerFindCheapestProvider(server);
	registerEstimateCost(server);
	registerListModels(server);
	registerDetectProjectModels(server);
}
