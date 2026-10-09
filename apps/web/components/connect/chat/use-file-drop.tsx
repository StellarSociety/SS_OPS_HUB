"use client";

import { Upload } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "@/components/ui/toast";
import { CONNECT_MAX_FILE_BYTES } from "@/lib/connect/types";
import { cn } from "@/lib/utils";

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

/**
 * Drop a file anywhere on an element to attach it. Spread `dropProps` on the
 * drop target and render <DropOverlay> inside it (the target needs `relative`).
 */
export function useFileDrop(onFile: (file: File) => void, enabled = true) {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child; count them to avoid flicker.
  const depth = useRef(0);

  const dropProps = enabled
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current += 1;
          setDragging(true);
        },
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setDragging(false);
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (!file) return;
          if (file.size > CONNECT_MAX_FILE_BYTES) {
            toast.alert("Files must be 25 MB or smaller.");
            return;
          }
          if (e.dataTransfer.files.length > 1) {
            toast.alert("One file at a time — attached the first one.");
          }
          onFile(file);
        },
      }
    : {};

  return { dragging, dropProps };
}

export function DropOverlay({ show, className }: { show: boolean; className?: string }) {
  if (!show) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--venue-primary,#818a40)] bg-white/85 text-[#2B2F16] backdrop-blur-sm",
        className,
      )}
    >
      <Upload className="h-8 w-8 text-[var(--venue-primary,#818a40)]" />
      <p className="text-sm font-semibold">Drop to attach</p>
      <p className="text-xs text-black/50">Photos and files up to 25 MB</p>
    </div>
  );
}
