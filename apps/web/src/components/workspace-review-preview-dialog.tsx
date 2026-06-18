"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@gitpal/ui/components/dialog";
import { cn } from "@gitpal/ui/lib/utils";
import type { WorkspaceSettings } from "@gitpal/utils";
import { buildRepositoryReviewPreviewData } from "@gitpal/utils";
import {
	CpuIcon,
	EyeIcon,
	GitBranchIcon,
	GitMergeIcon,
	SlidersHorizontalIcon,
	UserIcon,
	WrenchIcon,
} from "lucide-react";
import * as React from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { GitPalMark } from "./gitpal-mark";

// ─── Types ──────────────────────────────────────

type WorkspaceReviewPreviewDialogProps = {
	settings: WorkspaceSettings;
	repositoryFullName?: string;
	repositoryDescription?: string | null;
	workspaceName?: string;
	className?: string;
};

// ─── Markdown renderer ────────────────────────────
//
// We render the EXACT Markdown the bot publishes — `buildRepositoryReviewPreviewData`
// returns the same `markdown` string produced by `buildRepositoryReviewCommentData`,
// which is what GitPal posts to the PR. No bespoke reconstruction, so the preview
// can never drift from production output.
//
// GitHub-flavored styling is applied via component overrides so we don't depend on
// the Tailwind typography plugin being installed. Every block-level element is
// width-safe (min-w-0 / overflow-x-auto) so long tokens and wide tables never push
// the dialog out horizontally.

const markdownComponents: React.ComponentProps<
	typeof ReactMarkdown
>["components"] = {
	h1: ({ children }) => (
		<h1 className="mt-6 mb-3 border-border/60 border-b pb-2 font-semibold text-foreground text-lg first:mt-0 sm:text-xl">
			{children}
		</h1>
	),
	h2: ({ children }) => (
		<h2 className="mt-6 mb-3 border-border/50 border-b pb-1.5 font-semibold text-base text-foreground first:mt-0 sm:text-lg">
			{children}
		</h2>
	),
	h3: ({ children }) => (
		<h3 className="mt-5 mb-2 font-semibold text-foreground text-sm first:mt-0 sm:text-base">
			{children}
		</h3>
	),
	p: ({ children }) => (
		<p className="my-3 text-foreground/90 text-sm leading-7">{children}</p>
	),
	a: ({ href, children }) => (
		<a
			href={href}
			target="_blank"
			rel="noreferrer noopener"
			className="font-medium text-primary underline-offset-4 hover:underline"
		>
			{children}
		</a>
	),
	ul: ({ children }) => (
		<ul className="my-3 ml-5 list-disc space-y-1.5 text-foreground/90 text-sm leading-6 marker:text-muted-foreground">
			{children}
		</ul>
	),
	ol: ({ children }) => (
		<ol className="my-3 ml-5 list-decimal space-y-1.5 text-foreground/90 text-sm leading-6 marker:text-muted-foreground">
			{children}
		</ol>
	),
	li: ({ children }) => <li className="pl-1">{children}</li>,
	blockquote: ({ children }) => (
		<blockquote className="my-3 border-primary/40 border-l-[3px] bg-muted/30 py-1 pl-4 text-muted-foreground italic">
			{children}
		</blockquote>
	),
	code: ({ className, children, ...props }) => {
		const isBlock = Boolean(className?.startsWith("language-"));
		if (isBlock) {
			return (
				<code
					className={cn(
						"block font-mono text-foreground text-xs leading-6",
						className,
					)}
					{...props}
				>
					{children}
				</code>
			);
		}
		return (
			<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8em] text-foreground">
				{children}
			</code>
		);
	},
	pre: ({ children }) => (
		<pre className="my-3 max-w-full overflow-x-auto rounded-md border border-border/60 bg-muted/30 p-3 sm:p-4">
			{children}
		</pre>
	),
	table: ({ children }) => (
		<div className="my-4 w-full max-w-full overflow-x-auto rounded-md border border-border/60">
			<table className="w-full border-collapse text-sm">{children}</table>
		</div>
	),
	thead: ({ children }) => (
		<thead className="bg-muted/40 text-muted-foreground text-xs">
			{children}
		</thead>
	),
	th: ({ children, style }) => (
		<th
			style={style}
			className="whitespace-nowrap border-border/50 border-b px-3 py-2 text-left font-medium sm:px-4"
		>
			{children}
		</th>
	),
	td: ({ children, style }) => (
		<td
			style={style}
			className="border-border/30 border-b px-3 py-2 align-top text-foreground/90 sm:px-4"
		>
			{children}
		</td>
	),
	tr: ({ children }) => (
		<tr className="hover:bg-muted/20 last:[&>td]:border-0">{children}</tr>
	),
	hr: () => <hr className="my-5 border-border/50" />,
	details: ({ children, ...props }) => (
		<details
			className="my-3 overflow-hidden rounded-md border border-border/60 [&[open]>summary]:border-b"
			{...props}
		>
			{children}
		</details>
	),
	summary: ({ children }) => (
		<summary className="cursor-pointer select-none border-border/40 bg-muted/30 px-4 py-2 font-medium text-foreground text-xs hover:bg-muted/50">
			{children}
		</summary>
	),
	strong: ({ children }) => (
		<strong className="font-semibold text-foreground">{children}</strong>
	),
	img: ({ src, alt }) => (
		// eslint-disable-next-line @next/next/no-img-element
		<img src={src} alt={alt} className="my-3 max-w-full rounded-md" />
	),
};

