import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "@gitpal/db";
import * as integrationSchema from "@gitpal/db/schema/integrations";
import { env } from "@gitpal/env/server";
import { createLogger } from "@gitpal/logger";
import {
	type ConnectorAuthMethod,
	type ConnectorKnowledgeBaseSettings,
	type ConnectorStatus,
	type ConnectorType,
	type ConnectorUpsertInput,
	connectorKnowledgeBaseSettingsSchema,
	connectorUpsertInputSchema,
	getConnectorDefaultRateLimit,
	getConnectorProvider,
	listConnectorProviders,
	parseConnectorHeaders,
	redactHeaders,
	redactSecret,
} from "@gitpal/mcp";
import { createConnectorMcpToolSet } from "@gitpal/mcp/ai-sdk";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	buildAppRateLimitKey,
	consumeAppRateLimit,
	createRateLimitKeyFromRequestPath,
} from "./rate-limit";
import {
	decryptSecretEnvelope,
	encryptSecretEnvelope,
} from "./secret-envelope";
import { normalizeTrustedServiceUrl } from "./trusted-service-url";

type IntegrationConnectionRow =
	typeof integrationSchema.integrationConnection.$inferSelect;

type StoredConnectorCredential = {
	apiKey?: string;
	headers?: Record<string, string>;
	oauth?: {
		accessToken: string;
		refreshToken?: string | null;
		expiresAt?: string | null;
		scopes?: string[];
	};
};

type OAuthClientConfig = {
	clientId: string;
	clientSecret: string;
	provider: "linear" | "notion";
};

