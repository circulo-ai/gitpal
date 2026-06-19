import { cn } from "@gitpal/ui/lib/utils";
import Image from "next/image";
import type { ComponentPropsWithoutRef } from "react";

type GitPalMarkTone = "duotone" | "mono";

type GitPalMarkProps = {
	className?: string;
	/**
	 * Accessible label. When provided, the mark is exposed to assistive tech
	 * as an image. When omitted, it is treated as decorative.
	 */
	title?: string;
	/** Width/height. Number = px, string = any CSS length. Defaults to "1em". */
	size?: number | string;
	/** Kept for compatibility with existing call sites. */
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

	return (
		<span
			className={cn(
				"relative inline-flex shrink-0 items-center justify-center overflow-hidden",
				className,
			)}
			data-tone={tone}
			style={{
				width: size,
				height: size,
			}}
			{...props}
		>
			<Image
				src="/gitpal.svg"
				alt={title ?? ""}
				aria-hidden={decorative ? true : undefined}
				fill
				sizes={typeof size === "number" ? `${size}px` : "1em"}
				unoptimized
				className={cn(
					"size-full object-contain",
					tone === "mono" && "grayscale",
				)}
				draggable={false}
			/>
		</span>
	);
}
