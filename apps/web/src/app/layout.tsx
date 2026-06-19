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
		"Open source AI code review for GitHub and GitLab, with BYOK and self-hosted deployments.",
	manifest: "/favicon/site.webmanifest",
	icons: {
		icon: [
			{ url: "/favicon/favicon.ico" },
			{ url: "/favicon/favicon.svg", type: "image/svg+xml" },
			{
				url: "/favicon/favicon-16x16.png",
				sizes: "16x16",
				type: "image/png",
			},
			{
				url: "/favicon/favicon-32x32.png",
				sizes: "32x32",
				type: "image/png",
			},
			{
				url: "/favicon/favicon-96x96.png",
				sizes: "96x96",
				type: "image/png",
			},
		],
		apple: [
			{
				url: "/favicon/apple-touch-icon.png",
				sizes: "180x180",
				type: "image/png",
			},
		],
	},
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
