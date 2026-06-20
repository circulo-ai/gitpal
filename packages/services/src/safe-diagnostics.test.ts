import { describe, expect, test } from "bun:test";
import { sanitizeDiagnosticText, sanitizeRunDetails } from "./safe-diagnostics";

describe("safe diagnostics", () => {
	test("redacts common credential formats from messages", () => {
		expect(
			sanitizeDiagnosticText(
				"Bearer abc.def secret sk-example123456 and ?token=private-value",
			),
		).toBe("Bearer [redacted] secret [redacted] and ?token=[redacted]");
	});

	test("removes sensitive keys while retaining useful run metadata", () => {
		expect(
			sanitizeRunDetails({
				model: "example-model",
				prompt: "private prompt",
				nested: { authorization: "Bearer private", findingCount: 4 },
			}),
		).toEqual({ model: "example-model", nested: { findingCount: 4 } });
	});
});
