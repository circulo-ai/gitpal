import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@gitpal/ui/components/badge";
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
	Alert01Icon,
	ArrowRight01Icon,
	CheckIcon,
	CodeIcon,
	FileDiffIcon,
	GithubIcon,
	GitlabIcon,
	GitCompareIcon,
	GitPullRequestIcon,
	Key01Icon,
	MessageSquareCodeIcon,
	OpenSourceIcon,
	SecurityCheckIcon,
	ServerStack03Icon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import { GitPalMark } from "./gitpal-mark";

type PlatformCardData = {
	name: string;
	description: string;
	icon: IconSvgElement;
	support: string;
};

type PillarCardData = {
	title: string;
	description: string;
	icon: IconSvgElement;
};

type StepCardData = {
	number: string;
	title: string;
	description: string;
	icon: IconSvgElement;
};

const platformCards: PlatformCardData[] = [
	{
		name: "GitHub Cloud",
		description:
			"Connect GitHub.com and keep pull request review in the place your team already uses.",
		icon: GithubIcon,
		support: "Cloud",
	},
	{
		name: "GitHub Enterprise Server",
		description:
			"Run GitPal beside your enterprise GitHub deployment with the same review flow.",
		icon: GithubIcon,
		support: "Enterprise",
	},
	{
		name: "GitLab.com",
		description:
			"Support GitLab merge requests with review context that feels native to the project.",
		icon: GitlabIcon,
		support: "Cloud",
	},
	{
		name: "Self-managed GitLab",
		description:
			"Keep GitPal inside your private GitLab environment and preserve your policy boundary.",
		icon: GitlabIcon,
		support: "Self-managed",
	},
];

const pillarCards: PillarCardData[] = [
	{
		title: "Open source",
		description:
			"Audit the code, extend the workflow, and keep the product in the open.",
		icon: OpenSourceIcon,
	},
	{
		title: "Bring your own model",
		description:
			"Route review jobs through the LLM provider your team already trusts.",
		icon: Key01Icon,
	},
	{
		title: "Enterprise SSO",
		description:
			"Use a real enterprise identity layer for controlled access across teams.",
		icon: SecurityCheckIcon,
	},
	{
		title: "Self-hosted",
		description:
			"Run GitPal where your code and compliance rules already live.",
		icon: ServerStack03Icon,
	},
];

const workflowSteps: StepCardData[] = [
	{
		number: "01",
		title: "Connect your host",
		description:
			"Sign in with GitHub or GitLab, then choose the cloud or enterprise deployment that matches your repo.",
		icon: GitCompareIcon,
	},
	{
		number: "02",
		title: "GitPal builds context",
		description:
			"It reads the diff, related files, and your guidance before it writes a review your team can trust.",
		icon: FileDiffIcon,
	},
	{
		number: "03",
		title: "Feedback lands in the PR",
		description:
			"Inline notes, summaries, and questions stay in the pull request or merge request thread.",
		icon: MessageSquareCodeIcon,
	},
];

const reviewNotes = [
	{
		title: "Context gathered",
		description: "4 files, linked issue, and environment config.",
		icon: GitCompareIcon,
	},
	{
		title: "Risk flagged",
		description: "Timeout logic can drift across installs.",
		icon: Alert01Icon,
	},
	{
		title: "Suggested fix",
		description: "Move the value behind one env-backed setting.",
		icon: SparklesIcon,
	},
];

function PrimaryLink({
	href,
	children,
	className,
}: {
	href: "/login";
	children: ReactNode;
	className?: string;
}) {
	return (
		<Link
			href={href}
			className={cn(
				"inline-flex h-12 items-center justify-center rounded-full border border-transparent bg-[linear-gradient(135deg,#ff7a3d_0%,#f066b1_100%)] px-5 text-sm font-medium text-white shadow-[0_18px_45px_rgba(240,102,177,0.22)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_24px_55px_rgba(240,102,177,0.26)]",
				className,
			)}
		>
			{children}
		</Link>
	);
}

function SecondaryLink({
	href,
	children,
	className,
}: {
	href: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<a
			href={href}
			className={cn(
				"inline-flex h-12 items-center justify-center rounded-full border border-white/12 bg-white/5 px-5 text-sm font-medium text-white/90 transition duration-200 hover:border-white/20 hover:bg-white/10",
				className,
			)}
		>
			{children}
		</a>
	);
}

