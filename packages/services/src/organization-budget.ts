import { randomUUID } from "node:crypto";
import { repositories } from "@gitpal/repositories";
import { sendUserNotification } from "./notifications";

function currentMonthStart(now = new Date()) {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export class OrganizationBudgetExceededError extends Error {
	constructor() {
		super(
			"This workspace reached its monthly AI spend cap. Ask an owner or admin to raise the cap.",
		);
		this.name = "OrganizationBudgetExceededError";
	}
}

export async function getOrganizationBudgetSummary(organizationId: string) {
	const monthStart = currentMonthStart();
	const [budget, spentCents] = await Promise.all([
		repositories.organizationBudget.findByOrganizationId(organizationId),
		repositories.aiGeneration.getSpentCents(
			organizationId,
			"wallet",
			monthStart,
		),
	]);
	const monthlyLimitCents = budget?.monthlyLimitCents ?? null;
	return {
		enabled: budget?.enabled ?? false,
		monthlyLimitCents,
		alertThresholdPercent: budget?.alertThresholdPercent ?? 80,
		spentCents,
		remainingCents:
			monthlyLimitCents === null
				? null
				: Math.max(0, monthlyLimitCents - spentCents),
		periodStartedAt: monthStart.toISOString(),
	};
}

export async function saveOrganizationBudget({
	organizationId,
	enabled,
	monthlyLimitCents,
	alertThresholdPercent,
}: {
	organizationId: string;
	enabled: boolean;
	monthlyLimitCents: number;
	alertThresholdPercent: number;
}) {
	const now = new Date();
	await repositories.organizationBudget.upsertForOrganization({
		id: `org_budget_${randomUUID()}`,
		organizationId,
		enabled,
		monthlyLimitCents,
		alertThresholdPercent,
		createdAt: now,
		updatedAt: now,
	});
	return getOrganizationBudgetSummary(organizationId);
}

export async function assertOrganizationBudgetCanStartUsage(
	organizationId: string | null | undefined,
) {
	if (!organizationId) return;
	const budget = await getOrganizationBudgetSummary(organizationId);
	if (
		budget.enabled &&
		budget.monthlyLimitCents !== null &&
		budget.spentCents >= budget.monthlyLimitCents
	) {
		throw new OrganizationBudgetExceededError();
	}
}

export async function sendOrganizationBudgetAlerts(
	organizationId: string | null | undefined,
) {
	if (!organizationId) return;
	const budget = await getOrganizationBudgetSummary(organizationId);
	const monthlyLimitCents = budget.monthlyLimitCents;
	if (!budget.enabled || !monthlyLimitCents) return;
	const percent = Math.floor((budget.spentCents / monthlyLimitCents) * 100);
	if (percent < budget.alertThresholdPercent) return;
	const members = await repositories.member.listAdminsAndOwners(organizationId);
	const period = currentMonthStart().toISOString().slice(0, 7);
	await Promise.all(
		members.map(({ userId }) =>
			sendUserNotification({
				userId,
				organizationId,
				type: "organization_budget_alert",
				category: "billing",
				severity: budget.spentCents >= monthlyLimitCents ? "error" : "warning",
				title:
					budget.spentCents >= monthlyLimitCents
						? "Workspace spend cap reached"
						: "Workspace budget threshold reached",
				body: `This workspace used ${percent}% of its monthly AI budget.`,
				actionHref: "/account/billing",
				sourceType: "organization-budget",
				sourceId: organizationId,
				dedupeKey: `organization-budget:${organizationId}:${period}:${percent >= 100 ? "cap" : "threshold"}`,
				metadata: budget,
			}),
		),
	);
}
