import { Badge } from "@gitpal/ui/components/badge";
import { buttonVariants } from "@gitpal/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@gitpal/ui/components/card";
import { Separator } from "@gitpal/ui/components/separator";
import Link from "next/link";
import type { ReactNode } from "react";

import { GitPalMark } from "./gitpal-mark";

type HostCard = {
	title: string;
	description: string;
	label: string;
};

type ControlCard = {
	title: string;
	description: string;
	tag: string;
};

type WorkflowStep = {
	step: string;
	title: string;
	description: string;
};

type ProofPoint = {
	label: string;
	value: string;
};

const hostCards: HostCard[] = [
	{
		title: "GitHub.com",
		description: "Use deployment-wide cloud OAuth for hosted repositories.",
		label: "Cloud",
	},
	{
		title: "GitHub Enterprise Server",
		description: "Connect the host-specific OAuth app behind your firewall.",
		label: "Enterprise",
	},
	{
		title: "GitLab.com",
		description: "Keep merge request review inside the hosted GitLab flow.",
		label: "Cloud",
	},
	{
		title: "Self-managed GitLab",
		description: "Bring each private GitLab instance online with its own app.",
		label: "Self-managed",
	},
];

const controlCards: ControlCard[] = [
	{
		title: "Per-host OAuth",
		description:
			"Each enterprise Git host keeps its own credentials and callback URL.",
		tag: "Auth",
	},
	{
		title: "SAML and OIDC SSO",
		description:
			"Verified domains can route access through Better Auth's SSO flow.",
		tag: "Identity",
	},
	{
		title: "Bring your own model",
		description:
			"Choose the provider your security and compliance team already trusts.",
		tag: "Model",
	},
	{
		title: "Open source and self-hosted",
		description:
			"Run GitPal close to the repositories, policies, and logs it reads.",
		tag: "Deploy",
	},
];

const workflowSteps: WorkflowStep[] = [
	{
		step: "01",
		title: "Connect the host",
		description:
			"Sign in with GitHub or GitLab, then route the deployment through the right cloud or enterprise path.",
	},
	{
		step: "02",
		title: "Read the change",
		description:
			"GitPal looks at the diff, nearby files, and deployment context before it writes anything back.",
	},
	{
		step: "03",
		title: "Leave useful review",
		description:
			"Inline notes and summaries land in the pull request or merge request thread your team already watches.",
	},
];

const proofPoints: ProofPoint[] = [
	{
		label: "Cloud",
		value: "OAuth",
	},
	{
		label: "Enterprise",
		value: "Host-aware",
	},
	{
		label: "Control",
		value: "BYOK + SSO",
	},
];

function SectionLabel({ children }: { children: ReactNode }) {
	return (
		<Badge
			variant="outline"
			className="rounded-full border-border/80 bg-background/80 px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-[0.24em]"
		>
			{children}
		</Badge>
	);
}

function SectionHeading({
	label,
	title,
	description,
}: {
	label: string;
	title: string;
	description: string;
}) {
	return (
		<div className="max-w-2xl space-y-4">
			<SectionLabel>{label}</SectionLabel>
			<h2 className="text-balance font-heading text-3xl tracking-[-0.04em] sm:text-4xl lg:text-[2.75rem]">
				{title}
			</h2>
			<p className="max-w-[58ch] text-pretty text-base text-muted-foreground leading-7 sm:text-lg">
				{description}
			</p>
		</div>
	);
}

function PrimaryAction({ children }: { children: ReactNode }) {
	return (
		<Link href="/login" className={buttonVariants({ size: "lg" })}>
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
			className={buttonVariants({ variant: "outline", size: "lg" })}
		>
			{children}
		</a>
	);
}

