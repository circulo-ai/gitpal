import { createDb } from "@gitpal/db";
import * as schema from "@gitpal/db/schema/auth";
import { env } from "@gitpal/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import {
	createCloudOAuthPlugin,
	createEnterpriseGitAuthPlugin,
	createSsoPlugin,
} from "./enterprise-git";

export function createAuth() {
	const db = createDb();

	return betterAuth({
		appName: "GitPal",
		database: drizzleAdapter(db, {
			provider: "pg",
			schema,
		}),
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: {
			enabled: false,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		plugins: [
			createCloudOAuthPlugin(),
			createEnterpriseGitAuthPlugin(),
			createSsoPlugin(),
		],
		advanced: {
			defaultCookieAttributes: {
				sameSite: env.NODE_ENV === "production" ? "none" : "lax",
				secure: env.NODE_ENV === "production",
				httpOnly: true,
			},
		},
	});
}

export const auth = createAuth();

export {
	type EnterpriseGitProviderType,
	encryptSecret,
	getEnterpriseGitApiBaseUrl,
	getEnterpriseGitProviderLabel,
	lookupEnterpriseGitProvider,
	normalizeGitHostUrl,
	registerEnterpriseGitProvider,
} from "./enterprise-git";
