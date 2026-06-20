import { createLinearAdapter } from "@chat-adapter/linear";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createRedisState } from "@chat-adapter/state-redis";
import {
	createTeamsAdapter,
	encodeThreadId as encodeTeamsThreadId,
} from "@chat-adapter/teams";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { env } from "@gitpal/env/server";
import {
	createResendAdapter,
	type ResendAdapter,
} from "@resend/chat-sdk-adapter";
import { type Adapter, Chat } from "chat";
import { z } from "zod";
import { normalizeTrustedServiceUrl } from "./trusted-service-url";

export const notificationChannelProviders = [
	"resend",
	"telegram",
	"linear",
	"teams",
	"slack",
] as const;

export const notificationChannelProviderSchema = z.enum(
	notificationChannelProviders,
);

const requiredSecretSchema = z.string().trim().min(1);
const optionalSecretSchema = z.string().trim().min(1).optional();

export const telegramChannelCredentialSchema = z.object({
	botToken: requiredSecretSchema,
	chatId: requiredSecretSchema,
	webhookSecretToken: optionalSecretSchema,
	botUsername: optionalSecretSchema,
});

export const slackChannelCredentialSchema = z.object({
	botToken: requiredSecretSchema,
	channelId: requiredSecretSchema,
	signingSecret: optionalSecretSchema,
	botUsername: optionalSecretSchema,
});

export const teamsChannelCredentialSchema = z
	.object({
		appId: requiredSecretSchema,
		appPassword: requiredSecretSchema,
		appTenantId: requiredSecretSchema,
		conversationId: requiredSecretSchema,
		serviceUrl: requiredSecretSchema,
		appType: z.enum(["MultiTenant", "SingleTenant"]).optional(),
		botUsername: optionalSecretSchema,
	})
	.transform((credential) => ({
		...credential,
		serviceUrl: normalizeTrustedServiceUrl(credential.serviceUrl, {
			exactHosts: ["smba.trafficmanager.net"],
			hostSuffixes: ["botframework.com"],
		}) as string,
	}));

export const linearChannelCredentialSchema = z
	.object({
		apiKey: optionalSecretSchema,
		accessToken: optionalSecretSchema,
		issueId: requiredSecretSchema,
		webhookSecret: optionalSecretSchema,
		botUsername: optionalSecretSchema,
	})
	.refine((value) => value.apiKey || value.accessToken, {
		message: "Linear API key or access token is required.",
	});

export const resendChannelCredentialSchema = z.object({
	apiKey: requiredSecretSchema,
	fromAddress: requiredSecretSchema.email(),
	fromName: optionalSecretSchema,
	toEmail: requiredSecretSchema.email(),
	webhookSecret: optionalSecretSchema,
});

export const notificationChannelCredentialSchema = z.object({
	telegram: telegramChannelCredentialSchema.optional(),
	slack: slackChannelCredentialSchema.optional(),
	teams: teamsChannelCredentialSchema.optional(),
	linear: linearChannelCredentialSchema.optional(),
	resend: resendChannelCredentialSchema.optional(),
});

export type NotificationChannelProvider = z.infer<
	typeof notificationChannelProviderSchema
>;
export type NotificationChannelCredential = z.infer<
	typeof notificationChannelCredentialSchema
>;

type NotificationChatPayload = {
	title: string;
	body?: string | null;
	actionHref?: string | null;
	category: string;
	severity: string;
};

type SendNotificationViaChatSdkInput = {
	channelId: string;
	provider: NotificationChannelProvider;
	targetId: string | null;
	credential: NotificationChannelCredential;
	notification: NotificationChatPayload;
};

