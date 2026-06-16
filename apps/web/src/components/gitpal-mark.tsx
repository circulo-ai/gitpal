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
                stopOpacity="0.9"
              />
            </linearGradient>
          </defs>
        )}

        {/* Shield body — inherits foreground (auto light/dark) */}
        <path
          d="M8.5 9.75C8.5 8.23122 9.73122 7 11.25 7H20.75C22.2688 7 23.5 8.23122 23.5 9.75V15.25C23.5 19.8761 20.1639 23.84 16 25.3838C11.8361 23.84 8.5 19.8761 8.5 15.25V9.75Z"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Crown / peak */}
        <path
          d="M10.5 10.5L14.2 7.6C14.7706 7.15385 15.5205 6.91002 16.2925 6.91002C17.0645 6.91002 17.8144 7.15385 18.385 7.6L22.1 10.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Smile */}
        <path
          d="M12.1 20.3C13.1 21.1 14.4 21.55 16 21.55C17.6 21.55 18.9 21.1 19.9 20.3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* Accent strokes */}
        <path
          d="M10.7 24.1L13.3 22.6"
          stroke={accentStroke}
          strokeWidth="1.75"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M21.3 24.1L18.7 22.6"
          stroke={accentStroke}
          strokeWidth="1.75"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M12.2 26.6C13.1 27.2 14.4 27.55 16 27.55C17.6 27.55 18.9 27.2 19.8 26.6"
          stroke={accentStroke}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
}
