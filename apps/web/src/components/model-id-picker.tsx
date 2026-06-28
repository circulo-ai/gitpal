"use client";

import { Input } from "@gitpal/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@gitpal/ui/components/select";
import { llmProviderCatalog } from "@gitpal/utils";
import * as React from "react";

type ModelPickerOption = {
	value: string;
	label?: string;
};

type ModelPickerGroup = {
	label: string;
	options: ModelPickerOption[];
};

const CUSTOM_MODEL_VALUE = "__custom_model__";

function isCuratedModel(value: string, groups: ModelPickerGroup[]) {
	return groups.some((group) =>
		group.options.some((option) => option.value === value),
	);
}

export function buildCuratedModelGroups(providerIds?: readonly string[]) {
	const providers = providerIds
		? llmProviderCatalog.filter((provider) => providerIds.includes(provider.id))
		: llmProviderCatalog;

	return providers.map((provider) => ({
		label: provider.label,
		options: provider.suggestedModels.map((modelId) => ({
			value: modelId,
		})),
	}));
}

type ModelIdPickerProps = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	groups: ModelPickerGroup[];
	disabled?: boolean;
	placeholder?: string;
	customPlaceholder?: string;
	helperText?: string;
	customLabel?: string;
};

export function ModelIdPicker({
	label,
	value,
	onChange,
	groups,
	disabled,
	placeholder = "Select a model",
	customPlaceholder = "Enter a custom model ID",
	helperText = "Choose a curated model or switch to a custom override.",
	customLabel = "Custom override",
}: ModelIdPickerProps) {
	const [customValue, setCustomValue] = React.useState(value);
	const [isCustomMode, setIsCustomMode] = React.useState(
		!isCuratedModel(value, groups),
	);
	const selectValue =
		isCustomMode || !isCuratedModel(value, groups) ? CUSTOM_MODEL_VALUE : value;
	const selectItems = [
		...groups.flatMap((group) =>
			group.options.map((option) => ({
				label: option.label ?? option.value,
				value: option.value,
			})),
		),
		{ label: "Use a custom model ID", value: CUSTOM_MODEL_VALUE },
	];

	React.useEffect(() => {
		if (!isCustomMode && !isCuratedModel(value, groups)) {
			setIsCustomMode(true);
			setCustomValue(value);
		}
	}, [groups, isCustomMode, value]);

	return (
		<div className="space-y-2">
			<div className="space-y-1">
				<div className="font-medium text-sm">{label}</div>
				<p className="text-muted-foreground text-xs">{helperText}</p>
			</div>
			<Select
				items={selectItems}
				value={selectValue}
				disabled={disabled}
				onValueChange={(nextValue) => {
					if (nextValue === CUSTOM_MODEL_VALUE) {
						setIsCustomMode(true);
						setCustomValue((current) => current || value);
						onChange(customValue.trim() || value);
						return;
					}

					setIsCustomMode(false);
					if (nextValue) {
						onChange(nextValue);
					}
				}}
			>
				<SelectTrigger className="w-full">
					<SelectValue placeholder={placeholder} />
				</SelectTrigger>
				<SelectContent>
					{groups.map((group) => (
						<SelectGroup key={group.label}>
							<SelectLabel>{group.label}</SelectLabel>
							{group.options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label ?? option.value}
								</SelectItem>
							))}
						</SelectGroup>
					))}
					<SelectGroup>
						<SelectLabel>{customLabel}</SelectLabel>
						<SelectItem value={CUSTOM_MODEL_VALUE}>
							Use a custom model ID
						</SelectItem>
					</SelectGroup>
				</SelectContent>
			</Select>
			{selectValue === CUSTOM_MODEL_VALUE ? (
				<div className="space-y-2">
					<div className="font-medium text-sm">{customLabel}</div>
					<Input
						value={customValue}
						disabled={disabled}
						onChange={(event) => {
							const nextValue = event.target.value;
							setCustomValue(nextValue);
							onChange(nextValue);
						}}
						placeholder={customPlaceholder}
					/>
				</div>
			) : null}
		</div>
	);
}
