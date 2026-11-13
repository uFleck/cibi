"use client"

import { useEffect, useState } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { InfoIcon, Loader2Icon } from "lucide-react"
import { Cat } from "@/components/cats/Cat"

const Toaster = ({
  position: positionProp,
  closeButton: closeButtonProp,
  toastOptions: toastOptionsProp,
  swipeDirections: swipeDirectionsProp,
  theme = "light",
  ...props
}: ToasterProps) => {
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
      theme={theme}
      position={positionProp ?? responsivePosition}
      className="toaster group"
      icons={{
        success: (
          <Cat mood="happy" size={22} alive={false} />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <Cat mood="oops" size={22} alive={false} />
        ),
        error: (
          <Cat mood="oops" size={22} alive={false} />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--line-strong)",
          "--border-radius": "18px",
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
