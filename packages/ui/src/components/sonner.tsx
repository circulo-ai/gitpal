"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  Alert01Icon,
  CircleCheckIcon,
  InformationCircleIcon,
  Loading03Icon,
  OctagonXIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: (
          <HugeiconsIcon icon={CircleCheckIcon} size={16} className="size-4" />
        ),
        info: (
          <HugeiconsIcon
            icon={InformationCircleIcon}
            size={16}
            className="size-4"
          />
        ),
        warning: (
          <HugeiconsIcon icon={Alert01Icon} size={16} className="size-4" />
        ),
        error: (
          <HugeiconsIcon icon={OctagonXIcon} size={16} className="size-4" />
        ),
        loading: (
          <HugeiconsIcon
            icon={Loading03Icon}
            size={16}
            className="size-4 animate-spin"
          />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
