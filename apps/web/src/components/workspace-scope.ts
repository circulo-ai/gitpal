export type WorkspaceScope = "personal" | "organization" | "group";

export function formatWorkspaceScope(scope: WorkspaceScope) {
	if (scope === "personal") {
		return "Personal";
	}

	if (scope === "group") {
		return "Group";
	}

	return "Organization";
}
