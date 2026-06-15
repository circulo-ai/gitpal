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

type Feature = {
	title: string;
	description: string;
	label: string;
};

type SecuritySignal = {
	title: string;
	description: string;
};

type WorkflowStep = {
	step: string;
	title: string;
	description: string;
};

const features: Feature[] = [
	{
		title: "Context-aware analysis",
		description:
			"GitPal reads the diff, the nearby code, and the surrounding repository context so the feedback points at real risk instead of noisy style chatter.",
		label: "Reasoning",
	},
	{
		title: "One-click fixes",
		description:
			"Turn a review note into a patch without hopping between the PR, your editor, and chat. The intent stays attached to the code it belongs to.",
		label: "Workflow",
	},
	{
		title: "Conversational comments",
		description:
			"Reply to GitPal like a teammate. Ask for examples, challenge an assumption, or request a narrower fix and keep the thread in one place.",
		label: "Chat",
	},
	{
		title: "Shift-left review",
		description:
			"Catch the same edge cases before merge that you would normally discover after CI or during a slow manual pass through the PR.",
		label: "Pre-merge",
	},
];

const securitySignals: SecuritySignal[] = [
	{
		title: "Cloud and self-hosted",
		description:
			"GitPal supports GitHub.com, GitHub Enterprise Server, GitLab.com, and self-managed GitLab without changing the public app flow.",
	},
	{
		title: "Auth stays centralized",
		description:
			"Better Auth handles the login boundary, so OAuth, SSO, and the callback flow stay consistent across the web app and the API.",
	},
	{
		title: "Webhook-first by design",
		description:
			"The new git package is structured around adapters and webhook verification so future providers can slot in without rewriting business logic.",
	},
];

const workflowSteps: WorkflowStep[] = [
	{
		step: "01",
		title: "Connect your host",
		description:
			"Sign in with GitHub, GitLab, or a self-hosted provider and point GitPal at the repository you want reviewed.",
	},
	{
		step: "02",
		title: "Read the review",
		description:
			"GitPal posts a focused summary, marks the risky lines, and explains why the change matters in the context of your codebase.",
	},
	{
		step: "03",
		title: "Apply and merge",
		description:
			"Use the suggested fix, reply for clarification, and merge once the comment thread tells a complete story.",
	},
];

function SectionHeading({
	eyebrow,
	title,
	description,
	centered = false,
}: {
	eyebrow?: string;
	title: string;
	description: string;
	centered?: boolean;
}) {
	return (
		<div
			className={`space-y-4 ${centered ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}`}
		>
			{eyebrow ? (
				<p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.3em]">
					{eyebrow}
				</p>
			) : null}
			<h2 className="text-balance font-semibold text-3xl text-foreground tracking-[-0.04em] sm:text-4xl lg:text-5xl">
				{title}
			</h2>
			<p className="text-balance text-base text-muted-foreground leading-7 sm:text-lg">
				{description}
			</p>
		</div>
	);
}

function ActionLink({
	href,
	variant = "default",
	children,
	className = "",
}: {
	href: string;
	variant?: "default" | "outline";
	children: ReactNode;
	className?: string;
}) {
	const linkClassName = buttonVariants({
		variant,
		size: "lg",
		className,
	});

	if (href.startsWith("#")) {
		return (
			<a href={href} className={linkClassName}>
				{children}
			</a>
		);
	}

	return (
		<Link href={href as never} className={linkClassName}>
			{children}
		</Link>
	);
}

