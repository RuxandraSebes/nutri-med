import * as React from "react";

import { cn } from "@/lib/utils.js";

/**
 * shadcn-style progress bar (no @radix-ui/react-progress dependency).
 */
const Progress = React.forwardRef(({ className, value = 0, ...props }, ref) => (
  <div
    ref={ref}
    role="progressbar"
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={100}
    className={cn(
      "relative h-2 w-full overflow-hidden rounded-full bg-[var(--gray-100)]",
      className,
    )}
    {...props}
  >
    <div
      className="h-full rounded-full bg-[var(--nutrition,#16a34a)] transition-[width] duration-500 ease-out"
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
));
Progress.displayName = "Progress";

export { Progress };
