import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(command, args, label) {
	const result = spawnSync(command, args, {
		cwd: root,
		stdio: "inherit",
		shell: false,
	});

	if (result.error) {
		console.warn(`[reset:dev] ${label} skipped: ${result.error.message}`);
		return false;
	}

	if (result.status !== 0) {
		console.warn(`[reset:dev] ${label} exited with status ${result.status}.`);
		return false;
	}

	return true;
}

function remove(relativePath) {
	rmSync(join(root, relativePath), { force: true, recursive: true });
}

const cleanupTargets = [
	".turbo",
	"apps/server/dist",
	"apps/server/.turbo",
	"apps/web/.next",
	"apps/web/.turbo",
	"apps/fumadocs/.next",
	"apps/fumadocs/.turbo",
	"packages/api/dist",
	"packages/api/.turbo",
	"packages/auth/dist",
	"packages/auth/.turbo",
	"packages/config/dist",
	"packages/config/.turbo",
	"packages/db/dist",
	"packages/db/.turbo",
	"packages/env/dist",
	"packages/env/.turbo",
	"packages/git/dist",
	"packages/git/.turbo",
	"packages/jobs/dist",
	"packages/jobs/.turbo",
	"packages/logger/dist",
	"packages/logger/.turbo",
	"packages/mcp/dist",
	"packages/mcp/.turbo",
	"packages/repositories/dist",
	"packages/repositories/.turbo",
	"packages/redis/dist",
	"packages/redis/.turbo",
	"packages/services/dist",
	"packages/services/.turbo",
	"packages/ui/dist",
	"packages/ui/.turbo",
	"packages/utils/dist",
	"packages/utils/.turbo",
];

console.log("[reset:dev] Stopping the local Compose support stack...");
run(
	"docker",
	["compose", "-f", "docker-compose.dev.yml", "down", "-v", "--remove-orphans"],
	"docker compose down",
);

console.log("[reset:dev] Removing generated build artifacts...");
for (const target of cleanupTargets) {
	remove(target);
}

console.log("[reset:dev] Done.");
