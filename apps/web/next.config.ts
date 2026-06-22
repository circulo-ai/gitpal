import "@gitpal/env/web";
import type { NextConfig } from "next";

const securityHeaders = [
	{
		key: "X-Content-Type-Options",
		value: "nosniff",
	},
	{
		key: "X-Frame-Options",
		value: "SAMEORIGIN",
	},
	{
		key: "Referrer-Policy",
		value: "origin-when-cross-origin",
	},
	{
		key: "Permissions-Policy",
		value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
	},
] as const;

const nextConfig: NextConfig = {
	typedRoutes: true,
	reactCompiler: true,
	output: "standalone",
	poweredByHeader: false,
	devIndicators: false,
	async headers() {
		return [
			{
				source: "/:path*",
				headers: [...securityHeaders],
			},
		];
	},
};

export default nextConfig;
