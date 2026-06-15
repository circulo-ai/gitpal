import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "../index.css";
import AppShell from "@/components/app-shell";
import Providers from "@/components/providers";

const inter = Inter({
	variable: "--font-inter",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: {
		default: "GitPal",
		template: "%s | GitPal",
	},
	description:
		"Open source AI code review for GitHub and GitLab, with BYOK, enterprise SSO, and self-hosted deployments.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			suppressHydrationWarning
			className={`${inter.variable} scroll-smooth`}
		>
			<body className="antialiased">
				<Providers>
					<AppShell>{children}</AppShell>
				</Providers>
			</body>
		</html>
	);
}
