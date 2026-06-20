import type { GitPullRequestReview } from "@gitpal/git";

export type HumanReviewSummary = {
	firstHumanReviewAt: Date | null;
	lastHumanReviewAt: Date | null;
	approvedAt: Date | null;
	approvalState: GitPullRequestReview["state"] | null;
};

function toValidDate(value: string | null) {
	if (!value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function isHumanReview(review: GitPullRequestReview) {
	const login = review.author?.login?.toLowerCase() ?? "";
	return review.author?.kind !== "bot" && !login.endsWith("[bot]");
}

function actorKey(review: GitPullRequestReview) {
	return (
		review.author?.id ??
		review.author?.login?.toLowerCase() ??
		`review:${review.id}`
	);
}

function isDecision(review: GitPullRequestReview) {
	return (
		review.state === "approved" ||
		review.state === "changes_requested" ||
		review.state === "dismissed"
	);
}

export function summarizeHumanReviews(
	reviews: readonly GitPullRequestReview[],
): HumanReviewSummary {
	const humanReviews = reviews.filter(
		(review) => review.state !== "pending" && isHumanReview(review),
	);
	const timedReviews = humanReviews
		.map((review) => ({ review, submittedAt: toValidDate(review.submittedAt) }))
		.filter(
			(entry): entry is { review: GitPullRequestReview; submittedAt: Date } =>
				entry.submittedAt !== null,
		)
		.sort(
			(left, right) => left.submittedAt.getTime() - right.submittedAt.getTime(),
		);

	const latestDecisionByActor = new Map<string, GitPullRequestReview>();
	for (const review of humanReviews) {
		if (!isDecision(review)) continue;
		const key = actorKey(review);
		const existing = latestDecisionByActor.get(key);
		const existingAt = toValidDate(existing?.submittedAt ?? null);
		const candidateAt = toValidDate(review.submittedAt);
		if (
			!existing ||
			candidateAt === null ||
			(existingAt !== null && candidateAt >= existingAt)
		) {
			latestDecisionByActor.set(key, review);
		}
	}

	const decisions = [...latestDecisionByActor.values()];
	const activeApprovals = decisions.filter(
		(review) => review.state === "approved",
	);
	const hasChangesRequested = decisions.some(
		(review) => review.state === "changes_requested",
	);
	const latestTimedReview = timedReviews.at(-1)?.review ?? null;
	const approvalState = hasChangesRequested
		? ("changes_requested" as const)
		: activeApprovals.length > 0
			? ("approved" as const)
			: decisions.some((review) => review.state === "dismissed")
				? ("dismissed" as const)
				: (latestTimedReview?.state ?? null);
	const approvalTimes = activeApprovals
		.map((review) => toValidDate(review.submittedAt))
		.filter((date): date is Date => date !== null)
		.sort((left, right) => left.getTime() - right.getTime());

	return {
		firstHumanReviewAt: timedReviews[0]?.submittedAt ?? null,
		lastHumanReviewAt: timedReviews.at(-1)?.submittedAt ?? null,
		approvedAt: approvalTimes[0] ?? null,
		approvalState,
	};
}
