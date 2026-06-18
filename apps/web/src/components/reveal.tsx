"use client";

import { cn } from "@gitpal/ui/lib/utils";
import { type ReactNode, useEffect, useRef, useState } from "react";

export function Reveal({
	children,
	className,
	delay = 0,
}: {
	children: ReactNode;
	className?: string;
	delay?: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [shown, setShown] = useState(false);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setShown(true);
			return;
		}
		const io = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setShown(true);
					io.disconnect();
				}
			},
			{ threshold: 0.15 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, []);

	return (
		<div
			ref={ref}
			style={{ transitionDelay: `${delay}ms` }}
			className={cn(
				"transition-all duration-700 ease-out will-change-transform",
				shown
					? "translate-y-0 opacity-100 blur-0"
					: "translate-y-8 opacity-0 blur-[2px]",
				className,
			)}
		>
			{children}
		</div>
	);
}
