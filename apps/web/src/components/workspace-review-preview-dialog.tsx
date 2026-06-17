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
import { Separator } from "@gitpal/ui/components/separator";
import { cn } from "@gitpal/ui/lib/utils";
import type {
  WorkspaceManagedToolType,
  WorkspaceSettings,
} from "@gitpal/utils";
import { buildRepositoryReviewPreviewData } from "@gitpal/utils";
import {
  EyeIcon,
  GitBranchIcon,
  GitMergeIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
  UserIcon,
  ClockIcon,
  TagIcon,
  WrenchIcon,
  SlidersHorizontalIcon,
  CpuIcon,
} from "lucide-react";
import { GitPalMark } from "./gitpal-mark";

// ─── Types ───────────────────────────────────────────────────────────────────

type WorkspaceReviewPreviewDialogProps = {
  settings: WorkspaceSettings;
  repositoryFullName?: string;
  repositoryDescription?: string | null;
  workspaceName?: string;
  className?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function badgeVariantForStatus(status: string) {
  switch (status) {
    case "critical":
    case "failed":
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

function severityIcon(severity: string) {
  switch (severity) {
    case "critical":
    case "high":
      return <AlertCircleIcon className="size-3.5 shrink-0" />;
    case "warning":
      return <AlertTriangleIcon className="size-3.5 shrink-0" />;
    case "passed":
      return <CheckCircleIcon className="size-3.5 shrink-0" />;
    default:
      return <InfoIcon className="size-3.5 shrink-0" />;
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * GitHub-style section heading with a subtle horizontal rule.
 */
function GhSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-foreground">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <div className="h-px flex-1 bg-border/60" />
      </div>
      <div className="space-y-3 text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

/**
 * GitHub-style inline code path badge.
 */
function FilePath({ path }: { path: string }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
      {path}
    </code>
  );
}

/**
 * GitHub-style finding card — mirrors a PR review comment thread.
 */
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
  const isError = severity === "critical" || severity === "high";
  const isWarning = severity === "warning";

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border",
        isError && "border-destructive/40",
        isWarning && "border-yellow-500/40",
        !isError && !isWarning && "border-border/60",
      )}
    >
      {/* GitHub-style comment header bar */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs",
          isError && "border-destructive/30 bg-destructive/5 text-destructive",
          isWarning &&
            "border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400",
          !isError &&
            !isWarning &&
            "border-border/60 bg-muted/30 text-muted-foreground",
        )}
      >
        <span className="flex items-center gap-1 font-medium">
          {severityIcon(severity)}
          {severity}
        </span>
        <span className="font-semibold text-foreground">{title}</span>
        {location && (
          <span className="ml-auto font-mono">
            <FilePath path={location} />
          </span>
        )}
      </div>
      {/* Body */}
      <div className="bg-background/80 px-4 py-3 text-sm leading-6 text-muted-foreground">
        {body}
      </div>
    </div>
  );
}

/**
 * GitHub-style pre-merge check row.
 */
