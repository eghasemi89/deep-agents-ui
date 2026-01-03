"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  onCheckedChange?: (checked: boolean) => void
  checked?: boolean
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, onCheckedChange, checked, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation();
      onCheckedChange?.(e.target.checked);
    }

    return (
      <input
        type="checkbox"
        className={cn(
          "h-4 w-4 rounded border-2 border-gray-400 cursor-pointer",
          "checked:bg-blue-600 checked:border-blue-600",
          "focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none",
          "transition-colors duration-200",
          className
        )}
        style={{
          accentColor: "#2563eb", // blue-600 - makes checkmark blue/visible
        }}
        ref={ref}
        checked={checked}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        {...props}
      />
    )
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }

