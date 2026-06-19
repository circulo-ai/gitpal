import LandingPage from "@/components/landing-page";

async function getGitHubStars() {
	try {
		const response = await fetch(
			"https://api.github.com/repos/circulo-ai/gitpal",
			{
				headers: {
					Accept: "application/vnd.github+json",
				},
				next: { revalidate: 3600 },
			},
		);

		if (!response.ok) {
			return null;
		}

		const repository = (await response.json()) as {
			stargazers_count?: unknown;
		};

		return typeof repository.stargazers_count === "number"
			? repository.stargazers_count
			: null;
	} catch {
		return null;
	}
}

export default async function Home() {
	const githubStars = await getGitHubStars();

	return <LandingPage githubStars={githubStars} />;
}
