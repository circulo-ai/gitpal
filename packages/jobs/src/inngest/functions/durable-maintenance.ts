import { inngest } from "../client";

export type DurableStateMaintenanceProcessor = () => Promise<unknown>;

export function createDurableStateMaintenanceFunction(
	expireStaleDurableState: DurableStateMaintenanceProcessor,
	refreshDurableCredentials: DurableStateMaintenanceProcessor,
) {
	return inngest.createFunction(
		{
			id: "durable-state-maintenance",
			triggers: [{ cron: "*/5 * * * *" }],
			retries: 3,
			concurrency: 1,
			timeouts: { start: "5m", finish: "5m" },
		},
		async ({ step }) => {
			const expired = await step.run(
				"expire-stale-durable-state",
				expireStaleDurableState,
			);
			const credentials = await step.run(
				"refresh-durable-credentials",
				refreshDurableCredentials,
			);
			return { expired, credentials };
		},
	);
}