function PreviewShell() {
	return (
		<div className="relative isolate w-full">
			<div className="absolute -inset-4 rounded-[2rem] bg-[radial-gradient(circle_at_20%_20%,rgba(92,145,255,0.18),transparent_35%),radial-gradient(circle_at_85%_15%,rgba(255,166,110,0.16),transparent_28%),radial-gradient(circle_at_50%_85%,rgba(255,255,255,0.08),transparent_26%)] opacity-80 blur-2xl" />

			<div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1020] text-white shadow-[0_30px_80px_-24px_rgba(2,8,23,0.85)] ring-1 ring-white/5">
				<div className="flex items-center justify-between border-white/10 border-b px-5 py-4">
					<div className="flex items-center gap-2.5">
						<span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
						<span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
						<span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
					</div>
					<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-[11px] text-white/70 uppercase tracking-[0.24em]">
						acme/payments · feature/retry
					</span>
				</div>

				<div className="grid lg:grid-cols-[1.08fr_0.92fr]">
					<div className="border-white/10 border-b lg:border-white/10 lg:border-r lg:border-b-0">
						<div className="border-white/10 border-b px-5 py-4 text-white/55 text-xs">
							Review preview
						</div>
						<div className="space-y-1 px-5 py-5 font-mono text-[13px] text-slate-300 leading-6">
							<div className="flex gap-4">
								<span className="w-8 shrink-0 text-right text-white/25">
									41
								</span>
								<span>const user = await db.users.findById(userId);</span>
							</div>
							<div className="flex gap-4 rounded-xl bg-emerald-400/10 px-3 py-1 text-emerald-200">
								<span className="w-8 shrink-0 text-right text-emerald-200/50">
									42
								</span>
								<span>+ if (!user) return notFound();</span>
							</div>
							<div className="flex gap-4">
								<span className="w-8 shrink-0 text-right text-white/25">
									43
								</span>
								<span>return executeTransaction(user.accountId);</span>
							</div>
						</div>
						<div className="border-white/10 border-t px-5 py-4">
							<div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
								<div className="flex items-center justify-between gap-3">
									<div className="font-semibold text-sm text-white">GitPal</div>
									<Badge
										variant="secondary"
										className="bg-amber-400/15 text-amber-100 hover:bg-amber-400/15"
									>
										Blocking
									</Badge>
								</div>
								<p className="mt-3 text-sm text-white/75 leading-6">
									`db.users.findById` can return `null`. Guard the lookup before
									you dereference `accountId`, otherwise the PR ships a runtime
									exception.
								</p>
								<div className="mt-4 flex flex-wrap gap-2">
									<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/75 text-xs">
										Suggested fix attached
									</span>
									<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-white/75 text-xs">
										Reply in thread
									</span>
								</div>
								<div className="mt-4 flex gap-2">
									<span className="rounded-full bg-white px-3 py-1.5 font-medium text-slate-950 text-xs">
										Commit fix
									</span>
									<span className="rounded-full border border-white/10 bg-transparent px-3 py-1.5 font-medium text-white/80 text-xs">
										Keep review open
									</span>
								</div>
							</div>
						</div>
					</div>

					<div className="space-y-4 bg-[#10192d] p-5">
						<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
							<div className="flex items-center justify-between text-white/55 text-xs">
								<span>Review scope</span>
								<span>3 files changed</span>
							</div>
							<div className="mt-4 grid grid-cols-3 gap-2 text-center text-white/55 text-xs">
								<div className="rounded-xl border border-white/10 bg-white/5 px-2 py-3">
									Context
								</div>
								<div className="rounded-xl border border-white/10 bg-white/5 px-2 py-3">
									Review note
								</div>
								<div className="rounded-xl border border-white/10 bg-white/5 px-2 py-3">
									One-click fix
								</div>
							</div>
						</div>

						<div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
							<div className="font-semibold text-white/45 text-xs uppercase tracking-[0.24em]">
								What GitPal sees
							</div>
							<div className="mt-4 space-y-3 text-sm text-white/75">
								<div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
									<span>Diff context</span>
									<span className="text-white/45">2 files</span>
								</div>
								<div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
									<span>Suggested patch</span>
									<span className="text-white/45">1 change</span>
								</div>
								<div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
									<span>Webhook dispatch</span>
									<span className="text-white/45">Ready</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function SignalCard({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<Card className="border-border/70 bg-white/75 shadow-sm backdrop-blur-sm">
			<CardHeader className="space-y-3 pb-3">
				<div className="flex items-center gap-2">
					<span className="h-2 w-2 rounded-full bg-primary" />
					<span className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.22em]">
						Signal
					</span>
				</div>
				<CardTitle className="text-xl tracking-[-0.03em]">{title}</CardTitle>
			</CardHeader>
			<CardContent className="pt-0 text-muted-foreground text-sm leading-6">
				{description}
			</CardContent>
		</Card>
	);
}

function FeatureCard({ feature }: { feature: Feature }) {
	return (
		<Card className="border-border/70 bg-white/80 shadow-sm backdrop-blur-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg">
			<CardHeader className="space-y-3">
				<Badge
					variant="outline"
					className="w-fit border-border/80 bg-background/80 text-[11px] text-muted-foreground uppercase tracking-[0.22em]"
				>
					{feature.label}
				</Badge>
				<CardTitle className="text-xl tracking-[-0.03em]">
					{feature.title}
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-0 text-muted-foreground text-sm leading-6">
				{feature.description}
			</CardContent>
		</Card>
	);
}

function WorkflowCard({ step }: { step: WorkflowStep }) {
	return (
		<div className="relative rounded-[1.5rem] border border-border/70 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
			<div className="flex items-center justify-between">
				<div className="font-semibold text-muted-foreground text-sm uppercase tracking-[0.24em]">
					{step.step}
				</div>
				<div className="h-2.5 w-2.5 rounded-full bg-primary/80" />
			</div>
			<h3 className="mt-5 font-semibold text-foreground text-xl tracking-[-0.03em]">
				{step.title}
			</h3>
			<p className="mt-3 text-muted-foreground text-sm leading-6">
				{step.description}
			</p>
		</div>
	);
}

export default function LandingPage() {
	return (
		<main className="min-h-svh bg-[#f6f8fc] text-foreground selection:bg-primary/20">
			<div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(77,118,255,0.08),transparent_25%),radial-gradient(circle_at_90%_10%,rgba(255,153,102,0.12),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.8)_0%,rgba(246,248,252,1)_100%)]" />
			<div className="fixed inset-0 -z-10 bg-[linear-gradient(rgba(17,24,39,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(17,24,39,0.025)_1px,transparent_1px)] opacity-60 [background-size:30px_30px]" />

			<section className="relative px-4 pt-16 pb-16 sm:px-6 md:pt-20 md:pb-20 lg:px-8 lg:pt-24 lg:pb-24">
				<div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.02fr_0.98fr]">
					<div className="space-y-8">
						<div className="space-y-6">
							<h1 className="max-w-3xl text-balance font-semibold text-4xl text-slate-950 tracking-[-0.06em] sm:text-5xl lg:text-[4.9rem] lg:leading-[0.95]">
								Pull requests that get real reviews.
							</h1>

							<p className="max-w-2xl text-balance text-lg text-slate-700 leading-8 sm:text-xl">
								GitPal reads the diff, the surrounding code, and your team’s
								rules so the first pass catches the bugs humans usually skim
								past.
							</p>
						</div>

						<div className="flex flex-col gap-3 sm:flex-row">
							<ActionLink
								href="/login"
								className="bg-[#10192d] text-white hover:bg-[#18243d]"
							>
								Install GitPal
							</ActionLink>
							<ActionLink
								href="#workflow"
								variant="outline"
								className="border-slate-300 bg-white text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50"
							>
								See the workflow
							</ActionLink>
						</div>

						<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-slate-600 text-sm">
							<span>Works with cloud and self-hosted installs</span>
							<span className="hidden sm:inline">•</span>
							<span>OAuth, SSO, and webhook aware</span>
							<span className="hidden sm:inline">•</span>
							<span>Designed for GitHub and GitLab teams</span>
						</div>
					</div>

					<PreviewShell />
				</div>
			</section>

			<section
				id="security"
				className="border-border/60 border-y bg-white/55 px-4 py-16 backdrop-blur-sm sm:px-6 lg:px-8"
			>
				<div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
					<SectionHeading
						eyebrow="Security"
						title="Production-friendly by default."
						description="The auth flow stays on the server, the frontend redirects to the app origin, and the universal git package is shaped around verified webhooks and provider adapters."
					/>

					<div className="grid gap-4 md:grid-cols-3">
						{securitySignals.map((signal) => (
							<SignalCard key={signal.title} {...signal} />
						))}
					</div>
				</div>
			</section>

			<section id="features" className="px-4 py-20 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-7xl">
					<SectionHeading
						eyebrow="Features"
						title="A reviewer that understands the codebase."
						description="The page now reflects the product more honestly: fewer generic claims, more concrete signals, and a preview that looks like the actual workflow users will touch."
						centered
					/>

					<div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						{features.map((feature) => (
							<FeatureCard key={feature.title} feature={feature} />
						))}
					</div>
				</div>
			</section>

			<section
				id="workflow"
				className="border-border/60 border-y bg-[#eef2f8] px-4 py-20 sm:px-6 lg:px-8"
			>
				<div className="mx-auto max-w-7xl">
					<div className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
						<SectionHeading
							eyebrow="Workflow"
							title="Start in one place and keep the thread there."
							description="GitPal is built to move review context forward instead of scattering it across chat, your editor, and the PR timeline."
						/>

						<div className="grid gap-4 md:grid-cols-3">
							{workflowSteps.map((step) => (
								<WorkflowCard key={step.step} step={step} />
							))}
						</div>
					</div>
				</div>
			</section>

			<section className="px-4 py-20 sm:px-6 lg:px-8">
				<div className="mx-auto max-w-7xl">
					<div className="relative overflow-hidden rounded-[2rem] border border-primary/15 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(22,32,55,0.96))] px-6 py-14 text-white shadow-[0_24px_70px_-30px_rgba(15,23,42,0.9)] sm:px-10 lg:px-14 lg:py-16">
						<div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(124,156,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,163,108,0.14),transparent_24%)]" />
						<div className="relative grid gap-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center">
							<div className="space-y-5">
								<h2 className="max-w-2xl text-balance font-semibold text-3xl tracking-[-0.05em] sm:text-4xl lg:text-5xl">
									Put GitPal on the next pull request.
								</h2>
								<p className="max-w-2xl text-balance text-base text-white/72 leading-7 sm:text-lg">
									Install once, connect your providers, and let the review flow
									stay inside the tools your team already trusts.
								</p>
							</div>

							<div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
								<ActionLink
									href="/login"
									className="bg-white text-slate-950 hover:bg-white/90"
								>
									Install GitPal
								</ActionLink>
								<ActionLink
									href="#features"
									variant="outline"
									className="border-white/15 bg-white/5 text-white hover:bg-white/10"
								>
									Explore features
								</ActionLink>
							</div>
						</div>
					</div>
				</div>
			</section>

			<footer className="border-border/60 border-t bg-white/70 px-4 py-10 backdrop-blur-sm sm:px-6 lg:px-8">
				<div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
					<Link href="/" className="flex items-center gap-3">
						<GitPalMark className="size-8 text-[0.68rem]" />
						<div>
							<div className="font-semibold text-base tracking-[-0.03em]">
								GitPal
							</div>
							<div className="text-muted-foreground text-sm">
								AI review that keeps up with the code.
							</div>
						</div>
					</Link>

					<div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-muted-foreground text-sm">
						<a className="transition hover:text-foreground" href="#security">
							Security
						</a>
						<a className="transition hover:text-foreground" href="#features">
							Features
						</a>
						<a className="transition hover:text-foreground" href="#workflow">
							Workflow
						</a>
						<Separator orientation="vertical" className="hidden h-4 lg:block" />
						<Link className="transition hover:text-foreground" href="/login">
							Sign in
						</Link>
					</div>
				</div>
			</footer>
		</main>
	);
}
