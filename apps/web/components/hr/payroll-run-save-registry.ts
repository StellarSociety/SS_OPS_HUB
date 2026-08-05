"use client";

type PayrollSaveFn = () => Promise<void>;

let registeredSave: PayrollSaveFn | null = null;

/** PayrollRunClient registers the full save pipeline (budget + recalculate). */
export function registerPayrollRunSave(fn: PayrollSaveFn): () => void {
  registeredSave = fn;
  return () => {
    if (registeredSave === fn) registeredSave = null;
  };
}

export function getRegisteredPayrollRunSave(): PayrollSaveFn | null {
  return registeredSave;
}
