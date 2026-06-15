import { Badge } from "@gitpal/ui/components/badge";
import { buttonVariants } from "@gitpal/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@gitpal/ui/components/card";
import { Separator } from "@gitpal/ui/components/separator";
import Link from "next/link";
import type { ReactNode } from "react";

import { GitPalMark } from "./gitpal-mark";

// --- Types & Data ---

type AIFeature = {
  title: string;
  description: string;
  tag: string;
};

type Benchmark = {
  metric: string;
  label: string;
  context: string;
};

type WorkflowStep = {
  step: string;
  title: string;
  description: string;
};

const aiFeatures: AIFeature[] = [
  {
    title: "Context-Aware Analysis",
    description:
      "GitPal doesn't just read the diff. It parses your AST, maps file dependencies, and reads linked Jira/Linear issues to understand the blast radius of a change.",
    tag: "Intelligence",
  },
  {
    title: "One-Click Auto-Fixes",
    description:
      "Stop copying and pasting from chat windows. GitPal suggests code changes directly in the PR thread that you can commit with a single click.",
    tag: "Workflow",
  },
  {
    title: "Conversational PRs",
    description:
      "Reply directly to GitPal's comments to ask questions, challenge its assumptions, or ask it to generate missing unit tests.",
    tag: "Agentic",
  },
  {
    title: "Pre-Merge IDE & CLI",
    description:
      "Run reviews locally before you even push. Catch logical errors, hallucinations, and code smells right in VS Code or your terminal.",
    tag: "Shift-Left",
  },
];

const benchmarks: Benchmark[] = [
  {
    metric: "51.2%",
    label: "F1 Bug Detection Score",
    context: "Ranked #1 against diff-only AI tools on open-source benchmarks.",
  },
  {
    metric: "40%",
    label: "Cycle Time Reduction",
    context: "Average decrease in PR queue time for teams with 10+ engineers.",
  },
  {
    metric: "95%+",
    label: "Edge-Case Coverage",
    context:
      "Routinely catches off-by-ones, race conditions, and null pointers.",
  },
];

const workflowSteps: WorkflowStep[] = [
  {
    step: "01",
    title: "Open a Pull Request",
    description:
      "GitPal triggers automatically. It reads the new commits, cross-references your custom guidelines (.gitpal.yaml), and runs linter/SAST integrations.",
  },
  {
    step: "02",
    title: "Review the AI Feedback",
    description:
      "Within 2 minutes, GitPal posts a comprehensive PR summary, a sequence diagram of architectural changes, and inline line-by-line comments for actual bugs.",
  },
  {
    step: "03",
    title: "Chat, Fix, and Merge",
    description:
      "Apply one-click fixes, ask the bot to elaborate on a security risk, and merge with confidence knowing the edge cases were covered.",
  },
];

// --- Micro-Components ---

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary backdrop-blur-sm">
      <span className="mr-2 flex h-2 w-2 rounded-full bg-primary animate-pulse" />
      {children}
    </div>
  );
}

function SectionHeading({
  label,
  title,
  description,
  centered = false,
}: {
  label: string;
  title: string;
  description: string;
  centered?: boolean;
}) {
  return (
    <div
      className={`space-y-4 max-w-3xl ${
        centered ? "mx-auto text-center flex flex-col items-center" : ""
      }`}
    >
      <SectionLabel>{label}</SectionLabel>
      <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl text-foreground text-balance">
        {title}
      </h2>
      <p className="text-lg text-muted-foreground leading-relaxed text-balance">
        {description}
      </p>
    </div>
  );
}

function PrimaryAction({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href="/login"
      className={buttonVariants({
        size: "lg",
        className: `rounded-full px-8 shadow-[0_0_40px_-10px_rgba(var(--primary),0.5)] transition-all hover:scale-105 hover:shadow-[0_0_60px_-15px_rgba(var(--primary),0.6)] ${className}`,
      })}
    >
      {children}
    </Link>
  );
}