function redactValue(value: string | null | undefined) {
	if (!value) {
		return null;
	}

	if (value.length <= 8) {
		return "****";
	}

	return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

function normalizeProviderTargetId(
	provider: NotificationChannelProvider,
	target: string,
) {
	if (target.startsWith(`${provider}:`)) {
		return target;
	}

	return `${provider}:${target}`;
}

export function getNotificationChannelCredentialPreview(
	credential: NotificationChannelCredential | null,
) {
	if (credential?.telegram) {
		return redactValue(credential.telegram.botToken);
	}

	if (credential?.slack) {
		return redactValue(credential.slack.botToken);
	}

	if (credential?.teams) {
		return redactValue(credential.teams.appPassword);
	}

	if (credential?.linear) {
		return redactValue(
			credential.linear.apiKey ?? credential.linear.accessToken,
		);
	}

	if (credential?.resend) {
		return redactValue(credential.resend.apiKey);
	}

	return null;
}

export function getNotificationChannelTargetId({
	provider,
	credential,
}: {
	provider: NotificationChannelProvider;
	credential: NotificationChannelCredential;
}) {
	switch (provider) {
		case "telegram":
			if (!credential.telegram) {
				throw new Error("Telegram credentials are incomplete.");
			}
			return normalizeProviderTargetId("telegram", credential.telegram.chatId);
		case "slack":
			if (!credential.slack) {
				throw new Error("Slack credentials are incomplete.");
			}
			return normalizeProviderTargetId("slack", credential.slack.channelId);
		case "teams":
			if (!credential.teams) {
				throw new Error("Teams credentials are incomplete.");
			}
			return encodeTeamsThreadId({
				conversationId: credential.teams.conversationId,
				serviceUrl: credential.teams.serviceUrl,
			});
		case "linear":
			if (!credential.linear) {
				throw new Error("Linear credentials are incomplete.");
			}
			return normalizeProviderTargetId("linear", credential.linear.issueId);
		case "resend":
			if (!credential.resend) {
				throw new Error("Resend credentials are incomplete.");
			}
			return credential.resend.toEmail;
	}
}

export function getNotificationChannelTargetPreview({
	provider,
	credential,
}: {
	provider: NotificationChannelProvider;
	credential: NotificationChannelCredential;
}) {
	switch (provider) {
		case "telegram":
			return `Telegram chat ${
				redactValue(credential.telegram?.chatId) ?? "configured"
			}`;
		case "slack":
			return `Slack channel ${
				redactValue(credential.slack?.channelId) ?? "configured"
			}`;
		case "teams":
			return `Teams conversation ${
				redactValue(credential.teams?.conversationId) ?? "configured"
			}`;
		case "linear":
			return `Linear issue ${credential.linear?.issueId ?? "configured"}`;
		case "resend":
			return `Email ${credential.resend?.toEmail ?? "configured"}`;
	}
}

function createNotificationAdapter({
	provider,
	credential,
}: {
	provider: NotificationChannelProvider;
	credential: NotificationChannelCredential;
}): Adapter {
	const userName = getNotificationBotUserName({ provider, credential });

	switch (provider) {
		case "telegram": {
			if (!credential.telegram) {
				throw new Error("Telegram credentials are incomplete.");
			}

			return createTelegramAdapter({
				botToken: credential.telegram.botToken,
				secretToken: credential.telegram.webhookSecretToken,
				userName,
				mode: "webhook",
			}) as Adapter;
		}
		case "slack": {
			if (!credential.slack) {
				throw new Error("Slack credentials are incomplete.");
			}

			return createSlackAdapter({
				botToken: credential.slack.botToken,
				signingSecret: credential.slack.signingSecret,
				userName,
				mode: "webhook",
				installationKeyPrefix: `${env.GITPAL_CHAT_STATE_KEY_PREFIX}:slack-installation`,
			}) as Adapter;
		}
		case "teams": {
			if (!credential.teams) {
				throw new Error("Teams credentials are incomplete.");
			}

			return createTeamsAdapter({
				appId: credential.teams.appId,
				appPassword: credential.teams.appPassword,
				appTenantId: credential.teams.appTenantId,
				appType: credential.teams.appType,
				userName,
			}) as Adapter;
		}
		case "linear": {
			if (!credential.linear) {
				throw new Error("Linear credentials are incomplete.");
			}

			const commonConfig = {
				webhookSecret: credential.linear.webhookSecret,
				userName,
			};

			if (credential.linear.apiKey) {
				return createLinearAdapter({
					...commonConfig,
					apiKey: credential.linear.apiKey,
				}) as Adapter;
			}

			if (!credential.linear.accessToken) {
				throw new Error("Linear API key or access token is required.");
			}

			return createLinearAdapter({
				...commonConfig,
				accessToken: credential.linear.accessToken,
			}) as Adapter;
		}
		case "resend": {
			if (!credential.resend) {
				throw new Error("Resend credentials are incomplete.");
			}

			return createResendAdapter({
				apiKey: credential.resend.apiKey,
				fromAddress: credential.resend.fromAddress,
				fromName: userName,
				webhookSecret: credential.resend.webhookSecret,
			}) as unknown as Adapter;
		}
	}
}

function getNotificationBotUserName({
	provider,
	credential,
}: {
	provider: NotificationChannelProvider;
	credential: NotificationChannelCredential;
}) {
	const fallbackUserName = "GitPal";

	switch (provider) {
		case "telegram":
			return (
				credential.telegram?.botUsername ??
				env.TELEGRAM_BOT_USERNAME ??
				fallbackUserName
			);
		case "slack":
			return (
				credential.slack?.botUsername ??
				env.SLACK_BOT_USERNAME ??
				fallbackUserName
			);
		case "teams":
			return (
				credential.teams?.botUsername ??
				env.TEAMS_BOT_USERNAME ??
				fallbackUserName
			);
		case "linear":
			return (
				credential.linear?.botUsername ??
				env.LINEAR_BOT_USERNAME ??
				fallbackUserName
			);
		case "resend":
			return (
				credential.resend?.fromName ?? env.RESEND_FROM_NAME ?? fallbackUserName
			);
	}
}

function createNotificationChatClient({
	channelId,
	provider,
	credential,
}: {
	channelId: string;
	provider: NotificationChannelProvider;
	credential: NotificationChannelCredential;
}) {
	return new Chat({
		userName: getNotificationBotUserName({ provider, credential }),
		adapters: {
			[provider]: createNotificationAdapter({ provider, credential }),
		} as Record<string, Adapter>,
		state: createRedisState({
			url: env.GITPAL_CHAT_REDIS_URL ?? env.REDIS_URL,
			keyPrefix: `${env.GITPAL_CHAT_STATE_KEY_PREFIX}:notifications:${channelId}`,
		}),
		concurrency: "queue",
		dedupeTtlMs: 10 * 60 * 1000,
		fallbackStreamingPlaceholderText: null,
		streamingUpdateIntervalMs: 1000,
		logger: env.LOG_LEVEL === "debug" ? "debug" : "warn",
	});
}

function buildNotificationMarkdown(notification: NotificationChatPayload) {
	return [
		`**GitPal: ${notification.title}**`,
		notification.body,
		notification.actionHref ? `Open: ${notification.actionHref}` : null,
		`Category: ${notification.category}`,
		`Severity: ${notification.severity}`,
	]
		.filter(Boolean)
		.join("\n\n");
}

export async function sendNotificationViaChatSdk({
	channelId,
	provider,
	targetId,
	credential,
	notification,
}: SendNotificationViaChatSdkInput) {
	const chat = createNotificationChatClient({
		channelId,
		provider,
		credential,
	});
	const markdown = buildNotificationMarkdown(notification);
	const resolvedTargetId =
		targetId ?? getNotificationChannelTargetId({ provider, credential });

	try {
		await chat.initialize();

		switch (provider) {
			case "telegram":
			case "linear":
				await chat.thread(resolvedTargetId).post({ markdown });
				return;
			case "slack":
			case "teams":
				await chat.channel(resolvedTargetId).post({ markdown });
				return;
			case "resend": {
				if (!credential.resend) {
					throw new Error("Resend credentials are incomplete.");
				}

				const resend = chat.getAdapter("resend") as unknown as ResendAdapter;
				const threadId = await resend.openDM(credential.resend.toEmail);
				await chat.thread(threadId).post({ markdown });
			}
		}
	} finally {
		await chat.shutdown();
	}
}
