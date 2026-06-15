"use client";

import * as React from "react";
import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import { Input } from "@gitpal/ui/components/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@gitpal/ui/components/select";
import { Separator } from "@gitpal/ui/components/separator";
import { Switch } from "@gitpal/ui/components/switch";
import { Textarea } from "@gitpal/ui/components/textarea";
import { cn } from "@gitpal/ui/lib/utils";
import {
	PlusIcon,
	Trash2Icon,
} from "lucide-react";

import type {
	WorkspaceLabelInstruction,
	WorkspacePathInstruction,
	WorkspaceSettings,
} from "@gitpal/utils";

type WorkspaceSettingsFormProps = {
	value: WorkspaceSettings;
	onChange: (settings: WorkspaceSettings) => void;
	disabled?: boolean;
	className?: string;
};

type SectionToggleRowProps = {
	title: string;
	description: string;
	checked: boolean;
	disabled?: boolean;
	onCheckedChange: (checked: boolean) => void;
};

type StringListEditorProps = {
	title: string;
	description: string;
	placeholder: string;
	values: string[];
	disabled?: boolean;
	onChange: (values: string[]) => void;
};

type InstructionListEditorProps<T extends WorkspacePathInstruction | WorkspaceLabelInstruction> =
	{
		title: string;
		description: string;
		items: T[];
		placeholderLabel: string;
		keyField: keyof T;
		keyPlaceholder: string;
		disabled?: boolean;
		onChange: (items: T[]) => void;
	};

function cloneSettings(value: WorkspaceSettings) {
	return structuredClone(value);
}

function updateSettings(
	value: WorkspaceSettings,
	onChange: (settings: WorkspaceSettings) => void,
	updater: (draft: WorkspaceSettings) => void,
) {
	const draft = cloneSettings(value);
	updater(draft);
	onChange(draft);
}

function SectionToggleRow({
	title,
	description,
	checked,
	disabled,
	onCheckedChange,
}: SectionToggleRowProps) {
	return (
		<div className="flex items-start justify-between gap-6 rounded-2xl border border-border/60 bg-card/60 px-4 py-3">
			<div className="space-y-1">
				<div className="font-medium text-sm">{title}</div>
				<p className="max-w-2xl text-muted-foreground text-sm">{description}</p>
			</div>
			<Switch
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	);
}

function PillList({
	values,
	disabled,
	onRemove,
}: {
	values: string[];
	disabled?: boolean;
	onRemove: (value: string) => void;
}) {
	return (
		<div className="flex flex-wrap gap-2">
			{values.map((value) => (
				<Badge
					key={value}
					variant="secondary"
					className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs"
				>
					<span className="max-w-48 truncate">{value}</span>
					<button
						type="button"
						disabled={disabled}
						onClick={() => onRemove(value)}
						className={cn(
							"inline-flex size-4 items-center justify-center rounded-full transition-colors hover:bg-background/80",
							disabled && "cursor-not-allowed opacity-50",
						)}
						aria-label={`Remove ${value}`}
					>
						<Trash2Icon className="size-3" />
					</button>
				</Badge>
			))}
		</div>
	);
}

function StringListEditor({
	title,
	description,
	placeholder,
	values,
	disabled,
	onChange,
}: StringListEditorProps) {
	const [draft, setDraft] = React.useState("");

	function addValue() {
		const nextValue = draft.trim();
		if (!nextValue) {
			return;
		}

		if (values.includes(nextValue)) {
			setDraft("");
			return;
		}

		onChange([...values, nextValue]);
		setDraft("");
	}

	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<div className="font-medium text-sm">{title}</div>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			<PillList
				values={values}
				disabled={disabled}
				onRemove={(value) => {
					onChange(values.filter((entry) => entry !== value));
				}}
			/>
			<div className="flex flex-col gap-2 sm:flex-row">
				<Input
					value={draft}
					disabled={disabled}
					onChange={(event) => setDraft(event.target.value)}
					placeholder={placeholder}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							addValue();
						}
					}}
				/>
				<Button
					type="button"
					variant="outline"
					disabled={disabled}
					onClick={addValue}
				>
					<PlusIcon />
					Add
				</Button>
			</div>
		</div>
	);
}

function InstructionListEditor<
	T extends WorkspacePathInstruction | WorkspaceLabelInstruction,
