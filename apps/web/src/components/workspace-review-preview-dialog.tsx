"use client";

import * as React from "react";
import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@gitpal/ui/components/dialog";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import { ScrollArea } from "@gitpal/ui/components/scroll-area";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@gitpal/ui/components/table";
import { cn } from "@gitpal/ui/lib/utils";
import type {
	WorkspaceManagedToolType,
	WorkspaceSettings,
} from "@gitpal/utils";
import { buildRepositoryReviewPreviewData } from "@gitpal/utils";
import { EyeIcon } from "lucide-react";

import { GitPalMark } from "./gitpal-mark";

type WorkspaceReviewPreviewDialogProps = {
	settings: WorkspaceSettings;
	repositoryFullName?: string;
	repositoryDescription?: string | null;
	workspaceName?: string;
	className?: string;
};

function badgeVariantForStatus(status: string) {
	switch (status) {
		case "critical":
		case "failed":
			return "destructive" as const;
		case "high":
			return "destructive" as const;
		case "warning":
			return "secondary" as const;
		case "passed":
		case "built-in":
			return "outline" as const;
		default:
			return "secondary" as const;
	}
}

function toolModeLabel(type: WorkspaceManagedToolType, mode: string) {
	if (type === "github-mcp" || type === "gitlab-mcp") {
		return mode === "mcp" ? "MCP" : "Built-in";
	}

	return "Built-in";
}

function PreviewSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-3">
			<h3 className="font-semibold text-sm tracking-tight text-foreground">
				{title}
			</h3>
			<div className="space-y-3 text-muted-foreground text-sm leading-6">
				{children}
			</div>
		</section>
	);
}

function PreviewFinding({
	title,
	body,
	severity,
	location,
}: {
	title: string;
	body: string;
	severity: string;
	location: string | null;
}) {
	return (
		<div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm">
			<div className="flex flex-wrap items-center gap-2">
				<Badge variant={badgeVariantForStatus(severity)}>{severity}</Badge>
				<span className="font-medium text-foreground">{title}</span>
				{location ? (
					<Badge variant="outline" className="ml-auto">
						{location}
					</Badge>
				) : null}
			</div>
			<p className="mt-2 text-muted-foreground text-sm leading-6">{body}</p>
		</div>
	);
}

