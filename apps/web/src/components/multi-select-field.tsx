"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import { Checkbox } from "@gitpal/ui/components/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@gitpal/ui/components/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@gitpal/ui/components/popover";
import { cn } from "@gitpal/ui/lib/utils";
import { ChevronDownIcon, XIcon } from "lucide-react";
import * as React from "react";

type MultiSelectOption = {
	value: string;
	label: string;
	keywords?: string[];
};

type MultiSelectFieldProps = {
	value: string[];
	options: MultiSelectOption[];
	onChange: (value: string[]) => void;
	placeholder: string;
	searchPlaceholder?: string;
	emptyText?: string;
	description?: string;
	disabled?: boolean;
	className?: string;
};

function matchesQuery(option: MultiSelectOption, query: string) {
	if (!query) {
		return true;
	}

	const haystack = [option.label, option.value, ...(option.keywords ?? [])]
		.join(" ")
		.toLowerCase();

	return haystack.includes(query);
}

export function MultiSelectField({
	value,
	options,
	onChange,
	placeholder,
	searchPlaceholder = "Search options...",
	emptyText = "No matching options.",
	description,
	disabled,
	className,
}: MultiSelectFieldProps) {
	const [open, setOpen] = React.useState(false);
	const [query, setQuery] = React.useState("");
	const normalizedQuery = query.trim().toLowerCase();
	const selectedOptions = value
		.map((selectedValue) =>
			options.find((option) => option.value === selectedValue),
		)
		.filter((option): option is MultiSelectOption => Boolean(option));
	const hiddenCount = Math.max(0, selectedOptions.length - 2);
	const filteredOptions = options.filter((option) =>
		matchesQuery(option, normalizedQuery),
	);

	function toggleOption(nextValue: string) {
		if (value.includes(nextValue)) {
			onChange(value.filter((currentValue) => currentValue !== nextValue));
			return;
		}

		onChange([...value, nextValue]);
	}

	return (
		<div className={cn("flex flex-col gap-3", className)}>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							type="button"
							variant="outline"
							className="h-auto min-h-11 w-full justify-between rounded-2xl px-3 py-2"
							disabled={disabled}
						/>
					}
				>
					<span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-left">
						{selectedOptions.length > 0 ? (
							<>
								{selectedOptions.slice(0, 2).map((option) => (
									<Badge
										key={option.value}
										variant="secondary"
										className="max-w-full truncate"
									>
										{option.label}
									</Badge>
								))}
								{hiddenCount > 0 ? (
									<Badge variant="outline">+{hiddenCount} more</Badge>
								) : null}
							</>
						) : (
							<span className="text-muted-foreground">{placeholder}</span>
						)}
					</span>
					<ChevronDownIcon data-icon="inline-end" />
				</PopoverTrigger>
				<PopoverContent
					align="start"
					className="w-[min(28rem,calc(100vw-2rem))] gap-0 p-0"
				>
					<Command shouldFilter={false}>
						<CommandInput
							value={query}
							onValueChange={setQuery}
							placeholder={searchPlaceholder}
						/>
						<CommandList>
							<CommandEmpty>{emptyText}</CommandEmpty>
							<CommandGroup>
								{filteredOptions.map((option) => {
									const checked = value.includes(option.value);

									return (
										<CommandItem
											key={option.value}
											value={`${option.label} ${option.value}`}
											onSelect={() => toggleOption(option.value)}
											className="gap-3"
										>
											<Checkbox checked={checked} aria-hidden />
											<div className="min-w-0 flex-1">
												<div className="truncate font-medium">
													{option.label}
												</div>
												{option.label !== option.value ? (
													<div className="truncate text-muted-foreground text-xs">
														{option.value}
													</div>
												) : null}
											</div>
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>

			{selectedOptions.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{selectedOptions.map((option) => (
						<Badge
							key={option.value}
							variant="secondary"
							className="inline-flex max-w-full items-center gap-1 rounded-full px-3 py-1"
						>
							<span className="truncate">{option.label}</span>
							<button
								type="button"
								disabled={disabled}
								onClick={() => toggleOption(option.value)}
								className="inline-flex size-4 items-center justify-center rounded-full transition-colors hover:bg-background/80 disabled:cursor-not-allowed disabled:opacity-50"
								aria-label={`Remove ${option.label}`}
							>
								<XIcon className="size-3" />
							</button>
						</Badge>
					))}
				</div>
			) : null}

			{description ? (
				<p className="text-muted-foreground text-sm">{description}</p>
			) : null}
		</div>
	);
}
