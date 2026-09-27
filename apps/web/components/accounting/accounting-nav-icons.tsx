import { forwardRef } from "react";
import { Minus, Plus, type LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

/** Green plus for Accounting → Revenue. */
export const RevenuePlus = forwardRef<SVGSVGElement, LucideProps>(
  function RevenuePlus({ className, ...props }, ref) {
    return (
      <Plus
        ref={ref}
        aria-hidden
        strokeWidth={2.5}
        {...props}
        className={cn(className, "text-emerald-600")}
      />
    );
  },
);

/** Red minus for Accounting → Expenses. */
export const ExpenseMinus = forwardRef<SVGSVGElement, LucideProps>(
  function ExpenseMinus({ className, ...props }, ref) {
    return (
      <Minus
        ref={ref}
        aria-hidden
        strokeWidth={2.5}
        {...props}
        className={cn(className, "text-red-600")}
      />
    );
  },
);
