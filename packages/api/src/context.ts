import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
	context: HonoContext;
};

type AuthUser = {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string | null;
	createdAt: Date;
	updatedAt: Date;
};

type AuthSessionRecord = {
	id: string;
	token: string;
	userId: string;
	expiresAt: Date;
	createdAt: Date;
	updatedAt: Date;
	ipAddress?: string | null;
	userAgent?: string | null;
};

type AuthSession = {
	user: AuthUser;
	session: AuthSessionRecord;
} | null;

type AuthApi = {
	api: {
		getSession(input: { headers: Headers }): Promise<AuthSession>;
	};
};

type AuthModule = {
	auth: AuthApi;
};

const authPackageName = "@gitpal/auth";

function getDevelopmentSession() {
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
		},
	};
}

async function getAuth() {
	return (await import(authPackageName)) as AuthModule;
}

export async function createContext({ context }: CreateContextOptions) {
	const auth = await getAuth();
	const session = await auth.auth.api.getSession({
		headers: context.req.raw.headers,
	});
	const resolvedSession =
		session ?? (process.env.NODE_ENV !== "production" ? getDevelopmentSession() : null);

	return {
		auth: null,
		session: resolvedSession,
	} satisfies Context;
}

export type Context = {
	auth: null;
	session: AuthSession;
};