export function WorkspaceReviewPreviewDialog({
	settings,
	repositoryFullName,
	repositoryDescription,
	workspaceName,
	className,
}: WorkspaceReviewPreviewDialogProps) {
	const [open, setOpen] = React.useState(false);
	const preview = React.useMemo(
		() =>
			buildRepositoryReviewPreviewData(settings, {
				repositoryFullName,
				repositoryDescription,
			}),
		[settings, repositoryDescription, repositoryFullName],
	);
	const visibleFiles = React.useMemo(() => {
		if (settings.reviews.behavior.pathFilters.length === 0) {
			return preview.changedFiles;
		}

		return preview.changedFiles.filter((file) =>
			!settings.reviews.behavior.pathFilters.some((pattern) =>
				file.path.includes(pattern.replace(/\*\*/g, "")),
			),
		);
	}, [preview.changedFiles, settings.reviews.behavior.pathFilters]);

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<Button
				type="button"
				variant="outline"
				className={cn("gap-2", className)}
				onClick={() => setOpen(true)}
			>
				<EyeIcon />
				Preview review output
			</Button>
			<DialogContent className="max-w-6xl overflow-hidden p-0 sm:max-w-[95vw]">
				<div className="border-b border-border/60 bg-muted/30 px-6 py-5">
					<DialogHeader className="space-y-2">
						<div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
							<div className="space-y-1">
								<DialogTitle>Review preview</DialogTitle>
								<DialogDescription>
									{workspaceName
										? `This preview uses the current settings for ${workspaceName}.`
										: "This preview uses the current settings and updates as you edit them."}
								</DialogDescription>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Badge variant={settings.ai.reviewer.enabled ? "default" : "secondary"}>
									{settings.ai.reviewer.enabled ? "AI reviewer on" : "AI reviewer off"}
								</Badge>
								<Badge variant={settings.reviews.behavior.context.contextAware ? "outline" : "secondary"}>
									{settings.reviews.behavior.context.contextAware
										? "Context aware"
										: "Context off"}
								</Badge>
								<Badge variant={settings.ai.tools.allowRepositoryOverrides ? "outline" : "secondary"}>
									{settings.ai.tools.allowRepositoryOverrides
										? "Repo tool overrides allowed"
										: "Repo tool overrides locked"}
								</Badge>
							</div>
						</div>
					</DialogHeader>
				</div>
				<ScrollArea className="max-h-[calc(90vh-5.5rem)]">
					<div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
						<div className="space-y-6">
							<Card className="overflow-hidden">
								<CardHeader className="border-b border-border/60 bg-muted/20 px-4 py-3">
									<div className="flex items-center gap-3">
										<div className="flex size-9 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border/60">
											<GitPalMark className="size-4" />
										</div>
										<div className="min-w-0 space-y-0.5">
											<div className="flex flex-wrap items-center gap-2">
												<CardTitle className="text-sm">GitPal</CardTitle>
												<Badge variant="outline">Bot</Badge>
												<Badge variant="secondary">
													{preview.pullRequest.number}
												</Badge>
											</div>
											<p className="text-muted-foreground text-xs">
												{preview.repository.fullName}
												{preview.repository.description
													? ` · ${preview.repository.description}`
													: ""}
											</p>
										</div>
										<div className="ml-auto text-right text-muted-foreground text-xs">
											<div>{preview.pullRequest.sourceBranch}</div>
											<div>
												{preview.pullRequest.authorLogin ?? "unknown"}
												{" -> "}
												{preview.pullRequest.targetBranch}
											</div>
										</div>
									</div>
								</CardHeader>
								<CardContent className="space-y-6 px-4 py-5">
									{settings.reviews.summary.highLevelSummary ? (
										<PreviewSection title="Summary">
											<p className="text-foreground">{preview.summary}</p>
										</PreviewSection>
									) : (
										<div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-muted-foreground text-sm">
											High-level summaries are disabled for this workspace.
										</div>
									)}

									<PreviewSection title="Walkthrough">
										{settings.reviews.summary.highLevelSummary &&
										settings.reviews.summary.highLevelSummaryInWalkthrough &&
										preview.summary ? (
											<blockquote className="rounded-2xl border-l-2 border-primary/40 bg-primary/5 px-4 py-3 text-foreground">
												{preview.summary}
											</blockquote>
										) : null}
										<p className="text-foreground">{preview.walkthrough}</p>
										{settings.reviews.walkthrough.changedFilesSummary ? (
											<div className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-4">
												<div className="font-medium text-foreground text-sm">
													Changes
												</div>
												{visibleFiles.length > 0 ? (
													<div className="overflow-x-auto">
														<table className="w-full min-w-[32rem] text-sm">
															<thead>
																<tr className="border-b border-border/60 text-left text-muted-foreground text-xs">
																	<th className="px-3 py-2">File / path(s)</th>
																	<th className="px-3 py-2">Change summary</th>
																	<th className="px-3 py-2 text-right">+/-</th>
																</tr>
															</thead>
															<tbody>
																{visibleFiles.map((file) => (
																	<tr
																		key={file.path}
																		className="border-b border-border/40 last:border-0"
																	>
																		<td className="px-3 py-2 font-medium text-foreground">
																			{file.path}
																		</td>
																		<td className="px-3 py-2 text-muted-foreground">
																			{file.summary}
																		</td>
																		<td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
																			+{file.additions}/-{file.deletions}
																		</td>
																	</tr>
																))}
															</tbody>
														</table>
													</div>
												) : (
													<div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-muted-foreground text-sm">
														All changed files are filtered out by the current path
														rules.
													</div>
												)}
											</div>
										) : null}
										{settings.reviews.walkthrough.sequenceDiagrams &&
										preview.sequenceDiagram ? (
											<div className="space-y-2 rounded-2xl border border-border/60 bg-background/80 p-4">
												<div className="font-medium text-foreground text-sm">
													Sequence diagram(s)
												</div>
												<pre className="overflow-x-auto rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs leading-6 text-foreground">
													<code>{preview.sequenceDiagram}</code>
												</pre>
											</div>
										) : null}
										{settings.reviews.walkthrough.estimateCodeReviewEffort &&
										preview.reviewEffort ? (
											<div className="space-y-2 rounded-2xl border border-border/60 bg-background/80 p-4">
												<div className="font-medium text-foreground text-sm">
													Estimated code review effort
												</div>
												<p className="text-foreground">
													🎯 {preview.reviewEffort.score} ({preview.reviewEffort.label}) |{" "}
													⏱️ ~{preview.reviewEffort.minutes} minutes
												</p>
											</div>
										) : null}
										{preview.relatedWork.length > 0 ? (
											<div className="space-y-3">
												<div className="font-medium text-foreground text-sm">
													Related work
												</div>
												<div className="space-y-3">
													{preview.relatedWork.map((item) => (
														<div
															key={`${item.kind}-${item.number}`}
															className="rounded-2xl border border-border/60 bg-background/80 p-4"
														>
															<div className="flex flex-wrap items-center gap-2">
																<Badge variant="outline">
																	{item.kind === "issue"
																		? "Issue"
																		: "Pull request"}
																</Badge>
																<a
																	href={item.htmlUrl}
																	className="font-medium text-foreground underline-offset-4 hover:underline"
																>
																	#{item.number} {item.title}
																</a>
															</div>
															<p className="mt-2 text-muted-foreground text-sm">
																{item.reason}
															</p>
														</div>
													))}
												</div>
											</div>
										) : null}
										{preview.suggestedReviewers.length > 0 ? (
											<div className="space-y-2 rounded-2xl border border-border/60 bg-background/80 p-4">
												<div className="font-medium text-foreground text-sm">
													Suggested reviewers
												</div>
												<div className="flex flex-wrap gap-2">
													{preview.suggestedReviewers.map((reviewer) => (
														<Badge key={reviewer} variant="outline">
															{reviewer}
														</Badge>
													))}
												</div>
											</div>
										) : null}
										{preview.poem ? (
											<div className="space-y-2 rounded-2xl border border-border/60 bg-background/80 p-4">
												<div className="font-medium text-foreground text-sm">
													Poem
												</div>
												<pre className="whitespace-pre-wrap text-foreground text-sm leading-6">
													{preview.poem}
												</pre>
											</div>
										) : null}
									</PreviewSection>

									<PreviewSection title="Findings">
										<div className="space-y-3">
											{preview.findings.length > 0 ? (
												preview.findings.map((finding) => (
													<PreviewFinding
														key={`${finding.title}-${finding.filePath ?? "none"}`}
														title={finding.title}
														body={finding.body}
														severity={finding.severity}
														location={
															finding.filePath
																? finding.line
																	? `${finding.filePath}:${finding.line}`
																	: finding.filePath
																: null
														}
													/>
												))
											) : (
												<div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-muted-foreground text-sm">
													No findings were raised in this preview.
												</div>
											)}
										</div>
									</PreviewSection>

									{preview.preMergeChecks.length > 0 ? (
										<PreviewSection title="Pre-merge checks">
											<div className="space-y-3">
												{preview.preMergeChecks.map((check) => (
													<div
														key={check.name}
														className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/80 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
													>
														<div className="space-y-1">
															<div className="font-medium text-foreground text-sm">
																{check.name}
															</div>
															<p className="text-muted-foreground text-sm">
																{check.details}
															</p>
														</div>
														<Badge
															variant={badgeVariantForStatus(check.status)}
															className="self-start"
														>
															{check.status}
														</Badge>
													</div>
												))}
											</div>
										</PreviewSection>
									) : null}

									{preview.suggestedLabels.length > 0 ? (
										<PreviewSection title="Suggested labels">
											<div className="flex flex-wrap gap-2">
												{preview.suggestedLabels.map((label) => (
													<Badge key={label} variant="outline">
														{label}
													</Badge>
												))}
											</div>
										</PreviewSection>
									) : null}
								</CardContent>
							</Card>
						</div>

						<div className="space-y-4">
							<Card>
								<CardHeader>
									<CardTitle className="text-sm">Settings snapshot</CardTitle>
								</CardHeader>
								<CardContent className="space-y-2 text-sm text-muted-foreground">
									{preview.notes.map((note) => (
										<div
											key={note}
											className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2"
										>
											{note}
										</div>
									))}
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle className="text-sm">Model routing</CardTitle>
								</CardHeader>
								<CardContent className="space-y-2 text-sm text-muted-foreground">
									<div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-2">
										<span>Reviewer</span>
										<Badge variant="outline">{settings.ai.reviewer.modelId}</Badge>
									</div>
									<div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-2">
										<span>Walkthrough</span>
										<Badge variant="outline">
											{settings.reviews.walkthrough.modelId}
										</Badge>
									</div>
									<div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-2">
										<span>Labeler</span>
										<Badge
											variant={settings.ai.labeler.enabled ? "outline" : "secondary"}
										>
											{settings.ai.labeler.modelId}
										</Badge>
									</div>
									<div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-background/80 px-3 py-2">
										<span>Fun</span>
										<Badge variant="outline">{settings.fun.modelId}</Badge>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle className="text-sm">Tools</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="overflow-hidden rounded-2xl border border-border/60">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Tool</TableHead>
													<TableHead>Mode</TableHead>
													<TableHead>Status</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{preview.toolRows.map((tool) => (
													<TableRow key={tool.id}>
														<TableCell className="whitespace-normal">
															<div className="space-y-1">
																<div className="font-medium text-foreground">
																	{tool.label}
																</div>
																<p className="text-muted-foreground text-xs">
																	{tool.note}
																</p>
															</div>
														</TableCell>
														<TableCell>
															<Badge variant={tool.mode === "mcp" ? "secondary" : "outline"}>
																{toolModeLabel(tool.type, tool.mode)}
															</Badge>
														</TableCell>
														<TableCell>
															<Badge
																variant={
																	tool.enabled
																		? tool.mode === "mcp" && !tool.serverName
																			? "destructive"
																			: "outline"
																		: "secondary"
																}
															>
																{tool.statusLabel}
															</Badge>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
									<div className="text-muted-foreground text-xs leading-6">
										Built-in tools run directly against GitPal&apos;s provider
										adapters. MCP entries stay visible as configured server-backed
										proxies, and repositories can only change them when the
										workspace policy allows overrides.
									</div>
								</CardContent>
							</Card>
						</div>
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
