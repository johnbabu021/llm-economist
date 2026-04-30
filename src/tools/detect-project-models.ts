import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getGateways, getModelById } from "../data.js";

const MODEL_PATTERNS = [
	/gpt-4o(?:-mini)?/g,
	/gpt-4-turbo/g,
	/gpt-3\.5-turbo/g,
	/claude-(?:4|3\.5|3)-(?:opus|sonnet|haiku)/g,
	/gemini-(?:2\.5|2\.0|1\.5)-(?:pro|flash|ultra)/g,
	/llama-?3(?:\.3|\.2|\.1)?-\d+b/gi,
	/mixtral-\d+x\d+b/gi,
	/mistral-(?:large|medium|small)/gi,
	/deepseek-(?:v3|r1|coder)/gi,
	/command-r(?:-plus)?/gi,
];

const CONFIG_FILES = [
	".env",
	".env.local",
	".env.production",
	"package.json",
	"pyproject.toml",
	"litellm_config.yaml",
	"litellm.yaml",
	"portkey.config.json",
];

export function registerDetectProjectModels(server: McpServer): void {
	server.registerTool(
		"detect_project_models",
		{
			title: "Detect Project Models",
			description:
				"Scan the current project to detect which LLM models, providers, and gateways are in use. Provides optimization suggestions.",
			inputSchema: z.object({
				project_path: z
					.string()
					.optional()
					.describe("Path to scan (defaults to current working directory)"),
			}),
			annotations: { readOnlyHint: true },
		},
		async ({ project_path }) => {
			const dir = project_path ?? process.cwd();
			const detectedModels = new Set<string>();
			const detectedGateways: string[] = [];

			// Check for gateway config files
			for (const gw of getGateways()) {
				for (const file of gw.detection_files) {
					if (existsSync(join(dir, file))) {
						detectedGateways.push(gw.name);
						break;
					}
				}
			}

			// Scan config files for model references
			for (const file of CONFIG_FILES) {
				const path = join(dir, file);
				if (!existsSync(path)) continue;
				try {
					const content = readFileSync(path, "utf-8");
					for (const pattern of MODEL_PATTERNS) {
						const matches = content.matchAll(pattern);
						for (const match of matches) {
							detectedModels.add(match[0].toLowerCase());
						}
					}
				} catch {
					// Skip unreadable files
				}
			}

			// Scan src directory for model references
			try {
				const srcDir = join(dir, "src");
				if (existsSync(srcDir)) {
					scanDirectory(srcDir, detectedModels);
				}
			} catch {
				// Skip if src doesn't exist
			}

			const sections: string[] = ["# Project Model Detection\n"];

			if (detectedModels.size > 0) {
				sections.push("## Detected Models");
				for (const modelId of detectedModels) {
					const model = getModelById(modelId);
					sections.push(
						model
							? `- **${model.name}** (${model.provider})`
							: `- ${modelId} (not in database)`,
					);
				}
			} else {
				sections.push("_No models detected in project files._");
			}

			if (detectedGateways.length > 0) {
				sections.push("\n## Detected Gateways");
				for (const gw of detectedGateways) {
					sections.push(`- ${gw}`);
				}
			}

			sections.push(
				"\n## Suggestions",
				"Use `find_best_model` to check if better alternatives exist for your use case.",
				"Use `find_cheapest_provider` to see if you're on the most cost-effective provider.",
			);

			return { content: [{ type: "text" as const, text: sections.join("\n") }] };
		},
	);
}

function scanDirectory(dir: string, models: Set<string>, depth = 0): void {
	if (depth > 3) return;
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				scanDirectory(path, models, depth + 1);
			} else if (/\.(ts|js|py|yaml|yml|json|toml)$/.test(entry.name)) {
				try {
					const content = readFileSync(path, "utf-8");
					for (const pattern of MODEL_PATTERNS) {
						for (const match of content.matchAll(pattern)) {
							models.add(match[0].toLowerCase());
						}
					}
				} catch {
					// Skip unreadable
				}
			}
		}
	} catch {
		// Skip unreadable directories
	}
}
