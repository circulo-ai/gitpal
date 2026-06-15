import { Skeleton } from "@gitpal/ui/components/skeleton";
import { Suspense } from "react";

import { RepositoriesPage } from "@/components/repositories-page";

function RepositoriesFallback() {
	return (
		<main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
			<div className="flex flex-col gap-2">
				<Skeleton className="h-9 w-64" />
				<Skeleton className="h-4 w-full max-w-2xl" />
			</div>
			<div className="grid gap-3 md:grid-cols-3">
				{Array.from({ length: 3 }).map((_, index) => (
					<Skeleton key={index} className="h-32" />
				))}
			</div>
			<Skeleton className="h-96 w-full" />
		</main>
	);
}

export default function RepositoriesRoute() {
	return (
		<Suspense fallback={<RepositoriesFallback />}>
			<RepositoriesPage />
		</Suspense>
	);
}
