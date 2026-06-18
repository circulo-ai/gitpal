import { cn } from "@gitpal/ui/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

type GitPalMarkTone = "duotone" | "mono";

type GitPalMarkProps = {
	className?: string;
	/**
	 * Accessible label. When provided, the mark is exposed to assistive tech
	 * as an image. When omitted, it is treated as decorative (aria-hidden).
	 */
	title?: string;
	/** Width/height. Number = px, string = any CSS length. Defaults to "1em". */
	size?: number | string;
	/**
	 * "duotone" (default): foreground + accent. "mono": everything inherits
	 * the current text color — ideal for favicons, print, single-color use.
	 */
	tone?: GitPalMarkTone;
} & Omit<ComponentPropsWithoutRef<"span">, "title">;

export function GitPalMark({
	className,
	title,
	size = "1em",
	tone = "duotone",
	...props
}: GitPalMarkProps) {
	const decorative = !title;
	// Unique id so multiple marks on one page don't collide.
	const accentId = `gitpal-accent-${title ? title.replace(/\s+/g, "-").toLowerCase() : "mark"}`;
	const accentStroke = tone === "mono" ? "currentColor" : `url(#${accentId})`;

	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center justify-center text-foreground",
				className,
			)}
			style={{
				width: size,
				height: size,
			}}
			{...props}
		>
			<svg
				viewBox="0 0 32 32"
				fill="none"
				className="size-full"
				role={decorative ? undefined : "img"}
				aria-hidden={decorative ? true : undefined}
				aria-label={decorative ? undefined : title}
				focusable="false"
				shapeRendering="geometricPrecision"
			>
				{!decorative && <title>{title}</title>}

				{tone === "duotone" && (
					<defs>
						{/* Accent uses theme tokens with a graceful currentColor fallback,
                so it reads well on light, dark, and colored surfaces. */}
						<linearGradient id={accentId} x1="0" y1="0" x2="0" y2="1">
							<stop
								offset="0%"
								stopColor="var(--chart-1, currentColor)"
								stopOpacity="1"
							/>
							<stop
								offset="100%"
								stopColor="var(--chart-2, var(--chart-1, currentColor))"
								stopOpacity="0.95"
							/>
						</linearGradient>
					</defs>
				)}

				{/* Review bubble — inherits foreground (auto light/dark) */}
				<path
					d="M10 6H22Q26 6 26 10V16Q26 20 22 20H12L7 24.4L8.3 20Q6 19.6 6 16V10Q6 6 10 6Z"
					stroke="currentColor"
					strokeWidth="1.75"
					strokeLinecap="round"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
				/>

				{/* Eyes — friendly, foreground */}
				<circle cx="12.8" cy="12.1" r="1.3" fill="currentColor" />
				<circle cx="19.2" cy="12.1" r="1.3" fill="currentColor" />

				{/* Accent smile — the one pop of brand color */}
				<path
					d="M12.5 15Q16 18 19.5 15"
					stroke={accentStroke}
					strokeWidth="1.9"
					strokeLinecap="round"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
		</span>
	);
}
