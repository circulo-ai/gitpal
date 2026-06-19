import { z } from "zod";
import {
	type ConnectorAuthMethod,
	type ConnectorType,
	connectorProviders,
} from "./catalog";

export const connectorAuthMethodSchema = z.enum(["none", "oauth", "api_key"]);
export const connectorTypeSchema = z.enum(["mcp", "issue_tracking", "ci_cd"]);
export const connectorStatusSchema = z.enum([
	"configured",
	"pending_oauth",
	"connected",
	"disabled",
	"error",
]);

export const connectorProviderIdSchema = z.enum(
	connectorProviders.map((provider) => provider.id) as [string, ...string[]],
);

export const connectorKnowledgeBaseSettingsSchema = z
	.object({
		optOut: z.boolean().default(false),
		automaticRepositoryLinking: z.boolean().default(true),
		linkedRepositories: z.array(z.string().min(1).max(240)).max(50).default([]),
	})
	.default({
		optOut: false,
		automaticRepositoryLinking: true,
		linkedRepositories: [],
	});

export const connectorUpsertInputSchema = z.object({
	organizationId: z.string().min(1),
	connectionId: z.string().min(1).optional(),
	providerId: connectorProviderIdSchema,
	label: z.string().min(1).max(120),
	serverUrl: z.string().url().optional().or(z.literal("")),
	usageGuidance: z.string().max(10_000).optional(),
	authMethod: connectorAuthMethodSchema,
	apiKey: z.string().max(4096).optional(),
	additionalHeaders: z
		.string()
		.max(8 * 1024)
		.optional(),
	knowledgeBase: connectorKnowledgeBaseSettingsSchema.optional(),
	enabled: z.boolean().default(true),
});

export const connectorToggleInputSchema = z.object({
	organizationId: z.string().min(1),
	connectionId: z.string().min(1),
	enabled: z.boolean(),
});

export const connectorDeleteInputSchema = z.object({
	organizationId: z.string().min(1),
	connectionId: z.string().min(1),
});

export const connectorOAuthStartInputSchema = z.object({
	organizationId: z.string().min(1),
	providerId: connectorProviderIdSchema,
	returnTo: z.string().url().optional(),
});

export const connectorListInputSchema = z
	.object({
		organizationId: z.string().min(1),
		type: connectorTypeSchema.optional(),
	})
	.optional();

export type ConnectorUpsertInput = z.infer<typeof connectorUpsertInputSchema>;
export type ConnectorAuthMethodValue = z.infer<
	typeof connectorAuthMethodSchema
>;
export type ConnectorTypeValue = z.infer<typeof connectorTypeSchema>;
export type ConnectorKnowledgeBaseSettings = z.infer<
	typeof connectorKnowledgeBaseSettingsSchema
>;

export function isConnectorAuthMethod(
	value: string,
): value is ConnectorAuthMethod {
	return connectorAuthMethodSchema.safeParse(value).success;
}

export function isConnectorType(value: string): value is ConnectorType {
	return connectorTypeSchema.safeParse(value).success;
}
