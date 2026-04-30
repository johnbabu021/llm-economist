import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

function load(file: string) {
	return JSON.parse(readFileSync(join(dataDir, file), "utf-8"));
}

const models = load("models.json") as any[];
const pricing = load("pricing.json") as any[];
const gateways = load("gateways.json") as any[];

let errors = 0;

// Validate all pricing entries reference valid models
const modelIds = new Set(models.map((m: any) => m.id));
for (const p of pricing) {
	if (!modelIds.has(p.model_id)) {
		console.error(`❌ Pricing references unknown model: ${p.model_id}`);
		errors++;
	}
}

// Validate required fields
for (const m of models) {
	if (!m.id || !m.name || !m.provider) {
		console.error(`❌ Model missing required fields: ${JSON.stringify(m)}`);
		errors++;
	}
}

for (const p of pricing) {
	if (!p.model_id || !p.provider || p.input_price_per_1m == null || p.output_price_per_1m == null) {
		console.error(`❌ Pricing missing required fields: ${JSON.stringify(p)}`);
		errors++;
	}
}

if (errors > 0) {
	console.error(`\n❌ ${errors} validation error(s) found.`);
	process.exit(1);
} else {
	console.log(`✅ Data valid: ${models.length} models, ${pricing.length} pricing entries, ${gateways.length} gateways`);
}
