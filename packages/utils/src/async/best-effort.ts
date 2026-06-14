export function runBestEffort(task: Promise<unknown>): void {
	void task.catch(() => {
		// best-effort background trigger
	});
}
