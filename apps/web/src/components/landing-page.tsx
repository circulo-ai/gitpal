import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@gitpal/ui/components/card";
import { Separator } from "@gitpal/ui/components/separator";
import { cn } from "@gitpal/ui/lib/utils";
import {
  GithubIcon,
  GitlabIcon,
  AiBrain01Icon,
  ArrowRight01Icon,
  BubbleChatIcon,
  CheckmarkCircle02Icon,
  FlashIcon,
  GitBranchIcon,
  Shield01Icon,
  SparklesIcon,
  LockIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { GitPalMark } from "./gitpal-mark";
import { PrReviewCard } from "@/components/pr-review-card";
import { Reveal } from "@/components/reveal";
import { InstallButtons } from "./install-buttons";

type HugeIcon = typeof FlashIcon;

type Feature = { icon: HugeIcon; title: string; description: string };
type WorkflowStep = { icon: HugeIcon; title: string; description: string };

const navLinks = ["Features", "Workflow", "Integrations", "Docs"] as const;

const features: Feature[] = [
  {
    icon: AiBrain01Icon,
    title: "Insightful by default",
    description:
      "GitPal understands your codebase and context to deliver relevant, actionable feedback on every change.",
  },
  {
    icon: Shield01Icon,
    title: "Consistent standards",
    description:
      "Enforce best practices across your team with customizable rules and organization-wide guidelines.",
  },
  {
    icon: FlashIcon,
    title: "Faster reviews",
    description:
      "Automate the repetitive checks so your team can focus on what really matters — design and impact.",
  },
];

const workflowSteps: WorkflowStep[] = [
  {
    icon: GitBranchIcon,
    title: "Open a pull / merge request",
    description: "Push your changes as usual. GitPal kicks off automatically.",
  },
  {
    icon: SparklesIcon,
    title: "AI analyzes the changes",
    description:
      "We review the diff, understand the context, and check for issues.",
  },
  {
    icon: BubbleChatIcon,
    title: "Get clear feedback",
    description:
      "Receive actionable comments and suggestions right in your PR.",
  },
  {
    icon: CheckmarkCircle02Icon,
    title: "Merge with confidence",
    description:
      "Ship higher quality code, faster, with your standards intact.",
  },
];

const heroPills: {
  icon: HugeIcon;
  label: string;
}[] = [
  { icon: FlashIcon, label: "Setup in < 1 min" },
  { icon: LockIcon, label: "Secure by design" },
  { icon: CheckmarkCircle02Icon, label: "Loved by devs" },
] as const;

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
      {eyebrow ? (
        <Badge
          variant="secondary"
          className="rounded-full px-3 py-1 font-medium text-[0.78rem] text-muted-foreground"
        >
          {eyebrow}
        </Badge>
      ) : null}
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

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <Card className="group relative h-full overflow-hidden border-border/70 bg-card/60 shadow-sm backdrop-blur transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-primary/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <CardHeader className="gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-background shadow-sm transition-all duration-300 group-hover:-rotate-3 group-hover:border-primary/40">
          <HugeiconsIcon
            icon={Icon}
            className="size-6 stroke-[1.7] text-primary"
          />
        </div>
        <div className="space-y-2">
          <CardTitle className="text-[1.15rem] tracking-[-0.03em]">
            {feature.title}
          </CardTitle>
          <CardDescription className="text-[0.92rem] leading-6">
            {feature.description}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Link
          href="/login"
          className="inline-flex w-fit items-center gap-2 font-medium text-[0.92rem] text-primary transition-all hover:gap-3"
        >
          Learn more
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
        </Link>
      </CardContent>
    </Card>
  );
}

