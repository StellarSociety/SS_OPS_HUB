"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { importStaffFromCsv } from "@/lib/actions/hr";

export function ImportStaffForm() {
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    inserted?: number;
    updated?: number;
    total?: number;
    errors?: string[];
    error?: string;
  } | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    setCsvText(text);
  }

  async function handleImport() {
    if (!csvText.trim()) return;
    setLoading(true);
    setResult(null);
    const res = await importStaffFromCsv(csvText);
    setResult(res);
    setLoading(false);
  }

  return (
    <Card className="p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">Import from spreadsheet</h2>
      <p className="mt-1 text-sm text-black/50">
        Upload or paste CSV exported from the STAFF Details sheet. Import is
        idempotent on emp no.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <Label htmlFor="csv-file">Upload CSV</Label>
          <div className="mt-1 flex items-center gap-3">
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              className="text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="csv-paste">Or paste CSV</Label>
          <textarea
            id="csv-paste"
            rows={8}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="EMP NO,Department,STATTUS,First Name,..."
            className="mt-1 w-full rounded-md border border-black/10 p-3 font-mono text-xs"
          />
        </div>

        <Button
          type="button"
          onClick={() => void handleImport()}
          disabled={loading || !csvText.trim()}
        >
          <Upload className="h-4 w-4" />
          {loading ? "Importing…" : "Import staff"}
        </Button>

        {result?.error ? (
          <p className="text-sm text-red-600">{result.error}</p>
        ) : null}

        {result?.inserted != null ? (
          <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Imported {result.inserted} new, updated {result.updated} of{" "}
            {result.total} rows.
            {result.errors?.length ? (
              <ul className="mt-2 list-disc pl-4 text-red-700">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
