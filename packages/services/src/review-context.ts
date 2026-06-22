import type {
	GitPullRequestFile,
	GitRepositorySearchResult,
} from "@gitpal/git";

const generatedPathPattern =
	/(^|\/)(dist|build|coverage|vendor|generated)(\/|$)|\.(lock|min\.js)$/i;
const securityPathPattern =
	/(^|\/)(auth|security|permissions?|crypto|webhooks?)(\/|$)/i;
const dependencyPathPattern =
	/(^|\/)(package\.json|bun\.lock|pnpm-lock\.yaml|yarn\.lock|package-lock\.json)$/i;

function tokens(value: string) {
	return new Set(
		value
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((token) => token.length > 2),
	);
}

function overlapScore(left: Set<string>, right: Set<string>) {
	let score = 0;
	for (const token of left) if (right.has(token)) score += 1;
	return score;
}

export type ReviewTemplate =
	| "bug-fix"
	| "refactor"
	| "dependency-update"
	| "security-change"
	| "general";

export function inferReviewTemplate({
	title,
	body,
	files,
}: {
	title: string;
	body: string | null;
	files: GitPullRequestFile[];
}): ReviewTemplate {
	const text = `${title} ${body ?? ""}`.toLowerCase();
	if (
		/\b(security|auth|permission|vulnerab|cve|xss|csrf|ssrf)\b/.test(text) ||
		files.some((file) => securityPathPattern.test(file.path))
	) {
		return "security-change";
	}
	if (
		/\b(dependenc|upgrade|bump|renovate|dependabot)\b/.test(text) ||
		files.some((file) => dependencyPathPattern.test(file.path))
	) {
		return "dependency-update";
	}
	if (/\b(refactor|cleanup|reorganiz|deduplicat)\b/.test(text))
		return "refactor";
	if (/\b(fix|bug|regression|crash|incorrect|broken)\b/.test(text))
		return "bug-fix";
	return "general";
}

export function rankReviewFiles(
	files: GitPullRequestFile[],
	pullRequestText: string,
) {
	const queryTokens = tokens(pullRequestText);
	return files
		.map((file, index) => {
			let score = overlapScore(queryTokens, tokens(file.path)) * 8;
			if (securityPathPattern.test(file.path)) score += 14;
			if (/\.(ts|tsx|js|jsx|go|py|rs|java|kt)$/i.test(file.path)) score += 8;
			if (/\.(test|spec)\.[^.]+$/i.test(file.path)) score += 5;
			if (dependencyPathPattern.test(file.path)) score += 6;
			if (generatedPathPattern.test(file.path)) score -= 30;
			score += Math.min(12, Math.log2(file.additions + file.deletions + 1));
			return { file, index, score };
		})
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.map(({ file }) => file);
}

export function rankRepositoryContext(
	items: GitRepositorySearchResult[],
	pullRequestText: string,
) {
	const queryTokens = tokens(pullRequestText);
	return items
		.map((item, index) => {
			const itemTokens = tokens(`${item.title} ${item.body ?? ""}`);
			const ageDays = Math.max(
				0,
				(Date.now() - Date.parse(item.updatedAt)) / 86_400_000,
			);
			const score =
				overlapScore(queryTokens, itemTokens) * 10 +
				Math.max(0, 8 - Math.log2(ageDays + 1));
			return { item, index, score };
		})
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.map(({ item }) => item);
}

export function reviewTemplateInstructions(template: ReviewTemplate) {
	switch (template) {
		case "bug-fix":
			return "Bug-fix template: verify the root cause, regression boundary, failure-path behavior, and a test that would have failed before the fix.";
		case "refactor":
			return "Refactor template: prove behavioral equivalence, identify changed contracts, check migration/rollback risk, and require focused regression coverage.";
		case "dependency-update":
			return "Dependency-update template: inspect release and lockfile impact, breaking API changes, runtime compatibility, supply-chain risk, and rollback readiness.";
		case "security-change":
			return "Security-change template: trace trust boundaries, authorization, secret handling, abuse cases, secure failure modes, and negative tests.";
		default:
			return "General template: prioritize correctness, security, behavior changes, maintainability, and missing tests.";
	}
}
