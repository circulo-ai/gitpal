import { z } from "zod";

/**
 * Router identifiers describe *how* a model request is dispatched. A router can
 * front several upstream providers (for example, the AI gateway or OpenRouter)
 * or target a single provider API directly.
 */
export const llmRouterIdSchema = z.enum([
	"ai-gateway",
	"openrouter",
	"ollama",
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
	/** Lower-cased identifiers used to map a model id back to this provider. */
	modelPrefixes: readonly string[];
	suggestedModels: readonly string[];
	baseUrl: string | null;
	keyPlaceholder: string;
	/**
	 * True when the provider runs locally and therefore does not require an API
	 * key (for example, a self-hosted Ollama server).
	 */
	local?: boolean;
};

/**
 * Aggregator router prefixes. A model routed through one of these keeps the
 * *upstream* provider prefix (e.g. `openrouter/anthropic/claude-...`), so we
 * strip them before trying to detect the underlying provider.
 */
const AGGREGATOR_MODEL_PREFIXES = ["openrouter/", "ollama/"] as const;

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
		description:
			"OpenAI models and compatible endpoints with native OpenAI keys.",
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
		description:
			"Route compatible models through OpenRouter with your own key.",
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
		id: "ollama",
		label: "Ollama",
		description:
			"Route models through a local Ollama server. No API key required.",
		family: "openai-compatible",
		modelPrefixes: ["ollama"],
		suggestedModels: ["ollama/llama3.2", "ollama/qwen2.5", "ollama/gemma3"],
		baseUrl: "http://localhost:11434/api",
		keyPlaceholder: "",
		local: true,
	},
	{
		id: "xai",
		label: "xAI",
		description: "Grok and xAI endpoints through an OpenAI-compatible API.",
		family: "openai-compatible",
		modelPrefixes: ["xai", "grok"],
		suggestedModels: ["xai/grok-4", "xai/grok-3", "xai/grok-3-mini"],
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
		suggestedModels: ["deepseek/deepseek-chat", "deepseek/deepseek-reasoner"],
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

const providerById: ReadonlyMap<string, LlmProviderDefinition> = new Map(
	llmProviderCatalog.map((provider) => [provider.id, provider]),
);

export function getLlmProviderDefinition(
	providerId: LlmProviderId | string,
): LlmProviderDefinition | null {
	return providerById.get(providerId) ?? null;
}

/**
 * Whether a provider needs an API key. Unknown providers are treated as
 * key-requiring so we fail closed rather than silently accepting empty keys.
 */
export function providerRequiresApiKey(
	providerId: LlmProviderId | string,
): boolean {
	const definition = getLlmProviderDefinition(providerId);
	return definition ? definition.local !== true : true;
}

const MASK_CHARACTER = "\u2022";

/**
 * Produce a display-safe representation of a secret. Short secrets are masked
 * entirely (they lack the entropy to expose a prefix/suffix safely); longer
 * secrets reveal only the first and last four characters.
 */
export function maskSecret(secret: string): string {
	const trimmed = secret.trim();

	if (trimmed.length === 0) {
		return "";
	}

	if (trimmed.length <= 8) {
		return MASK_CHARACTER.repeat(8);
	}

	return `${trimmed.slice(0, 4)}${MASK_CHARACTER.repeat(4)}${trimmed.slice(-4)}`;
}

/** Strip any leading aggregator router prefixes (handles nested prefixes). */
function stripAggregatorPrefixes(modelId: string): string {
	let result = modelId;
	let changed = true;

	while (changed) {
		changed = false;
		for (const prefix of AGGREGATOR_MODEL_PREFIXES) {
			if (result.startsWith(prefix)) {
				result = result.slice(prefix.length);
				changed = true;
			}
		}
	}

	return result;
}

/**
 * Best-effort detection of the provider that owns a model id. Returns null when
 * no provider prefix matches.
 */
export function inferProviderIdFromModel(
	modelId: string,
): LlmProviderId | null {
	const normalized = stripAggregatorPrefixes(modelId.trim().toLowerCase());

	if (!normalized) {
		return null;
	}

	const [prefix] = normalized.split("/", 1);

	if (!prefix) {
		return null;
	}

	// Exact match on a leading path segment, e.g. "anthropic/claude-..." or "gpt".
	const exactMatch = llmProviderCatalog.find((provider) =>
		(provider.modelPrefixes as readonly string[]).includes(prefix),
	);

	if (exactMatch) {
		return exactMatch.id;
	}

	// Hyphenated match for bare model ids, e.g. "claude-3.5" or "gpt-5".
	const partialMatch = llmProviderCatalog.find((provider) =>
		provider.modelPrefixes.some((candidate) =>
			normalized.startsWith(`${candidate}-`),
		),
	);

	return partialMatch?.id ?? null;
}

/**
 * Expand a model id into the variants we compare against: the normalized id and,
 * when aggregator prefixes are present, the stripped upstream id.
 */
function modelMatchVariants(modelId: string): string[] {
	const normalized = modelId.trim().toLowerCase();

	if (!normalized) {
		return [];
	}

	const stripped = stripAggregatorPrefixes(normalized);

	return stripped === normalized ? [normalized] : [normalized, stripped];
}

/**
 * Check whether a model id is permitted by an allow-list. An empty allow-list
 * permits everything. A bare provider/family entry (e.g. "anthropic") matches
 * any fully-qualified model under it (e.g. "anthropic/claude-3.5").
 */
export function matchesAllowedModels({
	allowedModels,
	modelId,
}: {
	allowedModels: string[];
	modelId: string;
}): boolean {
	if (allowedModels.length === 0) {
		return true;
	}

	const modelVariants = modelMatchVariants(modelId);

	if (modelVariants.length === 0) {
		return false;
	}

	return allowedModels.some((candidate) => {
		const candidateVariants = modelMatchVariants(candidate);

		return candidateVariants.some((candidateVariant) =>
			modelVariants.some(
				(modelVariant) =>
					modelVariant === candidateVariant ||
					modelVariant.startsWith(`${candidateVariant}/`),
			),
		);
	});
}

function dedupeModelIds(models: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const model of models) {
		const key = model.toLowerCase();
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(model);
	}

	return result;
}

