export type ConnectorType = "mcp" | "issue_tracking" | "ci_cd";
export type ConnectorAuthMethod = "none" | "oauth" | "api_key";
export type ConnectorStatus =
	| "configured"
	| "pending_oauth"
	| "connected"
	| "disabled"
	| "error";

export type ConnectorToolDefinition = {
	name: string;
	title: string;
	description: string;
	permission: "read" | "write";
};

export type ConnectorProviderDefinition = {
	id: string;
	type: ConnectorType;
	name: string;
	host: string;
	description: string;
	defaultServerUrl: string | null;
	documentationUrl: string;
	authMethods: readonly ConnectorAuthMethod[];
	defaultAuthMethod: ConnectorAuthMethod;
	requiresApiKeyForProduction: boolean;
	defaultRateLimit: {
		windowSeconds: number;
		maxRequests: number;
	};
	scopes: readonly string[];
	tools: readonly ConnectorToolDefinition[];
	oauth?: {
		authorizationUrl: string;
		tokenUrl: string;
		scopes: readonly string[];
	};
};

const oneMinute = 60;

export const connectorProviders = [
	{
		id: "notion-mcp",
		type: "mcp",
		name: "Notion",
		host: "mcp.notion.com",
		description:
			"Access Notion pages and databases through Notion's MCP server.",
		defaultServerUrl: "https://mcp.notion.com/mcp",
		documentationUrl: "https://developers.notion.com/docs/mcp",
		authMethods: ["oauth", "api_key"],
		defaultAuthMethod: "oauth",
		requiresApiKeyForProduction: false,
		defaultRateLimit: { windowSeconds: oneMinute, maxRequests: 60 },
		scopes: ["mcp:tools:read", "mcp:resources:read"],
		oauth: {
			authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
			tokenUrl: "https://api.notion.com/v1/oauth/token",
			scopes: [],
		},
		tools: [
			{
				name: "notion_mcp_context",
				title: "Notion Context",
				description: "Use connected Notion workspace context during reviews.",
				permission: "read",
			},
		],
	},
	{
		id: "context7-mcp",
		type: "mcp",
		name: "Context7",
		host: "mcp.context7.com",
		description: "Fetch current library documentation through Context7 MCP.",
		defaultServerUrl: "https://mcp.context7.com/mcp",
		documentationUrl: "https://context7.com",
		authMethods: ["none", "api_key"],
		defaultAuthMethod: "none",
		requiresApiKeyForProduction: true,
		defaultRateLimit: { windowSeconds: oneMinute, maxRequests: 30 },
		scopes: ["mcp:tools:read", "docs:read"],
		tools: [
			{
				name: "context7_docs",
				title: "Context7 Docs",
				description: "Resolve library documentation for the reviewer.",
				permission: "read",
			},
		],
	},
	{
		id: "linear-mcp",
		type: "mcp",
		name: "Linear MCP",
		host: "mcp.linear.app",
		description: "Expose Linear issue context through Linear's MCP server.",
		defaultServerUrl: "https://mcp.linear.app/mcp",
		documentationUrl: "https://linear.app/developers",
		authMethods: ["oauth", "api_key"],
		defaultAuthMethod: "oauth",
		requiresApiKeyForProduction: false,
		defaultRateLimit: { windowSeconds: oneMinute, maxRequests: 60 },
		scopes: ["mcp:tools:read", "issues:read"],
		oauth: {
			authorizationUrl: "https://linear.app/oauth/authorize",
			tokenUrl: "https://api.linear.app/oauth/token",
			scopes: ["read"],
		},
		tools: [
			{
				name: "linear_mcp_context",
				title: "Linear MCP Context",
				description: "Use Linear MCP context alongside repository review data.",
				permission: "read",
			},
		],
	},
	{
		id: "deepwiki-mcp",
		type: "mcp",
		name: "DeepWiki",
		host: "mcp.deepwiki.com",
		description: "Connect DeepWiki repository knowledge to the review agent.",
		defaultServerUrl: "https://mcp.deepwiki.com/mcp",
		documentationUrl: "https://deepwiki.com",
		authMethods: ["none", "api_key"],
		defaultAuthMethod: "none",
		requiresApiKeyForProduction: false,
		defaultRateLimit: { windowSeconds: oneMinute, maxRequests: 40 },
		scopes: ["mcp:tools:read", "knowledge:read"],
		tools: [
			{
				name: "deepwiki_context",
				title: "DeepWiki Context",
				description: "Read repository knowledge from DeepWiki during reviews.",
				permission: "read",
			},
		],
	},
	{
		id: "linear",
		type: "issue_tracking",
		name: "Linear",
		host: "api.linear.app",
		description: "Search and reference Linear issues from review workflows.",
		defaultServerUrl: "https://api.linear.app/graphql",
		documentationUrl: "https://linear.app/developers/graphql",
		authMethods: ["api_key", "oauth"],
		defaultAuthMethod: "api_key",
		requiresApiKeyForProduction: true,
		defaultRateLimit: { windowSeconds: oneMinute, maxRequests: 60 },
		scopes: ["issues:read", "teams:read"],
		oauth: {
			authorizationUrl: "https://linear.app/oauth/authorize",
			tokenUrl: "https://api.linear.app/oauth/token",
			scopes: ["read"],
		},
		tools: [
			{
				name: "search_linear_issues",
				title: "Search Linear Issues",
				description: "Search Linear issues related to a pull request.",
				permission: "read",
			},
		],
	},
	{
		id: "circleci",
		type: "ci_cd",
		name: "CircleCI",
		host: "circleci.com",
		description: "Expose CI/CD build status and pipeline context to reviews.",
		defaultServerUrl: "https://circleci.com/api/v2",
		documentationUrl: "https://circleci.com/docs/api/v2",
		authMethods: ["api_key"],
		defaultAuthMethod: "api_key",
		requiresApiKeyForProduction: true,
		defaultRateLimit: { windowSeconds: oneMinute, maxRequests: 90 },
		scopes: ["pipeline:read", "job:read"],
		tools: [
			{
				name: "ci_cd_status",
				title: "CI/CD Status",
				description: "Inspect configured CI/CD context for review decisions.",
				permission: "read",
			},
		],
	},
] as const satisfies readonly ConnectorProviderDefinition[];

export type ConnectorProviderId = (typeof connectorProviders)[number]["id"];

const connectorProviderDefinitions: readonly ConnectorProviderDefinition[] =
	connectorProviders;

export const connectorTypeLabels = {
	mcp: "MCP Servers",
	issue_tracking: "Issue Tracking",
	ci_cd: "CI/CD",
} as const satisfies Record<ConnectorType, string>;

export function listConnectorProviders(type?: ConnectorType) {
	return connectorProviderDefinitions.filter((provider) =>
		type ? provider.type === type : true,
	);
}

export function getConnectorProvider(
	providerId: string,
): ConnectorProviderDefinition | null {
	return (
		connectorProviderDefinitions.find(
			(provider) => provider.id === providerId,
		) ?? null
	);
}

export function getConnectorDefaultRateLimit(providerId: string) {
	return (
		getConnectorProvider(providerId)?.defaultRateLimit ?? {
			windowSeconds: 60,
			maxRequests: 30,
		}
	);
}

export function buildConnectorToolName(providerId: string, toolName: string) {
	return `${providerId.replace(/[^a-z0-9]+/gi, "_")}_${toolName}`;
}
