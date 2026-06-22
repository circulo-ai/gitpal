"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@gitpal/ui/components/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@gitpal/ui/components/dropdown-menu";
import { Input } from "@gitpal/ui/components/input";
import { Label } from "@gitpal/ui/components/label";
import { cn } from "@gitpal/ui/lib/utils";
import {
	ChevronDownIcon,
	GithubIcon,
	GitlabIcon,
	Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	startEnterpriseGitHostSignIn,
	startOAuthSignIn,
} from "@/lib/auth-client";
import { GitPalMark } from "./gitpal-mark";

type ProviderId = "github" | "gitlab";
type ProviderMode = "cloud" | "enterprise";

type ProviderAvailability = Record<ProviderId, Record<ProviderMode, boolean>>;

type AuthPageProps = {
	availability: ProviderAvailability;
};

type ProviderConfig = {
	id: ProviderId;
	name: string;
	icon: IconSvgElement;
	cloudProviderId: string;
};

type StoredModes = Record<ProviderId, ProviderMode>;

type LastUsed = {
	provider: ProviderId;
	mode: ProviderMode;
} | null;

type EnterpriseHosts = Record<ProviderId, string>;

const STORAGE_KEY = "gitpal-auth-provider-modes";
const LAST_USED_STORAGE_KEY = "gitpal-auth-last-used";
const ENTERPRISE_HOST_STORAGE_KEY = "gitpal-auth-enterprise-hosts";

const PROVIDER_ORDER: ProviderId[] = ["github", "gitlab"];

const PROVIDERS: Record<ProviderId, ProviderConfig> = {
	github: {
		id: "github",
		name: "GitHub",
		icon: GithubIcon,
		cloudProviderId: "github",
	},
	gitlab: {
		id: "gitlab",
		name: "GitLab",
		icon: GitlabIcon,
		cloudProviderId: "gitlab",
	},
};

function getProviderLabel(provider: ProviderId) {
	return PROVIDERS[provider].name;
}

function getModeLabel(mode: ProviderMode) {
	return mode === "cloud" ? "Cloud" : "Enterprise";
}

function getProviderModeLabel(provider: ProviderId, mode: ProviderMode) {
	return `${getProviderLabel(provider)} ${getModeLabel(mode)}`;
}

function defaultModes(): StoredModes {
	return {
		github: "cloud",
		gitlab: "cloud",
	};
}

function sanitizeMode(
	provider: ProviderId,
	mode: ProviderMode | null | undefined,
	availability: ProviderAvailability,
) {
	if (mode === "enterprise" && availability[provider].enterprise) {
		return "enterprise" as const;
	}

	if (mode === "cloud" && availability[provider].cloud) {
		return "cloud" as const;
	}

	if (availability[provider].cloud) {
		return "cloud" as const;
	}

	if (availability[provider].enterprise) {
		return "enterprise" as const;
	}

	return "cloud" as const;
}

function loadModes(availability: ProviderAvailability) {
	if (typeof window === "undefined") {
		return defaultModes();
	}

	const raw = window.localStorage.getItem(STORAGE_KEY);

	if (!raw) {
		return defaultModes();
	}

	try {
		const parsed = JSON.parse(raw) as Partial<StoredModes>;
		return {
			github: sanitizeMode("github", parsed.github, availability),
			gitlab: sanitizeMode("gitlab", parsed.gitlab, availability),
		};
	} catch {
		return defaultModes();
	}
}

function loadLastUsed(availability: ProviderAvailability): LastUsed {
	if (typeof window === "undefined") {
		return null;
	}

	const raw = window.localStorage.getItem(LAST_USED_STORAGE_KEY);

	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as {
			provider?: ProviderId;
			mode?: ProviderMode;
		};

		if (
			(parsed.provider === "github" || parsed.provider === "gitlab") &&
			parsed.mode &&
			availability[parsed.provider][parsed.mode]
		) {
			return {
				provider: parsed.provider,
				mode: parsed.mode,
			};
		}
	} catch {
		return null;
	}

	return null;
}

function defaultEnterpriseHosts(): EnterpriseHosts {
	return {
		github: "",
		gitlab: "",
	};
}

function normalizeEnterpriseHost(value: string) {
	return value.trim().replace(/\/+$/, "");
}