function PreviewCard() {
	return (
		<Card className="overflow-hidden border-border/70 bg-card/95 shadow-[0_24px_80px_rgba(0,0,0,0.10)]">
			<CardHeader className="border-border/70 border-b bg-muted/30">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="flex flex-wrap items-center gap-2">
						<Badge className="rounded-full">GitHub</Badge>
						<Badge variant="outline" className="rounded-full">
							GitLab
						</Badge>
					</div>
					<span className="font-mono text-muted-foreground text-xs">
						acme/payments-api #482
					</span>
				</div>
				<CardTitle className="max-w-[18ch] text-2xl">
					A review surface that keeps the host and the policy visible.
				</CardTitle>
				<CardDescription className="max-w-[44ch]">
					GitPal studies the diff, then leaves guidance where engineers already
					work instead of creating a second review surface to babysit.
				</CardDescription>
			</CardHeader>

			<CardContent className="grid gap-6 p-6 lg:grid-cols-[1.08fr_0.92fr]">
				<div className="space-y-4 font-mono text-sm leading-6">
					<div className="text-muted-foreground">
						<span className="mr-3 text-muted-foreground/60">12</span>
						const retries = Math.max(1, config.retries);
					</div>
					<div className="rounded-2xl border border-border bg-muted/30 p-4">
						<div className="text-destructive">
							<span className="mr-3 text-muted-foreground/60">13</span>- const
							timeout = 5000;
						</div>
						<div className="text-primary">
							<span className="mr-3 text-muted-foreground/60">13</span>+ const
							timeout = env.REQUEST_TIMEOUT_MS ?? 5000;
						</div>
						<div className="mt-2 text-muted-foreground">
							<span className="mr-3 text-muted-foreground/60">14</span>if
							(!response.ok) throw new Error("Provider unavailable");
						</div>
					</div>

					<div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 font-sans">
						<p className="font-medium text-foreground">GitPal review</p>
						<p className="mt-2 text-muted-foreground text-sm leading-6">
							Keeping the timeout behind config avoids drift between GitHub and
							GitLab deployments, cloud or self-managed.
						</p>
					</div>
				</div>

				<div className="space-y-4">
					<div className="rounded-2xl border border-border bg-background p-4">
						<p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
							Runtime context
						</p>
						<div className="mt-4 space-y-2">
							{[
								["GitHub Enterprise Server", "host-specific OAuth"],
								["Self-managed GitLab", "host-specific OAuth"],
								["SAML / OIDC SSO", "identity boundary"],
							].map(([label, value]) => (
								<div
									key={label}
									className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2"
								>
									<span className="text-muted-foreground text-xs">{label}</span>
									<span className="font-mono text-[11px] text-foreground/80">
										{value}
									</span>
								</div>
							))}
						</div>
					</div>

					<div className="rounded-2xl border border-border bg-muted/20 p-4">
						<p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
							Callback
						</p>
						<p className="mt-3 break-all font-mono text-muted-foreground text-xs">
							/api/auth/sign-in/enterprise-git-host
						</p>
					</div>

					<div className="grid grid-cols-2 gap-3">
						{["BYOK", "Open source", "SSO", "Self-hosted"].map((item) => (
							<div
								key={item}
								className="rounded-2xl border border-border bg-card px-3 py-3 text-center font-medium text-muted-foreground text-xs"
							>
								{item}
							</div>
						))}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

function HostCardItem({ title, description, label }: HostCard) {
	return (
		<Card className="h-full border-border/70 bg-card/90 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg">
			<CardHeader className="space-y-3">
				<div className="flex items-center justify-between gap-3">
					<Badge variant="secondary" className="rounded-full">
						{label}
					</Badge>
					<span className="text-muted-foreground text-xs">Git host</span>
				</div>
				<CardTitle className="text-xl">{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
		</Card>
	);
}

function ControlCardItem({ title, description, tag }: ControlCard) {
	return (
		<Card className="h-full border-border/70 bg-card/90">
			<CardContent className="space-y-3 p-6">
				<Badge variant="outline" className="rounded-full">
					{tag}
				</Badge>
				<h3 className="font-heading font-medium text-lg tracking-[-0.02em]">
					{title}
				</h3>
				<p className="text-muted-foreground text-sm leading-6">{description}</p>
			</CardContent>
		</Card>
	);
}

function WorkflowCardItem({ step, title, description }: WorkflowStep) {
	return (
		<Card className="h-full border-border/70 bg-card/90">
			<CardContent className="space-y-4 p-6">
				<div className="flex items-center justify-between">
					<span className="font-mono text-primary text-sm">{step}</span>
					<span className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
						Step
					</span>
				</div>
				<h3 className="font-heading font-medium text-lg tracking-[-0.02em]">
					{title}
				</h3>
				<p className="text-muted-foreground text-sm leading-6">{description}</p>
			</CardContent>
		</Card>
	);
}

export default function LandingPage() {
	return (
		<main className="relative isolate overflow-hidden bg-background text-foreground">
			<div aria-hidden="true" className="pointer-events-none absolute inset-0">
				<div className="absolute top-0 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
				<div className="absolute top-40 right-[-8rem] h-72 w-72 rounded-full bg-muted/60 blur-3xl" />
				<div className="absolute inset-x-0 top-0 h-px bg-border/70" />
			</div>

			<section
				id="product"
				className="relative mx-auto grid max-w-7xl gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:px-8 lg:pt-20 lg:pb-28"
			>
				<div className="flex flex-col justify-center">
					<SectionLabel>AI code review</SectionLabel>
					<h1 className="mt-6 max-w-[12ch] text-balance font-heading text-5xl leading-[0.95] tracking-[-0.06em] sm:text-6xl lg:text-[5rem]">
						Review code for every Git host you run.
					</h1>
					<p className="mt-6 max-w-[42ch] text-pretty text-base text-muted-foreground leading-7 sm:text-lg">
						GitPal reviews pull requests and merge requests with repo context,
						policy awareness, and auth that fits cloud, enterprise, or
						self-managed deployments.
					</p>

					<div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
						<PrimaryAction>Sign in</PrimaryAction>
						<SecondaryAction href="#workflow">See workflow</SecondaryAction>
					</div>

					<div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
						{proofPoints.map((item) => (
							<div
								key={item.label}
								className="rounded-2xl border border-border/70 bg-card/80 p-4"
							>
								<p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
									{item.label}
								</p>
								<p className="mt-2 font-medium text-foreground">{item.value}</p>
							</div>
						))}
					</div>
				</div>

				<div className="flex items-center lg:justify-end">
					<PreviewCard />
				</div>
			</section>

			<section
				id="platforms"
				className="relative border-border border-y bg-muted/20"
			>
				<div className="mx-auto max-w-7xl px-4 py-18 sm:px-6 lg:px-8 lg:py-24">
					<SectionHeading
						label="Platform support"
						title="One review flow for hosted and self-managed Git hosts."
						description="GitPal keeps the same product shape whether you are signing in with cloud OAuth or a host-specific enterprise deployment."
					/>

					<div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						{hostCards.map((card) => (
							<HostCardItem key={card.title} {...card} />
						))}
					</div>
				</div>
			</section>

			<section
				id="security"
				className="relative mx-auto max-w-7xl px-4 py-18 sm:px-6 lg:px-8 lg:py-24"
			>
				<div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr]">
					<div className="rounded-[1.5rem] border border-border bg-card/80 p-6 shadow-sm sm:p-8">
						<div className="flex items-center gap-3">
							<div className="flex size-11 items-center justify-center rounded-2xl border border-border bg-primary/10 text-primary">
								<span className="font-mono font-semibold text-xs">SSO</span>
							</div>
							<div>
								<p className="font-medium text-foreground text-sm">
									Control plane
								</p>
								<p className="text-muted-foreground text-sm">
									Identity, deployment, and model control stay separate.
								</p>
							</div>
						</div>

						<h2 className="mt-8 text-balance font-heading text-3xl leading-[1.02] tracking-[-0.045em] sm:text-[2.75rem]">
							Keep the model, the data, and the deployment under your own
							control.
						</h2>
						<p className="mt-5 max-w-[45ch] text-pretty text-base text-muted-foreground leading-7">
							GitPal is built for teams that want AI review without flattening
							source control, identity, and infrastructure into one global
							setting.
						</p>

						<div className="mt-7 flex flex-wrap gap-2">
							{[
								"SAML/OIDC SSO",
								"BYOK",
								"Self-hosted",
								"Encrypted secrets",
							].map((item) => (
								<Badge key={item} variant="outline" className="rounded-full">
									{item}
								</Badge>
							))}
						</div>
					</div>

					<div className="grid content-start gap-4 sm:grid-cols-2">
						{controlCards.map((card) => (
							<ControlCardItem key={card.title} {...card} />
						))}
					</div>
				</div>
			</section>

			<section
				id="workflow"
				className="relative border-border border-y bg-muted/20"
			>
				<div className="mx-auto max-w-7xl px-4 py-18 sm:px-6 lg:px-8 lg:py-24">
					<div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
						<SectionHeading
							label="Workflow"
							title="A review loop that feels like part of the repo."
							description="GitPal keeps the useful parts of review close to the change itself: host auth, repository context, focused feedback, and the next concrete step."
						/>

						<div className="hidden items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-muted-foreground text-sm lg:flex">
							<span className="font-mono font-semibold text-primary text-xs">
								OK
							</span>
							No context-free review spam
						</div>
					</div>

					<div className="mt-10 grid gap-4 lg:grid-cols-3">
						{workflowSteps.map((step) => (
							<WorkflowCardItem key={step.step} {...step} />
						))}
					</div>
				</div>
			</section>

			<section className="relative mx-auto max-w-7xl px-4 py-18 sm:px-6 lg:px-8 lg:py-24">
				<Card className="border-border/70 bg-card/90">
					<CardContent className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
						<div className="max-w-2xl">
							<SectionLabel>Ready to connect?</SectionLabel>
							<h2 className="mt-4 text-balance font-heading text-3xl leading-tight tracking-[-0.04em] sm:text-[2.4rem]">
								Sign in and connect the first repository.
							</h2>
							<p className="mt-4 max-w-[54ch] text-pretty text-base text-muted-foreground leading-7">
								Use the host you already have, keep the deployment model you
								need, and let GitPal do the first pass on the diff.
							</p>
						</div>

						<div className="flex flex-col gap-3 sm:flex-row">
							<PrimaryAction>Sign in</PrimaryAction>
							<SecondaryAction href="#platforms">Platforms</SecondaryAction>
						</div>
					</CardContent>
				</Card>
			</section>

			<footer className="relative mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
				<Separator className="bg-border" />
				<div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
					<Link href="/" className="flex items-center gap-3">
						<GitPalMark className="size-8 text-[0.68rem]" />
						<div>
							<p className="font-medium text-foreground tracking-tight">
								GitPal
							</p>
							<p className="text-muted-foreground text-xs">
								Open source AI code review for GitHub and GitLab.
							</p>
						</div>
					</Link>

					<div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-muted-foreground text-sm">
						<a className="transition hover:text-foreground" href="#platforms">
							Platforms
						</a>
						<a className="transition hover:text-foreground" href="#security">
							Security
						</a>
						<a className="transition hover:text-foreground" href="#workflow">
							Workflow
						</a>
						<Link className="transition hover:text-foreground" href="/login">
							Sign in
						</Link>
					</div>
				</div>
			</footer>
		</main>
	);
}
