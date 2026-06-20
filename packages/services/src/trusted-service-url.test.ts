import { describe, expect, test } from "bun:test";
import { normalizeTrustedServiceUrl } from "./trusted-service-url";

describe("normalizeTrustedServiceUrl", () => {
	test("allows the provider host and removes fragments", () => {
		expect(
			normalizeTrustedServiceUrl("https://api.linear.app/graphql#token", {
				exactHosts: ["api.linear.app"],
			}),
		).toBe("https://api.linear.app/graphql");
	});

	test("rejects credential forwarding to another public host", () => {
		expect(() =>
			normalizeTrustedServiceUrl("https://attacker.example/mcp", {
				exactHosts: ["mcp.linear.app"],
			}),
		).toThrow("not allowed");
	});

	test("allows trusted Microsoft Bot Framework subdomains", () => {
		expect(
			normalizeTrustedServiceUrl("https://amer.botframework.com/api/messages", {
				hostSuffixes: ["botframework.com"],
			}),
		).toBe("https://amer.botframework.com/api/messages");
	});
});