function MarkdownPreview({ markdown }: { markdown: string }) {
	return (
		<div className="min-w-0 max-w-full break-words px-4 py-4 [overflow-wrap:anywhere] sm:px-5">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw]}
				components={markdownComponents}
			>
				{markdown}
			</ReactMarkdown>
		</div>
	);
}

// ─── Sidebar card ──────────────────────────────────

function SidebarCard({
	title,
	icon,
	className,
	children,
}: {
	title: string;
	icon: React.ReactNode;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Card className={cn("min-w-0 gap-0 overflow-hidden py-0", className)}>
			<CardHeader className="border-border/40 border-b bg-muted/20 px-4 py-3">
				<CardTitle className="flex items-center gap-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
					{icon}
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent className="p-0">{children}</CardContent>
		</Card>
	);
}

// ─── Main component ────────────────────────────────

export function WorkspaceReviewPreviewDialog({
	settings,
	repositoryFullName,
	repositoryDescription,
	workspaceName,
	className,
}: WorkspaceReviewPreviewDialogProps) {
	const preview = React.useMemo(
		() =>
			buildRepositoryReviewPreviewData(settings, {
				repositoryFullName,
				repositoryDescription,
			}),
		[settings, repositoryDescription, repositoryFullName],
	);

	const modelRows = [
		{ label: "Reviewer", model: settings.ai.reviewer.modelId },
		{ label: "Walkthrough", model: settings.reviews.walkthrough.modelId },
		{
			label: "Labeler",
			model: settings.ai.labeler.modelId,
			muted: !settings.ai.labeler.enabled,
		},
		{ label: "Fun", model: settings.fun.modelId },
	];

	return (
		<Dialog>
			{/* Trigger — base-ui composes via `render` (no `asChild`) */}
			<DialogTrigger
				render={
					<Button
						type="button"
						variant="outline"
						className={cn("gap-2", className)}
					>
						<EyeIcon className="size-4" />
						Preview review output
					</Button>
				}
			/>

			{/*
			 * Layout contract:
			 * - DialogContent is a fixed-height flex column: header stays pinned, body scrolls.
			 * - max-w-5xl keeps the comment from sprawling on wide desktops.
			 * - Below lg the comment + sidebar are a single stacked column (predictable on
			 *   tablets, no ragged 2-col card grid).
			 * - At lg+ it's a flex row: comment = flex-1 (min-w-0 so wide tables/pre never
			 *   overflow the dialog) and a fixed, comfortably-wide sidebar rail.
			 */}
			<DialogContent className="flex max-h-[90dvh] min-w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0">
				{/* ── Header (pinned) ──────────────────── */}
				<DialogHeader className="shrink-0 space-y-0.5 border-border/60 border-b bg-muted/30 px-4 py-3.5 text-left sm:px-6 sm:py-4">
					<DialogTitle className="text-sm sm:text-base">
						Review preview
					</DialogTitle>
					<DialogDescription className="text-xs">
						{workspaceName
							? `Rendered from the published Markdown using current settings for ${workspaceName}.`
							: "Rendered from the published Markdown — updates live as you edit settings."}
					</DialogDescription>
				</DialogHeader>

				{/* ── Body (scrolls) ───────────────────── */}
				<div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">
					<div className="flex w-full flex-col gap-5 p-4 sm:p-6 lg:flex-row lg:items-start lg:gap-6">
						{/* ── GitHub-style comment ───────────── */}
						<section className="min-w-0 flex-1">
							<div className="overflow-hidden rounded-lg border border-border/70 shadow-sm">
								{/* Author bar */}
								<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-border/60 border-b bg-muted/40 px-3 py-2.5 sm:px-4">
									<div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border/60">
										<GitPalMark className="size-3.5" />
									</div>
									<span className="font-semibold text-foreground text-sm">
										gitpal
									</span>
									<Badge variant="outline" className="h-5 px-1.5 text-[10px]">
										bot
									</Badge>
									<Badge
										variant="secondary"
										className="ml-auto h-5 shrink-0 px-1.5 font-mono text-[10px]"
									>
										#{preview.pullRequest.number}
									</Badge>
								</div>

								{/* Meta row — always visible, wraps gracefully on every size */}
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-border/40 border-b bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground sm:px-4 sm:text-xs">
									<span className="flex min-w-0 items-center gap-1">
										<GitBranchIcon className="size-3 shrink-0" />
										<span className="truncate">
											{preview.pullRequest.sourceBranch}
										</span>
										<span className="shrink-0">→</span>
										<GitMergeIcon className="size-3 shrink-0" />
										<span className="truncate">
											{preview.pullRequest.targetBranch}
										</span>
									</span>
									<span className="flex items-center gap-1">
										<UserIcon className="size-3 shrink-0" />
										{preview.pullRequest.authorLogin ?? "unknown"}
									</span>
								</div>

								{/* Repo sub-header */}
								<div className="border-border/40 border-b bg-muted/10 px-3 py-2 sm:px-4">
									<p className="truncate text-muted-foreground text-xs">
										<span className="font-medium font-mono text-foreground">
											{preview.repository.fullName}
										</span>
										{preview.repository.description && (
											<> · {preview.repository.description}</>
										)}
									</p>
								</div>

								{/* Rendered Markdown body */}
								<div className="bg-background">
									<MarkdownPreview markdown={preview.markdown} />
								</div>
							</div>
						</section>

						{/* ── Sidebar rail ─────────────────── */}
						<aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80 xl:w-96">
							{/* Settings snapshot — uses preview.notes from the shared builder */}
							<SidebarCard
								title="Settings snapshot"
								icon={<SlidersHorizontalIcon className="size-3.5" />}
							>
								<div className="divide-y divide-border/40">
									{preview.notes.map((note) => (
										<div
											key={note}
											className="px-4 py-2.5 text-muted-foreground text-xs leading-5"
										>
											{note}
										</div>
									))}
								</div>
							</SidebarCard>

							{/* Model routing */}
							<SidebarCard
								title="Model routing"
								icon={<CpuIcon className="size-3.5" />}
							>
								<div className="divide-y divide-border/40">
									{modelRows.map(({ label, model, muted }) => (
										<div
											key={label}
											className="flex items-center justify-between gap-3 px-4 py-2.5"
										>
											<span
												className={cn(
													"text-xs",
													muted
														? "text-muted-foreground/50"
														: "text-muted-foreground",
												)}
											>
												{label}
											</span>
											<Badge
												variant={muted ? "secondary" : "outline"}
												className="max-w-[60%] truncate font-mono text-[10px]"
											>
												{model}
											</Badge>
										</div>
									))}
								</div>
							</SidebarCard>

							{/* Tools — stacked rows (no horizontal table) so it never squishes
							 * inside the narrow rail; badges drop below the label on tight widths. */}
							<SidebarCard
								title="Tools"
								icon={<WrenchIcon className="size-3.5" />}
							>
								<ul className="divide-y divide-border/40">
									{preview.toolRows.map((tool) => (
										<li
											key={tool.id}
											className="flex items-start justify-between gap-3 px-4 py-3"
										>
											<div className="min-w-0">
												<div className="font-medium text-foreground text-xs leading-tight">
													{tool.label}
												</div>
												{tool.note && (
													<p className="mt-1 text-[10px] text-muted-foreground leading-snug">
														{tool.note}
													</p>
												)}
											</div>
											<div className="flex shrink-0 flex-col items-end gap-1">
												<Badge
													variant={
														tool.mode === "mcp" ? "secondary" : "outline"
													}
													className="text-[10px]"
												>
													{tool.mode === "mcp" ? "MCP" : "Built-in"}
												</Badge>
												<Badge
													variant={
														tool.enabled
															? tool.mode === "mcp" && !tool.serverName
																? "destructive"
																: "outline"
															: "secondary"
													}
													className="text-[10px]"
												>
													{tool.statusLabel}
												</Badge>
											</div>
										</li>
									))}
								</ul>
								<p className="border-border/40 border-t px-4 py-3 text-[11px] text-muted-foreground leading-5">
									Built-in tools run via GitPal&apos;s provider adapters. MCP
									entries proxy configured servers; repo overrides are only
									honoured when the workspace policy permits them.
								</p>
							</SidebarCard>
						</aside>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
