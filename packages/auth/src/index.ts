import { apiKey } from "@better-auth/api-key";
import { db } from "@gitpal/db";
import * as schema from "@gitpal/db/schema/auth";
import { env } from "@gitpal/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins/organization";

import {
	createCloudOAuthPlugin,
	createEnterpriseGitAuthPlugin,
} from "./enterprise-git";
import { workspaceAc, workspaceRoles } from "./organization-access";

export function createAuth() {
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
		session: {
			expiresIn: 60 * 60 * 24 * 7,
			updateAge: 60 * 60 * 24,
			freshAge: 60 * 60 * 24,
			cookieCache: {
				enabled: true,
				maxAge: 5 * 60,
				strategy: "compact",
			},
		},
		rateLimit: {
			enabled: env.NODE_ENV === "production",
			window: 60,
			max: 120,
			storage: "database",
			customRules: {
				"/sign-in/*": { window: 60, max: 20 },
				"/sign-up/*": { window: 60, max: 10 },
				"/organization/*": { window: 60, max: 60 },
				"/enterprise-git-host/*": { window: 60, max: 30 },
			},
		},
		plugins: [
			createCloudOAuthPlugin(),
			createEnterpriseGitAuthPlugin(),
			apiKey({
				defaultPrefix: "gp_",
				requireName: true,
				enableMetadata: true,
				rateLimit: {
					enabled: true,
					timeWindow: 1000 * 60 * 60 * 24,
					maxRequests: 5_000,
				},
				schema: {
					apikey: {
						modelName: "apiKey",
					},
				},
			}),
			organization({
				allowUserToCreateOrganization: false,
				creatorRole: "owner",
				ac: workspaceAc,
				roles: workspaceRoles,
				teams: {
					enabled: true,
					defaultTeam: {
						enabled: true,
					},
				},
				dynamicAccessControl: {
					enabled: true,
				},
				schema: {
					session: {
						fields: {
							activeOrganizationId: "activeOrganizationId",
							activeTeamId: "activeTeamId",
						},
					},
					organizationRole: {
						modelName: "organization_role",
					},
					teamMember: {
						modelName: "team_member",
					},
				},
			}),
		],
		advanced: {
			defaultCookieAttributes: {
				sameSite: env.NODE_ENV === "production" ? "none" : "lax",
				secure: env.NODE_ENV === "production",
				httpOnly: true,
				domain: env.NODE_ENV === "production" ? ".circulo-ai.com" : undefined,
			},
		},
	});
}

export const auth = createAuth();

export {
	decryptSecret,
	type EnterpriseGitProviderType,
	encryptSecret,
	getEnterpriseGitApiBaseUrl,
	getEnterpriseGitProviderLabel,
	lookupEnterpriseGitProvider,
	normalizeGitHostUrl,
	registerEnterpriseGitProvider,
} from "./enterprise-git";
export {
	workspaceAc,
	workspacePermissionOptions,
	workspaceRoleLabels,
	workspaceRoles,
	workspaceStatements,
} from "./organization-access";
