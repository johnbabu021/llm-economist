import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DataStore, Gateway, Model, ProviderPricing } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

function loadJson<T>(filename: string): T {
	const content = readFileSync(join(dataDir, filename), "utf-8");
	return JSON.parse(content) as T;
}

let store: DataStore | null = null;

export function getDataStore(): DataStore {
	if (!store) {
		store = {
			models: loadJson<Model[]>("models.json"),
			pricing: loadJson<ProviderPricing[]>("pricing.json"),
			gateways: loadJson<Gateway[]>("gateways.json"),
			last_updated: loadJson<{ last_updated: string; version: string }>("meta.json").last_updated,
			version: loadJson<{ last_updated: string; version: string }>("meta.json").version,
		};
	}
	return store;
}

export function getModels(): Model[] {
	return getDataStore().models;
}

export function getPricing(): ProviderPricing[] {
	return getDataStore().pricing;
}

export function getGateways(): Gateway[] {
	return getDataStore().gateways;
}

export function getModelById(id: string): Model | undefined {
	return getModels().find((m) => m.id === id || m.name.toLowerCase() === id.toLowerCase());
}

export function getPricingForModel(modelId: string): ProviderPricing[] {
	return getPricing().filter((p) => p.model_id === modelId);
}