export type PublicIntegrationConnection = {
	id: string;
	organizationId: string;
	providerId: string;
	providerType: ConnectorType;
	label: string;
	serverUrl: string | null;
	usageGuidance: string | null;
	authMethod: ConnectorAuthMethod;
	headerPreview: Record<string, string>;
	credentialPreview: string | null;
	status: ConnectorStatus;
	enabled: boolean;
	rateLimit: {
		windowSeconds: number;
		maxRequests: number;
	};
	knowledgeBase: ConnectorKnowledgeBaseSettings | null;
	lastValidatedAt: string | null;
	lastUsedAt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type IntegrationToolContext = {
	connectionId: string;
	providerId: string;
	providerType: ConnectorType;
	label: string;
	serverUrl: string | null;
	usageGuidance: string | null;
	tools: Array<{
		name: string;
		title: string;
		description: string;
		permission: "read" | "write";
	}>;
	rateLimit: {
		windowSeconds: number;
		maxRequests: number;
	};
	knowledgeBase: ConnectorKnowledgeBaseSettings | null;
};

export type LinearIssueSearchResult = {
	id: string;
	identifier: string | null;
	title: string;
	url: string | null;
	state: string | null;
	assignee: string | null;
	updatedAt: string | null;
};

const log = createLogger("integrations");
const oauthStateTtlMs = 10 * 60 * 1000;
const notionVersion = "2026-03-11";
const connectorCredentialSchema = z.object({
	apiKey: z.string().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	oauth: z
		.object({
			accessToken: z.string(),
			refreshToken: z.string().nullish(),
			expiresAt: z.string().nullish(),
			scopes: z.array(z.string()).optional(),
		})
		.optional(),
});

function encryptCredential(value: StoredConnectorCredential | null) {
	return encryptSecretEnvelope(value);
}

function decryptCredential(value: string | null) {
	return decryptSecretEnvelope(value, connectorCredentialSchema);
}

function parseConnectorType(value: string): ConnectorType {
	if (value === "mcp" || value === "issue_tracking" || value === "ci_cd") {
		return value;
	}
	return "mcp";
}

function parseConnectorAuthMethod(value: string): ConnectorAuthMethod {
	if (value === "none" || value === "oauth" || value === "api_key") {
		return value;
	}
	return "none";
}

function parseConnectorStatus(value: string): ConnectorStatus {
	if (
		value === "configured" ||
		value === "pending_oauth" ||
		value === "connected" ||
		value === "disabled" ||
		value === "error"
	) {
		return value;
	}
	return "configured";
}

function getCredentialPreview(credential: StoredConnectorCredential | null) {
	return redactSecret(
		credential?.apiKey ?? credential?.oauth?.accessToken ?? null,
	);
}

function getConnectionMetadata(row: IntegrationConnectionRow) {
	return row.metadata && typeof row.metadata === "object"
		? (row.metadata as Record<string, unknown>)
		: {};
}

function getKnowledgeBaseSettings({
	providerId,
	metadata,
	fallback,
}: {
	providerId: string;
	metadata: Record<string, unknown>;
	fallback?: ConnectorKnowledgeBaseSettings;
}) {
	const provider = getConnectorProvider(providerId);
	if (!provider?.knowledgeBase) {
		return null;
	}

	const parsed = connectorKnowledgeBaseSettingsSchema.safeParse(
		metadata.knowledgeBase ?? fallback ?? provider.knowledgeBase,
	);
	const settings = parsed.success
		? parsed.data
		: connectorKnowledgeBaseSettingsSchema.parse(provider.knowledgeBase);

	return {
		optOut: settings.optOut,
		automaticRepositoryLinking: settings.automaticRepositoryLinking,
		linkedRepositories: [
			...new Set(
				settings.linkedRepositories
					.map((repository) => repository.trim())
					.filter(Boolean),
			),
		],
	};
}

function normalizeRepositoryName(value: string | null | undefined) {
	return (value ?? "")
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\/(?:www\.)?(?:github\.com|gitlab\.com)\//, "")
		.replace(/\.git$/, "")
		.replace(/^\/+|\/+$/g, "");
}

function canUseKnowledgeBaseForRepository({
	knowledgeBase,
	repositoryFullName,
}: {
	knowledgeBase: ConnectorKnowledgeBaseSettings | null;
	repositoryFullName?: string | null;
}) {
	if (!knowledgeBase) {
		return true;
	}

	if (knowledgeBase.optOut) {
		return false;
	}

	if (knowledgeBase.automaticRepositoryLinking) {
		return true;
	}

	const normalizedRepository = normalizeRepositoryName(repositoryFullName);
	if (!normalizedRepository) {
		return false;
	}

	return knowledgeBase.linkedRepositories
		.map(normalizeRepositoryName)
		.includes(normalizedRepository);
}

function hasAuthorizationHeader(headers: Record<string, string>) {
	return Object.keys(headers).some(
		(headerName) => headerName.toLowerCase() === "authorization",
	);
}

function buildConnectorRequestHeaders(
	credential: StoredConnectorCredential | null,
) {
	const headers = { ...(credential?.headers ?? {}) };

	if (!hasAuthorizationHeader(headers)) {
		if (credential?.oauth?.accessToken) {
			headers.Authorization = `Bearer ${credential.oauth.accessToken}`;
		} else if (credential?.apiKey) {
			headers.Authorization = `Bearer ${credential.apiKey}`;
		}
	}

	return headers;
}

function toPublicConnection(
	row: IntegrationConnectionRow,
): PublicIntegrationConnection {
	const credential = decryptCredential(row.credentialEnvelope);
	const metadata = getConnectionMetadata(row);

	return {
		id: row.id,
		organizationId: row.organizationId,
		providerId: row.providerId,
		providerType: parseConnectorType(row.providerType),
		label: row.label,
		serverUrl: row.serverUrl,
		usageGuidance: row.usageGuidance,
		authMethod: parseConnectorAuthMethod(row.authMethod),
		headerPreview:
			row.headerPreview && typeof row.headerPreview === "object"
				? row.headerPreview
				: {},
		credentialPreview: getCredentialPreview(credential),
		status: parseConnectorStatus(row.status),
		enabled: row.enabled,
		rateLimit: {
			windowSeconds: row.rateLimitWindowSeconds,
			maxRequests: row.rateLimitMaxRequests,
		},
		knowledgeBase: getKnowledgeBaseSettings({
			providerId: row.providerId,
			metadata,
		}),
		lastValidatedAt: row.lastValidatedAt?.toISOString() ?? null,
		lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

async function getConnectionById({
	connectionId,
	organizationId,
}: {
	connectionId: string;
	organizationId: string;
}) {
	const [connection] = await db
		.select()
		.from(integrationSchema.integrationConnection)
		.where(
			and(
				eq(integrationSchema.integrationConnection.id, connectionId),
				eq(
					integrationSchema.integrationConnection.organizationId,
					organizationId,
				),
			),
		)
		.limit(1);

	return connection ?? null;
}

async function getExistingConnectionForUpsert(input: {
	connectionId?: string;
	organizationId: string;
	providerId: string;
	label: string;
}) {
	if (input.connectionId) {
		return getConnectionById({
			connectionId: input.connectionId,
			organizationId: input.organizationId,
		});
	}

	const [connection] = await db
		.select()
		.from(integrationSchema.integrationConnection)
		.where(
			and(
				eq(
					integrationSchema.integrationConnection.organizationId,
					input.organizationId,
				),
				eq(
					integrationSchema.integrationConnection.providerId,
					input.providerId,
				),
				eq(integrationSchema.integrationConnection.label, input.label),
			),
		)
		.limit(1);

	return connection ?? null;
}

function buildCredential({
	authMethod,
	apiKey,
	additionalHeaders,
	existing,
}: {
	authMethod: ConnectorAuthMethod;
	apiKey?: string;
	additionalHeaders?: string;
	existing: StoredConnectorCredential | null;
}): {
	credential: StoredConnectorCredential | null;
	headerPreview: Record<string, string>;
} {
	const headers = parseConnectorHeaders(additionalHeaders);

	if (authMethod === "none") {
		return {
			credential: Object.keys(headers).length > 0 ? { headers } : null,
			headerPreview: redactHeaders(headers),
		};
	}

	if (authMethod === "oauth") {
		return {
			credential: {
				...(existing ?? {}),
				headers,
			},
			headerPreview: redactHeaders(headers),
		};
	}

	const normalizedApiKey = apiKey?.trim();
	if (!normalizedApiKey && !existing?.apiKey) {
		throw new Error("An API key is required for this connector.");
	}

	return {
		credential: {
			...(existing ?? {}),
			apiKey: normalizedApiKey || existing?.apiKey,
			headers,
		},
		headerPreview: redactHeaders(headers),
	};
}

export function listIntegrationProviderCatalog(type?: ConnectorType) {
	return listConnectorProviders(type);
}

export async function listIntegrationConnections({
	organizationId,
	type,
}: {
	organizationId: string;
	type?: ConnectorType;
}) {
	const rows = await db
		.select()
		.from(integrationSchema.integrationConnection)
		.where(
			eq(
				integrationSchema.integrationConnection.organizationId,
				organizationId,
			),
		)
		.orderBy(
			asc(integrationSchema.integrationConnection.providerType),
			asc(integrationSchema.integrationConnection.label),
		);

	return rows
		.filter((row) => (type ? row.providerType === type : true))
		.map(toPublicConnection);
}

export async function upsertIntegrationConnection({
	userId,
	input,
}: {
	userId: string;
	input: ConnectorUpsertInput;
}) {
	const data = connectorUpsertInputSchema.parse(input);
	const provider = getConnectorProvider(data.providerId);

	if (!provider) {
		throw new Error("Unknown connector provider.");
	}

	if (!provider.authMethods.includes(data.authMethod)) {
		throw new Error(
			`${provider.name} does not support ${data.authMethod} auth.`,
		);
	}

	const existing = await getExistingConnectionForUpsert({
		connectionId: data.connectionId,
		organizationId: data.organizationId,
		providerId: data.providerId,
		label: data.label.trim(),
	});
	const existingCredential = existing
		? decryptCredential(existing.credentialEnvelope)
		: null;
	const existingMetadata = existing ? getConnectionMetadata(existing) : {};
	const { credential, headerPreview } = buildCredential({
		authMethod: data.authMethod,
		apiKey: data.apiKey,
		additionalHeaders: data.additionalHeaders,
		existing: existingCredential,
	});
	const rateLimit = getConnectorDefaultRateLimit(data.providerId);
	const serverUrl = normalizeTrustedServiceUrl(
		data.serverUrl || provider.defaultServerUrl,
		{ exactHosts: [provider.host] },
	);
	const status =
		data.authMethod === "oauth" && !credential?.oauth
			? "pending_oauth"
			: "connected";
	const now = new Date();

	const values = {
		id: existing?.id ?? `int_${randomUUID()}`,
		organizationId: data.organizationId,
		providerId: provider.id,
		providerType: provider.type,
		label: data.label.trim(),
		serverUrl,
		usageGuidance: data.usageGuidance?.trim() || null,
		authMethod: data.authMethod,
		credentialEnvelope: encryptCredential(credential),
		headerPreview,
		status,
		enabled: data.enabled,
		rateLimitWindowSeconds: rateLimit.windowSeconds,
		rateLimitMaxRequests: rateLimit.maxRequests,
		connectedByUserId: userId,
		lastValidatedAt: now,
		metadata: {
			...existingMetadata,
			scopes: provider.scopes,
			tools: provider.tools.map((tool) => tool.name),
			documentationUrl: provider.documentationUrl,
			...(provider.knowledgeBase
				? {
						knowledgeBase: getKnowledgeBaseSettings({
							providerId: provider.id,
							metadata: {
								knowledgeBase:
									data.knowledgeBase ?? existingMetadata.knowledgeBase,
							},
						}),
					}
				: {}),
		},
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	};

	const [connection] = await db
		.insert(integrationSchema.integrationConnection)
		.values(values)
		.onConflictDoUpdate({
			target: integrationSchema.integrationConnection.id,
			set: {
				label: values.label,
				serverUrl: values.serverUrl,
				usageGuidance: values.usageGuidance,
				authMethod: values.authMethod,
				credentialEnvelope: values.credentialEnvelope,
				headerPreview: values.headerPreview,
				status: values.status,
				enabled: values.enabled,
				rateLimitWindowSeconds: values.rateLimitWindowSeconds,
				rateLimitMaxRequests: values.rateLimitMaxRequests,
				connectedByUserId: values.connectedByUserId,
				lastValidatedAt: values.lastValidatedAt,
				metadata: values.metadata,
				updatedAt: values.updatedAt,
			},
		})
		.returning();

	if (!connection) {
		throw new Error("Unable to save connector.");
	}

	log.info("Integration connection saved.", {
		connectionId: connection.id,
		organizationId: connection.organizationId,
		providerId: connection.providerId,
		status: connection.status,
	});

	return toPublicConnection(connection);
}

export async function createIntegrationOAuthAuthorizationUrl({
	organizationId,
	providerId,
	returnTo,
	userId,
}: {
	organizationId: string;
	providerId: string;
	returnTo?: string;
	userId: string;
}) {
	const provider = getConnectorProvider(providerId);

	if (!provider?.oauth || !provider.authMethods.includes("oauth")) {
		throw new Error("OAuth is not supported for this connector.");
	}

	const config = getOAuthClientConfig(provider.id);
	if (!config) {
		throw new Error(
			`${provider.name} OAuth is not configured for this deployment.`,
		);
	}

	const state = randomBytes(32).toString("base64url");
	const redirectUri = getDefaultOAuthCallbackUrl();
	const safeReturnTo = sanitizeOAuthReturnTo(returnTo);
	const codeVerifier = createCodeVerifier();
	const authorizationUrl = new URL(provider.oauth.authorizationUrl);

	authorizationUrl.searchParams.set("client_id", config.clientId);
	authorizationUrl.searchParams.set("redirect_uri", redirectUri);
	authorizationUrl.searchParams.set("response_type", "code");
	authorizationUrl.searchParams.set("state", state);

	if (config.provider === "notion") {
		authorizationUrl.searchParams.set("owner", "user");
	} else {
		authorizationUrl.searchParams.set(
			"scope",
			provider.oauth.scopes.join(",") || "read",
		);
		authorizationUrl.searchParams.set("actor", "app");

		authorizationUrl.searchParams.set(
			"code_challenge",
			createCodeChallenge(codeVerifier),
		);
		authorizationUrl.searchParams.set("code_challenge_method", "S256");
	}

	await db.insert(integrationSchema.integrationOAuthState).values({
		id: `oauth_${randomUUID()}`,
		organizationId,
		providerId: provider.id,
		userId,
		state,
		codeVerifier,
		redirectUri,
		returnTo: safeReturnTo,
		expiresAt: new Date(Date.now() + oauthStateTtlMs),
	});

	log.info("Integration OAuth flow started.", {
		organizationId,
		providerId: provider.id,
	});

	return {
		authorizationUrl: authorizationUrl.toString(),
		expiresAt: new Date(Date.now() + oauthStateTtlMs).toISOString(),
	};
}

export async function completeIntegrationOAuthCallback({
	code,
	state,
}: {
	code: string;
	state: string;
}) {
	const oauthState = await readOAuthState(state);

	if (!oauthState) {
		throw new Error("OAuth state was not found.");
	}

	if (oauthState.expiresAt.getTime() < Date.now()) {
		throw new Error("OAuth state expired. Please try again.");
	}

	const provider = getConnectorProvider(oauthState.providerId);
	if (!provider?.oauth) {
		throw new Error("OAuth provider was not found.");
	}

	const config = getOAuthClientConfig(provider.id);
	if (!config) {
		throw new Error(
			`${provider.name} OAuth is not configured for this deployment.`,
		);
	}

	const token = await exchangeOAuthCode({
		code,
		codeVerifier: oauthState.codeVerifier,
		config,
		provider,
		redirectUri: oauthState.redirectUri,
	});
	const existing = await getExistingConnectionForUpsert({
		organizationId: oauthState.organizationId,
		providerId: provider.id,
		label: provider.name,
	});
	const existingCredential = existing
		? decryptCredential(existing.credentialEnvelope)
		: null;
	const rateLimit = getConnectorDefaultRateLimit(provider.id);
	const now = new Date();
	const credential: StoredConnectorCredential = {
		...(existingCredential ?? {}),
		oauth: {
			accessToken: token.accessToken,
			refreshToken: token.refreshToken,
			expiresAt: token.expiresAt,
			scopes: token.scopes,
		},
	};
	const existingMetadata = existing ? getConnectionMetadata(existing) : {};
	const values = {
		id: existing?.id ?? `int_${randomUUID()}`,
		organizationId: oauthState.organizationId,
		providerId: provider.id,
		providerType: provider.type,
		label: existing?.label ?? provider.name,
		serverUrl: existing?.serverUrl ?? provider.defaultServerUrl,
		usageGuidance: existing?.usageGuidance ?? null,
		authMethod: "oauth" as const,
		credentialEnvelope: encryptCredential(credential),
		headerPreview: redactHeaders(credential.headers ?? {}),
		status: "connected" as const,
		enabled: true,
		rateLimitWindowSeconds:
			existing?.rateLimitWindowSeconds ?? rateLimit.windowSeconds,
		rateLimitMaxRequests:
			existing?.rateLimitMaxRequests ?? rateLimit.maxRequests,
		connectedByUserId: oauthState.userId,
		lastValidatedAt: now,
		metadata: {
			...existingMetadata,
			oauthProvider: config.provider,
			oauthScopes: token.scopes ?? provider.oauth.scopes,
			oauthConnectedAt: now.toISOString(),
			tools: provider.tools.map((tool) => tool.name),
			documentationUrl: provider.documentationUrl,
			...(provider.knowledgeBase
				? {
						knowledgeBase: getKnowledgeBaseSettings({
							providerId: provider.id,
							metadata: existingMetadata,
						}),
					}
				: {}),
		},
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
	};

	const [connection] = await db
		.insert(integrationSchema.integrationConnection)
		.values(values)
		.onConflictDoUpdate({
			target: integrationSchema.integrationConnection.id,
			set: {
				authMethod: values.authMethod,
				credentialEnvelope: values.credentialEnvelope,
				headerPreview: values.headerPreview,
				status: values.status,
				enabled: values.enabled,
				connectedByUserId: values.connectedByUserId,
				lastValidatedAt: values.lastValidatedAt,
				metadata: values.metadata,
				updatedAt: values.updatedAt,
			},
		})
		.returning();

	if (!connection) {
		throw new Error("Unable to save OAuth connector.");
	}

	log.info("Integration OAuth flow completed.", {
		connectionId: connection.id,
		organizationId: connection.organizationId,
		providerId: connection.providerId,
	});

	return {
		connection: toPublicConnection(connection),
		returnTo: oauthState.returnTo ?? getDefaultIntegrationsReturnUrl(),
	};
}

export async function setIntegrationConnectionEnabled({
	connectionId,
	organizationId,
	enabled,
}: {
	connectionId: string;
	organizationId: string;
	enabled: boolean;
}) {
	const [connection] = await db
		.update(integrationSchema.integrationConnection)
		.set({
			enabled,
			status: enabled ? "connected" : "disabled",
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(integrationSchema.integrationConnection.id, connectionId),
				eq(
					integrationSchema.integrationConnection.organizationId,
					organizationId,
				),
			),
		)
		.returning();

	return connection ? toPublicConnection(connection) : null;
}

export async function deleteIntegrationConnection({
	connectionId,
	organizationId,
}: {
	connectionId: string;
	organizationId: string;
}) {
	const [deleted] = await db
		.delete(integrationSchema.integrationConnection)
		.where(
			and(
				eq(integrationSchema.integrationConnection.id, connectionId),
				eq(
					integrationSchema.integrationConnection.organizationId,
					organizationId,
				),
			),
		)
		.returning({
			id: integrationSchema.integrationConnection.id,
		});

	return Boolean(deleted);
}

export async function listEnabledIntegrationToolContexts({
	organizationId,
}: {
	organizationId: string | null;
}): Promise<IntegrationToolContext[]> {
	if (!organizationId) {
		return [];
	}

	const connections = await db
		.select()
		.from(integrationSchema.integrationConnection)
		.where(
			and(
				eq(
					integrationSchema.integrationConnection.organizationId,
					organizationId,
				),
				eq(integrationSchema.integrationConnection.enabled, true),
			),
		);

	return connections.flatMap((connection) => {
		const provider = getConnectorProvider(connection.providerId);
		if (!provider) {
			return [];
		}

		return [
			{
				connectionId: connection.id,
				providerId: connection.providerId,
				providerType: provider.type,
				label: connection.label,
				serverUrl: connection.serverUrl,
				usageGuidance: connection.usageGuidance,
				tools: provider.tools.map((tool) => ({
					name: tool.name,
					title: tool.title,
					description: tool.description,
					permission: tool.permission,
				})),
				rateLimit: {
					windowSeconds: connection.rateLimitWindowSeconds,
					maxRequests: connection.rateLimitMaxRequests,
				},
				knowledgeBase: getKnowledgeBaseSettings({
					providerId: connection.providerId,
					metadata: getConnectionMetadata(connection),
				}),
			},
		];
	});
}

export async function createEnabledMcpToolSetForOrganization({
	organizationId,
	repositoryFullName,
}: {
	organizationId: string | null;
	repositoryFullName?: string | null;
}) {
	if (!organizationId) {
		return createConnectorMcpToolSet({ connections: [] });
	}

	const connections = await db
		.select()
		.from(integrationSchema.integrationConnection)
		.where(
			and(
				eq(
					integrationSchema.integrationConnection.organizationId,
					organizationId,
				),
				eq(integrationSchema.integrationConnection.providerType, "mcp"),
				eq(integrationSchema.integrationConnection.enabled, true),
			),
		);
	const connectionById = new Map(
		connections.map((connection) => [connection.id, connection]),
	);

	return createConnectorMcpToolSet({
		connections: connections.flatMap((connection) => {
			const provider = getConnectorProvider(connection.providerId);
			if (!provider || connection.status !== "connected") {
				return [];
			}

			const knowledgeBase = getKnowledgeBaseSettings({
				providerId: connection.providerId,
				metadata: getConnectionMetadata(connection),
			});
			if (
				!canUseKnowledgeBaseForRepository({
					knowledgeBase,
					repositoryFullName,
				})
			) {
				return [];
			}

			return [
				{
					connectionId: connection.id,
					providerId: connection.providerId,
					label: connection.label,
					serverUrl: connection.serverUrl,
					headers: buildConnectorRequestHeaders(
						decryptCredential(connection.credentialEnvelope),
					),
				},
			];
		}),
		onConnectionError: ({ connection, error }) => {
			log.warn(
				{ err: error, connectionId: connection.connectionId },
				"MCP connection failed; continuing without its tools.",
			);
		},
		onToolCall: async ({ connectionId, toolName }) => {
			const connection = connectionById.get(connectionId);
			if (!connection) {
				return;
			}

			await consumeIntegrationToolRateLimit({ connection, toolName });
			await db
				.update(integrationSchema.integrationConnection)
				.set({ lastUsedAt: new Date() })
				.where(eq(integrationSchema.integrationConnection.id, connection.id));
		},
	});
}

function createCodeVerifier() {
	return randomBytes(32).toString("base64url");
}

function createCodeChallenge(codeVerifier: string) {
	return createHash("sha256").update(codeVerifier).digest("base64url");
}

function getDefaultOAuthCallbackUrl() {
	return `${env.NEXT_PUBLIC_SERVER_URL.replace(/\/$/, "")}/integrations/oauth/callback`;
}

function getDefaultIntegrationsReturnUrl() {
	return `${env.CORS_ORIGIN.replace(/\/$/, "")}/integrations`;
}

function sanitizeOAuthReturnTo(returnTo: string | undefined) {
	if (!returnTo) {
		return getDefaultIntegrationsReturnUrl();
	}

	try {
		const url = new URL(returnTo);
		const allowedOrigins = new Set([
			new URL(env.CORS_ORIGIN).origin,
			new URL(env.BETTER_AUTH_URL).origin,
		]);

		return allowedOrigins.has(url.origin)
			? url.toString()
			: getDefaultIntegrationsReturnUrl();
	} catch {
		return getDefaultIntegrationsReturnUrl();
	}
}

function getOAuthClientConfig(providerId: string): OAuthClientConfig | null {
	if (providerId === "notion-mcp") {
		if (!env.NOTION_OAUTH_CLIENT_ID || !env.NOTION_OAUTH_CLIENT_SECRET) {
			return null;
		}

		return {
			clientId: env.NOTION_OAUTH_CLIENT_ID,
			clientSecret: env.NOTION_OAUTH_CLIENT_SECRET,
			provider: "notion",
		};
	}

	if (providerId === "linear" || providerId === "linear-mcp") {
		if (!env.LINEAR_OAUTH_CLIENT_ID || !env.LINEAR_OAUTH_CLIENT_SECRET) {
			return null;
		}

		return {
			clientId: env.LINEAR_OAUTH_CLIENT_ID,
			clientSecret: env.LINEAR_OAUTH_CLIENT_SECRET,
			provider: "linear",
		};
	}

	return null;
}

function parseOAuthTokenResponse(value: unknown) {
	const tokenSchema = z
		.object({
			access_token: z.string(),
			refresh_token: z.string().nullish(),
			expires_in: z.number().nullish(),
			scope: z.string().nullish(),
			token_type: z.string().nullish(),
		})
		.passthrough();

	const token = tokenSchema.parse(value);
	const expiresAt = token.expires_in
		? new Date(Date.now() + token.expires_in * 1000).toISOString()
		: null;
	const scopes = token.scope
		? token.scope
				.split(/[,\s]+/)
				.map((scope) => scope.trim())
				.filter(Boolean)
		: undefined;

	return {
		accessToken: token.access_token,
		refreshToken: token.refresh_token ?? null,
		expiresAt,
		scopes,
		raw: token,
	};
}

async function readOAuthState(state: string) {
	const [row] = await db
		.delete(integrationSchema.integrationOAuthState)
		.where(eq(integrationSchema.integrationOAuthState.state, state))
		.returning();

	return row ?? null;
}

async function exchangeOAuthCode({
	code,
	codeVerifier,
	config,
	provider,
	redirectUri,
}: {
	code: string;
	codeVerifier: string | null;
	config: OAuthClientConfig;
	provider: NonNullable<ReturnType<typeof getConnectorProvider>>;
	redirectUri: string;
}) {
	if (!provider.oauth) {
		throw new Error("OAuth is not supported for this connector.");
	}

	if (config.provider === "notion") {
		const response = await fetch(provider.oauth.tokenUrl, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				"Notion-Version": notionVersion,
				Authorization: `Basic ${Buffer.from(
					`${config.clientId}:${config.clientSecret}`,
				).toString("base64")}`,
			},
			body: JSON.stringify({
				grant_type: "authorization_code",
				code,
				redirect_uri: redirectUri,
			}),
		});

		if (!response.ok) {
			throw new Error(`Notion OAuth returned ${response.status}.`);
		}

		return parseOAuthTokenResponse(await response.json());
	}

	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		redirect_uri: redirectUri,
		client_id: config.clientId,
		client_secret: config.clientSecret,
	});

	if (codeVerifier) {
		body.set("code_verifier", codeVerifier);
	}

	const response = await fetch(provider.oauth.tokenUrl, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body,
	});

	if (!response.ok) {
		throw new Error(`Linear OAuth returned ${response.status}.`);
	}

	return parseOAuthTokenResponse(await response.json());
}

