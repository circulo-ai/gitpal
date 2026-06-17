import { z } from "zod";

export const llmRouterIdSchema = z.enum([
	"ai-gateway",
	"openrouter",
	"direct",
]);

export type LlmRouterId = z.infer<typeof llmRouterIdSchema>;

export type LlmProviderFamily =
	| "anthropic"
	| "google"
	| "openai"
	| "openai-compatible";

export type LlmProviderDefinition = {
	id: string;
	label: string;
	description: string;
	family: LlmProviderFamily;
	modelPrefixes: string[];
	suggestedModels: string[];
	baseUrl: string | null;
	keyPlaceholder: string;
};

export const llmProviderCatalog = [
	{
		id: "anthropic",
		label: "Anthropic",
		description: "Direct Claude access with Anthropic API keys.",
		family: "anthropic",
		modelPrefixes: ["anthropic", "claude"],
		suggestedModels: [
			"anthropic/claude-opus-4.1",
			"anthropic/claude-sonnet-4.6",
			"anthropic/claude-sonnet-4.5",
			"anthropic/claude-3.5-haiku",
		],
		baseUrl: null,
		keyPlaceholder: "sk-ant-...",
	},
	{
		id: "google",
		label: "Google AI Studio",
		description: "Gemini models through Google AI Studio keys.",
		family: "google",
		modelPrefixes: ["google", "gemini"],
		suggestedModels: [
			"google/gemini-2.5-pro",
			"google/gemini-2.5-flash",
			"google/gemini-2.0-flash",
			"google/gemini-2.0-flash-lite",
		],
		baseUrl: null,
		keyPlaceholder: "AIza...",
	},
	{
		id: "openai",
		label: "OpenAI",
		description: "OpenAI models and compatible endpoints with native OpenAI keys.",
		family: "openai",
		modelPrefixes: ["openai", "gpt", "o1", "o3", "o4"],
		suggestedModels: [
			"openai/gpt-5",
			"openai/gpt-5-mini",
			"openai/o4-mini",
			"openai/o3",
		],
		baseUrl: null,
		keyPlaceholder: "sk-proj-...",
	},
	{
		id: "openrouter",
		label: "OpenRouter",
		description: "Route compatible models through OpenRouter with your own key.",
		family: "openai-compatible",
		modelPrefixes: ["openrouter"],
		suggestedModels: [
			"anthropic/claude-sonnet-4.6",
			"openai/gpt-5",
			"google/gemini-2.5-pro",
			"deepseek/deepseek-chat",
		],
		baseUrl: "https://openrouter.ai/api/v1",
		keyPlaceholder: "sk-or-...",
	},
	{
		id: "xai",
		label: "xAI",
		description: "Grok and xAI endpoints through an OpenAI-compatible API.",
		family: "openai-compatible",
		modelPrefixes: ["xai", "grok"],
		suggestedModels: [
			"xai/grok-4",
			"xai/grok-3",
			"xai/grok-3-mini",
		],
		baseUrl: "https://api.x.ai/v1",
		keyPlaceholder: "xai-...",
	},
	{
		id: "groq",
		label: "Groq",
		description: "Ultra-low-latency OpenAI-compatible inference.",
		family: "openai-compatible",
		modelPrefixes: ["groq"],
		suggestedModels: [
			"groq/llama-3.3-70b-versatile",
			"groq/qwen-qwq-32b",
			"groq/deepseek-r1-distill-llama-70b",
		],
		baseUrl: "https://api.groq.com/openai/v1",
		keyPlaceholder: "gsk_...",
	},
	{
		id: "deepseek",
		label: "DeepSeek",
		description: "Direct DeepSeek models via OpenAI-compatible APIs.",
		family: "openai-compatible",
		modelPrefixes: ["deepseek"],
		suggestedModels: [
			"deepseek/deepseek-chat",
			"deepseek/deepseek-reasoner",
		],
		baseUrl: "https://api.deepseek.com/v1",
		keyPlaceholder: "sk-...",
	},
	{
		id: "mistral",
		label: "Mistral",
		description: "Mistral platform models via OpenAI-compatible APIs.",
		family: "openai-compatible",
		modelPrefixes: ["mistral"],
		suggestedModels: [
			"mistral/mistral-large",
			"mistral/mistral-small",
			"mistral/codestral",
		],
		baseUrl: "https://api.mistral.ai/v1",
		keyPlaceholder: "sk-...",
	},
	{
		id: "perplexity",
		label: "Perplexity",
		description: "Search-grounded models via Perplexity's API.",
		family: "openai-compatible",
		modelPrefixes: ["perplexity", "sonar"],
		suggestedModels: [
			"perplexity/sonar",
			"perplexity/sonar-pro",
			"perplexity/sonar-reasoning",
		],
		baseUrl: "https://api.perplexity.ai",
		keyPlaceholder: "pplx-...",
	},
	{
		id: "togetherai",
		label: "Together AI",
		description: "Open models and serverless inference through Together.",
		family: "openai-compatible",
		modelPrefixes: ["together", "togetherai"],
		suggestedModels: [
			"togetherai/meta-llama/Llama-3.3-70B-Instruct-Turbo",
			"togetherai/Qwen/Qwen2.5-72B-Instruct-Turbo",
			"togetherai/deepseek-ai/DeepSeek-V3",
		],
		baseUrl: "https://api.together.xyz/v1",
		keyPlaceholder: "sk-...",
	},
	{
		id: "fireworks",
		label: "Fireworks AI",
		description: "High-throughput OpenAI-compatible inference.",
		family: "openai-compatible",
		modelPrefixes: ["fireworks"],
		suggestedModels: [
			"fireworks/accounts/fireworks/models/llama-v3p1-70b-instruct",
			"fireworks/accounts/fireworks/models/qwen3-235b-a22b",
		],
		baseUrl: "https://api.fireworks.ai/inference/v1",
		keyPlaceholder: "fw_...",
	},
	{
		id: "cerebras",
		label: "Cerebras",
		description: "Fast OpenAI-compatible inference on Cerebras.",
		family: "openai-compatible",
		modelPrefixes: ["cerebras"],
		suggestedModels: [
			"cerebras/llama-4-scout-17b-16e-instruct",
			"cerebras/qwen-3-235b-a22b-instruct-2507",
		],
		baseUrl: "https://api.cerebras.ai/v1",
		keyPlaceholder: "csk-...",
	},
] as const satisfies readonly LlmProviderDefinition[];