function loadEnterpriseHosts(): EnterpriseHosts {
	if (typeof window === "undefined") {
		return defaultEnterpriseHosts();
	}

	const raw = window.localStorage.getItem(ENTERPRISE_HOST_STORAGE_KEY);

	if (!raw) {
		return defaultEnterpriseHosts();
	}

	try {
		const parsed = JSON.parse(raw) as Partial<EnterpriseHosts>;

		return {
			github: normalizeEnterpriseHost(parsed.github ?? ""),
			gitlab: normalizeEnterpriseHost(parsed.gitlab ?? ""),
		};
	} catch {
		return defaultEnterpriseHosts();
	}
}

function persistEnterpriseHosts(nextHosts: EnterpriseHosts) {
	window.localStorage.setItem(
		ENTERPRISE_HOST_STORAGE_KEY,
		JSON.stringify(nextHosts),
	);
}

function persistPreferences(nextModes: StoredModes, nextLastUsed: LastUsed) {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextModes));

	if (nextLastUsed) {
		window.localStorage.setItem(
			LAST_USED_STORAGE_KEY,
			JSON.stringify(nextLastUsed),
		);
	}
}

function rowActionKey(provider: ProviderId, mode: ProviderMode) {
	return `${provider}:${mode}`;
}

function ProviderRow({
	config,
	mode,
	availability,
	isLastUsed,
	isPending,
	onModeChange,
	onPrimaryAction,
}: {
	config: ProviderConfig;
	mode: ProviderMode;
	availability: ProviderAvailability[ProviderId];
	isLastUsed: boolean;
	isPending: boolean;
	onModeChange: (mode: ProviderMode) => void;
	onPrimaryAction: () => void;
}) {
	const isAvailable = availability[mode];
	const label = getProviderModeLabel(config.id, mode);

	return (
		<div className="relative">
			{isLastUsed ? (
				<Badge
					variant="outline"
					className="absolute -top-2 right-4 z-10 h-6 rounded-full border-white/15 bg-[#17141b] px-2.5 text-[11px] text-white/80 shadow-lg"
				>
					Last used
				</Badge>
			) : null}

			<div className="flex items-stretch overflow-hidden rounded-2xl border border-white/10 bg-[#19161d]/95 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
				<Button
					type="button"
					variant="outline"
					size="lg"
					disabled={!isAvailable || isPending}
					onClick={onPrimaryAction}
					className="flex h-12 flex-1 items-center justify-center gap-3 rounded-none rounded-l-2xl border-0 border-white/10 border-r bg-transparent px-4 text-white hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<HugeiconsIcon
						icon={isPending ? Loading03Icon : config.icon}
						size={18}
						className={cn("shrink-0", isPending && "animate-spin")}
					/>
					<span className="font-semibold text-sm tracking-tight">{label}</span>
				</Button>

				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<Button
								type="button"
								variant="outline"
								size="icon"
								aria-label={`${config.name} options`}
								className="h-12 w-12 rounded-none rounded-r-2xl border-0 bg-transparent text-white hover:bg-white/5"
							/>
						}
					>
						<HugeiconsIcon icon={ChevronDownIcon} size={16} />
					</DropdownMenuTrigger>
					<DropdownMenuContent className="w-44 border-white/10 bg-[#1a171e] p-1 text-white shadow-2xl">
						<DropdownMenuItem
							disabled={!availability.cloud}
							onClick={() => {
								onModeChange("cloud");
							}}
							className="rounded-xl px-3 py-2 text-sm text-white/90 focus:bg-white/10 focus:text-white"
						>
							Cloud
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!availability.enterprise}
							onClick={() => {
								onModeChange("enterprise");
							}}
							className="rounded-xl px-3 py-2 text-sm text-white/90 focus:bg-white/10 focus:text-white"
						>
							Enterprise
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

type PromptDialogProps = {
	open: boolean;
	title: string;
	description: string;
	label: string;
	inputId: string;
	value: string;
	placeholder: string;
	inputType?: "email" | "text" | "url";
	autoComplete?: string;
	submitLabel: string;
	pending: boolean;
	onOpenChange: (open: boolean) => void;
	onValueChange: (value: string) => void;
	onSubmit: () => void;
};

