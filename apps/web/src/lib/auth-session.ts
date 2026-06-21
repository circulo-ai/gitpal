import { env } from "@gitpal/env/web-server";

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

export async function getServerAuthSession(
	requestHeaders: Headers,
): Promise<ServerAuthSession> {
	const cookie = requestHeaders.get("cookie");

	if (!cookie) {
		return null;
	}

	try {
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
			return null;
		}

		const session = (await response.json()) as ServerAuthSession;

		return session;
	} catch {
		return null;
	}
}
