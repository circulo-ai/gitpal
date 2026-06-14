import { z } from "zod";

import { publicProcedure, router } from "../index";

type EnterpriseGitProviderType = "github" | "gitlab";

type PublicEnterpriseGitProvider = {
	id: string;
	type: EnterpriseGitProviderType;
	name: string;
	baseUrl: string;
	apiBaseUrl: string;
	githubAppName: string | null;
	githubAppClientId: string | null;
	createdAt: Date;
	updatedAt: Date;
};

type EnterpriseGitProviderLookupInput = {
	type: EnterpriseGitProviderType;
	baseUrl: string;
};

type EnterpriseGitProviderRegisterInput = EnterpriseGitProviderLookupInput & {
	name?: string;
	clientId: string;
	clientSecret: string;
	githubAppName?: string;
	githubAppClientId?: string;
	webhookSecret?: string;
};

type EnterpriseGitProviderLookupOutput = {
	configured: boolean;
	callbackUrl: string;
	provider: PublicEnterpriseGitProvider | null;
};

type EnterpriseGitProviderRegisterOutput = {
	created: boolean;
	provider: PublicEnterpriseGitProvider;
};

type EnterpriseGitProviderService = {
	lookupEnterpriseGitProvider(
		input: EnterpriseGitProviderLookupInput,
	): Promise<EnterpriseGitProviderLookupOutput>;
	registerEnterpriseGitProvider(
		input: EnterpriseGitProviderRegisterInput,
	): Promise<EnterpriseGitProviderRegisterOutput>;
};

const enterpriseGitProviderTypeSchema = z.enum(["github", "gitlab"]);
const authPackageName = "@gitpal/auth";

const enterpriseGitProviderLookupSchema = z.object({
	type: enterpriseGitProviderTypeSchema,
	baseUrl: z.string().min(1),
});

const enterpriseGitProviderRegisterSchema =
	enterpriseGitProviderLookupSchema.extend({
		name: z.string().min(1).max(120).optional(),
		clientId: z.string().min(1),
		clientSecret: z.string().min(1),
		githubAppName: z.string().min(1).max(120).optional(),
		githubAppClientId: z.string().min(1).max(120).optional(),
		webhookSecret: z.string().min(1).max(240).optional(),
	});

async function getEnterpriseGitProviderService() {
	return (await import(authPackageName)) as EnterpriseGitProviderService;
}

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	enterpriseGitProvider: router({
		lookup: publicProcedure
			.input(enterpriseGitProviderLookupSchema)
			.mutation(async ({ input }) => {
				const service = await getEnterpriseGitProviderService();

				return service.lookupEnterpriseGitProvider(input);
			}),
		register: publicProcedure
			.input(enterpriseGitProviderRegisterSchema)
			.mutation(async ({ input }) => {
				const service = await getEnterpriseGitProviderService();

				return service.registerEnterpriseGitProvider(input);
			}),
	}),
});
export type AppRouter = typeof appRouter;
