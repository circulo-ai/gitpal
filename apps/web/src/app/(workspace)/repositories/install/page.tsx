import { Skeleton } from "@gitpal/ui/components/skeleton";
import { Suspense } from "react";

import { RepositoryInstallWizardPage } from "@/components/repository-install-wizard-page";

function RepositoryInstallWizardFallback() {
	return (
		<main className="flex flex-1 flex-col gap-5 p-4 md:p-6">
			<div className="flex flex-col gap-2">
				<Skeleton className="h-9 w-80" />
				<Skeleton className="h-4 w-full max-w-3xl" />
			</div>
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
				<div className="space-y-4">
					{Array.from({ length: 3 }).map((_, index) => (
						<Skeleton key={index} className="h-56 w-full" />
					))}
				</div>
				<div className="space-y-4">
					<Skeleton className="h-72 w-full" />
					<Skeleton className="h-80 w-full" />
				</div>
			</div>
		</main>
	);
}

export default function RepositoryInstallWizardRoute() {
	return (
		<Suspense fallback={<RepositoryInstallWizardFallback />}>
			<RepositoryInstallWizardPage />
		</Suspense>
	);
}
