"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { useUnsavedChangesGuard } from "@/components/use-unsaved-changes-guard";

function serializeForm(form: HTMLFormElement): string {
  const fd = new FormData(form);
  const entries: [string, string][] = [];
  for (const [key, value] of fd.entries()) {
    entries.push([
      key,
      typeof value === "string" ? value : `file:${value.name}:${value.size}`,
    ]);
  }
  entries.sort((a, b) => {
    const byKey = a[0].localeCompare(b[0]);
    return byKey !== 0 ? byKey : a[1].localeCompare(b[1]);
  });
  return JSON.stringify(entries);
}

type GuardedSettingsFormProps = Omit<
  FormHTMLAttributes<HTMLFormElement>,
  "action" | "onSubmit"
> & {
  action: (formData: FormData) => Promise<unknown>;
  children: ReactNode;
  /**
   * Extra controlled state (e.g. JSON editors) to include in the dirty snapshot.
   * Pass whenever hidden inputs are driven by React state.
   */
  watch?: unknown;
  formRef?: RefObject<HTMLFormElement | null>;
};

/**
 * Settings form that prompts Keep editing / Cancel / Save before navigate or refresh
 * when the form has unsaved changes.
 */
export function GuardedSettingsForm({
  action,
  children,
  className,
  watch,
  id,
  formRef: formRefProp,
  ...rest
}: GuardedSettingsFormProps) {
  const reactId = useId();
  const formId = id ?? `settings-form-${reactId.replace(/:/g, "")}`;
  const internalFormRef = useRef<HTMLFormElement>(null);
  const formRef = formRefProp ?? internalFormRef;
  const baselineRef = useRef("");
  const [isDirty, setIsDirty] = useState(false);
  const onSaveRef = useRef<() => Promise<boolean>>(async () => false);

  const snapshot = useCallback(() => {
    const form = formRef.current;
    if (!form) return "";
    return JSON.stringify({
      form: serializeForm(form),
      watch: watch ?? null,
    });
  }, [watch]);

  const syncBaseline = useCallback(() => {
    baselineRef.current = snapshot();
    setIsDirty(false);
  }, [snapshot]);

  const recomputeDirty = useCallback(() => {
    if (!baselineRef.current) {
      syncBaseline();
      return;
    }
    setIsDirty(snapshot() !== baselineRef.current);
  }, [snapshot, syncBaseline]);

  // Capture baseline after first paint / when server props remount the form.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!baselineRef.current) {
        syncBaseline();
        return;
      }
      recomputeDirty();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [recomputeDirty, syncBaseline, watch]);

  onSaveRef.current = async () => {
    const form = formRef.current;
    if (!form) return false;
    if (!form.reportValidity()) return false;

    const formData = new FormData(form);
    try {
      const result = await action(formData);
      if (
        result &&
        typeof result === "object" &&
        "ok" in result &&
        (result as { ok: boolean }).ok === false
      ) {
        return false;
      }
      syncBaseline();
      return true;
    } catch {
      return false;
    }
  };

  const { unsavedDialog } = useUnsavedChangesGuard({
    isDirty,
    onSaveRef,
  });

  return (
    <>
      <form
        {...rest}
        id={formId}
        ref={formRef}
        className={className}
        action={async (formData) => {
          await action(formData);
          syncBaseline();
        }}
        onInput={recomputeDirty}
        onChange={recomputeDirty}
      >
        {children}
      </form>
      {unsavedDialog}
    </>
  );
}