function HeroPreview() {
	return (
		<Card className="relative overflow-hidden border-white/10 bg-[#17141b]/95 shadow-[0_32px_90px_rgba(0,0,0,0.42)]">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,122,61,0.12),transparent_28%),radial-gradient(circle_at_82%_18%,rgba(240,102,177,0.14),transparent_26%)]" />
			<CardHeader className="relative gap-4 border-b border-white/10 px-6 py-5">
				<div className="flex flex-wrap items-center gap-2">
					<Badge
						variant="outline"
						className="rounded-full border-white/10 bg-white/5 text-white/75"
					>
						GitHub
					</Badge>
					<Badge
						variant="outline"
						className="rounded-full border-white/10 bg-white/5 text-white/75"
					>
						GitLab
					</Badge>
				</div>
				<div className="flex items-start justify-between gap-4">
					<div className="flex items-start gap-3">
						<div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
							<HugeiconsIcon icon={GitPullRequestIcon} size={20} />
						</div>
						<div className="space-y-1">
							<CardTitle className="text-base font-semibold">
								acme/payments-api
							</CardTitle>
							<CardDescription className="max-w-[28ch] text-xs text-white/50">
								Pull request #482 · feature/timeout-config · 7 files changed
							</CardDescription>
						</div>
					</div>
					<Badge
						variant="outline"
						className="rounded-full border-[#ff8d57]/25 bg-[#2a1915] text-[#ffbf96]"
					>
						Needs attention
					</Badge>
				</div>
			</CardHeader>
			<CardContent className="relative grid gap-0 p-0 lg:grid-cols-[1.18fr_0.82fr]">
				<div className="border-b border-white/10 lg:border-b-0 lg:border-r lg:border-white/10">
					<div className="flex items-center justify-between border-b border-white/10 px-6 py-3 text-[11px] text-white/45">
						<span>src/payments/charge.ts</span>
						<span>Review summary</span>
					</div>
					<div className="space-y-4 px-6 py-5 font-mono text-[12px] leading-6">
						<div className="text-white/45">
							<span className="text-white/24">1</span>{" "}
							{`diff --git a/src/payments/charge.ts b/src/payments/charge.ts`}
						</div>
						<div className="rounded-2xl border border-white/10 bg-[#100f14] p-4">
							<div className="flex gap-3">
								<span className="w-5 text-right text-white/25">12</span>
								<span className="text-white/62">
									const retries = Math.max(1, config.retries);
								</span>
							</div>
							<div className="flex gap-3">
								<span className="w-5 text-right text-white/25">13</span>
								<span className="text-[#ff9f75]">- const timeout = 5000;</span>
							</div>
							<div className="flex gap-3">
								<span className="w-5 text-right text-white/25">13</span>
								<span className="text-[#7fdcff]">
									+ const timeout = env.REQUEST_TIMEOUT_MS ?? 5000;
								</span>
							</div>
							<div className="flex gap-3">
								<span className="w-5 text-right text-white/25">14</span>
								<span className="text-white/62">
									if (!response.ok) throw new Error("Payment provider unavailable");
								</span>
							</div>
						</div>
					</div>
					<div className="px-6 pb-6">
						<div className="rounded-2xl border border-[#ff8d57]/18 bg-[#261915] p-4">
							<div className="flex items-center gap-2 text-sm font-medium">
								<HugeiconsIcon icon={SparklesIcon} size={18} />
								GitPal review
							</div>
							<p className="mt-2 text-sm leading-6 text-white/72">
								This timeout is hard-coded in a path that also runs on
								self-managed installs. Move it behind a single env-backed
								setting so GitHub and GitLab deployments stay consistent.
							</p>
							<div className="mt-3 flex flex-wrap gap-2">
								<Badge
									variant="outline"
									className="rounded-full border-white/10 bg-white/5 text-white/68"
								>
									Inline comment
								</Badge>
								<Badge
									variant="outline"
									className="rounded-full border-white/10 bg-white/5 text-white/68"
								>
									Suggestion
								</Badge>
							</div>
						</div>
					</div>
				</div>

				<div className="space-y-4 p-6">
					<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
						<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-white/40">
							<HugeiconsIcon icon={CodeIcon} size={14} />
							Context
						</div>
						<p className="mt-3 text-sm leading-6 text-white/72">
							GitPal reads the diff, related files, and nearby config before it
							writes a review.
						</p>
					</div>
					<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
						<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-white/40">
							<HugeiconsIcon icon={Alert01Icon} size={14} />
							Risk
						</div>
						<p className="mt-3 text-sm leading-6 text-white/72">
							It flags migration drift, edge cases, and policy mismatches before
							the PR merges.
						</p>
					</div>
					<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
						<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-white/40">
							<HugeiconsIcon icon={MessageSquareCodeIcon} size={14} />
							Delivery
						</div>
						<p className="mt-3 text-sm leading-6 text-white/72">
							Summaries and inline comments land in the same PR or merge request
							thread your team already monitors.
						</p>
					</div>
					<div className="rounded-2xl border border-white/10 bg-[#141118] p-4">
						<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-white/40">
							<HugeiconsIcon icon={GitCompareIcon} size={14} />
							Supported flows
						</div>
						<div className="mt-3 flex flex-wrap gap-2">
							<Badge
								variant="outline"
								className="rounded-full border-white/10 bg-white/5 text-white/75"
							>
								Cloud
							</Badge>
							<Badge
								variant="outline"
								className="rounded-full border-white/10 bg-white/5 text-white/75"
							>
								Enterprise
							</Badge>
							<Badge
								variant="outline"
								className="rounded-full border-white/10 bg-white/5 text-white/75"
							>
								Self-managed
							</Badge>
						</div>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function PlatformCardItem({
	name,
	description,
	icon,
	support,
}: PlatformCardData) {
	return (
		<Card className="border-white/10 bg-white/5 transition duration-300 hover:-translate-y-1 hover:border-white/16 hover:bg-white/7">
			<CardHeader className="gap-4">
				<div className="flex items-start justify-between gap-3">
					<div className="flex items-center gap-3">
						<div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
							<HugeiconsIcon icon={icon} size={22} />
						</div>
						<div>
							<CardTitle className="text-lg font-semibold">{name}</CardTitle>
							<CardDescription className="mt-1 max-w-[24ch] text-sm text-white/58">
								{description}
							</CardDescription>
						</div>
					</div>
					<Badge
						variant="outline"
						className="rounded-full border-white/10 bg-white/5 text-white/70"
					>
						{support}
					</Badge>
				</div>
			</CardHeader>
		</Card>
	);
}