function SecondaryAction({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={buttonVariants({
        variant: "secondary",
        size: "lg",
        className:
          "rounded-full px-8 backdrop-blur-md transition-all hover:bg-secondary/80",
      })}
    >
      {children}
    </a>
  );
}

function PreviewCard() {
  return (
    <div className="relative group perspective-[2000px] w-full">
      <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-primary/30 via-transparent to-primary/10 opacity-50 blur-2xl transition-opacity duration-500 group-hover:opacity-100" />
      <Card className="relative overflow-hidden border-border/50 bg-background/60 backdrop-blur-xl shadow-2xl transition-transform duration-500 md:hover:rotate-y-[-2deg] md:hover:rotate-x-[2deg]">
        <CardHeader className="border-b border-border/50 bg-muted/20 pb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex space-x-2">
              <div className="h-3 w-3 rounded-full bg-destructive/80" />
              <div className="h-3 w-3 rounded-full bg-amber-500/80" />
              <div className="h-3 w-3 rounded-full bg-emerald-500/80" />
            </div>
            <span className="font-mono text-xs text-muted-foreground bg-background/80 px-2.5 py-1 rounded-md border border-border/50">
              acme/core-api #1042
            </span>
          </div>
          <CardTitle className="text-lg md:text-xl text-foreground/90 font-medium">
            Catching the bugs diffs miss.
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0">
          <div className="grid lg:grid-cols-[1fr_280px] divide-y lg:divide-y-0 lg:divide-x divide-border/50">
            {/* Diff Section */}
            <div className="p-4 md:p-6 font-mono text-[13px] leading-relaxed bg-[#0d1117]/80 text-slate-300 overflow-x-auto">
              <div className="flex min-w-max">
                <span className="w-10 text-slate-600 select-none text-right pr-4">
                  44
                </span>
                <span>
                  async function processCheckout(userId: string) &#123;
                </span>
              </div>
              <div className="flex min-w-max">
                <span className="w-10 text-slate-600 select-none text-right pr-4">
                  45
                </span>
                <span> const user = await db.users.findById(userId);</span>
              </div>
              <div className="flex min-w-max bg-emerald-500/15 text-emerald-400 my-1 -mx-4 md:-mx-6 px-4 md:px-6 py-1">
                <span className="w-10 opacity-50 select-none text-right pr-4">
                  46
                </span>
                <span>+ return executeTransaction(user.accountId);</span>
              </div>
              <div className="flex min-w-max">
                <span className="w-10 text-slate-600 select-none text-right pr-4">
                  47
                </span>
                <span>&#125;</span>
              </div>

              {/* GitPal AI Comment */}
              <div className="mt-6 ml-4 md:ml-10 rounded-lg border border-primary/30 bg-primary/10 p-4 font-sans text-sm shadow-inner relative max-w-2xl">
                <div className="absolute -left-3 top-4 h-6 w-6 rounded-full bg-background border border-primary/50 flex items-center justify-center shadow-sm">
                  <span className="text-[10px]">🚨</span>
                </div>
                <div className="flex justify-between items-start mb-2">
                  <div className="font-semibold text-primary flex items-center gap-2">
                    GitPal AI
                    <Badge
                      variant="secondary"
                      className="text-[9px] h-4 px-1.5 bg-primary/20 text-primary"
                    >
                      CRITICAL
                    </Badge>
                  </div>
                </div>
                <p className="text-foreground/90 leading-relaxed mb-4">
                  Potential Null Reference Exception.{" "}
                  <code className="bg-background px-1 py-0.5 rounded text-xs text-primary">
                    db.users.findById
                  </code>{" "}
                  can return{" "}
                  <code className="bg-background px-1 py-0.5 rounded text-xs">
                    null
                  </code>{" "}
                  if the user isn't found, which will cause{" "}
                  <code className="bg-background px-1 py-0.5 rounded text-xs">
                    user.accountId
                  </code>{" "}
                  to throw. You need to handle the null case.
                </p>
                <div className="bg-background/80 rounded border border-border/50 p-3 font-mono text-xs text-slate-300">
                  <div className="text-emerald-400">
                    + if (!user) throw new NotFoundError("User not found");
                  </div>
                  <div> return executeTransaction(user.accountId);</div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded hover:bg-primary/90 transition-colors">
                    Commit Fix
                  </button>
                  <button className="bg-secondary text-secondary-foreground text-xs font-medium px-3 py-1.5 rounded hover:bg-secondary/80 transition-colors">
                    Reply
                  </button>
                </div>
              </div>
            </div>

            {/* Metadata Sidebar */}
            <div className="p-6 bg-muted/10 flex flex-col justify-center">
              <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-4">
                Analysis Context
              </h4>
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    AST Depth
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-[85%]" />
                    </div>
                    <span className="text-xs font-mono">Cross-file</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Confidence Score
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-amber-500 w-[92%]" />
                    </div>
                    <span className="text-xs font-mono">92%</span>
                  </div>
                </div>
                <Separator className="bg-border/50 my-4" />
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    Typescript
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    Control Flow
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Main Page ---

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background text-foreground selection:bg-primary/30">
      {/* Global Background Effects */}
      <div className="fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/5 via-background to-background" />
      <div className="fixed inset-0 z-[-1] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.15] mix-blend-overlay pointer-events-none" />

      {/* HERO SECTION */}
      <section className="relative pt-32 pb-20 md:pt-48 md:pb-32 px-4 overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center">
          <SectionLabel>Senior-level reviews, instantly.</SectionLabel>

          <h1 className="mt-8 text-5xl md:text-7xl font-extrabold tracking-tighter max-w-4xl text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/70 text-balance">
            Cut code review time and bugs in half.
          </h1>

          <p className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed text-balance">
            Your team moves fast with AI. We make sure every line still earns
            its merge. GitPal is an autonomous agent that reviews PRs, enforces
            standards, and catches the edge cases humans skim past.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <PrimaryAction className="w-full sm:w-auto">
              Install on GitHub
            </PrimaryAction>
            <SecondaryAction href="#features">See it in action</SecondaryAction>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground font-mono">
            <span>✓ Auto-generates PR summaries</span>
            <span className="hidden sm:inline">•</span>
            <span>✓ 1-Click Code Fixes</span>
            <span className="hidden sm:inline">•</span>
            <span>✓ Integrates with GitHub & GitLab</span>
          </div>
        </div>

        <div className="mt-20 md:mt-24 max-w-5xl mx-auto px-4 sm:px-6">
          <PreviewCard />
        </div>
      </section>

      {/* DATA & BENCHMARKS SECTION */}
      <section className="py-16 px-4 border-t border-border/40 bg-muted/5">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-border/50">
            {benchmarks.map((b) => (
              <div key={b.label} className="pt-8 md:pt-0 px-4">
                <div className="text-4xl md:text-5xl font-bold text-foreground mb-2 tracking-tighter">
                  {b.metric}
                </div>
                <div className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">
                  {b.label}
                </div>
                <p className="text-sm text-muted-foreground max-w-[250px] mx-auto text-balance">
                  {b.context}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CORE FEATURES SECTION */}
      <section id="features" className="py-24 px-4 relative overflow-hidden">
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div className="relative z-10">
            <SectionHeading
              label="Beyond the Diff"
              title="A reviewer that actually understands your codebase."
              description="Standard AI tools just summarize line changes. GitPal reads your entire repository, maps module dependencies, and learns your custom coding conventions to provide high-signal, low-noise feedback."
            />

            <div className="mt-8 flex flex-wrap gap-3">
              {[
                "AST Parsing",
                "Cross-File Reasoning",
                "Custom .yaml Rules",
                "Security Focused",
              ].map((item) => (
                <Badge
                  key={item}
                  variant="secondary"
                  className="px-4 py-2 text-sm rounded-full bg-muted/50 border-border/50 hover:bg-muted/80 transition-colors font-medium"
                >
                  {item}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4 relative z-10">
            {aiFeatures.map((feature) => (
              <Card
                key={feature.title}
                className="bg-background/60 backdrop-blur-sm border-border/50 hover:bg-muted/10 transition-colors"
              >
                <CardContent className="p-6">
                  <Badge variant="outline" className="mb-4 bg-background">
                    {feature.tag}
                  </Badge>
                  <h3 className="font-semibold text-lg mb-2 text-foreground">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW SECTION */}
      <section
        id="workflow"
        className="py-24 px-4 bg-muted/5 border-y border-border/40"
      >
        <div className="max-w-4xl mx-auto">
          <SectionHeading
            label="How it works"
            title="Chat with your PRs."
            description="Turn static reviews into collaborative conversations. GitPal fits seamlessly into your existing Git platform."
            centered
          />

          <div className="mt-20 relative">
            <div className="absolute left-7 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-primary/50 via-border to-transparent md:-translate-x-1/2" />

            <div className="space-y-12">
              {workflowSteps.map((step, index) => (
                <div
                  key={step.step}
                  className={`relative flex flex-col md:flex-row items-start md:items-center gap-8 ${
                    index % 2 === 0 ? "md:flex-row-reverse" : ""
                  }`}
                >
                  {/* Timeline Node */}
                  <div className="absolute left-7 md:left-1/2 w-10 h-10 -translate-x-1/2 rounded-full bg-background border-2 border-primary flex items-center justify-center font-mono text-sm font-bold shadow-[0_0_15px_rgba(var(--primary),0.3)] z-10">
                    {step.step}
                  </div>

                  {/* Content Card */}
                  <div
                    className={`ml-16 md:ml-0 w-[calc(100%-4rem)] md:w-1/2 ${
                      index % 2 === 0
                        ? "md:pl-16 text-left"
                        : "md:pr-16 text-left md:text-right"
                    }`}
                  >
                    <Card className="border-border/50 bg-background/50 hover:border-primary/30 transition-colors shadow-sm">
                      <CardContent className="p-6">
                        <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                        <p className="text-muted-foreground leading-relaxed">
                          {step.description}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA SECTION */}
      <section className="py-24 md:py-32 px-4 relative">
        <div className="max-w-5xl mx-auto">
          <div className="relative rounded-[2.5rem] overflow-hidden border border-primary/20 bg-primary/5 px-6 py-20 text-center sm:px-16 shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent opacity-60" />

            <div className="relative z-10 flex flex-col items-center">
              <SectionLabel>Stop waiting on manual reviews</SectionLabel>
              <h2 className="mt-6 text-4xl sm:text-5xl font-bold tracking-tight text-foreground max-w-2xl text-balance">
                Vibe code with confidence.
              </h2>
              <p className="mt-6 text-lg text-muted-foreground max-w-xl text-balance">
                Install GitPal in 2 clicks. Usage-based pricing ensures you only
                pay for the work the system actually does.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
                <PrimaryAction className="w-full sm:w-auto">
                  Try it for Free
                </PrimaryAction>
                <SecondaryAction href="/docs">Read the Docs</SecondaryAction>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border/40 bg-background/50 backdrop-blur-lg">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <Link href="/" className="flex items-center gap-3 group w-fit">
              <div className="bg-primary/10 p-2 rounded-lg group-hover:bg-primary/20 transition-colors">
                <GitPalMark className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-bold text-foreground tracking-tight text-lg">
                  GitPal
                </p>
                <p className="text-muted-foreground text-sm">
                  Autonomous AI code review.
                </p>
              </div>
            </Link>

            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 text-sm font-medium text-muted-foreground">
              <Link
                className="hover:text-primary transition-colors"
                href="#features"
              >
                Features
              </Link>
              <Link
                className="hover:text-primary transition-colors"
                href="/pricing"
              >
                Pricing
              </Link>
              <Link
                className="hover:text-primary transition-colors"
                href="#workflow"
              >
                Workflow
              </Link>
              <Separator
                orientation="vertical"
                className="h-4 hidden md:block"
              />
              <Link
                className="text-foreground hover:text-primary transition-colors"
                href="/login"
              >
                Sign in &rarr;
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
