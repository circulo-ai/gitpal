import { randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as aiSchema from "@gitpal/db/schema/ai";
import * as authSchema from "@gitpal/db/schema/auth";
import * as billingSchema from "@gitpal/db/schema/billing";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
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
	const [[budget], [usage]] = await Promise.all([
		db
			.select()
			.from(billingSchema.organizationBudget)
			.where(
				eq(billingSchema.organizationBudget.organizationId, organizationId),
			)
			.limit(1),
		db
			.select({
				spentCents: sql<number>`coalesce(sum(${aiSchema.aiGeneration.actualCostCents}), 0)::int`,
			})
			.from(aiSchema.aiGeneration)
			.where(
				and(
					eq(aiSchema.aiGeneration.organizationId, organizationId),
					eq(aiSchema.aiGeneration.billingMode, "wallet"),
					gte(aiSchema.aiGeneration.createdAt, monthStart),
				),
			),
	]);
	const spentCents = usage?.spentCents ?? 0;
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
	await db
		.insert(billingSchema.organizationBudget)
		.values({
			id: `org_budget_${randomUUID()}`,
			organizationId,
			enabled,
			monthlyLimitCents,
			alertThresholdPercent,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: billingSchema.organizationBudget.organizationId,
			set: {
				enabled,
				monthlyLimitCents,
				alertThresholdPercent,
				updatedAt: now,
			},
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
	const members = await db
		.select({ userId: authSchema.member.userId })
		.from(authSchema.member)
		.where(
			and(
				eq(authSchema.member.organizationId, organizationId),
				inArray(authSchema.member.role, ["owner", "admin"]),
			),
		);
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