function WorkflowCard({ step, index }: { step: WorkflowStep; index: number }) {
  const Icon = step.icon;
  return (
    <div className="group relative flex flex-col gap-4 px-2 pt-10 text-center md:px-6 md:text-left">
      <div className="absolute top-0 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border-2 border-background bg-primary font-semibold text-[0.8rem] text-primary-foreground shadow-md transition-transform duration-300 group-hover:scale-110 md:left-6 md:translate-x-0">
        {index}
      </div>
      <div className="flex justify-center md:justify-start">
        <div className="flex size-12 items-center justify-center rounded-xl border border-border/70 bg-card transition-colors duration-300 group-hover:border-primary/40">
          <HugeiconsIcon
            icon={Icon}
            className="size-6 stroke-[1.8] text-primary"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-semibold text-[0.98rem] text-foreground leading-tight tracking-[-0.02em]">
          {step.title}
        </h3>
        <p className="mx-auto max-w-60 text-[0.85rem] text-muted-foreground leading-6 md:mx-0">
          {step.description}
        </p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="relative isolate overflow-hidden bg-background text-foreground selection:bg-primary/20">
      {/* ambient background — no theme() arbitrary values */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(120,120,140,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(120,120,140,0.07)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_at_top,#000_30%,transparent_75%)]" />
        <div className="absolute top-0 -left-24 h-[34rem] w-[34rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-14 -right-40 h-[30rem] w-[30rem] rounded-full bg-emerald-500/[0.06] blur-3xl" />
      </div>

      {/* header */}
      <header className="mx-auto grid max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-6 px-6 pt-6 sm:px-8 lg:px-10">
        <Link href="/" className="flex items-center gap-3">
          <span className="font-semibold text-[1.45rem] tracking-[-0.04em]">
            GitPal
          </span>
        </Link>
        <nav className="hidden items-center justify-center gap-10 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link}
              href={`#${link.toLowerCase()}`}
              className="relative font-medium text-[15px] text-foreground/80 transition after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-primary after:transition-all after:duration-300 hover:text-foreground hover:after:w-full"
            >
              {link}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <Button variant="ghost" render={<Link href="/login" />}>
            Log in
          </Button>
          <Button render={<Link href="/dashboard" />}>Get started</Button>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-7xl gap-14 px-6 pt-14 pb-20 sm:px-8 md:grid-cols-[0.9fr_1.1fr] md:items-center md:gap-10 md:pt-20 md:pb-24 lg:px-10">
        <Reveal className="flex max-w-xl flex-col gap-8">
          <Badge
            variant="secondary"
            className="w-fit gap-2 rounded-full px-3 py-1 font-medium text-[0.8rem]"
          >
            <span className="size-2 animate-pulse rounded-full bg-primary" />
            AI code review, on autopilot
          </Badge>
          <div className="space-y-6">
            <h1 className="max-w-[16ch] text-balance font-heading text-[clamp(3rem,5.4vw,5.25rem)] text-foreground leading-[0.95] tracking-[-0.05em]">
              Code reviews, elevated by{" "}
              <span className="text-primary">AI.</span>
            </h1>
            <p className="max-w-[30rem] text-balance text-[1.05rem] text-muted-foreground leading-8 sm:text-[1.15rem]">
              GitPal is an AI code review assistant that helps your team ship
              higher quality code, faster. Get insightful feedback, catch issues
              early, and keep your standards consistent.
            </p>
          </div>
          <InstallButtons />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2">
            {heroPills.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 whitespace-nowrap text-[0.88rem] text-foreground/75"
              >
                <HugeiconsIcon
                  icon={Icon}
                  className="size-3.5 stroke-[1.8] text-primary"
                />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120}>
          <PrReviewCard />
        </Reveal>
      </section>

      {/* features */}
      <section
        id="features"
        className="mx-auto max-w-7xl px-6 pt-16 pb-8 sm:px-8 lg:px-10 lg:pt-20"
      >
        <Reveal>
          <SectionHeading
            eyebrow="Features"
            title="Built for modern teams"
            description="Everything you need to keep code quality high without slowing your team down."
          />
        </Reveal>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 120}>
              <FeatureCard feature={feature} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* workflow */}
      <section
        id="workflow"
        className="mx-auto max-w-7xl px-6 pt-16 pb-8 sm:px-8 lg:px-10 lg:pt-20"
      >
        <Reveal>
          <SectionHeading
            eyebrow="Workflow"
            title="How GitPal works"
            description="From pull request to merge, GitPal stays in the loop so you don't have to."
          />
        </Reveal>
        <div className="relative mt-14">
          <Separator className="absolute top-4 right-0 left-0 hidden md:block" />
          <div className="grid gap-12 md:grid-cols-4 md:gap-0">
            {workflowSteps.map((step, index) => (
              <Reveal
                key={step.title}
                delay={index * 120}
                className="md:border-border/60 md:border-l md:border-dashed md:first:border-l-0"
              >
                <WorkflowCard step={step} index={index + 1} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 pt-16 pb-16 sm:px-8 lg:px-10 lg:pt-20">
        <Reveal>
          <Card className="relative overflow-hidden rounded-[1.85rem] border-0 bg-[linear-gradient(135deg,#0a1120_0%,#101b34_54%,#0a1020_100%)] p-0 text-white shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_120%,rgba(73,109,255,0.4),transparent_30%),radial-gradient(circle_at_14%_16%,rgba(255,255,255,0.06),transparent_26%)]" />
            <div className="relative grid gap-8 px-6 py-12 sm:px-8 md:grid-cols-[1.08fr_0.92fr] md:items-center md:px-12 md:py-16">
              <div className="space-y-5">
                <h2 className="font-heading text-[clamp(2.4rem,3.8vw,4rem)] leading-[0.96] tracking-tighter">
                  Better reviews.
                  <br />
                  {/* fixed: visible bright gradient instead of dark text-primary */}
                  <span className="bg-gradient-to-r from-sky-300 via-indigo-300 to-violet-300 bg-clip-text text-transparent">
                    Better code.
                  </span>
                </h2>
                <p className="max-w-[34rem] text-[0.98rem] text-white/70 leading-7 sm:text-[1rem]">
                  Join thousands of developers shipping with confidence.
                </p>
              </div>
              <div className="flex flex-col items-start gap-4 md:items-end">
                <InstallButtons tone="dark" />
                <div className="flex items-center gap-2 text-[0.95rem] text-white/65">
                  <HugeiconsIcon icon={LockIcon} className="size-4" />
                  <span>No credit card required</span>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute -right-16 -bottom-16 h-48 w-72 rounded-full bg-primary/20 blur-3xl" />
          </Card>
        </Reveal>
      </section>
    </main>
  );
}
