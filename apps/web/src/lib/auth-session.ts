import { env } from "@gitpal/env/server";

type AuthUser = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	createdAt: string | Date;
	updatedAt: string | Date;
};

type AuthSessionRecord = {
	id: string;
	token: string;
	userId: string;
	expiresAt: string | Date;
	createdAt: string | Date;
	updatedAt: string | Date;
	ipAddress?: string | null;
	userAgent?: string | null;
	activeOrganizationId?: string | null;
	activeTeamId?: string | null;
};

export type ServerAuthSession = {
	user: AuthUser;
	session: AuthSessionRecord;
} | null;

function getDevelopmentSession(): ServerAuthSession {
	const now = new Date();

	return {
		user: {
			id: "codex_demo_user",
			name: "MonoBit",
			email: "monobit.demo@example.com",
			emailVerified: true,
			image: "https://avatars.githubusercontent.com/u/9919?v=4",
			createdAt: now,
			updatedAt: now,
		},
		session: {
			id: "codex_demo_session",
			token: "codex-demo-session-token",
			userId: "codex_demo_user",
			expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
			createdAt: now,
			updatedAt: now,
			ipAddress: "127.0.0.1",
			userAgent: "Codex Browser",
			activeOrganizationId: null,
			activeTeamId: null,
		},
	};
}

export async function getServerAuthSession(
	requestHeaders: Headers,
): Promise<ServerAuthSession> {
	const cookie = requestHeaders.get("cookie");
	const isProduction = env.NODE_ENV === "production";

	if (!cookie) {
		return isProduction ? null : getDevelopmentSession();
	}

	const response = await fetch(
		`${env.NEXT_PUBLIC_SERVER_URL}/api/auth/get-session`,
		{
			cache: "no-store",
			headers: {
				cookie,
			},
		},
	);

	if (!response.ok) {
		return isProduction ? null : getDevelopmentSession();
	}

	const session = (await response.json()) as ServerAuthSession;

	return (
		session ??
		(isProduction ? null : getDevelopmentSession())
	);
}
