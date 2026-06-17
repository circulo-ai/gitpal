"use client";

import * as React from "react";
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
import { PlusIcon, Trash2Icon } from "lucide-react";

import type {
	WorkspaceLabelInstruction,
	WorkspaceManagedTool,
	WorkspacePathInstruction,
	WorkspaceSettings,
} from "@gitpal/utils";
import { WorkspaceReviewPreviewDialog } from "./workspace-review-preview-dialog";

type WorkspaceSettingsFormProps = {
	value: WorkspaceSettings;
	onChange: (settings: WorkspaceSettings) => void;
	disabled?: boolean;
	className?: string;
	previewSettings?: WorkspaceSettings;
	previewRepositoryFullName?: string;
	previewRepositoryDescription?: string | null;
	previewWorkspaceName?: string;
	toolSettingsLocked?: boolean;
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

type InstructionListEditorProps<
	T extends WorkspacePathInstruction | WorkspaceLabelInstruction,
> = {
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

function updateNumber(
	currentValue: number,
	nextValue: string,
	limits: {
		min: number;
		max: number;
	},
) {
	return Math.min(
		limits.max,
		Math.max(limits.min, Number(nextValue) || currentValue),
	);
}

function SectionToggleRow({
	title,
	description,
	checked,
	disabled,
	onCheckedChange,
}: SectionToggleRowProps) {
	return (
		<div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
			<div className="space-y-1">
				<div className="font-medium text-sm">{title}</div>
				<p className="max-w-2xl text-muted-foreground text-sm">{description}</p>
			</div>
			<Switch
				checked={checked}
				disabled={disabled}
				onCheckedChange={onCheckedChange}
				className="self-end sm:self-auto"
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
				<div
					key={value}
					className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs"
				>
					<span className="max-w-56 truncate">{value}</span>
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
				</div>
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
				onRemove={(item) => onChange(values.filter((value) => value !== item))}
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
							className="grid gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3 lg:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto]"
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
									onChange(
										items.filter((_, entryIndex) => entryIndex !== index) as T[],
									);
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

function isMcpToolType(type: WorkspaceManagedTool["type"]) {
	return type === "github-mcp" || type === "gitlab-mcp";
}

const LANGUAGE_OPTIONS = [
	{ value: "en-US", label: "English (United States)" },
	{ value: "en-GB", label: "English (United Kingdom)" },
	{ value: "es-ES", label: "Spanish (Spain)" },
	{ value: "fr-FR", label: "French" },
	{ value: "de-DE", label: "German" },
	{ value: "it-IT", label: "Italian" },
	{ value: "pt-BR", label: "Portuguese (Brazil)" },
	{ value: "pt-PT", label: "Portuguese (Portugal)" },
	{ value: "tr-TR", label: "Turkish" },
	{ value: "ar", label: "Arabic" },
	{ value: "fa-IR", label: "Persian" },
	{ value: "ru-RU", label: "Russian" },
	{ value: "ja-JP", label: "Japanese" },
	{ value: "ko-KR", label: "Korean" },
	{ value: "zh-CN", label: "Chinese (Simplified)" },
	{ value: "zh-TW", label: "Chinese (Traditional)" },
] as const;

const CUSTOM_LANGUAGE_VALUE = "__custom__";

function isPresetLanguage(value: string) {
	return LANGUAGE_OPTIONS.some((language) => language.value === value);
}

function ToolSettingsEditor({
	tools,
	disabled,
	onChange,
}: {
	tools: WorkspaceManagedTool[];
	disabled?: boolean;
	onChange: (tools: WorkspaceManagedTool[]) => void;
}) {
	return (
		<div className="space-y-3">
			<div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-muted-foreground text-sm">
				Built-in tools run locally through GitPal&apos;s provider adapters.
				Dedicated MCP tools are bound automatically so the execution path stays
				clear without asking users to manage a separate server-name field.
			</div>
			{tools.map((toolSetting, index) => (
				<div
					key={toolSetting.id}
					className="rounded-2xl border border-border/60 bg-muted/20 p-4"
				>
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
							<div className="space-y-1">
								<div className="font-medium text-sm">{toolSetting.label}</div>
								<p className="text-muted-foreground text-sm">
									{toolSetting.description}
								</p>
							</div>
							<div className="rounded-full border px-2 py-0.5 text-xs">
								{toolSetting.type}
							</div>
						</div>
						<div className="grid gap-4 md:grid-cols-3">
							<SectionToggleRow
								title="Enabled"
								description="Allow this tool during review runs."
								checked={toolSetting.enabled}
								disabled={disabled}
								onCheckedChange={(checked) => {
									onChange(
										tools.map((tool, toolIndex) =>
											toolIndex === index
												? {
														...tool,
														enabled: checked,
													}
												: tool,
										),
									);
								}}
							/>
							<div className="space-y-2">
								<div className="font-medium text-sm">Execution</div>
								{isMcpToolType(toolSetting.type) ? (
									<Select
										value={toolSetting.mode}
										disabled={disabled}
										onValueChange={(mode) => {
											onChange(
												tools.map((tool, toolIndex) =>
													toolIndex === index
														? {
																...tool,
																mode: mode as "builtin" | "mcp",
															}
														: tool,
												),
											);
										}}
									>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select execution" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="builtin">Built-in</SelectItem>
											<SelectItem value="mcp">MCP</SelectItem>
										</SelectContent>
									</Select>
								) : (
									<div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2 text-sm text-muted-foreground">
										Built-in execution
									</div>
								)}
							</div>
							<div className="space-y-2">
								<div className="font-medium text-sm">Max results</div>
								<Input
									type="number"
									min="1"
									max="50"
									value={String(toolSetting.maxResults)}
									disabled={disabled}
									onChange={(event) => {
										onChange(
											tools.map((tool, toolIndex) =>
												toolIndex === index
													? {
															...tool,
															maxResults: updateNumber(
																tool.maxResults,
																event.target.value,
																{
																	min: 1,
																	max: 50,
																},
															),
														}
													: tool,
											),
										);
									}}
								/>
							</div>
						</div>
						{isMcpToolType(toolSetting.type) && toolSetting.mode === "mcp" ? (
							<div className="space-y-2">
								<div className="font-medium text-sm">MCP server binding</div>
								<div className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2 text-sm">
									{toolSetting.mcpServerName ??
										(toolSetting.type === "github-mcp" ? "github" : "gitlab")}
								</div>
								<p className="text-muted-foreground text-xs">
									GitPal binds GitHub and GitLab MCP tools automatically so the
									server name stays consistent across the UI and runtime.
								</p>
							</div>
						) : null}
					</div>
				</div>
			))}
		</div>
	);
}

export function WorkspaceSettingsForm({
	value,
	onChange,
	disabled,
	className,
	previewSettings,
	previewRepositoryFullName,
	previewRepositoryDescription,
	previewWorkspaceName,
	toolSettingsLocked,
}: WorkspaceSettingsFormProps) {
	const previewSource = previewSettings ?? value;
	const [languageMode, setLanguageMode] = React.useState(() =>
		isPresetLanguage(value.general.language)
			? value.general.language
			: CUSTOM_LANGUAGE_VALUE,
	);
	const [customLanguage, setCustomLanguage] = React.useState(
		() => value.general.language,
	);
	const lastCustomLanguageRef = React.useRef(value.general.language);
	const previousLanguageRef = React.useRef(value.general.language);

	React.useEffect(() => {
		if (previousLanguageRef.current === value.general.language) {
			return;
		}

		previousLanguageRef.current = value.general.language;

		if (isPresetLanguage(value.general.language)) {
			setLanguageMode(value.general.language);
			return;
		}

		setLanguageMode(CUSTOM_LANGUAGE_VALUE);
		setCustomLanguage(value.general.language);
		lastCustomLanguageRef.current = value.general.language;
	}, [value.general.language]);

	return (
		<div className={cn("space-y-4", className)}>
			<div className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-card/60 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-1">
					<div className="font-medium text-sm">Live preview</div>
					<p className="max-w-2xl text-muted-foreground text-sm">
						Open a CodeRabbit-style preview that updates from the current
						settings before you save them.
					</p>
				</div>
				<WorkspaceReviewPreviewDialog
					settings={previewSource}
					repositoryFullName={previewRepositoryFullName}
					repositoryDescription={previewRepositoryDescription}
					workspaceName={previewWorkspaceName}
				/>
			</div>

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
								Choose a common locale or switch to custom for any BCP 47 tag.
							</p>
							<Select
								value={languageMode}
								disabled={disabled}
								onValueChange={(nextValue) => {
									if (nextValue === CUSTOM_LANGUAGE_VALUE) {
										setLanguageMode(CUSTOM_LANGUAGE_VALUE);
										setCustomLanguage(lastCustomLanguageRef.current);
										return;
									}

									lastCustomLanguageRef.current = customLanguage;
									setLanguageMode(nextValue);
									updateSettings(value, onChange, (draft) => {
										draft.general.language = nextValue;
									});
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select a language" />
								</SelectTrigger>
								<SelectContent>
									{LANGUAGE_OPTIONS.map((language) => (
										<SelectItem key={language.value} value={language.value}>
											{language.label}
										</SelectItem>
									))}
									<SelectItem value={CUSTOM_LANGUAGE_VALUE}>
										Custom language tag
									</SelectItem>
								</SelectContent>
							</Select>
							{languageMode === CUSTOM_LANGUAGE_VALUE ? (
								<div className="space-y-2">
									<Input
										value={customLanguage}
										disabled={disabled}
										onChange={(event) => {
											const nextValue = event.target.value;
											setCustomLanguage(nextValue);
											lastCustomLanguageRef.current = nextValue;
											updateSettings(value, onChange, (draft) => {
												draft.general.language = nextValue;
											});
										}}
										placeholder="e.g. en-US, fa-IR, or any BCP 47 tag"
									/>
									<p className="text-muted-foreground text-xs">
										Use this only if your locale is not in the preset list.
									</p>
								</div>
							) : null}
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
						High-level summaries, walkthrough details, automation, and repository context.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="space-y-3">
						<div className="font-medium text-sm">Summary</div>
						<SectionToggleRow
							title="High-level summary"
							description="Generate a concise summary of the pull request changes."
							checked={value.reviews.summary.highLevelSummary}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.reviews.summary.highLevelSummary = checked;
								});
							}}
						/>
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
						<div className="grid gap-3 md:grid-cols-2">
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
								title="Estimate review effort"
								description="Estimate how much human review time the change is likely to take."
								checked={value.reviews.walkthrough.estimateCodeReviewEffort}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.walkthrough.estimateCodeReviewEffort =
											checked;
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
						</div>
						<SectionToggleRow
							title="Suggested labels"
							description="Recommend pull request labels based on the change context."
							checked={value.reviews.walkthrough.suggestedLabels}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.reviews.walkthrough.suggestedLabels = checked;
								});
							}}
						/>
						<div className="space-y-2">
							<div className="font-medium text-sm">Walkthrough model ID</div>
							<Input
								value={value.reviews.walkthrough.modelId}
								disabled={disabled}
								onChange={(event) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.walkthrough.modelId = event.target.value;
									});
								}}
								placeholder="anthropic/claude-sonnet-4-5"
							/>
						</div>
					</div>

					<Separator />

					<div className="space-y-4">
						<div className="font-medium text-sm">Behavior</div>
						<InstructionListEditor
							title="Path instructions"
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
						<StringListEditor
							title="Path filters"
							description="Exclude or constrain paths during review."
							placeholder="dist/**"
							values={value.reviews.behavior.pathFilters}
							disabled={disabled}
							onChange={(values) => {
								updateSettings(value, onChange, (draft) => {
									draft.reviews.behavior.pathFilters = values;
								});
							}}
						/>
						<InstructionListEditor
							title="Labeling instructions"
							description="Define allowed labels and when the reviewer should suggest them."
							items={value.reviews.behavior.labelingInstructions}
							placeholderLabel="Explain when this label should be suggested."
							keyField="label"
							keyPlaceholder="bug"
							disabled={disabled}
							onChange={(items) => {
								updateSettings(value, onChange, (draft) => {
									draft.reviews.behavior.labelingInstructions =
										items as WorkspaceLabelInstruction[];
								});
							}}
						/>
						<div className="grid gap-3 md:grid-cols-2">
							<SectionToggleRow
								title="Request changes workflow"
								description="Treat blocking issues as change requests during the review flow."
								checked={value.reviews.behavior.requestChangesWorkflow}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.requestChangesWorkflow = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Auto-assign reviewers"
								description="Assign suggested reviewers automatically when the provider supports it."
								checked={value.reviews.behavior.autoAssignReviewers}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.autoAssignReviewers = checked;
									});
								}}
							/>
						</div>
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
						<StringListEditor
							title="Auto review skip labels"
							description="Skip automatic review when any of these labels are present."
							placeholder="skip-gitpal"
							values={value.reviews.behavior.autoReview.skipLabels}
							disabled={disabled}
							onChange={(values) => {
								updateSettings(value, onChange, (draft) => {
									draft.reviews.behavior.autoReview.skipLabels = values;
								});
							}}
						/>
						<div className="grid gap-3 md:grid-cols-2">
							<SectionToggleRow
								title="Auto review on open"
								description="Start a review automatically when a pull request is opened."
								checked={value.reviews.behavior.autoReview.onOpen}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.autoReview.onOpen = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Auto review on push"
								description="Re-run the review when new commits are pushed."
								checked={value.reviews.behavior.autoReview.onPush}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.autoReview.onPush = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Auto review on ready"
								description="Start the review when the pull request leaves draft mode."
								checked={value.reviews.behavior.autoReview.onReadyForReview}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.autoReview.onReadyForReview =
											checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Auto review on mention"
								description="Trigger a review when the GitPal mention command is used."
								checked={value.reviews.behavior.autoReview.onMention}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.reviews.behavior.autoReview.onMention = checked;
									});
								}}
							/>
						</div>
						<SectionToggleRow
							title="Skip drafts"
							description="Do not auto-review draft pull requests until they are ready."
							checked={value.reviews.behavior.autoReview.skipDrafts}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.reviews.behavior.autoReview.skipDrafts = checked;
								});
							}}
						/>
						<Separator />
						<div className="space-y-4">
							<div className="font-medium text-sm">Repository context</div>
							<div className="grid gap-3 md:grid-cols-2">
								<SectionToggleRow
									title="Context-aware review"
									description="Allow the reviewer to search repository context and related work."
									checked={value.reviews.behavior.context.contextAware}
									disabled={disabled}
									onCheckedChange={(checked) => {
										updateSettings(value, onChange, (draft) => {
											draft.reviews.behavior.context.contextAware = checked;
										});
									}}
								/>
								<SectionToggleRow
									title="Repository files"
									description="Use repository files beyond the diff when needed."
									checked={value.reviews.behavior.context.includeRepositoryFiles}
									disabled={disabled}
									onCheckedChange={(checked) => {
										updateSettings(value, onChange, (draft) => {
											draft.reviews.behavior.context.includeRepositoryFiles =
												checked;
										});
									}}
								/>
								<SectionToggleRow
									title="Pull request history"
									description="Include earlier review discussion and history."
									checked={value.reviews.behavior.context.includePullRequestHistory}
									disabled={disabled}
									onCheckedChange={(checked) => {
										updateSettings(value, onChange, (draft) => {
											draft.reviews.behavior.context.includePullRequestHistory =
												checked;
										});
									}}
								/>
								<SectionToggleRow
									title="Related issues"
									description="Search for related issues when they help explain the change."
									checked={value.reviews.behavior.context.includeRelatedIssues}
									disabled={disabled}
									onCheckedChange={(checked) => {
										updateSettings(value, onChange, (draft) => {
											draft.reviews.behavior.context.includeRelatedIssues =
												checked;
										});
									}}
								/>
								<SectionToggleRow
									title="Related pull requests"
									description="Search for related pull requests or merge requests."
									checked={value.reviews.behavior.context.includeRelatedPRs}
									disabled={disabled}
									onCheckedChange={(checked) => {
										updateSettings(value, onChange, (draft) => {
											draft.reviews.behavior.context.includeRelatedPRs = checked;
										});
									}}
								/>
								<SectionToggleRow
									title="Mention related work"
									description="Publish related issues and pull requests in the result when there is clear evidence."
									checked={value.reviews.behavior.context.mentionRelatedWork}
									disabled={disabled}
									onCheckedChange={(checked) => {
										updateSettings(value, onChange, (draft) => {
											draft.reviews.behavior.context.mentionRelatedWork =
												checked;
										});
									}}
								/>
							</div>
							<div className="space-y-2">
								<div className="font-medium text-sm">Max related items</div>
								<p className="text-muted-foreground text-sm">
									Cap the number of related issues or pull requests inspected per run.
								</p>
								<Input
									type="number"
									min="1"
									max="20"
									value={String(value.reviews.behavior.context.maxRelatedItems)}
									disabled={disabled}
									onChange={(event) => {
										updateSettings(value, onChange, (draft) => {
											draft.reviews.behavior.context.maxRelatedItems =
												updateNumber(
													draft.reviews.behavior.context.maxRelatedItems,
													event.target.value,
													{
														min: 1,
														max: 20,
													},
												);
										});
									}}
								/>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>AI Reviewer</CardTitle>
					<CardDescription>
						Control the default review model, reasoning behavior, and tool access.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="space-y-4">
						<SectionToggleRow
							title="AI reviewer"
							description="Enable GitPal review generation for this workspace."
							checked={value.ai.reviewer.enabled}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.ai.reviewer.enabled = checked;
								});
							}}
						/>
						<div className="grid gap-4 md:grid-cols-2">
							<div className="space-y-2">
								<div className="font-medium text-sm">Model ID</div>
								<Input
									value={value.ai.reviewer.modelId}
									disabled={disabled}
									onChange={(event) => {
										updateSettings(value, onChange, (draft) => {
											draft.ai.reviewer.modelId = event.target.value;
										});
									}}
									placeholder="anthropic/claude-sonnet-4.6"
								/>
							</div>
							<div className="space-y-2">
								<div className="font-medium text-sm">Review focus</div>
								<Select
									value={value.ai.reviewer.focus}
									disabled={disabled}
									onValueChange={(focus) => {
										updateSettings(value, onChange, (draft) => {
											draft.ai.reviewer.focus = focus as
												| "balanced"
												| "security"
												| "performance"
												| "maintainability";
										});
									}}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select focus" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="balanced">Balanced</SelectItem>
										<SelectItem value="security">Security</SelectItem>
										<SelectItem value="performance">Performance</SelectItem>
										<SelectItem value="maintainability">
											Maintainability
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<div className="font-medium text-sm">Max steps</div>
								<Input
									type="number"
									min="1"
									max="50"
									value={String(value.ai.reviewer.maxSteps)}
									disabled={disabled}
									onChange={(event) => {
										updateSettings(value, onChange, (draft) => {
											draft.ai.reviewer.maxSteps = updateNumber(
												draft.ai.reviewer.maxSteps,
												event.target.value,
												{
													min: 1,
													max: 50,
												},
											);
										});
									}}
								/>
							</div>
							<div className="space-y-2">
								<div className="font-medium text-sm">Max output tokens</div>
								<Input
									type="number"
									min="256"
									max="32768"
									value={String(value.ai.reviewer.maxOutputTokens)}
									disabled={disabled}
									onChange={(event) => {
										updateSettings(value, onChange, (draft) => {
											draft.ai.reviewer.maxOutputTokens = updateNumber(
												draft.ai.reviewer.maxOutputTokens,
												event.target.value,
												{
													min: 256,
													max: 32768,
												},
											);
										});
									}}
								/>
							</div>
						</div>
						<div className="space-y-2">
							<div className="font-medium text-sm">Extra instructions</div>
							<Textarea
								value={value.ai.reviewer.extraInstructions}
								disabled={disabled}
								onChange={(event) => {
									updateSettings(value, onChange, (draft) => {
										draft.ai.reviewer.extraInstructions = event.target.value;
									});
								}}
								placeholder="Review the whole change in repository context."
							/>
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							<SectionToggleRow
								title="Publish summary comment"
								description="Post the final review summary comment back to the provider."
								checked={value.ai.reviewer.postSummaryComment}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.ai.reviewer.postSummaryComment = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Publish inline findings"
								description="Post file-specific findings inline when the provider supports anchors."
								checked={value.ai.reviewer.postInlineFindings}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.ai.reviewer.postInlineFindings = checked;
									});
								}}
							/>
						</div>
					</div>

					<Separator />

					<div className="space-y-4">
						<div className="font-medium text-sm">Labeler</div>
						<SectionToggleRow
							title="AI labeler"
							description="Generate and optionally apply issue and pull request labels from the repository label set."
							checked={value.ai.labeler.enabled}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.ai.labeler.enabled = checked;
								});
							}}
						/>
						<div className="grid gap-4 md:grid-cols-3">
							<div className="space-y-2">
								<div className="font-medium text-sm">Model ID</div>
								<Input
									value={value.ai.labeler.modelId}
									disabled={disabled}
									onChange={(event) => {
										updateSettings(value, onChange, (draft) => {
											draft.ai.labeler.modelId = event.target.value;
										});
									}}
									placeholder="anthropic/claude-sonnet-4-5"
								/>
							</div>
							<div className="space-y-2">
								<div className="font-medium text-sm">Max labels</div>
								<Input
									type="number"
									min="1"
									max="10"
									value={String(value.ai.labeler.maxLabels)}
									disabled={disabled}
									onChange={(event) => {
										updateSettings(value, onChange, (draft) => {
											draft.ai.labeler.maxLabels = updateNumber(
												draft.ai.labeler.maxLabels,
												event.target.value,
												{
													min: 1,
													max: 10,
												},
											);
										});
									}}
								/>
							</div>
							<div className="space-y-2">
								<div className="font-medium text-sm">Max output tokens</div>
								<Input
									type="number"
									min="256"
									max="8192"
									value={String(value.ai.labeler.maxOutputTokens)}
									disabled={disabled}
									onChange={(event) => {
										updateSettings(value, onChange, (draft) => {
											draft.ai.labeler.maxOutputTokens = updateNumber(
												draft.ai.labeler.maxOutputTokens,
												event.target.value,
												{
													min: 256,
													max: 8192,
												},
											);
										});
									}}
								/>
							</div>
						</div>
						<div className="grid gap-3 md:grid-cols-2">
							<SectionToggleRow
								title="Label issues"
								description="Run the labeler when a new issue is opened or reopened."
								checked={value.ai.labeler.applyOnIssues}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.ai.labeler.applyOnIssues = checked;
									});
								}}
							/>
							<SectionToggleRow
								title="Label pull requests"
								description="Run the labeler when a new pull request is opened or made ready."
								checked={value.ai.labeler.applyOnPullRequests}
								disabled={disabled}
								onCheckedChange={(checked) => {
									updateSettings(value, onChange, (draft) => {
										draft.ai.labeler.applyOnPullRequests = checked;
									});
								}}
							/>
						</div>
						<div className="space-y-2">
							<div className="font-medium text-sm">Extra instructions</div>
							<Textarea
								value={value.ai.labeler.extraInstructions}
								disabled={disabled}
								onChange={(event) => {
									updateSettings(value, onChange, (draft) => {
										draft.ai.labeler.extraInstructions = event.target.value;
									});
								}}
								placeholder="Only choose labels that already exist in the repository."
							/>
						</div>
					</div>

					<Separator />

					<div className="space-y-4">
						<div className="font-medium text-sm">Thinking</div>
						<SectionToggleRow
							title="Extended reasoning"
							description="Enable provider-specific reasoning features when the selected model supports them."
							checked={value.ai.thinking.enabled}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.ai.thinking.enabled = checked;
								});
							}}
						/>
						<div className="grid gap-4 md:grid-cols-3">
							<div className="space-y-2">
								<div className="font-medium text-sm">Effort</div>
								<Select
									value={value.ai.thinking.effort}
									disabled={disabled}
									onValueChange={(effort) => {
										updateSettings(value, onChange, (draft) => {
											draft.ai.thinking.effort = effort as
												| "low"
												| "medium"
												| "high";
										});
									}}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select effort" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="low">Low</SelectItem>
										<SelectItem value="medium">Medium</SelectItem>
										<SelectItem value="high">High</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<div className="font-medium text-sm">Budget tokens</div>
								<Input
									type="number"
									min="1024"
									max="32000"
									value={String(value.ai.thinking.budgetTokens)}
									disabled={disabled}
									onChange={(event) => {
										updateSettings(value, onChange, (draft) => {
											draft.ai.thinking.budgetTokens = updateNumber(
												draft.ai.thinking.budgetTokens,
												event.target.value,
												{
													min: 1024,
													max: 32000,
												},
											);
										});
									}}
								/>
							</div>
							<div className="space-y-2">
								<div className="font-medium text-sm">Summary visibility</div>
								<Select
									value={value.ai.thinking.summaryVisibility}
									disabled={disabled}
									onValueChange={(summaryVisibility) => {
										updateSettings(value, onChange, (draft) => {
											draft.ai.thinking.summaryVisibility =
												summaryVisibility as
													| "auto"
													| "detailed"
													| "hidden";
										});
									}}
								>
									<SelectTrigger className="w-full">
										<SelectValue placeholder="Select visibility" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="auto">Auto</SelectItem>
										<SelectItem value="detailed">Detailed</SelectItem>
										<SelectItem value="hidden">Hidden</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
					</div>

					<Separator />

					<div className="space-y-4">
						<div className="font-medium text-sm">Tools</div>
						{toolSettingsLocked ? (
							<div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 text-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
								Workspace policy locks repository tool overrides. This repository
								will keep using the workspace-level tool configuration.
							</div>
						) : null}
						<SectionToggleRow
							title="Allow repository overrides"
							description="Let repositories override the workspace-level tool access policy."
							checked={value.ai.tools.allowRepositoryOverrides}
							disabled={disabled || toolSettingsLocked}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.ai.tools.allowRepositoryOverrides = checked;
								});
							}}
						/>
						<ToolSettingsEditor
							tools={value.ai.tools.available}
							disabled={disabled || toolSettingsLocked}
							onChange={(tools) => {
								updateSettings(value, onChange, (draft) => {
									draft.ai.tools.available = tools;
								});
							}}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Finishing Touches</CardTitle>
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
							title="Docstring path instructions"
							description="Add path-specific guidelines for docstring generation."
							items={value.finishingTouches.docstrings.pathInstructions}
							placeholderLabel="Write the docstring guidance."
							keyField="path"
							keyPlaceholder="src/**"
							disabled={disabled}
							onChange={(items) => {
								updateSettings(value, onChange, (draft) => {
									draft.finishingTouches.docstrings.pathInstructions =
										items as WorkspacePathInstruction[];
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
					<CardTitle>Pre-merge Checks</CardTitle>
					<CardDescription>
						Validation checks that run before changes are merged.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<SectionToggleRow
						title="Pre-merge checks"
						description="Enable the pre-merge verification flow for this workspace."
						checked={value.preMergeChecks.enabled}
						disabled={disabled}
						onCheckedChange={(checked) => {
							updateSettings(value, onChange, (draft) => {
								draft.preMergeChecks.enabled = checked;
							});
						}}
					/>
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
					<SectionToggleRow
						title="Require AI review"
						description="Block merge until an AI review run has completed successfully."
						checked={value.preMergeChecks.requireAiReview}
						disabled={disabled}
						onCheckedChange={(checked) => {
							updateSettings(value, onChange, (draft) => {
								draft.preMergeChecks.requireAiReview = checked;
							});
						}}
					/>
					<SectionToggleRow
						title="Block on open findings"
						description="Prevent merge when unresolved blocking findings remain."
						checked={value.preMergeChecks.blockOnOpenFindings}
						disabled={disabled}
						onCheckedChange={(checked) => {
							updateSettings(value, onChange, (draft) => {
								draft.preMergeChecks.blockOnOpenFindings = checked;
							});
						}}
					/>
					<SectionToggleRow
						title="Require context scan"
						description="Require repository context and related-work scanning before merge approval."
						checked={value.preMergeChecks.requireContextScan}
						disabled={disabled}
						onCheckedChange={(checked) => {
							updateSettings(value, onChange, (draft) => {
								draft.preMergeChecks.requireContextScan = checked;
							});
						}}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Statuses</CardTitle>
					<CardDescription>
						Behavior for labels, titles, and published summaries.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<SectionToggleRow
						title="Auto-apply labels"
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
					<div className="grid gap-3 md:grid-cols-2">
						<SectionToggleRow
							title="Publish review summary"
							description="Publish the final AI review summary comment after review runs."
							checked={value.statuses.publishReviewSummary}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.statuses.publishReviewSummary = checked;
								});
							}}
						/>
						<SectionToggleRow
							title="Publish pre-merge summary"
							description="Publish pre-merge summary comments when merge checks run."
							checked={value.statuses.publishPreMergeSummary}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.statuses.publishPreMergeSummary = checked;
								});
							}}
						/>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Webhooks</CardTitle>
					<CardDescription>
						Mention commands and automatic provider event triggers.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="space-y-3">
						<SectionToggleRow
							title="Mention commands"
							description="Enable GitPal mention commands inside issue or pull request comments."
							checked={value.webhooks.mentions.enabled}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.webhooks.mentions.enabled = checked;
								});
							}}
						/>
						<StringListEditor
							title="Mention commands"
							description="Accepted commands that should trigger a review run."
							placeholder="review"
							values={value.webhooks.mentions.commands}
							disabled={disabled}
							onChange={(values) => {
								updateSettings(value, onChange, (draft) => {
									draft.webhooks.mentions.commands = values;
								});
							}}
						/>
						<StringListEditor
							title="Mention aliases"
							description="Aliases that can invoke GitPal in comments."
							placeholder="@gitpal"
							values={value.webhooks.mentions.aliases}
							disabled={disabled}
							onChange={(values) => {
								updateSettings(value, onChange, (draft) => {
									draft.webhooks.mentions.aliases = values;
								});
							}}
						/>
					</div>

					<Separator />

					<div className="space-y-3">
						<SectionToggleRow
							title="Pull request events"
							description="Enable automatic review triggers for pull request events."
							checked={value.webhooks.pullRequests.enabled}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.webhooks.pullRequests.enabled = checked;
								});
							}}
						/>
						<StringListEditor
							title="Pull request actions"
							description="Provider event actions that should trigger GitPal."
							placeholder="opened"
							values={value.webhooks.pullRequests.actions}
							disabled={disabled}
							onChange={(values) => {
								updateSettings(value, onChange, (draft) => {
									draft.webhooks.pullRequests.actions = values;
								});
							}}
						/>
					</div>

					<Separator />

					<div className="space-y-3">
						<SectionToggleRow
							title="Merge request events"
							description="Enable automatic review triggers for merge request events."
							checked={value.webhooks.mergeRequests.enabled}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.webhooks.mergeRequests.enabled = checked;
								});
							}}
						/>
						<StringListEditor
							title="Merge request actions"
							description="GitLab merge request actions that should trigger GitPal."
							placeholder="update"
							values={value.webhooks.mergeRequests.actions}
							disabled={disabled}
							onChange={(values) => {
								updateSettings(value, onChange, (draft) => {
									draft.webhooks.mergeRequests.actions = values;
								});
							}}
						/>
					</div>

					<Separator />

					<div className="space-y-3">
						<SectionToggleRow
							title="Pre-merge command trigger"
							description="Enable pre-merge checks through explicit commands."
							checked={value.webhooks.preMerge.enabled}
							disabled={disabled}
							onCheckedChange={(checked) => {
								updateSettings(value, onChange, (draft) => {
									draft.webhooks.preMerge.enabled = checked;
								});
							}}
						/>
						<StringListEditor
							title="Pre-merge commands"
							description="Commands that should run the pre-merge flow."
							placeholder="pre-merge"
							values={value.webhooks.preMerge.commands}
							disabled={disabled}
							onChange={(values) => {
								updateSettings(value, onChange, (draft) => {
									draft.webhooks.preMerge.commands = values;
								});
							}}
						/>
						<StringListEditor
							title="Pre-merge aliases"
							description="Aliases that can invoke the pre-merge flow."
							placeholder="/gitpal"
							values={value.webhooks.preMerge.aliases}
							disabled={disabled}
							onChange={(values) => {
								updateSettings(value, onChange, (draft) => {
									draft.webhooks.preMerge.aliases = values;
								});
							}}
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
					<div className="space-y-2">
						<div className="font-medium text-sm">Fun model ID</div>
						<Input
							value={value.fun.modelId}
							disabled={disabled}
							onChange={(event) => {
								updateSettings(value, onChange, (draft) => {
									draft.fun.modelId = event.target.value;
								});
							}}
							placeholder="anthropic/claude-sonnet-4-5"
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
