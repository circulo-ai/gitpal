"use client";

import { Button } from "@gitpal/ui/components/button";
import { cn } from "@gitpal/ui/lib/utils";

type SettingsChangeDockProps = {
	open: boolean;
	title?: string;
	description?: string;
	saveLabel?: string;
	discardLabel?: string;
	disabled?: boolean;
	onSave: () => void;
	onDiscard: () => void;
};

export function SettingsChangeDock({
	open,
	title = "Unsaved changes",
	description = "Review your edits, then save or discard them.",
	saveLabel = "Save changes",
	discardLabel = "Discard",
	disabled,
	onSave,
	onDiscard,
}: SettingsChangeDockProps) {
	return (
		<div
			className={cn(
				"pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 transition-all duration-200",
				open
					? "translate-y-0 opacity-100"
					: "translate-y-4 opacity-0",
			)}
			aria-hidden={!open}
		>
			<div
				className={cn(
					"pointer-events-auto flex w-full max-w-3xl flex-col gap-4 rounded-3xl border border-border/70 bg-background/96 px-4 py-3 shadow-lg shadow-black/10 backdrop-blur sm:flex-row sm:items-center sm:justify-between",
					!open && "pointer-events-none",
				)}
			>
				<div className="min-w-0">
					<div className="font-medium text-sm">{title}</div>
					<p className="text-muted-foreground text-sm">
						{description}
					</p>
				</div>
				<div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
					<Button type="button" variant="outline" onClick={onDiscard}>
						{discardLabel}
					</Button>
					<Button type="button" disabled={disabled} onClick={onSave}>
						{saveLabel}
					</Button>
				</div>
			</div>
		</div>
	);
}
