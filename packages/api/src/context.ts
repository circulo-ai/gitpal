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

const authPackageName = "@gitpal/auth";

async function getAuth() {
	return (await import(authPackageName)) as AuthApi;
}

export async function createContext({ context }: CreateContextOptions) {
	const auth = await getAuth();
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});

	return {
		auth: null,
		session,
	} satisfies Context;
}

export type Context = {
	auth: null;
	session: AuthSession;
};
