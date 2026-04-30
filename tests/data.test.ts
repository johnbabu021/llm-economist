import { describe, expect, it } from "vitest";
import { getDataStore, getModelById, getModels, getPricing, getPricingForModel } from "../src/data.js";

describe("data", () => {
	it("loads all models", () => {
		const models = getModels();
		expect(models.length).toBeGreaterThan(0);
		expect(models[0]).toHaveProperty("id");
		expect(models[0]).toHaveProperty("name");
		expect(models[0]).toHaveProperty("provider");
	});

	it("loads pricing data", () => {
		const pricing = getPricing();
		expect(pricing.length).toBeGreaterThan(0);
		expect(pricing[0]).toHaveProperty("model_id");
		expect(pricing[0]).toHaveProperty("input_price_per_1m");
	});

	it("finds model by id", () => {
		const model = getModelById("gpt-4o");
		expect(model).toBeDefined();
		expect(model!.name).toBe("GPT-4o");
	});

	it("finds model by name (case-insensitive)", () => {
		const model = getModelById("GPT-4o");
		expect(model).toBeDefined();
	});

	it("returns undefined for unknown model", () => {
		expect(getModelById("nonexistent-model")).toBeUndefined();
	});

	it("gets pricing for a specific model", () => {
		const pricing = getPricingForModel("gpt-4o");
		expect(pricing.length).toBeGreaterThan(0);
		expect(pricing.every((p) => p.model_id === "gpt-4o")).toBe(true);
	});

	it("data store has metadata", () => {
		const store = getDataStore();
		expect(store.last_updated).toBeDefined();
		expect(store.version).toBeDefined();
	});
});
