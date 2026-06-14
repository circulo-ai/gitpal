"use client";

import { Badge } from "@gitpal/ui/components/badge";
import { Button } from "@gitpal/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@gitpal/ui/components/dropdown-menu";
import { Separator } from "@gitpal/ui/components/separator";
import { cn } from "@gitpal/ui/lib/utils";
import {
  ChevronDownIcon,
  GithubIcon,
  GitlabIcon,
  Key01Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
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
  enterpriseProviderId: string;
};

type StoredModes = Record<ProviderId, ProviderMode>;

type LastUsed = {
  provider: ProviderId;
  mode: ProviderMode;
} | null;

const STORAGE_KEY = "gitpal-auth-provider-modes";
const LAST_USED_STORAGE_KEY = "gitpal-auth-last-used";

const PROVIDERS: ProviderConfig[] = [
  {
    id: "github",
    name: "GitHub",
    icon: GithubIcon,
    cloudProviderId: "github",
    enterpriseProviderId: "github-enterprise",
  },
  {
    id: "gitlab",
    name: "GitLab",
    icon: GitlabIcon,
    cloudProviderId: "gitlab",
    enterpriseProviderId: "gitlab-enterprise",
  },
];

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
  const isCloud = mode === "cloud";
  const isAvailable = availability[mode];
  const label = `${config.name} ${isCloud ? "Cloud" : "Enterprise"}`;

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

async function startOAuth(providerId: string, label: string) {
  const response = await authClient.signIn.oauth2({
    providerId,
    callbackURL: "/dashboard",
    disableRedirect: true,
  });

  if (response?.data?.url) {
    window.location.assign(response.data.url);
    return;
  }

  toast.success(`Redirecting to ${label}...`);
}

export default function AuthPage({ availability }: AuthPageProps) {
  const [providerModes, setProviderModes] =
    useState<StoredModes>(defaultModes());
  const [lastUsed, setLastUsed] = useState<LastUsed>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    const modes = loadModes(availability);
    setProviderModes(modes);
    setLastUsed(loadLastUsed(availability));
  }, [availability]);

  function updateModes(provider: ProviderId, mode: ProviderMode) {
    if (!availability[provider][mode]) {
      toast.error(
        `${provider === "github" ? "GitHub" : "GitLab"} ${mode === "cloud" ? "Cloud" : "Enterprise"} is not configured for this deployment.`,
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
        `${provider === "github" ? "GitHub" : "GitLab"} ${mode === "cloud" ? "Cloud" : "Enterprise"} is not configured yet.`,
      );
      return;
    }

    const actionKey = rowActionKey(provider, mode);
    const config = PROVIDERS.find((entry) => entry.id === provider);

    if (!config) {
      toast.error("Authentication provider is missing.");
      return;
    }

    setPendingAction(actionKey);
    updateModes(provider, mode);

    try {
      await startOAuth(
        mode === "cloud" ? config.cloudProviderId : config.enterpriseProviderId,
        `${config.name} ${mode === "cloud" ? "Cloud" : "Enterprise"}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Unable to start ${config.name} sign in`,
      );
    } finally {
      setPendingAction((current) => (current === actionKey ? null : current));
    }
  }

  async function launchSingleSignOn() {
    const preferredProvider =
      (lastUsed?.mode === "enterprise" &&
      availability[lastUsed.provider].enterprise
        ? lastUsed.provider
        : null) ??
      (availability.github.enterprise
        ? "github"
        : availability.gitlab.enterprise
          ? "gitlab"
          : null);

    if (!preferredProvider) {
      toast.error("Enterprise SSO is not configured on this deployment.");
      return;
    }

    await launchProvider(preferredProvider, "enterprise");
  }

  const enterpriseEnabled =
    availability.github.enterprise || availability.gitlab.enterprise;

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
            <GitPalMark className="size-9 text-[0.72rem]" />
            <span className="text-[1.15rem]">GitPal</span>
          </Link>

          <div className="flex flex-1 items-center justify-center py-12 lg:py-0">
            <div className="max-w-190 text-center">
              <h1 className="mx-auto mt-8 max-w-[16ch] text-balance font-semibold text-4xl text-white leading-[1.04] tracking-[-0.045em] sm:text-5xl lg:text-[4.3rem]">
                Two clicks from better reviews.
              </h1>

              <p className="mx-auto mt-6 max-w-[36ch] text-balance text-base text-white/68 leading-7 sm:text-lg">
                Keep developers moving while GitHub and GitLab auth stays
                straightforward across cloud and enterprise installs.
              </p>
            </div>
          </div>

          <div className="mb-8 hidden text-white/36 text-xs lg:block">
            Built for GitHub and GitLab across cloud and enterprise deployments.
          </div>
        </section>

        <section className="relative flex items-center justify-center border-white/6 bg-[#0f0d13]/92 px-4 py-8 sm:px-8 lg:border-l lg:px-10">
          <div className="w-full max-w-95 space-y-5">
            <div className="space-y-2 text-center">
              <h2 className="font-semibold text-2xl text-white tracking-tight">
                Sign into GitPal
              </h2>
              <p className="text-sm text-white/60">
                Welcome back, let&apos;s start reviewing.
              </p>
            </div>

            <div className="space-y-4">
              {PROVIDERS.map((provider) => (
                <ProviderRow
                  key={provider.id}
                  config={provider}
                  mode={providerModes[provider.id]}
                  availability={availability[provider.id]}
                  isLastUsed={lastUsed?.provider === provider.id}
                  isPending={
                    pendingAction ===
                    rowActionKey(provider.id, providerModes[provider.id])
                  }
                  onModeChange={(mode) => {
                    updateModes(provider.id, mode);
                  }}
                  onPrimaryAction={() => {
                    void launchProvider(
                      provider.id,
                      providerModes[provider.id],
                    );
                  }}
                />
              ))}
            </div>

            <Separator className="bg-white/10" />

            <Button
              type="button"
              variant="outline"
              disabled={!enterpriseEnabled || pendingAction !== null}
              onClick={() => {
                void launchSingleSignOn();
              }}
              className={cn(
                "h-12 w-full rounded-2xl border-white/10 bg-[#19161d] text-white hover:bg-white/5",
                !enterpriseEnabled &&
                  "cursor-not-allowed opacity-50 hover:bg-[#19161d]",
              )}
            >
              <HugeiconsIcon
                icon={pendingAction ? Loading03Icon : Key01Icon}
                size={18}
                className={cn("mr-2", pendingAction && "animate-spin")}
              />
              Single Sign-On
            </Button>

            <p className="px-2 text-center text-white/45 text-xs leading-5">
              Cloud sign-in uses GitHub.com and GitLab.com. Enterprise SSO is
              enabled when your deployment is configured for it.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
