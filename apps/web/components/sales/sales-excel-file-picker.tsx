"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

const lightOutlineButtonClass =
  "border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30";

type SalesExcelFilePickerProps = {
  id: string;
  disabled?: boolean;
  loading?: boolean;
  onImport: (file: File) => void | Promise<void>;
};

export function SalesExcelFilePicker({
  id,
  disabled = false,
  loading = false,
  onImport,
}: SalesExcelFilePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleFileChange(file: File | undefined) {
    setSelectedFile(file ?? null);
  }

  return (
    <div className="flex flex-wrap items-center justify-start gap-3">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        disabled={disabled || loading}
        onChange={(event) => {
          handleFileChange(event.target.files?.[0]);
        }}
      />
      <Button
        type="button"
        variant="outline"
        className={lightOutlineButtonClass}
        disabled={disabled || loading}
        onClick={() => inputRef.current?.click()}
      >
        Choose file
      </Button>
      <span className="max-w-xs truncate text-sm text-black/50">
        {selectedFile?.name ?? "No file chosen"}
      </span>
      <Button
        type="button"
        disabled={disabled || loading || !selectedFile}
        onClick={() => {
          if (selectedFile) void onImport(selectedFile);
        }}
      >
        <Upload className="h-4 w-4" />
        {loading ? "Importing…" : "Import"}
      </Button>
    </div>
  );
}
