import { RepositorySettingsPanel } from "@/components/repository-settings-panel";

type RepositorySettingsRouteProps = {
	params: Promise<{
		repositoryId: string;
	}>;
};

export default async function RepositorySettingsRoute({
	params,
}: RepositorySettingsRouteProps) {
	const { repositoryId } = await params;

	return <RepositorySettingsPanel repositoryId={repositoryId} />;
}
