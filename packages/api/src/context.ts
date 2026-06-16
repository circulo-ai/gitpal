import { createDb } from "@gitpal/db";
import * as authSchema from "@gitpal/db/schema/auth";
import { env } from "@gitpal/env/server";
import type { Context as HonoContext } from "hono";
import { eq } from "drizzle-orm";

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
	activeOrganizationId?: string | null;
	activeTeamId?: string | null;
};

type AuthSession = {
	user: AuthUser;
	session: AuthSessionRecord;
} | null;

export type RequestMetadata = {
	ip: string | null;
	userAgent: string | null;
	method: string;
	path: string;
};

type AuthApi = {
	api: {
		getSession(input: { headers: Headers }): Promise<AuthSession>;
	};
};

type AuthModule = {
	auth: AuthApi;
};

const authPackageName = "@gitpal/auth";
const db = createDb();

function resolveClientIp(headers: Headers) {
	const forwardedFor = headers.get("x-forwarded-for");
	const forwardedIp = forwardedFor?.split(",")[0]?.trim();

	return (
		headers.get("cf-connecting-ip") ??
		headers.get("x-real-ip") ??
		headers.get("x-client-ip") ??
		forwardedIp ??
		null
	);
}

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
			activeOrganizationId: null,
			activeTeamId: null,
		},
	};
}

async function getAuth() {
	return (await import(authPackageName)) as AuthModule;
}

async function ensureSessionUserRecord(session: Exclude<AuthSession, null>) {
	const [existing] = await db
		.select({
			id: authSchema.user.id,
		})
		.from(authSchema.user)
		.where(eq(authSchema.user.id, session.user.id))
		.limit(1);

	if (existing) {
		return;
	}

	await db.insert(authSchema.user).values({
		id: session.user.id,
		name: session.user.name,
		email: session.user.email,
		emailVerified: session.user.emailVerified,
		image: session.user.image ?? null,
		createdAt: new Date(session.user.createdAt),
		updatedAt: new Date(session.user.updatedAt),
	});
}

export async function createContext({ context }: CreateContextOptions) {
	const auth = await getAuth();
	const session = await auth.auth.api.getSession({
		headers: context.req.raw.headers,
	});
	const resolvedSession = session ?? (env.NODE_ENV !== "production" ? getDevelopmentSession() : null);
	const headers = context.req.raw.headers;
	const url = new URL(context.req.raw.url);

	if (resolvedSession) {
		await ensureSessionUserRecord(resolvedSession);
	}

	return {
		auth: null,
		session: resolvedSession,
		request: {
			ip: resolveClientIp(headers),
			userAgent: headers.get("user-agent"),
			method: context.req.method,
			path: url.pathname,
		},
	} satisfies Context;
}

export type Context = {
	auth: null;
	session: AuthSession;
	request: RequestMetadata;
};