>({
	title,
	description,
	items,
	placeholderLabel,
	keyField,
	keyPlaceholder,
	disabled,
	onChange,
}: InstructionListEditorProps<T>) {
	return (
		<div className="space-y-3">
			<div className="space-y-1">
				<div className="font-medium text-sm">{title}</div>
				<p className="text-muted-foreground text-sm">{description}</p>
			</div>
			<div className="space-y-3">
				{items.length === 0 ? (
					<div className="rounded-2xl border border-dashed border-border/60 px-4 py-6 text-center text-muted-foreground text-sm">
						No items yet.
					</div>
				) : null}
				{items.map((item, index) => {
					const keyValue = String(item[keyField] ?? "");

					return (
						<div
							key={`${keyValue}-${index}`}
							className="grid gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3 xl:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]"
						>
							<Input
								value={keyValue}
								disabled={disabled}
								onChange={(event) => {
									const nextValue = event.target.value;
									onChange(
										items.map((entry, entryIndex) =>
											entryIndex === index
												? {
														...entry,
														[keyField]: nextValue,
													}
												: entry,
										) as T[],
									);
								}}
								placeholder={keyPlaceholder}
							/>
							<Textarea
								value={item.instructions}
								disabled={disabled}
								onChange={(event) => {
									onChange(
										items.map((entry, entryIndex) =>
											entryIndex === index
												? {
														...entry,
														instructions: event.target.value,
													}
												: entry,
										) as T[],
									);
								}}
								placeholder={placeholderLabel}
								className="min-h-20"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								disabled={disabled}
								onClick={() => {
									onChange(items.filter((_, entryIndex) => entryIndex !== index) as T[]);
								}}
								className="self-start"
								aria-label="Remove item"
							>
								<Trash2Icon />
							</Button>
						</div>
					);
				})}
			</div>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={disabled}
				onClick={() => {
					const nextItem =
						keyField === "path"
							? ({
									path: "",
									instructions: "",
								} as T)
							: ({
									label: "",
									instructions: "",
								} as T);

					onChange([...items, nextItem]);
				}}
			>
				<PlusIcon />
				Add item
			</Button>
		</div>
	);
}

