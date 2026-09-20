import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, hint, id, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || props.name || generatedId;

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="chase-label">
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          className={cn(
            "chase-input",
            error && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25",
            className
          )}
          ref={ref}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {hint && !error && (
          <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
        )}
        {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
