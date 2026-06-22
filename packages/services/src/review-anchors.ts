import type { GitPullRequestFile } from "@gitpal/git";

export type ReviewAnchor = {
	line: number | null;
	status: "exact" | "adjusted" | "unavailable";
	originalLine: number | null;
};

export function resolveDiffAnchor(
	files: GitPullRequestFile[],
	filePath: string | null,
	requestedLine: number | null,
): ReviewAnchor {
	if (!filePath || !requestedLine) {
		return { line: null, status: "unavailable", originalLine: requestedLine };
	}
	const patch = files.find((file) => file.path === filePath)?.patch;
	if (!patch) {
		return { line: null, status: "unavailable", originalLine: requestedLine };
	}
	const anchorable: number[] = [];
	const changed = new Set<number>();
	let newLine = 0;
	for (const line of patch.split("\n")) {
		const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
		if (hunk) {
			newLine = Number(hunk[1]);
			continue;
		}
		if (line.startsWith("-") || line.startsWith("\\")) continue;
		if (newLine <= 0) continue;
		anchorable.push(newLine);
		if (line.startsWith("+")) changed.add(newLine);
		newLine += 1;
	}
	if (anchorable.includes(requestedLine)) {
		return {
			line: requestedLine,
			status: "exact",
			originalLine: requestedLine,
		};
	}
	const candidates = changed.size > 0 ? [...changed] : anchorable;
	const nearest = candidates.sort(
		(left, right) =>
			Math.abs(left - requestedLine) - Math.abs(right - requestedLine),
	)[0];
	return {
		line: nearest ?? null,
		status: nearest ? "adjusted" : "unavailable",
		originalLine: requestedLine,
	};
}
