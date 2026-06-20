import { createHash } from "node:crypto";

export type StableIdPart = string | number | boolean | null | undefined;

export function stableId(parts: readonly StableIdPart[]) {
	return createHash("sha256")
		.update(parts.map((part) => String(part ?? "")).join(":"))
		.digest("hex");
}