export type LlmProviderId = (typeof llmProviderCatalog)[number]["id"];

export const llmProviderIdSchema = z.enum(
	llmProviderCatalog.map((provider) => provider.id) as [
		LlmProviderId,
		...LlmProviderId[],
	],
);

export const byokRoutingSettingsSchema = z.object({
	defaultRouter: llmRouterIdSchema.default("ai-gateway"),
	fallbackRouter: llmRouterIdSchema.nullable().default("openrouter"),
	preferUserKeys: z.boolean().default(true),
});

export type ByokRoutingSettings = z.infer<typeof byokRoutingSettingsSchema>;

export const byokProviderKeySchema = z.object({
	id: z.string().min(1).optional(),
	providerId: llmProviderIdSchema,
	name: z.string().trim().min(1).max(80),
	apiKey: z.string().trim().min(1).max(4096).optional(),
	enabled: z.boolean().default(true),
	priority: z.coerce.number().int().min(1).max(100).default(1),
	forceDirect: z.boolean().default(false),
	allowedModels: z.array(z.string().trim().min(1).max(200)).default([]),
});

export type ByokProviderKeyInput = z.infer<typeof byokProviderKeySchema>;

export function getLlmProviderDefinition(
	providerId: LlmProviderId | string,
): LlmProviderDefinition | null {
	return (
		llmProviderCatalog.find((provider) => provider.id === providerId) ?? null
	);
}

export function maskSecret(secret: string) {
	const trimmed = secret.trim();

	if (trimmed.length <= 8) {
		return trimmed;
	}

	return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

export function inferProviderIdFromModel(
	modelId: string,
): LlmProviderId | null {
	const normalized = modelId.trim().toLowerCase();

	if (!normalized) {
		return null;
	}

	if (normalized.startsWith("openrouter/")) {
		return inferProviderIdFromModel(normalized.slice("openrouter/".length));
	}

	const [prefix] = normalized.split("/", 1);

	if (prefix) {
		const exactMatch = llmProviderCatalog.find((provider) =>
			provider.modelPrefixes.some((candidate) => candidate === prefix),
		);

		if (exactMatch) {
			return exactMatch.id;
		}
	}

	const partialMatch = llmProviderCatalog.find((provider) =>
		provider.modelPrefixes.some((candidate) => normalized.startsWith(`${candidate}-`)),
	);

	return partialMatch?.id ?? null;
}

export function matchesAllowedModels({
	allowedModels,
	modelId,
}: {
	allowedModels: string[];
	modelId: string;
}) {
	if (allowedModels.length === 0) {
		return true;
	}

	const normalizedModelId = modelId.trim().toLowerCase();
	const normalizedModelIdWithoutOpenRouterPrefix = normalizedModelId.startsWith(
		"openrouter/",
	)
		? normalizedModelId.slice("openrouter/".length)
		: normalizedModelId;

	return allowedModels.some((candidate) => {
		const normalizedCandidate = candidate.trim().toLowerCase();
		const normalizedCandidateWithoutOpenRouterPrefix =
			normalizedCandidate.startsWith("openrouter/")
				? normalizedCandidate.slice("openrouter/".length)
				: normalizedCandidate;

		return (
			normalizedCandidate === normalizedModelId ||
			normalizedCandidateWithoutOpenRouterPrefix === normalizedModelIdWithoutOpenRouterPrefix ||
			normalizedModelId.startsWith(`${normalizedCandidate}/`) ||
			normalizedModelIdWithoutOpenRouterPrefix.startsWith(
				`${normalizedCandidateWithoutOpenRouterPrefix}/`,
			)
		);
	});
}