async function consumeIntegrationToolRateLimit({
	connection,
	toolName,
}: {
	connection: IntegrationConnectionRow;
	toolName: string;
}) {
	const decision = await consumeAppRateLimit({
		key: buildAppRateLimitKey({
			scope: "user",
			subject: connection.organizationId,
			route: createRateLimitKeyFromRequestPath(
				`integration/${connection.id}/${toolName}`,
			),
		}),
		rule: {
			window: connection.rateLimitWindowSeconds,
			max: connection.rateLimitMaxRequests,
		},
	});

	if (!decision.allowed) {
		throw new Error(
			`Connector rate limit exceeded. Retry in ${decision.retryAfter ?? 1}s.`,
		);
	}
}

function assertLinearIssuesPayload(value: unknown): LinearIssueSearchResult[] {
	const issueSchema = z.object({
		id: z.string(),
		identifier: z.string().nullish(),
		title: z.string(),
		url: z.string().nullish(),
		updatedAt: z.string().nullish(),
		state: z.object({ name: z.string().nullish() }).nullish(),
		assignee: z.object({ name: z.string().nullish() }).nullish(),
	});
	const payloadSchema = z.object({
		data: z.object({
			issues: z.object({
				nodes: z.array(issueSchema),
			}),
		}),
		errors: z
			.array(
				z.object({
					message: z.string(),
				}),
			)
			.optional(),
	});
	const parsed = payloadSchema.parse(value);

	if (parsed.errors?.length) {
		throw new Error(parsed.errors[0]?.message ?? "Linear query failed.");
	}

	return parsed.data.issues.nodes.map((issue) => ({
		id: issue.id,
		identifier: issue.identifier ?? null,
		title: issue.title,
		url: issue.url ?? null,
		state: issue.state?.name ?? null,
		assignee: issue.assignee?.name ?? null,
		updatedAt: issue.updatedAt ?? null,
	}));
}

