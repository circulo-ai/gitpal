import { describe, expect, test } from "bun:test";
import { mapWithConcurrency } from "./bounded-concurrency";

describe("mapWithConcurrency", () => {
	test("preserves order while bounding active work", async () => {
		let active = 0;
		let peak = 0;
		const result = await mapWithConcurrency(
			[1, 2, 3, 4, 5],
			2,
			async (item) => {
				active += 1;
				peak = Math.max(peak, active);
				await Bun.sleep(1);
				active -= 1;
				return item * 2;
			},
		);

		expect(result).toEqual([2, 4, 6, 8, 10]);
		expect(peak).toBe(2);
	});

	test("rejects invalid concurrency", () => {
		expect(mapWithConcurrency([1], 0, async (item) => item)).rejects.toThrow(
			"positive integer",
		);
	});
});
