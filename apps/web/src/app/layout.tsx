import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "../index.css";
import AppShell from "@/components/app-shell";
import Providers from "@/components/providers";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
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
				className={`${geistSans.variable} ${geistMono.variable}`}
			>
			<body className="antialiased">
				<Providers>
					<AppShell>{children}</AppShell>
				</Providers>
			</body>
			</html>
	);
}
