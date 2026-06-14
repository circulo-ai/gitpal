import { env } from "@gitpal/env/web";

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

	return (await response.json()) as ServerAuthSession;
}
