import { Badge } from "@gitpal/ui/components/badge";
import { buttonVariants } from "@gitpal/ui/components/button";
import { cn } from "@gitpal/ui/lib/utils";
import { GithubIcon, GitlabIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  FileCode2,
  Files,
  GitBranch,
  GitCommitHorizontal,
  House,
  Lock,
  type LucideIcon,
  MessageSquareText,
  MoreHorizontal,
  PanelLeft,
  Settings,
  Shield,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { GitPalMark } from "./gitpal-mark";

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  variant?: "default" | "outline";
  className?: string;
};

type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type WorkflowStep = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type PreviewNavItem = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
};

type DiffLine = {
  line: number;
  code: string;
  kind?: "base" | "added" | "removed";
};

const navLinks = ["Features", "Integrations", "Docs"] as const;

const features: Feature[] = [
  {
    icon: BrainCircuit,
    title: "Insightful by default",
    description:
      "GitPal understands your codebase and context to provide relevant, actionable feedback on every change.",
  },
  {
    icon: Shield,
    title: "Consistent standards",
    description:
      "Enforce best practices across your team with customizable rules and organization-wide guidelines.",
  },
  {
    icon: Zap,
    title: "Faster reviews",
    description:
      "Automate the repetitive checks so your team can focus on what really matters-design and impact.",
  },
];

const workflowSteps: WorkflowStep[] = [
  {
    icon: GitBranch,
    title: "Open a pull / merge request",
    description: "Push your changes as usual. GitPal kicks off automatically.",
  },
  {
    icon: Sparkles,
    title: "AI analyzes the changes",
    description:
      "We review the diff, understand the context, and check for issues.",
  },
  {
    icon: MessageSquareText,
    title: "Get clear feedback",
    description:
      "Receive actionable comments and suggestions right in your PR.",
  },
  {
    icon: CheckCircle2,
    title: "Merge with confidence",
    description:
      "Ship higher quality code, faster, with your standards intact.",
  },
];

const previewNavItems: PreviewNavItem[] = [
  { icon: House, label: "Overview" },
  { icon: GitCommitHorizontal, label: "Commits" },
  { icon: Files, label: "Changes", active: true },
  { icon: CheckCircle2, label: "Checks" },
  { icon: FileCode2, label: "Files" },
];

const diffLines: DiffLine[] = [
  { line: 45, code: "const token = crypto.randomBytes(32).toString('hex');" },
  {
    line: 47,
    code: "await db.query('INSERT INTO magic_links (email, token, created_at)'",
    kind: "removed",
  },
  {
    line: 48,
    code: "await db.query('INSERT INTO magic_links (email, token, created_at, expires_at)'",
    kind: "added",
  },
  {
    line: 49,
    code: "VALUES ($1, $2, NOW(), NOW() + INTERVAL '15 minutes')",
    kind: "added",
  },
  { line: 50, code: "[email, token]);", kind: "added" },
  { line: 56, code: "return token;" },
];