export function WorkspaceSettingsForm({
	value,
	onChange,
	disabled,
	className,
}: WorkspaceSettingsFormProps) {
	const language = value.general.language;

	return (
		<div className={cn("space-y-4", className)}>
			<Card>
				<CardHeader>
					<CardTitle>General</CardTitle>
					<CardDescription>
						Base language and inheritance behavior for generated review content.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid gap-4 md:grid-cols-2">
						<div className="space-y-2">
							<div className="font-medium text-sm">Language</div>
							<p className="text-muted-foreground text-sm">
								Set the primary review locale. Use a valid BCP 47 language tag.
							</p>
							<Input
								value={language}
								disabled={disabled}
								onChange={(event) => {
									updateSettings(value, onChange, (draft) => {
										draft.general.language = event.target.value;
									});
								}}
								placeholder="en-US"
							/>
						</div>
						<div className="space-y-2">
							<div className="font-medium text-sm">Review profile</div>
							<p className="text-muted-foreground text-sm">
								Choose how direct the review should be.
							</p>
							<Select
								value={value.reviews.behavior.profile}
								disabled={disabled}
								onValueChange={(profile) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.profile = profile as
											| "chill"
											| "assertive";
									});
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select profile" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="chill">Chill</SelectItem>
									<SelectItem value="assertive">Assertive</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<SectionToggleRow
						title="Early access"
						description="Enable early access review features when they are available."
						checked={value.general.earlyAccess}
						disabled={disabled}
						onCheckedChange={(checked) => {
							updateSettings(value, onChange, (draft) => {
								draft.general.earlyAccess = checked;
							});
						}}
					/>
					<SectionToggleRow
						title="Inheritance"
						description="Use parent settings for values not overridden here."
						checked={value.general.inheritance}
						disabled={disabled}
						onCheckedChange={(checked) => {
							updateSettings(value, onChange, (draft) => {
								draft.general.inheritance = checked;
							});
						}}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Reviews</CardTitle>
					<CardDescription>
						High-level summaries, walkthrough details, and behavior instructions.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="space-y-3">
						<div className="flex items-center justify-between gap-3">
							<div>
								<div className="font-medium text-sm">Summary</div>
								<p className="text-muted-foreground text-sm">
									High-level summary of the pull request changes.
								</p>
							</div>
							<Switch
								checked={value.reviews.summary.highLevelSummary}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.summary.highLevelSummary = checked;
									});
								}}
							/>
						</div>
						<Textarea
							value={value.reviews.summary.highLevelSummaryInstructions}
							disabled={disabled}
							onChange={(event) => {
								updateSettings(value, onChange, (draft) => {
									draft.reviews.summary.highLevelSummaryInstructions =
										event.target.value;
								});
							}}
							placeholder="Describe how to generate the summary."
						/>
						<SectionToggleRow
							title="Include summary in walkthrough"
							description="Embed the high-level summary inside the walkthrough comment."
							checked={value.reviews.summary.highLevelSummaryInWalkthrough}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.reviews.summary.highLevelSummaryInWalkthrough = checked;
								});
							}}
						/>
					</div>

					<Separator />

					<div className="space-y-3">
						<div className="font-medium text-sm">Walkthrough</div>
						<div className="space-y-3">
							<SectionToggleRow
								title="Collapse walkthrough"
								description="Wrap the walkthrough in a collapsible Markdown section."
								checked={value.reviews.walkthrough.collapseWalkthrough}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.walkthrough.collapseWalkthrough = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Changed files summary"
								description="Include a summary of changed files in the walkthrough."
								checked={value.reviews.walkthrough.changedFilesSummary}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.walkthrough.changedFilesSummary = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Sequence diagrams"
								description="Show sequence diagrams when they help explain the change."
								checked={value.reviews.walkthrough.sequenceDiagrams}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.walkthrough.sequenceDiagrams = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Estimate code review effort"
								description="Estimate how much time a human review is likely to take."
								checked={value.reviews.walkthrough.estimateCodeReviewEffort}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.walkthrough.estimateCodeReviewEffort = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Related issues"
								description="Include potentially related issues in the walkthrough."
								checked={value.reviews.walkthrough.relatedIssues}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.walkthrough.relatedIssues = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Related PRs"
								description="Include potentially related pull requests in the walkthrough."
								checked={value.reviews.walkthrough.relatedPRs}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.walkthrough.relatedPRs = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Suggested labels"
								description="Recommend labels based on the change context."
								checked={value.reviews.walkthrough.suggestedLabels}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.walkthrough.suggestedLabels = checked;
									});
								}}
							/>
						</div>
					</div>

					<Separator />

					<div className="space-y-4">
						<div className="font-medium text-sm">Behavior</div>
						<div className="space-y-4">
							<div className="space-y-2">
								<div className="font-medium text-sm">Path instructions</div>
								<InstructionListEditor
									title=""
									description="Add path-specific guidance for code review."
									items={value.reviews.behavior.pathInstructions}
									placeholderLabel="Explain how this path should be reviewed."
									keyField="path"
									keyPlaceholder="src/**"
									disabled={disabled}
									onChange={(items) => {
										updateSettings(value, onChange, (draft) => {
											draft.reviews.behavior.pathInstructions = items as WorkspacePathInstruction[];
										});
									}}
								/>
							</div>
							<StringListEditor
								title="Path filters"
								description="Include or exclude glob patterns during review."
								placeholder="dist/**"
								values={value.reviews.behavior.pathFilters}
								disabled={disabled}
								onChange={(values) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.pathFilters = values;
									});
								}}
							/>
							<div className="space-y-2">
								<div className="font-medium text-sm">Labeling instructions</div>
								<InstructionListEditor
									title=""
									description="Define allowed labels and when to suggest them."
									items={value.reviews.behavior.labelingInstructions}
									placeholderLabel="Explain when this label should be suggested."
									keyField="label"
									keyPlaceholder="bug"
									disabled={disabled}
									onChange={(items) => {
										updateSettings(value, onChange, (draft) => {
											draft.reviews.behavior.labelingInstructions = items as WorkspaceLabelInstruction[];
										});
									}}
								/>
							</div>
							<SectionToggleRow
								title="Request changes workflow"
								description="Automatically approve once comments are resolved and no checks fail."
								checked={value.reviews.behavior.requestChangesWorkflow}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.requestChangesWorkflow = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Auto assign reviewers"
								description="Assign suggested reviewers to the pull request automatically."
								checked={value.reviews.behavior.autoAssignReviewers}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.autoAssignReviewers = checked;
									});
								}}
							/>
							<StringListEditor
								title="Auto review branches"
								description="Base branches that should trigger automatic review."
								placeholder="main"
								values={value.reviews.behavior.autoReview.baseBranches}
								disabled={disabled}
								onChange={(values) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.autoReview.baseBranches = values;
									});
								}}
							/>
							<StringListEditor
								title="Auto review labels"
								description="Only auto-review pull requests matching these labels."
								placeholder="feature"
								values={value.reviews.behavior.autoReview.labels}
								disabled={disabled}
								onChange={(values) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.autoReview.labels = values;
									});
								}}
							/>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Finishing touches</CardTitle>
					<CardDescription>
						Docstrings and test generation options.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="space-y-3">
						<SectionToggleRow
							title="Docstrings"
							description="Generate or improve docstrings when requested."
							checked={value.finishingTouches.docstrings.enabled}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.finishingTouches.docstrings.enabled = checked;
								});
							}}
						/>
						<InstructionListEditor
							title=""
							description="Add path-specific guidelines for docstring generation."
							items={value.finishingTouches.docstrings.pathInstructions}
							placeholderLabel="Write the docstring guidance."
							keyField="path"
							keyPlaceholder="src/**"
							disabled={disabled}
							onChange={(items) => {
								updateSettings(value, onChange, (draft) => {
									draft.finishingTouches.docstrings.pathInstructions = items as WorkspacePathInstruction[];
								});
							}}
						/>
					</div>
					<Separator />
					<div className="space-y-3">
						<SectionToggleRow
							title="Unit tests"
							description="Generate unit tests when the feature is enabled."
							checked={value.finishingTouches.unitTests.enabled}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.finishingTouches.unitTests.enabled = checked;
								});
							}}
						/>
						<Textarea
							value={value.finishingTouches.unitTests.instructions}
							disabled={disabled}
							onChange={(event) => {
								updateSettings(value, onChange, (draft) => {
									draft.finishingTouches.unitTests.instructions =
										event.target.value;
								});
							}}
							placeholder="Add guidance for generated tests."
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Pre-merge checks</CardTitle>
					<CardDescription>
						Validation checks that run before changes are merged.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<SectionToggleRow
						title="Description check"
						description="Ensure the pull request description is present and useful."
						checked={value.preMergeChecks.descriptionCheck}
						disabled={disabled}
						onCheckedChange={(checked) => {
							updateSettings(value, onChange, (draft) => {
								draft.preMergeChecks.descriptionCheck = checked;
							});
						}}
					/>
					<SectionToggleRow
						title="Docstring coverage"
						description="Require the generated docstrings coverage check to pass."
						checked={value.preMergeChecks.docstringCoverage}
						disabled={disabled}
						onCheckedChange={(checked) => {
							updateSettings(value, onChange, (draft) => {
								draft.preMergeChecks.docstringCoverage = checked;
							});
						}}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Statuses</CardTitle>
					<CardDescription>
						Behavior for labels and title generation.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<SectionToggleRow
						title="Auto apply labels"
						description="Automatically apply suggested labels to the pull request."
						checked={value.statuses.autoApplyLabels}
						disabled={disabled}
						onCheckedChange={(checked) => {
							updateSettings(value, onChange, (draft) => {
								draft.statuses.autoApplyLabels = checked;
							});
						}}
					/>
					<div className="space-y-2">
						<div className="font-medium text-sm">Auto title instructions</div>
						<Textarea
							value={value.statuses.autoTitleInstructions}
							disabled={disabled}
							onChange={(event) => {
								updateSettings(value, onChange, (draft) => {
									draft.statuses.autoTitleInstructions = event.target.value;
								});
							}}
							placeholder="Write how titles should be generated."
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Fun</CardTitle>
					<CardDescription>
						Optional tone and playful output for reviews and chat.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="space-y-2">
						<div className="font-medium text-sm">Tone instructions</div>
						<Textarea
							value={value.fun.toneInstructions}
							disabled={disabled}
							onChange={(event) => {
								updateSettings(value, onChange, (draft) => {
									draft.fun.toneInstructions = event.target.value;
								});
							}}
							placeholder="Keep the tone sharp but kind."
						/>
					</div>
					<div className="grid gap-3 md:grid-cols-3">
						<SectionToggleRow
							title="Poem"
							description="Generate a poem in the walkthrough comment."
							checked={value.fun.poem}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.fun.poem = checked;
								});
							}}
						/>
						<SectionToggleRow
							title="Fortune"
							description="Post a fortune message while the review runs."
							checked={value.fun.inProgressFortune}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.fun.inProgressFortune = checked;
								});
							}}
						/>
						<SectionToggleRow
							title="Art"
							description="Generate art in chat responses."
							checked={value.fun.art}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.fun.art = checked;
								});
							}}
						/>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
