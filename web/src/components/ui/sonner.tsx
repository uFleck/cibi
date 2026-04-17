"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({
  position: positionProp,
  closeButton: closeButtonProp,
  toastOptions: toastOptionsProp,
  swipeDirections: swipeDirectionsProp,
  ...props
}: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const [responsivePosition, setResponsivePosition] = useState<ToasterProps["position"]>("bottom-right")

  const toastOptions: ToasterProps["toastOptions"] = {
    ...toastOptionsProp,
    classNames: {
      ...toastOptionsProp?.classNames,
      toast: ["cn-toast", "cursor-default", toastOptionsProp?.classNames?.toast]
        .filter(Boolean)
        .join(" "),
    },
  }

  useEffect(() => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia("(max-width: 639px)")
    const updatePosition = () => {
      setResponsivePosition(mediaQuery.matches ? "top-center" : "bottom-right")
    }

    updatePosition()

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updatePosition)
      return () => mediaQuery.removeEventListener("change", updatePosition)
    }

    mediaQuery.addListener(updatePosition)
    return () => mediaQuery.removeListener(updatePosition)
  }, [])

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={positionProp ?? responsivePosition}
      className="toaster group"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
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
      closeButton={closeButtonProp ?? true}
      swipeDirections={swipeDirectionsProp ?? ["top", "bottom", "left", "right"]}
      toastOptions={toastOptions}
      {...props}
    />
  )
}

export { Toaster }
