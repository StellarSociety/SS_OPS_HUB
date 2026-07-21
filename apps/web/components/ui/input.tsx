import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const inputVariants = cva(
  "flex h-10 w-full rounded-md border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818a40] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        /** Default — light app surfaces (HR, settings, directory). */
        default:
          "border-black/10 bg-white text-[#3D421F] placeholder:text-black/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
        /** Dark auth / marketing surfaces. */
        onDark:
          "border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface InputProps
  extends React.ComponentProps<"input">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, ...props }, ref) => (
    <input
      type={type}
      className={cn(inputVariants({ variant }), className)}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input, inputVariants };
