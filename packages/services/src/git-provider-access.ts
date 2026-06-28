import { env } from "@gitpal/env/server";
import {
	createGitHubAppInstallationAdapter,
	type GitActor,
	type GitProviderAdapter,
	type GitRepository,
	listGitHubAppInstallationRepositories,
	listGitHubAppInstallations,
} from "@gitpal/git";
import { createLogger } from "@gitpal/logger";
import {
	type Account,
	type EnterpriseGitProvider,
	type Repository,
	repositories,
} from "@gitpal/repositories";

const log = createLogger("git-provider-access");

export type GitAccount = Account;
export type EnterpriseProvider = EnterpriseGitProvider;
type RepositoryRow = Repository;

function normalizePemSecret(value: string) {
	const trimmed = value.trim().replace(/\\n/g, "\n");
	if (trimmed.includes("-----BEGIN")) {
		return trimmed;
	}
	try {
		const decoded = Buffer.from(trimmed, "base64").toString("utf8");
		return decoded.includes("-----BEGIN") ? decoded : trimmed;
	} catch {
		return trimmed;
	}
}

function getCloudGitHubAppConfig() {
	if (!env.GITHUB_APP_ID || !env.GITHUB_APP_PRIVATE_KEY) {
		return null;
	}
	return {
		appId: env.GITHUB_APP_ID,
		privateKey: normalizePemSecret(env.GITHUB_APP_PRIVATE_KEY),
	};
}

export async function getEnterpriseProviderMap() {
	const enterpriseProviders =
		await repositories.enterpriseGitProvider.findMany();
	return new Map(
		enterpriseProviders.map((provider) => [provider.id, provider]),
	);
}

export async function getAccountForProvider({
	userId,
	providerId,
}: {
	userId: string;
	providerId: string;
}) {
	const account = await repositories.account.findByUserIdAndProviderId(
		userId,
		providerId,
	);
	return account ?? null;
}

/**
 * Builds a provider adapter for a repository using GitHub App installation
 * credentials only.
 *
 * Provider access is intentionally App/installation-scoped: we never fall back
 * to the OAuth tokens a user logged in with. Providers that cannot authenticate
 * as an App (GitLab — appAuthentication: false — and every enterprise provider
 * today) therefore have no automation credential source and return null.
 */
export async function createAppAdapterForRepository({
	repository,
	webhookSecrets = [],
}: {
	repository: RepositoryRow;
	webhookSecrets?: string[];
}): Promise<GitProviderAdapter | null> {
	if (repository.providerId !== "github") {
		// Only cloud GitHub exposes App installation auth in our adapters. GitLab
		// and enterprise providers cannot authenticate as an App, so automation is
		// disabled for them rather than silently borrowing a user's login token.
		return null;
	}

	const config = getCloudGitHubAppConfig();
	if (!config) {
		return null;
	}

	return createGitHubAppInstallationAdapter({
		providerId: "github",
		appId: config.appId,
		privateKey: config.privateKey,
		repositoryPath: repository.repositoryPath,
		webhookSecrets,
	});
}

export async function getAutomationActorForRepository({
	repositoryId,
	providerId,
}: {
	repositoryId: string;
	providerId: string;
}) {
	const candidates =
		await repositories.repositoryAccess.findAutomationActorCandidates(
			repositoryId,
			providerId,
		);

	if (candidates.length === 0) {
		return null;
	}

	// We still pick the highest-privilege, most-recently-active member purely for
	// attribution/auditing. Credentials always come from the GitHub App
	// installation — the selected account is never exchanged for a token.
	const primaryCandidate = candidates[0];
	if (!primaryCandidate) {
		return null;
	}

	let appAdapter: GitProviderAdapter | null = null;
	try {
		appAdapter = await createAppAdapterForRepository({
			repository: primaryCandidate.repository,
		});
	} catch (error) {
		log.error(
			{
				err: error,
				repositoryId,
				providerId,
				repositoryPath: primaryCandidate.repository.repositoryPath,
			},
			"Failed to create App-backed provider adapter; automation is disabled. User login credentials are never used as a fallback.",
		);
		return null;
	}

	if (!appAdapter) {
		log.warn(
			{
				repositoryId,
				providerId,
				repositoryPath: primaryCandidate.repository.repositoryPath,
			},
			"No GitHub App installation adapter available for this repository (GitLab and enterprise providers are unsupported); automation is disabled. User login credentials are never used as a fallback.",
		);
		return null;
	}

	return {
		userId: primaryCandidate.userId,
		account: primaryCandidate.account,
		organizationRole: primaryCandidate.organizationRole,
		adapter: appAdapter,
		credentialSource: "app" as const,
	};
}

export type AppInstallationDiscovery = {
	installationId: number;
	account: GitActor | null;
	repositories: GitRepository[];
};

/**
 * Enumerates every GitHub App installation and the repositories each can
 * access, using App + installation credentials only.
 *
 * This is the App-only replacement for listing repositories with a user OAuth
 * login token. GitLab and enterprise providers have no GitHub App installation
 * concept, so they are intentionally excluded here and their discovery is
 * disabled rather than borrowing a user login token.
 */
export async function listAppInstallationsForDiscovery(): Promise<
	AppInstallationDiscovery[]
