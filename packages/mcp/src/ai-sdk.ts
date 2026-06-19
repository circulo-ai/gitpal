import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { ToolSet } from "ai";
import { buildConnectorToolName, getConnectorProvider } from "./catalog";
import {
	normalizeConnectorHeaders,
	normalizeConnectorServerUrl,
} from "./security";

export type ConnectorMcpToolConnection = {
	connectionId: string;
	providerId: string;
	label: string;
	serverUrl: string | null;
	headers?: Record<string, string>;
	allowedToolNames?: readonly string[];
};

export type ConnectorMcpToolCall = {
	connectionId: string;
	providerId: string;
	label: string;
	toolName: string;
	exposedToolName: string;
};

export type ConnectorMcpConnectionSummary = {
	connectionId: string;
	providerId: string;
	label: string;
	serverUrl: string;
	toolCount: number;
	status: "connected" | "skipped" | "error";
	error?: string;
};

export type ConnectorMcpToolSet = {
	tools: ToolSet;
	connections: ConnectorMcpConnectionSummary[];
	close: () => Promise<void>;
};

type McpTool = Awaited<ReturnType<MCPClient["tools"]>>[string];
type ExecutableMcpTool = McpTool & {
	execute: (input: unknown, options: unknown) => unknown | Promise<unknown>;
};
type AiSdkTool = ToolSet[string];

function toToolScope(connection: ConnectorMcpToolConnection) {
	const connectionSuffix = connection.connectionId
		.replace(/^int_/, "")
		.replace(/[^a-z0-9]+/gi, "_")
		.slice(0, 10);

	return [connection.providerId, connectionSuffix].filter(Boolean).join("_");
}

function getUniqueToolName(tools: ToolSet, preferredName: string) {
	if (!tools[preferredName]) {
		return preferredName;
	}

	let index = 2;
	let nextName = `${preferredName}_${index}`;
	while (tools[nextName]) {
		index += 1;
		nextName = `${preferredName}_${index}`;
	}

	return nextName;
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : "Unknown MCP error.";
}

function wrapMcpTool({
	connection,
	remoteToolName,
	exposedToolName,
	tool,
	onToolCall,
}: {
	connection: ConnectorMcpToolConnection;
	remoteToolName: string;
	exposedToolName: string;
	tool: ExecutableMcpTool;
	onToolCall?: (event: ConnectorMcpToolCall) => Promise<void> | void;
}): AiSdkTool {
	const execute = tool.execute.bind(tool);

	return {
		...tool,
		execute: async (input, options) => {
			await onToolCall?.({
				connectionId: connection.connectionId,
				providerId: connection.providerId,
				label: connection.label,
				toolName: remoteToolName,
				exposedToolName,
			});

			return execute(input, options);
		},
	} as AiSdkTool;
}

export async function createConnectorMcpToolSet({
	connections,
	onConnectionError,
	onToolCall,
}: {
	connections: ConnectorMcpToolConnection[];
	onConnectionError?: (event: {
		connection: ConnectorMcpToolConnection;
		error: unknown;
	}) => void;
	onToolCall?: (event: ConnectorMcpToolCall) => Promise<void> | void;
}): Promise<ConnectorMcpToolSet> {
	const clients: MCPClient[] = [];
	const tools: ToolSet = {};
	const summaries: ConnectorMcpConnectionSummary[] = [];

	for (const connection of connections) {
		const provider = getConnectorProvider(connection.providerId);
		const allowedToolNames = connection.allowedToolNames
			? new Set(connection.allowedToolNames)
			: null;
		let serverUrl: string | null = null;
		let client: MCPClient | null = null;

		try {
			if (provider?.type !== "mcp") {
				continue;
			}

			serverUrl = normalizeConnectorServerUrl(connection.serverUrl);
			if (!serverUrl) {
				summaries.push({
					connectionId: connection.connectionId,
					providerId: connection.providerId,
					label: connection.label,
					serverUrl: "",
					toolCount: 0,
					status: "skipped",
					error: "Missing MCP server URL.",
				});
				continue;
			}

			client = await createMCPClient({
				transport: {
					type: "http",
					url: serverUrl,
					headers: normalizeConnectorHeaders(connection.headers ?? {}),
					redirect: "error",
				},
			});
			clients.push(client);

			const remoteTools = await client.tools();
			let exposedToolCount = 0;

			for (const [remoteToolName, remoteTool] of Object.entries(
				remoteTools,
			) as Array<[string, ExecutableMcpTool]>) {
				if (allowedToolNames && !allowedToolNames.has(remoteToolName)) {
					continue;
				}

				const preferredName = buildConnectorToolName(
					toToolScope(connection),
					remoteToolName,
				);
				const exposedToolName = getUniqueToolName(tools, preferredName);

				tools[exposedToolName] = wrapMcpTool({
					connection,
					remoteToolName,
					exposedToolName,
					tool: remoteTool,
					onToolCall,
				});
				exposedToolCount += 1;
			}

			summaries.push({
				connectionId: connection.connectionId,
				providerId: connection.providerId,
				label: connection.label,
				serverUrl,
				toolCount: exposedToolCount,
				status: "connected",
			});
		} catch (error) {
			if (client && !clients.includes(client)) {
				await client.close().catch(() => undefined);
			}

			onConnectionError?.({ connection, error });
			summaries.push({
				connectionId: connection.connectionId,
				providerId: connection.providerId,
				label: connection.label,
				serverUrl: serverUrl ?? connection.serverUrl ?? "",
				toolCount: 0,
				status: "error",
				error: getErrorMessage(error),
			});
		}
	}

	return {
		tools,
		connections: summaries,
		close: async () => {
			await Promise.all(clients.map((client) => client.close()));
		},
	};
}