function getLinearAuthorizationHeader(
	credential: StoredConnectorCredential | null,
) {
	if (credential?.apiKey) {
		return credential.apiKey;
	}

	if (credential?.oauth?.accessToken) {
		return `Bearer ${credential.oauth.accessToken}`;
	}

	return null;
}

export async function searchLinearIssuesForOrganization({
	organizationId,
	repositoryFullName,
	query,
	limit,
}: {
	organizationId: string | null;
	repositoryFullName?: string | null;
	query: string;
	limit: number;
}) {
	if (!organizationId) {
		return [];
	}

	const [connection] = await db
		.select()
		.from(integrationSchema.integrationConnection)
		.where(
			and(
				eq(
					integrationSchema.integrationConnection.organizationId,
					organizationId,
				),
				eq(integrationSchema.integrationConnection.providerId, "linear"),
				eq(integrationSchema.integrationConnection.enabled, true),
			),
		)
		.limit(1);

	if (!connection) {
		return [];
	}

	const credential = decryptCredential(connection.credentialEnvelope);
	const knowledgeBase = getKnowledgeBaseSettings({
		providerId: connection.providerId,
		metadata: getConnectionMetadata(connection),
	});
	if (
		!canUseKnowledgeBaseForRepository({
			knowledgeBase,
			repositoryFullName,
		})
	) {
		return [];
	}

	const authorization = getLinearAuthorizationHeader(credential);
	if (!authorization) {
		return [];
	}

	await consumeIntegrationToolRateLimit({
		connection,
		toolName: "search_linear_issues",
	});

	const response = await fetch(
		connection.serverUrl ?? "https://api.linear.app/graphql",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: authorization,
				...(credential?.headers ?? {}),
			},
			body: JSON.stringify({
				query: `
query SearchLinearIssues($term: String!, $first: Int!) {
	issues(search: $term, first: $first) {
		nodes {
			id
			identifier
			title
			url
			updatedAt
			state { name }
			assignee { name }
		}
	}
}
`.trim(),
				variables: {
					term: query,
					first: Math.min(Math.max(limit, 1), 20),
				},
			}),
		},
	);

	if (!response.ok) {
		throw new Error(`Linear API returned ${response.status}.`);
	}

	const results = assertLinearIssuesPayload(await response.json());

	await db
		.update(integrationSchema.integrationConnection)
		.set({ lastUsedAt: new Date() })
		.where(eq(integrationSchema.integrationConnection.id, connection.id));

	return results;
}
