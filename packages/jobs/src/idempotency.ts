import { createHash } from "node:crypto";

export function buildEventId(
	parts: Array<string | number | boolean | null | undefined>,
) {
	return `evt_${createHash("sha256")
		.update(JSON.stringify(parts))
		.digest("hex")}`;
}