function CheckRow({
  name,
  details,
  status,
}: {
  name: string;
  details: string;
  status: string;
}) {
  const isPassed = status === "passed";
  const isFailed = status === "failed" || status === "critical";

  return (
    <div className="flex items-start gap-3 rounded-md border border-border/60 bg-background/80 px-4 py-3">
      <span className="mt-0.5 shrink-0">
        {isPassed ? (
          <CheckCircleIcon className="size-4 text-green-500" />
        ) : isFailed ? (
          <AlertCircleIcon className="size-4 text-destructive" />
        ) : (
          <AlertTriangleIcon className="size-4 text-yellow-500" />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="font-medium text-foreground text-sm">{name}</div>
        <p className="text-muted-foreground text-sm">{details}</p>
      </div>
      <Badge
        variant={badgeVariantForStatus(status)}
        className="shrink-0 self-start"
      >
        {status}
      </Badge>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
    return preview.changedFiles.filter(
      (file) =>
        !settings.reviews.behavior.pathFilters.some((pattern) =>
          file.path.includes(pattern.replace(/\*\*/g, "")),
        ),
    );
  }, [preview.changedFiles, settings.reviews.behavior.pathFilters]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Trigger button */}
      <Button
        type="button"
        variant="outline"
        className={cn("gap-2", className)}
        onClick={() => setOpen(true)}
      >
        <EyeIcon className="size-4" />
        Preview review output
      </Button>

      <DialogContent className="max-w-6xl overflow-hidden p-0 sm:max-w-[95vw]">
        {/* ── Dialog header ─────────────────────────────────────── */}
        <div className="border-b border-border/60 bg-muted/30 px-6 py-4">
          <DialogHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="space-y-0.5">
                <DialogTitle className="text-base">Review preview</DialogTitle>
                <DialogDescription className="text-xs">
                  {workspaceName
                    ? `Using current settings for ${workspaceName}.`
                    : "Updates live as you edit settings."}
                </DialogDescription>
              </div>

              {/* Status pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant={
                    settings.ai.reviewer.enabled ? "default" : "secondary"
                  }
                  className="text-xs"
                >
                  {settings.ai.reviewer.enabled
                    ? "AI reviewer on"
                    : "AI reviewer off"}
                </Badge>
                <Badge
                  variant={
                    settings.reviews.behavior.context.contextAware
                      ? "outline"
                      : "secondary"
                  }
                  className="text-xs"
                >
                  {settings.reviews.behavior.context.contextAware
                    ? "Context-aware"
                    : "Context off"}
                </Badge>
                <Badge
                  variant={
                    settings.ai.tools.allowRepositoryOverrides
                      ? "outline"
                      : "secondary"
                  }
                  className="text-xs"
                >
                  {settings.ai.tools.allowRepositoryOverrides
                    ? "Repo overrides on"
                    : "Repo overrides locked"}
                </Badge>
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <ScrollArea className="max-h-[calc(90vh-5.5rem)]">
          <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
            {/* ── Left column: GitHub-style comment card ──── */}
            <div className="space-y-0">
              {/*
               * Outer wrapper mimics GitHub's PR timeline comment:
               * rounded border with a header bar and content area.
               */}
              <div className="overflow-hidden rounded-md border border-border/70 shadow-sm">
                {/* Comment header — GitHub's gray author bar */}
                <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border/60">
                    <GitPalMark className="size-3.5" />
                  </div>

                  <span className="font-semibold text-foreground text-sm">
                    gitpal
                  </span>
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    bot
                  </Badge>

                  <Separator orientation="vertical" className="mx-0.5 h-3.5" />

                  {/* PR metadata */}
                  <span className="flex items-center gap-1 text-muted-foreground text-xs">
                    <GitBranchIcon className="size-3" />
                    {preview.pullRequest.sourceBranch}
                  </span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <span className="flex items-center gap-1 text-muted-foreground text-xs">
                    <GitMergeIcon className="size-3" />
                    {preview.pullRequest.targetBranch}
                  </span>

                  <Separator orientation="vertical" className="mx-0.5 h-3.5" />

                  <span className="flex items-center gap-1 text-muted-foreground text-xs">
                    <UserIcon className="size-3" />
                    {preview.pullRequest.authorLogin ?? "unknown"}
                  </span>

                  {/* PR number — right-aligned */}
                  <Badge
                    variant="secondary"
                    className="ml-auto h-5 px-1.5 text-[10px] font-mono"
                  >
                    #{preview.pullRequest.number}
                  </Badge>
                </div>

                {/* Sub-header: repo + description */}
                <div className="border-b border-border/40 bg-muted/10 px-4 py-2">
                  <p className="text-muted-foreground text-xs">
                    <span className="font-mono font-medium text-foreground">
                      {preview.repository.fullName}
                    </span>
                    {preview.repository.description && (
                      <> · {preview.repository.description}</>
                    )}
                  </p>
                </div>

                {/* Comment body */}
                <div className="space-y-7 bg-background px-5 py-5">
                  {/* Summary */}
                  {settings.reviews.summary.highLevelSummary ? (
                    <GhSection
                      title="Summary"
                      icon={<InfoIcon className="size-3.5" />}
                    >
                      <p className="text-foreground">{preview.summary}</p>
                    </GhSection>
                  ) : (
                    <div className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-3 text-muted-foreground text-sm">
                      High-level summaries are disabled for this workspace.
                    </div>
                  )}

                  {/* Walkthrough */}
                  <GhSection
                    title="Walkthrough"
                    icon={<GitMergeIcon className="size-3.5" />}
                  >
                    {/* Inlined summary blockquote */}
                    {settings.reviews.summary.highLevelSummary &&
                      settings.reviews.summary.highLevelSummaryInWalkthrough &&
                      preview.summary && (
                        <blockquote className="border-l-[3px] border-primary/50 pl-4 text-muted-foreground italic">
                          {preview.summary}
                        </blockquote>
                      )}

                    <p className="text-foreground">{preview.walkthrough}</p>

                    {/* Changed files table */}
                    {settings.reviews.walkthrough.changedFilesSummary && (
                      <div className="overflow-hidden rounded-md border border-border/60">
                        <div className="border-b border-border/40 bg-muted/30 px-4 py-2 text-xs font-medium text-foreground">
                          Changed files &nbsp;
                          <span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                            {visibleFiles.length}
                          </span>
                        </div>
                        {visibleFiles.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[30rem] text-sm">
                              <thead>
                                <tr className="border-b border-border/40 bg-muted/10 text-left text-xs text-muted-foreground">
                                  <th className="px-4 py-2 font-medium">
                                    File
                                  </th>
                                  <th className="px-4 py-2 font-medium">
                                    Summary
                                  </th>
                                  <th className="px-4 py-2 text-right font-medium">
                                    Δ
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleFiles.map((file) => (
                                  <tr
                                    key={file.path}
                                    className="border-b border-border/30 last:border-0 hover:bg-muted/20"
                                  >
                                    <td className="px-4 py-2">
                                      <FilePath path={file.path} />
                                    </td>
                                    <td className="px-4 py-2 text-muted-foreground text-xs">
                                      {file.summary}
                                    </td>
                                    <td className="px-4 py-2 text-right font-mono text-xs">
                                      <span className="text-green-600 dark:text-green-400">
                                        +{file.additions}
                                      </span>
                                      <span className="text-muted-foreground">
                                        /
                                      </span>
                                      <span className="text-red-500 dark:text-red-400">
                                        -{file.deletions}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="px-4 py-3 text-muted-foreground text-sm">
                            All changed files are filtered out by the current
                            path rules.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sequence diagram */}
                    {settings.reviews.walkthrough.sequenceDiagrams &&
                      preview.sequenceDiagram && (
                        <details
                          className="group rounded-md border border-border/60"
                          open
                        >
                          <summary className="flex cursor-pointer select-none items-center gap-2 border-b border-border/40 bg-muted/30 px-4 py-2 text-xs font-medium text-foreground">
                            Sequence diagram
                          </summary>
                          <pre className="overflow-x-auto bg-muted/20 p-4 text-xs leading-6 text-foreground">
                            <code>{preview.sequenceDiagram}</code>
                          </pre>
                        </details>
                      )}

                    {/* Review effort */}
                    {settings.reviews.walkthrough.estimateCodeReviewEffort &&
                      preview.reviewEffort && (
                        <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/20 px-4 py-3 text-sm">
                          <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
                          <span className="text-foreground">
                            Review effort:&nbsp;
                            <strong>
                              {preview.reviewEffort.score} —{" "}
                              {preview.reviewEffort.label}
                            </strong>
                            &nbsp;·&nbsp;~{preview.reviewEffort.minutes} min
                          </span>
                        </div>
                      )}

                    {/* Related work */}
                    {preview.relatedWork.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Related
                        </p>
                        <div className="space-y-2">
                          {preview.relatedWork.map((item) => (
                            <div
                              key={`${item.kind}-${item.number}`}
                              className="flex items-start gap-3 rounded-md border border-border/60 bg-background/80 px-4 py-3"
                            >
                              <Badge
                                variant="outline"
                                className="shrink-0 text-xs"
                              >
                                {item.kind === "issue" ? "Issue" : "PR"}
                              </Badge>
                              <div className="min-w-0 space-y-0.5">
                                <a
                                  href={item.htmlUrl}
                                  className="font-medium text-foreground text-sm underline-offset-4 hover:underline"
                                >
                                  #{item.number} {item.title}
                                </a>
                                <p className="text-muted-foreground text-xs">
                                  {item.reason}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Suggested reviewers */}
                    {preview.suggestedReviewers.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          Suggested reviewers:
                        </span>
                        {preview.suggestedReviewers.map((reviewer) => (
                          <Badge
                            key={reviewer}
                            variant="outline"
                            className="gap-1 text-xs"
                          >
                            <UserIcon className="size-3" />
                            {reviewer}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Poem easter egg */}
                    {preview.poem && (
                      <details className="group rounded-md border border-border/60">
                        <summary className="flex cursor-pointer select-none items-center gap-2 bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
                          🎭 Poem
                        </summary>
                        <pre className="whitespace-pre-wrap bg-background/80 px-5 py-4 text-sm leading-7 text-foreground">
                          {preview.poem}
                        </pre>
                      </details>
                    )}
                  </GhSection>

                  {/* Findings */}
                  <GhSection
                    title="Findings"
                    icon={<AlertCircleIcon className="size-3.5" />}
                  >
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
                      <div className="flex items-center gap-2 rounded-md border border-dashed border-border/60 bg-muted/10 px-4 py-3 text-muted-foreground text-sm">
                        <CheckCircleIcon className="size-4 text-green-500 shrink-0" />
                        No findings raised in this preview.
                      </div>
                    )}
                  </GhSection>

                  {/* Pre-merge checks */}
                  {preview.preMergeChecks.length > 0 && (
                    <GhSection
                      title="Pre-merge checks"
                      icon={<CheckCircleIcon className="size-3.5" />}
                    >
                      {preview.preMergeChecks.map((check) => (
                        <CheckRow
                          key={check.name}
                          name={check.name}
                          details={check.details}
                          status={check.status}
                        />
                      ))}
                    </GhSection>
                  )}

                  {/* Suggested labels */}
                  {preview.suggestedLabels.length > 0 && (
                    <GhSection
                      title="Suggested labels"
                      icon={<TagIcon className="size-3.5" />}
                    >
                      <div className="flex flex-wrap gap-1.5">
                        {preview.suggestedLabels.map((label) => (
                          <Badge
                            key={label}
                            variant="outline"
                            className="rounded-full text-xs"
                          >
                            {label}
                          </Badge>
                        ))}
                      </div>
                    </GhSection>
                  )}
                </div>
              </div>
            </div>

            {/* ── Right sidebar ──────────────────────────── */}
            <div className="space-y-4">
              {/* Settings snapshot */}
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <SlidersHorizontalIcon className="size-3.5" />
                    Settings snapshot
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border/40 p-0 text-sm">
                  {preview.notes.map((note) => (
                    <div
                      key={note}
                      className="px-4 py-2.5 text-muted-foreground text-xs leading-5"
                    >
                      {note}
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Model routing */}
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <CpuIcon className="size-3.5" />
                    Model routing
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y divide-border/40 p-0">
                  {[
                    { label: "Reviewer", model: settings.ai.reviewer.modelId },
                    {
                      label: "Walkthrough",
                      model: settings.reviews.walkthrough.modelId,
                    },
                    {
                      label: "Labeler",
                      model: settings.ai.labeler.modelId,
                      muted: !settings.ai.labeler.enabled,
                    },
                    { label: "Fun", model: settings.fun.modelId },
                  ].map(({ label, model, muted }) => (
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
                        className="font-mono text-[10px]"
                      >
                        {model}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Tools */}
              <Card className="overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <WrenchIcon className="size-3.5" />
                    Tools
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/10 text-xs">
                          <TableHead className="py-2 pl-4">Tool</TableHead>
                          <TableHead className="py-2">Mode</TableHead>
                          <TableHead className="py-2 pr-4">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.toolRows.map((tool) => (
                          <TableRow key={tool.id} className="text-xs">
                            <TableCell className="pl-4 py-2.5">
                              <div className="font-medium text-foreground leading-tight">
                                {tool.label}
                              </div>
                              {tool.note && (
                                <p className="mt-0.5 text-muted-foreground text-[10px] leading-tight">
                                  {tool.note}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Badge
                                variant={
                                  tool.mode === "mcp" ? "secondary" : "outline"
                                }
                                className="text-[10px]"
                              >
                                {toolModeLabel(tool.type, tool.mode)}
                              </Badge>
                            </TableCell>
                            <TableCell className="pr-4 py-2.5">
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
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="border-t border-border/40 px-4 py-3 text-[11px] leading-5 text-muted-foreground">
                    Built-in tools run via GitPal's provider adapters. MCP
                    entries proxy configured servers; repo overrides are only
                    honoured when the workspace policy permits them.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