export const byokRoutingSettingsSchema = z
	.object({
		defaultRouter: llmRouterIdSchema.default("ai-gateway"),
		fallbackRouter: llmRouterIdSchema.nullable().default("openrouter"),
		preferUserKeys: z.boolean().default(true),
	})
	// A fallback that equals the default router is redundant; normalize it away.
	.transform((settings) =>
		settings.fallbackRouter === settings.defaultRouter
			? { ...settings, fallbackRouter: null }
			: settings,
	);

export type ByokRoutingSettings = z.infer<typeof byokRoutingSettingsSchema>;

export const byokProviderKeySchema = z
	.object({
		id: z.string().min(1).optional(),
		providerId: llmProviderIdSchema,
		name: z.string().trim().min(1).max(80),
		apiKey: z.string().trim().min(1).max(4096).optional(),
		enabled: z.boolean().default(true),
		priority: z.coerce.number().int().min(1).max(100).default(1),
		forceDirect: z.boolean().default(false),
		allowedModels: z
			.array(z.string().trim().min(1).max(200))
			.default([])
			.transform(dedupeModelIds),
	})
	.superRefine((value, ctx) => {
		// A brand-new credential (no id yet) must include an API key unless the
		// provider runs locally. Updates may omit the key to keep the stored one.
		const isNewCredential = !value.id;
		const hasApiKey =
			typeof value.apiKey === "string" && value.apiKey.length > 0;

		if (
			isNewCredential &&
			!hasApiKey &&
			providerRequiresApiKey(value.providerId)
		) {
			const definition = getLlmProviderDefinition(value.providerId);
			ctx.addIssue({
				code: "custom",
				path: ["apiKey"],
				message: `An API key is required for ${
					definition?.label ?? value.providerId
				}.`,
			});
		}
	});

export type ByokProviderKeyInput = z.infer<typeof byokProviderKeySchema>;