function PromptDialog({
	open,
	title,
	description,
	label,
	inputId,
	value,
	placeholder,
	inputType = "text",
	autoComplete,
	submitLabel,
	pending,
	onOpenChange,
	onValueChange,
	onSubmit,
}: PromptDialogProps) {
	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				onOpenChange(nextOpen);
			}}
		>
			<DialogContent className="border-white/10 bg-[#16131a] text-white shadow-2xl sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="font-semibold text-white">
						{title}
					</DialogTitle>
					<DialogDescription className="text-white/60">
						{description}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-2">
					<Label htmlFor={inputId} className="text-sm text-white/80">
						{label}
					</Label>
					<Input
						id={inputId}
						autoFocus
						autoComplete={autoComplete}
						type={inputType}
						value={value}
						onChange={(event) => {
							onValueChange(event.target.value);
						}}
						placeholder={placeholder}
						className="border-white/10 bg-white/5 text-white placeholder:text-white/35"
					/>
				</div>

				<DialogFooter className="gap-3">
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							onOpenChange(false);
						}}
						className="border-white/10 bg-white/5 text-white hover:bg-white/10"
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={() => {
							onSubmit();
						}}
						disabled={pending}
						className="bg-white text-[#0b0910] hover:bg-white/90"
					>
						{submitLabel}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export default function AuthPage({ availability }: AuthPageProps) {
	const [providerModes, setProviderModes] = useState<StoredModes>(() =>
		defaultModes(),
	);
	const [lastUsed, setLastUsed] = useState<LastUsed>(null);
	const [enterpriseHosts, setEnterpriseHosts] = useState<EnterpriseHosts>(() =>
		defaultEnterpriseHosts(),
	);
	const [enterpriseDialogProvider, setEnterpriseDialogProvider] =
		useState<ProviderId | null>(null);
	const [enterpriseDialogOpen, setEnterpriseDialogOpen] = useState(false);
	const [enterpriseHostDraft, setEnterpriseHostDraft] = useState("");
	const [pendingAction, setPendingAction] = useState<string | null>(null);

	useEffect(() => {
		const modes = loadModes(availability);
		setProviderModes(modes);
		setLastUsed(loadLastUsed(availability));
		setEnterpriseHosts(loadEnterpriseHosts());
	}, [availability]);

	function openEnterpriseDialog(provider: ProviderId) {
		setEnterpriseDialogProvider(provider);
		setEnterpriseHostDraft(enterpriseHosts[provider]);
		setEnterpriseDialogOpen(true);
	}

	function closeEnterpriseDialog() {
		setEnterpriseDialogOpen(false);
		setEnterpriseDialogProvider(null);
	}

	function updateModes(provider: ProviderId, mode: ProviderMode) {
		if (!availability[provider][mode]) {
			toast.error(
				`${getProviderLabel(provider)} ${getModeLabel(mode)} is not configured for this deployment.`,
			);
			return;
		}

		const nextModes = {
			...providerModes,
			[provider]: mode,
		};
		const nextLastUsed = {
			provider,
			mode,
		} as const;

		setProviderModes(nextModes);
		setLastUsed(nextLastUsed);
		persistPreferences(nextModes, nextLastUsed);
	}

	async function launchProvider(provider: ProviderId, mode: ProviderMode) {
		if (!availability[provider][mode]) {
			toast.error(
				`${getProviderModeLabel(provider, mode)} is not configured yet.`,
			);
			return;
		}

		const config = PROVIDERS[provider];
		const label = getProviderModeLabel(provider, mode);

		if (mode === "cloud") {
			updateModes(provider, mode);

			const actionKey = rowActionKey(provider, mode);

			setPendingAction(actionKey);

			try {
				await startOAuthSignIn({
					providerId: config.cloudProviderId,
					label,
				});
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: `Unable to start ${label} sign in`,
				);
			} finally {
				setPendingAction((current) => (current === actionKey ? null : current));
			}

			return;
		}

		openEnterpriseDialog(provider);
	}

	async function submitEnterpriseHost() {
		if (!enterpriseDialogProvider) {
			return;
		}

		const provider = enterpriseDialogProvider;
		const label = getProviderModeLabel(provider, "enterprise");
		const baseUrl = normalizeEnterpriseHost(enterpriseHostDraft);

		if (!baseUrl) {
			toast.error("Enter a self-hosted Git URL to continue.");
			return;
		}

		const actionKey = rowActionKey(provider, "enterprise");
		const nextHosts = {
			...enterpriseHosts,
			[provider]: baseUrl,
		};
		let didStartSignIn = false;

		setPendingAction(actionKey);

		try {
			setEnterpriseHosts(nextHosts);
			persistEnterpriseHosts(nextHosts);
			await startEnterpriseGitHostSignIn({
				type: provider,
				baseUrl,
				label,
			});
			updateModes(provider, "enterprise");
			didStartSignIn = true;
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: `Unable to start ${label} sign in`,
			);
		} finally {
			setPendingAction((current) => (current === actionKey ? null : current));
			if (didStartSignIn) {
				closeEnterpriseDialog();
			}
		}
	}

	const heroHeadline = "Two clicks from better reviews.";
	const heroDescription =
		"Keep developers moving while GitHub and GitLab auth stays straightforward across cloud and enterprise installs.";
	const panelTitle = "Sign into GitPal";
	const panelDescription = "Welcome back, let's start reviewing.";
	const footerNote =
		"Built for GitHub and GitLab across cloud and enterprise deployments.";

	return (
		<div className="dark relative min-h-svh overflow-hidden bg-[#0b0910] text-white">
			<div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.09),transparent_18%),radial-gradient(circle_at_80%_22%,rgba(255,126,74,0.12),transparent_14%),radial-gradient(circle_at_50%_50%,rgba(123,92,255,0.06),transparent_34%)]" />
			<div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] opacity-[0.12] [background-size:28px_28px]" />

			<main className="relative z-10 mx-auto grid min-h-svh max-w-[1700px] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_430px]">
				<section className="hidden min-h-[48vh] flex-col justify-between px-5 py-6 sm:px-8 sm:py-8 lg:flex lg:min-h-svh lg:px-12 lg:py-7">
					<Link
						href="/"
						className="inline-flex w-fit items-center gap-3 font-semibold text-sm text-white/90 tracking-tight transition hover:text-white"
					>
						<GitPalMark className="text-[0.72rem]" />
						<span className="text-[1.15rem]">GitPal</span>
					</Link>

					<div className="flex flex-1 items-center justify-center py-12 lg:py-0">
						<div className="max-w-190 text-center">
							<h1 className="mx-auto mt-8 max-w-[16ch] text-balance font-semibold text-4xl text-white leading-[1.04] tracking-[-0.045em] sm:text-5xl lg:text-[4.3rem]">
								{heroHeadline}
							</h1>

							<p className="mx-auto mt-6 max-w-[36ch] text-balance text-base text-white/68 leading-7 sm:text-lg">
								{heroDescription}
							</p>
						</div>
					</div>

					<div className="mb-8 hidden text-white/36 text-xs lg:block">
						{footerNote}
					</div>
				</section>

				<section className="relative flex items-center justify-center border-white/6 bg-[#0f0d13]/92 px-4 py-8 sm:px-8 lg:border-l lg:px-10">
					<div className="w-full max-w-95 space-y-5">
						<div className="space-y-2 text-center">
							<h2 className="font-semibold text-2xl text-white tracking-tight">
								{panelTitle}
							</h2>
							<p className="text-sm text-white/60">{panelDescription}</p>
						</div>

						<div className="space-y-4">
							{PROVIDER_ORDER.map((providerId) => {
								const provider = PROVIDERS[providerId];

								return (
									<ProviderRow
										key={providerId}
										config={provider}
										mode={providerModes[providerId]}
										availability={availability[providerId]}
										isLastUsed={lastUsed?.provider === providerId}
										isPending={
											pendingAction ===
											rowActionKey(providerId, providerModes[providerId])
										}
										onModeChange={(mode) => {
											updateModes(providerId, mode);
										}}
										onPrimaryAction={() => {
											void launchProvider(
												providerId,
												providerModes[providerId],
											);
										}}
									/>
								);
							})}
						</div>

						<PromptDialog
							open={enterpriseDialogOpen}
							title={
								enterpriseDialogProvider
									? `${getProviderLabel(enterpriseDialogProvider)} self-hosted URL`
									: "Self-hosted Git URL"
							}
							description="Enter the URL for your self-hosted Git host. GitPal will remember it on this device so the next sign-in is faster."
							label="Git host URL"
							inputId="enterprise-host-url"
							value={enterpriseHostDraft}
							placeholder="https://git.example.com"
							inputType="url"
							autoComplete="url"
							submitLabel="Continue"
							pending={pendingAction !== null}
							onOpenChange={(open) => {
								setEnterpriseDialogOpen(open);

								if (!open) {
									setEnterpriseDialogProvider(null);
								}
							}}
							onValueChange={(value) => {
								setEnterpriseHostDraft(value);
							}}
							onSubmit={() => {
								void submitEnterpriseHost();
							}}
						/>
					</div>
				</section>
			</main>
		</div>
	);
}
