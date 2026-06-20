import { expect, test } from "bun:test";
import { readIntegerConfig, secondsConfig } from "./config";

test("flow-control config safely coerces Compose strings", () => {
	expect(readIntegerConfig("20", "LIMIT")).toBe(20);
	expect(secondsConfig("60", "PERIOD")).toBe("60s");
});

test("flow-control config rejects invalid values before registration", () => {
	expect(() => readIntegerConfig("1.5", "LIMIT")).toThrow();
	expect(() => readIntegerConfig("nope", "LIMIT")).toThrow();
	expect(() => readIntegerConfig("0", "LIMIT")).toThrow();
});
