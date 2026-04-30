/**
 * Quick test client — spawns the MCP server and calls tools.
 * Usage: npx tsx scripts/test-client.ts
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "dist", "index.js");

const server = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "pipe"] });

let buffer = "";
let msgId = 0;

server.stdout.on("data", (data) => {
	buffer += data.toString();
	const lines = buffer.split("\n");
	buffer = lines.pop() ?? "";
	for (const line of lines) {
		if (!line.trim()) continue;
		try {
			const msg = JSON.parse(line);
			console.log("\n📨 Response:", JSON.stringify(msg, null, 2));
		} catch {
			// skip non-JSON lines
		}
	}
});

server.stderr.on("data", (data) => {
	console.error("🔧", data.toString().trim());
});

function send(method: string, params: any = {}) {
	const msg = { jsonrpc: "2.0", id: ++msgId, method, params };
	const line = JSON.stringify(msg) + "\n";
	console.log(`\n📤 Sending: ${method}`);
	server.stdin.write(line);
}

// Run the test sequence
async function run() {
	// 1. Initialize
	send("initialize", {
		protocolVersion: "2024-11-05",
		capabilities: {},
		clientInfo: { name: "test-client", version: "1.0.0" },
	});

	await sleep(500);

	// 2. List tools
	send("tools/list", {});
	await sleep(500);

	// 3. Call find_best_model
	send("tools/call", {
		name: "find_best_model",
		arguments: { use_case: "coding", top_k: 3 },
	});
	await sleep(500);

	// 4. Call estimate_cost
	send("tools/call", {
		name: "estimate_cost",
		arguments: { model: "gpt-4o", input_tokens_per_day: 100000, output_tokens_per_day: 50000 },
	});
	await sleep(500);

	// 5. Call find_cheapest_provider
	send("tools/call", {
		name: "find_cheapest_provider",
		arguments: { model: "claude-sonnet-4" },
	});
	await sleep(1000);

	server.kill();
	process.exit(0);
}

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

run();