function PillarCardItem({ title, description, icon }: PillarCardData) {
	return (
		<div className="rounded-3xl border border-white/10 bg-white/5 p-5 transition duration-300 hover:-translate-y-1 hover:border-white/16 hover:bg-white/7">
			<div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
				<HugeiconsIcon icon={icon} size={20} />
			</div>
			<h3 className="mt-4 font-semibold text-lg tracking-tight">{title}</h3>
			<p className="mt-2 max-w-[28ch] text-sm leading-6 text-white/62">
				{description}
			</p>
		</div>
	);
}

function WorkflowStepItem({ number, title, description, icon }: StepCardData) {
	return (
		<div className="rounded-3xl border border-white/10 bg-white/5 p-6">
			<div className="flex items-start gap-4">
				<div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xs font-semibold tracking-[0.2em] text-white/75">
					{number}
				</div>
				<div className="flex-1 space-y-3">
					<div className="flex items-center gap-2">
						<HugeiconsIcon icon={icon} size={18} />
						<h3 className="font-semibold text-lg tracking-tight">{title}</h3>
					</div>
					<p className="text-sm leading-6 text-white/62">{description}</p>
				</div>
			</div>
		</div>
	);
}

export default function LandingPage() {
	return (
		<main className="relative isolate overflow-hidden">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_14%,rgba(255,122,61,0.16),transparent_25%),radial-gradient(circle_at_80%_16%,rgba(240,102,177,0.14),transparent_26%),radial-gradient(circle_at_50%_70%,rgba(255,255,255,0.04),transparent_28%)]" />
			<div className="pointer-events-none absolute inset-0 opacity-[0.1] [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:26px_26px]" />

			<section
				id="product"
				className="relative mx-auto grid max-w-[1440px] gap-12 px-4 pb-18 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pb-28 lg:pt-16"
			>
				<div className="flex flex-col justify-center">
					<h1 className="max-w-[15ch] text-balance font-semibold text-5xl leading-[0.96] tracking-[-0.06em] sm:text-6xl lg:text-[4.55rem]">
						Code review that understands GitHub and GitLab.
					</h1>

					<div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
						<PrimaryLink href="/login">Sign in</PrimaryLink>
						<SecondaryLink href="#workflow">See the workflow</SecondaryLink>
					</div>

					<p className="mt-6 max-w-[34ch] text-pretty text-base leading-7 text-white/68 sm:text-lg">
						GitPal pulls in repo context, flags risk early, and leaves review
						notes where engineers already work. Open source, BYOK ready, and
						built for cloud or self-managed installs.
					</p>

					<div className="mt-8 flex flex-wrap gap-3">
						<Badge
							variant="outline"
							className="rounded-full border-white/10 bg-white/5 px-3 py-1.5 text-white/72"
						>
							GitHub + GitLab
						</Badge>
						<Badge
							variant="outline"
							className="rounded-full border-white/10 bg-white/5 px-3 py-1.5 text-white/72"
						>
							Cloud + enterprise
						</Badge>
						<Badge
							variant="outline"
							className="rounded-full border-white/10 bg-white/5 px-3 py-1.5 text-white/72"
						>
							Open source + BYOK
						</Badge>
					</div>

				</div>

				<div className="flex items-center lg:justify-end">
					<HeroPreview />
				</div>
			</section>

			<section
				id="platforms"
				className="relative mx-auto max-w-[1440px] px-4 py-18 sm:px-6 lg:px-8 lg:py-24"
			>
				<div className="max-w-2xl">
					<p className="text-xs font-medium uppercase tracking-[0.28em] text-white/40">
						Platform support
					</p>
					<h2 className="mt-4 text-balance font-semibold text-3xl tracking-[-0.04em] sm:text-4xl lg:text-[2.85rem]">
						Use the host your team already trusts.
					</h2>
					<p className="mt-5 max-w-[52ch] text-pretty text-base leading-7 text-white/62 sm:text-lg">
						GitPal supports GitHub.com, GitHub Enterprise Server, GitLab.com,
						and self-managed GitLab with the same review experience in every
						deployment model.
					</p>
				</div>

				<div className="mt-10 grid gap-4 md:grid-cols-2">
					{platformCards.map((card) => (
						<PlatformCardItem key={card.name} {...card} />
					))}
				</div>
			</section>

			<section
				id="security"
				className="relative mx-auto max-w-[1440px] px-4 py-18 sm:px-6 lg:px-8 lg:py-24"
			>
				<Card className="overflow-hidden border-white/10 bg-[#151219]/90 shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
					<CardContent className="grid gap-10 p-6 sm:p-8 lg:grid-cols-[1.02fr_0.98fr] lg:p-10">
						<div className="space-y-6">
							<div className="space-y-4">
								<p className="text-xs font-medium uppercase tracking-[0.28em] text-white/40">
									Security and control
								</p>
								<h2 className="text-balance font-semibold text-3xl tracking-[-0.04em] sm:text-4xl lg:text-[2.75rem]">
									Keep the model, the data, and the deployment under your own
									control.
								</h2>
								<p className="max-w-[52ch] text-pretty text-base leading-7 text-white/62 sm:text-lg">
									GitPal is open source, supports BYOK, and is designed for
									cloud or self-managed GitHub and GitLab environments. Add
									enterprise SSO when the org needs a stronger access boundary.
								</p>
							</div>

							<div className="space-y-3">
								{pillarCards.map((pillar) => (
									<PillarCardItem key={pillar.title} {...pillar} />
								))}
							</div>
						</div>

						<div className="rounded-[2rem] border border-white/10 bg-[#110f14] p-6 sm:p-7">
							<div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
								<div>
									<p className="text-xs font-medium uppercase tracking-[0.24em] text-white/40">
										Deployment path
									</p>
									<p className="mt-2 text-sm text-white/72">
										Connect your host, choose your model, keep ownership.
									</p>
								</div>
								<Badge
									variant="outline"
									className="rounded-full border-white/10 bg-white/5 text-white/72"
								>
									SSO
								</Badge>
							</div>

							<div className="mt-6 space-y-4">
								<div className="rounded-3xl border border-white/10 bg-white/5 p-4">
									<div className="flex items-center justify-between">
										<div className="flex items-center gap-3">
											<div className="flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
												<HugeiconsIcon icon={GithubIcon} size={20} />
											</div>
											<div>
												<p className="font-medium">GitHub or GitLab</p>
												<p className="text-sm text-white/52">
													Your source of truth.
												</p>
											</div>
										</div>
										<HugeiconsIcon icon={ArrowRight01Icon} size={18} />
									</div>
								</div>

								<div className="flex items-center justify-center">
									<div className="flex size-10 items-center justify-center rounded-full border border-[#ff8d57]/25 bg-[#2a1915]">
										<HugeiconsIcon icon={SparklesIcon} size={18} />
									</div>
								</div>

								<div className="grid gap-4 sm:grid-cols-2">
									<div className="rounded-3xl border border-white/10 bg-white/5 p-4">
										<p className="text-xs font-medium uppercase tracking-[0.24em] text-white/40">
											GitPal
										</p>
										<p className="mt-3 text-sm leading-6 text-white/68">
											Review routing, policy checks, and inline comments.
										</p>
									</div>
									<div className="rounded-3xl border border-white/10 bg-white/5 p-4">
										<p className="text-xs font-medium uppercase tracking-[0.24em] text-white/40">
											Your model
										</p>
										<p className="mt-3 text-sm leading-6 text-white/68">
											Bring your own provider or run the stack inside your own
											infrastructure.
										</p>
									</div>
								</div>
							</div>

							<div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
								<div className="flex flex-wrap gap-2">
									<Badge
										variant="outline"
										className="rounded-full border-white/10 bg-white/5 text-white/72"
									>
										Open source
									</Badge>
									<Badge
										variant="outline"
										className="rounded-full border-white/10 bg-white/5 text-white/72"
									>
										BYOK
									</Badge>
									<Badge
										variant="outline"
										className="rounded-full border-white/10 bg-white/5 text-white/72"
									>
										Enterprise SSO
									</Badge>
									<Badge
										variant="outline"
										className="rounded-full border-white/10 bg-white/5 text-white/72"
									>
										Self-hosted
									</Badge>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</section>

			<section
				id="workflow"
				className="relative mx-auto max-w-[1440px] px-4 py-18 sm:px-6 lg:px-8 lg:py-24"
			>
				<div className="max-w-2xl">
					<p className="text-xs font-medium uppercase tracking-[0.28em] text-white/40">
						Workflow
					</p>
					<h2 className="mt-4 text-balance font-semibold text-3xl tracking-[-0.04em] sm:text-4xl lg:text-[2.75rem]">
						A review loop that feels like part of the repo, not another tool.
					</h2>
					<p className="mt-5 max-w-[52ch] text-pretty text-base leading-7 text-white/62 sm:text-lg">
						GitPal keeps the useful parts of review close to the change itself:
						context, explanation, and the next concrete step.
					</p>
				</div>

				<div className="mt-10 grid gap-4 lg:grid-cols-3">
					{workflowSteps.map((step) => (
						<WorkflowStepItem key={step.number} {...step} />
					))}
				</div>

				<div className="mt-10 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
					<div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 sm:p-8">
						<div className="flex items-center gap-3">
							<div className="flex size-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
								<HugeiconsIcon icon={CheckIcon} size={18} />
							</div>
							<div>
								<p className="text-xs font-medium uppercase tracking-[0.24em] text-white/40">
									What reviewers get
								</p>
								<p className="mt-1 text-sm text-white/62">
									Short, clear notes with enough context to decide quickly.
								</p>
							</div>
						</div>

						<div className="mt-6 grid gap-3 sm:grid-cols-3">
							{reviewNotes.map((note) => (
								<div
									key={note.title}
									className="rounded-3xl border border-white/10 bg-[#151219] p-4"
								>
									<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.24em] text-white/40">
										<HugeiconsIcon icon={note.icon} size={14} />
										{note.title}
									</div>
									<p className="mt-3 text-sm leading-6 text-white/68">
										{note.description}
									</p>
								</div>
							))}
						</div>
					</div>

					<div className="rounded-[2rem] border border-[#ff8d57]/18 bg-[linear-gradient(180deg,rgba(255,122,61,0.14),rgba(240,102,177,0.1))] p-6 sm:p-8">
						<p className="text-xs font-medium uppercase tracking-[0.28em] text-white/45">
							Ready to connect?
						</p>
						<h3 className="mt-4 text-balance font-semibold text-2xl tracking-[-0.04em] sm:text-[2rem]">
							Sign in with GitHub or GitLab and start the first review.
						</h3>
						<p className="mt-4 max-w-[34ch] text-sm leading-6 text-white/68">
							Use the host you already have, keep the deployment model you need,
							and let GitPal do the first pass on the diff.
						</p>
						<div className="mt-7 flex flex-wrap gap-3">
							<PrimaryLink href="/login">Sign in</PrimaryLink>
							<SecondaryLink href="#product">Back to top</SecondaryLink>
						</div>
					</div>
				</div>
			</section>

			<footer className="relative mx-auto max-w-[1440px] px-4 pb-10 pt-8 sm:px-6 lg:px-8">
				<Separator className="bg-white/10" />
				<div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
					<Link href="/" className="flex items-center gap-3">
						<GitPalMark className="size-8 text-[0.68rem]" />
						<div>
							<p className="font-semibold tracking-tight">GitPal</p>
							<p className="text-xs text-white/45">
								Open source AI code review for GitHub and GitLab.
							</p>
						</div>
					</Link>

					<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/52">
						<a className="transition hover:text-white" href="#platforms">
							Platforms
						</a>
						<a className="transition hover:text-white" href="#security">
							Security
						</a>
						<a className="transition hover:text-white" href="#workflow">
							Workflow
						</a>
						<Link className="transition hover:text-white" href="/login">
							Sign in
						</Link>
					</div>
				</div>
			</footer>
		</main>
	);
}
