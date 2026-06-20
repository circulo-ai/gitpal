import { cn } from "@gitpal/ui/lib/utils";
import Image from "next/image";
import type { ComponentPropsWithoutRef, CSSProperties } from "react";

type GitPalMarkTone = "duotone" | "mono";

// Named size variants — easy to use, easy to extend
const sizeVariants = {
	xs: "16px",
	sm: "20px",
	md: "24px",
	lg: "32px",
	xl: "48px",
	"2xl": "64px",
} as const;

type GitPalMarkSize = keyof typeof sizeVariants | number | string;

type GitPalMarkProps = {
	className?: string;
	/**
	 * Accessible label. When provided, the mark is exposed to assistive tech
	 * as an image. When omitted, it is treated as decorative.
	 */
	title?: string;
	/**
	 * Size of the mark.
	 * - Named variant: "xs" | "sm" | "md" | "lg" | "xl" | "2xl"
	 * - Number → interpreted as px (e.g. 40 → "40px")
	 * - String → any valid CSS length (e.g. "2rem", "1.5em")
	 * Defaults to "md" (24px).
	 */
	size?: GitPalMarkSize;
	/** Kept for compatibility with existing call sites. */
	tone?: GitPalMarkTone;
} & Omit<ComponentPropsWithoutRef<"span">, "title">;

function resolveSize(size: GitPalMarkSize): string {
	if (typeof size === "number") return `${size}px`;
	if (size in sizeVariants)
		return sizeVariants[size as keyof typeof sizeVariants];
	return size; // raw CSS string
}

export function GitPalMark({
	className,
	title,
	size = "md",
	tone = "duotone",
	style,
	...props
}: GitPalMarkProps) {
	const decorative = !title;
	const resolvedSize = resolveSize(size);

	return (
		<span
			className={cn(
				"relative inline-flex shrink-0 items-center justify-center overflow-hidden",
				"h-[var(--mark-size)] w-[var(--mark-size)]",
				className,
			)}
			data-tone={tone}
			style={
				{
					"--mark-size": resolvedSize,
					...style,
				} as CSSProperties
			}
			{...props}
		>
			<Image
				src="/gitpal.svg"
				alt={title ?? ""}
				aria-hidden={decorative ? true : undefined}
				fill
				sizes={resolvedSize}
				unoptimized
				className={cn("object-contain", tone === "mono" && "grayscale")}
				draggable={false}
			/>
		</span>
	);
}