> {
	const config = getCloudGitHubAppConfig();
	if (!config) {
		log.warn(
			{},
			"GitHub App is not configured; App-based repository discovery is disabled. User login credentials are never used as a fallback.",
		);
		return [];
	}

	const installations = await listGitHubAppInstallations({
		appId: config.appId,
		privateKey: config.privateKey,
	});

	const discoveries: AppInstallationDiscovery[] = [];
	for (const installation of installations) {
		try {
			const repositories = await listGitHubAppInstallationRepositories({
				providerId: "github",
				appId: config.appId,
				privateKey: config.privateKey,
				installationId: installation.installationId,
			});
			discoveries.push({
				installationId: installation.installationId,
				account: installation.account,
				repositories,
			});
		} catch (error) {
			log.warn(
				{ err: error, installationId: installation.installationId },
				"Failed to list repositories for a GitHub App installation; skipping it.",
			);
		}
	}

	return discoveries;
}

async function createAppInstallationAdapterById(
	installationId: number,
): Promise<GitProviderAdapter | null> {
	const config = getCloudGitHubAppConfig();
	if (!config) {
		return null;
	}
	return createGitHubAppInstallationAdapter({
		providerId: "github",
		appId: config.appId,
		privateKey: config.privateKey,
		installationId,
	});
}

async function isAccountMemberOfInstallationOrg({
	installationId,
	organization,
	accountId,
}: {
	installationId: number;
	organization: NonNullable<AppInstallationDiscovery["account"]>;
	accountId: string;
}): Promise<boolean> {
	if (!accountId || !organization.login) {
		return false;
	}

	const adapter = await createAppInstallationAdapterById(installationId);
	if (!adapter) {
		return false;
	}

	try {
		const members = await adapter.listWorkspaceMembers({
			scope: "organization",
			providerOwnerId: organization.id,
			providerOwnerPath: organization.login,
			providerOwnerName: organization.name ?? organization.login,
			providerOwnerAvatarUrl: organization.avatarUrl ?? null,
			providerOwnerHtmlUrl: organization.htmlUrl ?? null,
		});
		return members.some((member) => String(member.id) === accountId);
	} catch (error) {
		log.warn(
			{ err: error, installationId, organization: organization.login },
			"Could not verify organization membership for a GitHub App installation; excluding it from discovery.",
		);
		return false;
	}
}

/**
 * App-only repository discovery scoped to a single connected account.
 *
 * Repositories are enumerated from the GitHub App installations (App +
 * installation credentials). An installation is attributed to the account when
 * it is the personal installation for that account, or when the account is a
 * verified member of the installation organization (membership is checked with
 * the App installation token, never a user OAuth login token). GitLab and
 * enterprise accounts have no App installation concept and return no
 * repositories.
 */
export async function listAppRepositoriesForAccount(
	account: GitAccount,
): Promise<GitRepository[]> {
	if (account.providerId !== "github") {
		return [];
	}

	const discoveries = await listAppInstallationsForDiscovery();
	if (discoveries.length === 0) {
		return [];
	}

	const accountId = account.accountId;
	const seen = new Set<string>();
	const repositories: GitRepository[] = [];

	for (const discovery of discoveries) {
		const installationAccount = discovery.account;

		const isPersonalInstall =
			installationAccount?.kind === "user" &&
			Boolean(accountId) &&
			installationAccount.id === accountId;

		let include = isPersonalInstall;
		if (!include && installationAccount?.kind === "organization") {
			include = await isAccountMemberOfInstallationOrg({
				installationId: discovery.installationId,
				organization: installationAccount,
				accountId,
			});
		}

		if (!include) {
			continue;
		}

		for (const repository of discovery.repositories) {
			if (seen.has(repository.repositoryId)) {
				continue;
			}
			seen.add(repository.repositoryId);
			repositories.push(repository);
		}
	}

	return repositories;
}

/**
 * Builds a GitHub App installation adapter for a workspace owner (user or org),
 * resolving the installation by matching the App installations against the
 * owner id/path. App credentials only; returns null for non-GitHub providers
 * and when no matching installation exists.
 */
export async function createAppInstallationAdapterForOwner({
	providerId,
	ownerId,
	ownerPath,
}: {
	providerId: string;
	ownerId: string;
	ownerPath: string;
}): Promise<GitProviderAdapter | null> {
	if (providerId !== "github") {
		return null;
	}

	const config = getCloudGitHubAppConfig();
	if (!config) {
		return null;
	}

	const installations = await listGitHubAppInstallations({
		appId: config.appId,
		privateKey: config.privateKey,
	});

	const normalizedPath = ownerPath.trim().toLowerCase();
	const match = installations.find((installation) => {
		const account = installation.account;
		if (!account) {
			return false;
		}
		if (ownerId && account.id === ownerId) {
			return true;
		}
		const login = account.login?.trim().toLowerCase();
		return Boolean(login && normalizedPath && login === normalizedPath);
	});

	if (!match) {
		return null;
	}

	return createAppInstallationAdapterById(match.installationId);
}

/**
 * Builds a GitHub App installation adapter for a repository path, resolving the
 * installation from the path. App credentials only; returns null for non-GitHub
 * providers and when the App is not configured.
 */
export async function createAppAdapterForRepositoryPath({
	providerId,
	repositoryPath,
}: {
	providerId: string;
	repositoryPath: string;
}): Promise<GitProviderAdapter | null> {
	if (providerId !== "github") {
		return null;
	}

	const config = getCloudGitHubAppConfig();
	if (!config) {
		return null;
	}

	return createGitHubAppInstallationAdapter({
		providerId: "github",
		appId: config.appId,
		privateKey: config.privateKey,
		repositoryPath: repositoryPath.trim(),
	});
}