function ButtonLink({
  href,
  children,
  icon,
  variant = "default",
  className,
}: ButtonLinkProps) {
  return (
    <Link
      href={href as never}
      className={cn(
        buttonVariants({
          variant,
          size: "lg",
          className: "rounded-xl px-5 text-[15px]",
        }),
        className,
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

function SectionHeading({
  title,
  description,
  className,
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-3xl flex-col items-center gap-4 text-center",
        className,
      )}
    >
      <h2 className="font-heading text-[clamp(2.25rem,3.9vw,4rem)] text-foreground leading-[0.96] tracking-[-0.045em]">
        {title}
      </h2>
      {description ? (
        <p className="max-w-2xl text-balance text-[1.05rem] text-muted-foreground leading-7 sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function FeatureColumn({ feature }: { feature: Feature }) {
  const Icon = feature.icon;

  return (
    <div className="flex flex-col gap-4 px-1 pt-6 pb-1 md:border-border/70 md:border-l md:px-8 md:first:border-l-0">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-background shadow-[0_1px_0_rgba(15,23,42,0.02)]">
        <Icon className="size-6 stroke-[1.7] text-chart-1" />
      </div>
      <div className="flex flex-col gap-2.5">
        <h3 className="font-semibold text-[1.15rem] text-foreground leading-tight tracking-[-0.03em]">
          {feature.title}
        </h3>
        <p className="max-w-68 text-[0.92rem] text-muted-foreground leading-6">
          {feature.description}
        </p>
      </div>
      <Link
        href="/login"
        className="inline-flex w-fit items-center gap-2 font-medium text-[0.92rem] text-chart-1 transition hover:gap-2.5"
      >
        Learn more
        <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function WorkflowCard({ step, index }: { step: WorkflowStep; index: number }) {
  const Icon = step.icon;

  return (
    <div className="relative flex flex-col gap-4 px-2 pt-8 text-center md:px-6 md:text-left">
      <div className="absolute top-0 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full border-2 border-background bg-chart-1 font-semibold text-[0.78rem] text-white shadow-[0_1px_10px_rgba(63,101,235,0.25)] md:left-6 md:translate-x-0">
        {index}
      </div>
      <div className="flex justify-center text-foreground md:justify-start">
        <Icon className="size-7 stroke-[1.8]" />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-semibold text-[0.95rem] text-foreground leading-tight tracking-[-0.02em]">
          {step.title}
        </h3>
        <p className="mx-auto max-w-60 text-[0.85rem] text-muted-foreground leading-6 md:mx-0">
          {step.description}
        </p>
      </div>
    </div>
  );
}

function PreviewSidebarItem({ icon, label, active = false }: PreviewNavItem) {
  const Icon = icon;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[0.7rem] leading-none",
        active ? "bg-white/6 text-white" : "text-white/60",
      )}
    >
      {active ? (
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-chart-1" />
      ) : null}
      <Icon
        className={cn("size-4", active ? "text-chart-1" : "text-inherit")}
      />
      <span>{label}</span>
    </div>
  );
}

function DiffRow({ line, code, kind = "base" }: DiffLine) {
  const rowClasses = {
    base: "text-white/75",
    removed: "bg-rose-500/14 text-rose-100",
    added: "bg-emerald-500/16 text-emerald-50",
  }[kind];

  const numberClasses = {
    base: "text-white/28",
    removed: "text-rose-200/55",
    added: "text-emerald-200/55",
  }[kind];

  const prefix = kind === "removed" ? "-" : kind === "added" ? "+" : "";

  return (
    <div
      className={cn(
        "grid grid-cols-[3.5rem_1fr] gap-3 px-3 py-1 font-mono text-[0.8rem] leading-5",
        rowClasses,
      )}
    >
      <div className={cn("text-right", numberClasses)}>{line}</div>
      <div className="flex gap-2">
        {prefix ? (
          <span className="w-3 shrink-0 text-center">{prefix}</span>
        ) : null}
        <span className="whitespace-nowrap">{code}</span>
      </div>
    </div>
  );
}

function PreviewShell() {
  return (
    <div
      className="relative isolate w-full max-w-135 justify-self-center md:w-135 md:max-w-none md:justify-self-end"
      style={{ zoom: 0.84 }}
    >
      <div className="absolute -inset-6 -z-10 rounded-[2.25rem] bg-[radial-gradient(circle_at_50%_0%,rgba(97,123,255,0.22),transparent_35%),radial-gradient(circle_at_78%_16%,rgba(18,123,94,0.12),transparent_25%),radial-gradient(circle_at_20%_86%,rgba(0,0,0,0.12),transparent_30%)] blur-2xl" />

      <div className="overflow-hidden rounded-[1.85rem] border border-white/8 bg-[#0d1424] text-white shadow-[0_30px_90px_-30px_rgba(12,18,32,0.85)] ring-1 ring-white/5">
        <div className="grid min-h-140 grid-cols-[4.75rem_1fr]">
          <aside className="flex flex-col items-center justify-between border-white/8 border-r px-2 py-3.5">
            <div className="flex w-full flex-col items-center gap-2">
              <div className="mb-2 flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/4 text-white/75">
                <PanelLeft className="size-3.5" />
              </div>
              {previewNavItems.map((item) => (
                <PreviewSidebarItem key={item.label} {...item} />
              ))}
            </div>
            <div className="flex size-8 items-center justify-center rounded-full border border-white/10 text-white/55">
              <Settings className="size-4" />
            </div>
          </aside>

          <div className="flex min-w-0 flex-col">
            <div className="flex items-start justify-between gap-4 px-4 pt-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate font-medium text-[0.98rem] tracking-[-0.02em]">
                    feat(auth): add magic link sign in
                  </h3>
                  <Badge className="h-6 rounded-full bg-chart-4/20 px-2.5 font-medium text-[0.7rem] text-chart-4 hover:bg-chart-4/20">
                    Draft
                  </Badge>
                </div>
                <p className="mt-1 text-[0.84rem] text-white/60">
                  #318 opened 2 days ago by alex
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-[0.82rem] text-emerald-200">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span>2/3 checks passed</span>
              </div>
            </div>

            <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-t-[1.4rem] border-white/8 border-t bg-white/2">
              <div className="flex items-center justify-between border-white/8 border-b px-4 py-2.5">
                <div className="flex items-center gap-2 text-[0.86rem] text-white/80">
                  <ChevronDown className="size-4 text-white/50" />
                  <span className="font-medium">src/auth/magic-link.ts</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={cn(
                      buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className:
                          "h-8 rounded-lg border-white/10 bg-white/5 px-3 text-white hover:bg-white/10",
                      }),
                    )}
                  >
                    View file
                  </button>
                  <button
                    type="button"
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </div>
              </div>

              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden px-2 py-1.5">
                <div className="overflow-hidden rounded-4xl border border-white/8 bg-[#0e1627] shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                  <div className="relative">
                    {diffLines.map((line) => (
                      <DiffRow
                        key={`${line.kind ?? "base"}-${line.line}`}
                        {...line}
                      />
                    ))}
                    <div className="absolute top-1/2 right-[-0.7rem] flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-chart-1 font-semibold text-[0.78rem] text-white shadow-[0_10px_22px_rgba(63,101,235,0.35)]">
                      1
                    </div>
                  </div>
                </div>

                <div className="mt-3 rounded-4xl border border-chart-1/25 bg-[#101a2d] px-4 py-3.5 shadow-[0_1px_0_rgba(255,255,255,0.04)]">
                  <div className="flex items-start gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-[#0d1424]">
                      <GitPalMark className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">GitPal</span>
                        <Badge className="h-5 rounded-full bg-chart-1/20 px-2 font-medium text-[0.68rem] text-chart-1 hover:bg-chart-1/20">
                          AI
                        </Badge>
                        <span className="text-[0.8rem] text-white/55">
                          just now
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        <Badge className="h-6 rounded-full bg-chart-5/20 px-2.5 font-medium text-[0.7rem] text-chart-5 hover:bg-chart-5/20">
                          High
                        </Badge>
                        <span className="text-white/35">↻</span>
                        <MoreHorizontal className="size-4 text-white/45" />
                      </div>

                      <p className="mt-2.5 max-w-136 text-[0.88rem] text-white/78 leading-[1.35]">
                        Magic links should be one-time use. Consider marking the
                        token as used (or storing a used_at timestamp) when it's
                        consumed to prevent replay attacks.
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-white/12 bg-white/3 px-3 font-medium text-[0.84rem] text-white/85 transition hover:bg-white/[0.07]"
                        >
                          Reply
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-white/12 bg-white/3 px-3 font-medium text-[0.84rem] text-white/85 transition hover:bg-white/[0.07]"
                        >
                          Apply suggestion
                        </button>
                        <div className="ml-auto flex items-center gap-3 text-white/60">
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-lg transition hover:bg-white/5 hover:text-white"
                          >
                            <ThumbsUp className="size-4" />
                          </button>
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-lg transition hover:bg-white/5 hover:text-white"
                          >
                            <ThumbsDown className="size-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-5 border-white/8 border-t px-4 py-2.5 text-[0.82rem] text-white/58">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-chart-1" />
                  <span>1 AI comment</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400" />
                  <span>0 outstanding</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-chart-5" />
                  <span>1 nit</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroPill({ icon, label }: { icon: LucideIcon; label: string }) {
  const Icon = icon;

  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-[0.88rem] text-foreground/75">
      <Icon className="size-3.5 stroke-[1.8] text-chart-1" />
      <span>{label}</span>
    </div>
  );
}

function PreviewButtons() {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <ButtonLink
        href="/login"
        icon={
          <HugeiconsIcon icon={GithubIcon} size={18} data-icon="inline-start" />
        }
        className="bg-white text-slate-950 shadow-[0_16px_28px_-20px_rgba(0,0,0,0.65)] hover:bg-white/90"
      >
        Install on GitHub
      </ButtonLink>
      <ButtonLink
        href="/login"
        variant="outline"
        icon={
          <HugeiconsIcon icon={GitlabIcon} size={18} data-icon="inline-start" />
        }
        className="border-white/15 bg-white/5 text-white shadow-sm hover:bg-white/10"
      >
        Install on GitLab
      </ButtonLink>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="relative isolate overflow-hidden bg-background text-foreground selection:bg-chart-1/20">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 -left-24 h-136 w-136 rounded-full bg-chart-1/8 blur-3xl" />
        <div className="absolute top-14 -right-40 h-120 w-120 rounded-full bg-chart-4/6 blur-3xl" />
        <div className="absolute -bottom-32 left-1/2 h-80 w-2xl -translate-x-1/2 rounded-full bg-secondary/35 blur-3xl" />
      </div>

      <header className="mx-auto grid max-w-295 grid-cols-[auto_1fr_auto] items-center gap-6 px-6 pt-6 pb-0 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <GitPalMark className="size-9 text-foreground md:size-10" />
          <span className="font-semibold text-[1.45rem] tracking-[-0.04em]">
            GitPal
          </span>
        </Link>

        <nav className="hidden items-center justify-center gap-10 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link}
              href={`#${link.toLowerCase()}`}
              className="font-medium text-[15px] text-foreground/80 transition hover:text-foreground"
            >
              {link}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="font-medium text-[15px] text-foreground/80 transition hover:text-foreground"
          >
            Log in
          </Link>
          <ButtonLink href="/login">Get started</ButtonLink>
        </div>
      </header>

      <section className="mx-auto grid max-w-295 gap-14 px-6 pt-14 pb-20 sm:px-8 md:grid-cols-[0.8fr_1.2fr] md:items-start md:gap-10 md:px-8 md:pt-20 md:pb-24 lg:px-10">
        <div className="flex max-w-124 flex-col gap-8 md:pt-16">
          <div className="space-y-6">
            <h1 className="max-w-[11.1ch] text-balance font-heading text-[clamp(3.25rem,5.8vw,5.75rem)] text-foreground leading-[0.92] tracking-[-0.06em]">
              Code reviews, elevated by{" "}
              <span className="text-chart-1">AI.</span>
            </h1>
            <p className="max-w-104 text-balance text-[1.05rem] text-muted-foreground leading-8 sm:text-[1.15rem]">
              GitPal is an AI code review assistant that helps your team ship
              higher quality code, faster. Get insightful feedback, catch issues
              early, and keep your standards consistent.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink
              href="/login"
              icon={
                <HugeiconsIcon
                  icon={GithubIcon}
                  size={18}
                  data-icon="inline-start"
                />
              }
            >
              Install on GitHub
            </ButtonLink>
            <ButtonLink
              href="/login"
              variant="outline"
              icon={
                <HugeiconsIcon
                  icon={GitlabIcon}
                  size={18}
                  data-icon="inline-start"
                />
              }
              className="border-border bg-background text-foreground shadow-sm hover:bg-background/90"
            >
              Install on GitLab
            </ButtonLink>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-2 text-foreground/70 sm:flex-nowrap sm:gap-x-6">
            <HeroPill icon={Zap} label="Setup in <1 min" />
            <HeroPill icon={Lock} label="Secure by design" />
            <HeroPill icon={CheckCircle2} label="Loved by devs" />
          </div>
        </div>

        <PreviewShell />
      </section>

      <section
        id="features"
        className="mx-auto max-w-295 px-6 pt-16 pb-8 sm:px-8 lg:px-10 lg:pt-20 lg:pb-12"
      >
        <SectionHeading title="Built for modern teams" className="max-w-4xl" />

        <div className="mt-12 grid gap-8 md:grid-cols-3 md:gap-0">
          {features.map((feature) => (
            <FeatureColumn key={feature.title} feature={feature} />
          ))}
        </div>
      </section>

      <section
        id="workflow"
        className="mx-auto max-w-295 px-6 pt-16 pb-8 sm:px-8 lg:px-10 lg:pt-20 lg:pb-12"
      >
        <SectionHeading title="How GitPal works" className="max-w-4xl" />

        <div className="relative mt-12">
          <div className="absolute top-4 right-0 left-0 hidden border-border/80 border-t md:block" />
          <div className="grid gap-12 md:grid-cols-4 md:gap-0">
            {workflowSteps.map((step, index) => (
              <div
                key={step.title}
                className="md:border-border/60 md:border-l md:border-dashed md:first:border-l-0"
              >
                <WorkflowCard step={step} index={index + 1} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-295 px-6 pt-16 pb-6 sm:px-8 lg:px-10 lg:pt-20 lg:pb-10">
        <div className="relative overflow-hidden rounded-[1.85rem] bg-[linear-gradient(135deg,#0a1120_0%,#101b34_54%,#0a1020_100%)] px-6 py-12 text-white shadow-[0_32px_80px_-34px_rgba(10,16,32,0.9)] sm:px-8 md:px-10 md:py-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_120%,rgba(73,109,255,0.4),transparent_28%),radial-gradient(circle_at_14%_16%,rgba(255,255,255,0.06),transparent_26%)]" />
          <div className="relative grid gap-8 md:grid-cols-[1.08fr_0.92fr] md:items-center">
            <div className="space-y-5">
              <h2 className="font-heading text-[clamp(2.4rem,3.8vw,4rem)] text-white leading-[0.96] tracking-tighter">
                Better reviews.
                <br />
                <span className="text-chart-1">Better code.</span>
              </h2>
              <p className="max-w-136 text-[0.98rem] text-white/72 leading-7 sm:text-[1rem]">
                Join thousands of developers shipping with confidence.
              </p>
            </div>

            <div className="flex flex-col items-start gap-4 md:items-end">
              <PreviewButtons />
              <div className="flex items-center gap-2 text-[0.95rem] text-white/65">
                <Lock className="size-4" />
                <span>No credit card required</span>
              </div>
            </div>
          </div>
          <div className="pointer-events-none absolute -right-16 -bottom-16 h-48 w-72 rounded-full bg-chart-1/20 blur-3xl" />
        </div>
      </section>
    </main>
  );
}
