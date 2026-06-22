"use client";

import { Button } from "@gitpal/ui/components/button";
import { RefreshCcwIcon } from "lucide-react";

type ProviderSyncTarget = {
	providerName: string;
};

export function ProviderSyncButton({
	target,
	isPending,
	onClick,
	className,
}: {
	target: ProviderSyncTarget | null;
	isPending: boolean;
	onClick: () => void;
	className?: string;
}) {
	if (!target) {
		return null;
	}

	const label = target.providerName.trim()
		? `Sync ${target.providerName}`
		: "Sync provider";

	return (
		<Button
			type="button"
			variant="outline"
			size="icon"
			tooltip={isPending ? "Syncing…" : label}
			aria-label={label}
			disabled={isPending}
			onClick={onClick}
			className={className}
		>
			<RefreshCcwIcon />
		</Button>
	);
}
