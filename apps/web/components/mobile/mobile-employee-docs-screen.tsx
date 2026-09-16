"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Eye, FileText, FolderOpen, IdCard, Receipt, X } from "lucide-react";
import { MobileProfileToggle } from "@/components/mobile/mobile-profile-toggle";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { getMobilePayslipSnapshotAction } from "@/lib/actions/mobile-docs";
import { formatDisplayDate } from "@/lib/dates/display";
import { formatAed } from "@/lib/hr/derived";
import type { PayslipPdfInput } from "@/lib/hr/payslip-pdf";
import { payslipSnapshotToPdfInput } from "@/lib/hr/payslip-snapshot-to-pdf-input";
import type {
  MobileDocsFile,
  MobileDocsPage,
  MobileDocsPayslip,
  MobileDocsSection,
} from "@/lib/mobile/employee-docs";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";

type MobileEmployeeDocsScreenProps = {
  venue: Venue;
  initial: MobileDocsPage;
  previewStaffId?: string | null;
  employeeName?: string | null;
  onSelectTab?: (tab: MobileTabItem) => void;
};

function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

function formatUploadedAt(value: string | null | undefined): string {
  const iso = value?.trim().slice(0, 10) ?? "";
  if (!iso) return "";
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDisplayDate(iso) : iso;
}

function formatPayslipDate(value: string | null | undefined): string {
  const iso = value?.trim().slice(0, 10) ?? "";
  if (!iso) return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDisplayDate(iso) : iso;
}

export function MobileEmployeeDocsScreen({
  venue,
  initial,
  previewStaffId = null,
  employeeName,
  onSelectTab,
}: MobileEmployeeDocsScreenProps) {
  const firstName = firstNameOf(employeeName);
  const [payslipPreview, setPayslipPreview] = useState<{
    title: string;
    input: PayslipPdfInput;
    venueLogoUrl: string | null;
  } | null>(null);
  const [payslipError, setPayslipError] = useState<string | null>(null);
  const [payslipPendingId, setPayslipPendingId] = useState<string | null>(null);
  const [payslipPending, startPayslip] = useTransition();

  function closePayslip() {
    setPayslipPreview(null);
    setPayslipError(null);
    setPayslipPendingId(null);
  }

  function viewPayslip(row: MobileDocsPayslip) {
    setPayslipError(null);
    setPayslipPendingId(row.payslipId);
    startPayslip(async () => {
      const result = await getMobilePayslipSnapshotAction({
        payslipId: row.payslipId,
        previewStaffId,
      });
      if (!result.ok) {
        setPayslipError(result.error);
        setPayslipPendingId(null);
        return;
      }
      const input = payslipSnapshotToPdfInput(result.snapshot);
      setPayslipPreview({
        title: `${input.fullName || "Payslip"} · ${input.payrollMonthLabel}${
          input.version ? ` · v${input.version}` : ""
        }`,
        input,
        venueLogoUrl: result.venueLogoUrl,
      });
      setPayslipPendingId(null);
    });
  }

  if (payslipPreview) {
    return (
      <InCanvasOverlay
        venue={venue}
        title={payslipPreview.title}
        onClose={closePayslip}
      >
        <MobilePayslipPreview
          input={payslipPreview.input}
          venueLogoUrl={payslipPreview.venueLogoUrl}
        />
      </InCanvasOverlay>
    );
  }

  if (payslipPending) {
    return (
      <InCanvasOverlay venue={venue} title="Payslip" onClose={closePayslip}>
        <div className="flex h-full items-center justify-center text-sm text-black/45">
          Opening payslip…
        </div>
      </InCanvasOverlay>
    );
  }

  return (
    <div
      className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-4">
        <h1 className="text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
          {firstName ? `${firstName} Documents` : "Documents"}
        </h1>

        {!initial.linked ? (
          <p className="mt-6 text-center text-sm text-black/45 dark:text-white/45">
            No staff profile is linked to this account yet.
          </p>
        ) : (
          <div className="mt-5 space-y-2">
            <MobileProfileToggle
              title="Personal Documents"
              icon={FolderOpen}
              count={initial.personal.length}
            >
              <DocumentSections
                sections={initial.personalSections ?? []}
                empty="No personal documents on file."
              />
            </MobileProfileToggle>
            <MobileProfileToggle
              title="Employment Documents"
              icon={FileText}
              count={initial.employment.length}
            >
              <DocumentSections
                sections={initial.employmentSections ?? []}
                empty="No employment documents on file."
              />
            </MobileProfileToggle>
            <MobileProfileToggle
              title="Insurance"
              icon={IdCard}
              count={initial.insurance.length}
            >
              <InsuranceCardList
                files={initial.insurance}
                expiry={initial.insuranceExpiry}
              />
            </MobileProfileToggle>
            <MobileProfileToggle
              title="Payslips"
              icon={Receipt}
              count={initial.payslips.length}
            >
              {initial.payslips.length === 0 ? (
                <p className="text-sm text-black/45 dark:text-white/45">
                  No payslips on file yet.
                </p>
              ) : (
                <ul className="divide-y divide-black/8">
                  {initial.payslips.map((row) => (
                    <li
                      key={row.payslipId}
                      className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[#3D421F] dark:text-[CanvasText]">
                          {row.payrollMonthLabel}
                        </p>
                        <p className="text-[11px] text-black/40 dark:text-white/40">
                          Latest payslip
                          {row.version > 1 ? ` · v${row.version}` : ""}
                        </p>
                      </div>
                      <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-[#3D421F] dark:text-[CanvasText]">
                        {formatAed(row.netSalary)}
                      </p>
                      <button
                        type="button"
                        aria-label={`View ${row.payrollMonthLabel} payslip`}
                        disabled={payslipPending}
                        onClick={() => viewPayslip(row)}
                        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--venue-primary,#818a40)] transition hover:bg-[var(--venue-primary,#818a40)]/10 disabled:opacity-50"
                      >
                        <Eye className="size-4 shrink-0" strokeWidth={2} />
                        {payslipPending && payslipPendingId === row.payslipId
                          ? "…"
                          : "View"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {payslipError ? (
                <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                  {payslipError}
                </p>
              ) : null}
            </MobileProfileToggle>
          </div>
        )}
      </div>

      <MobileTabBar
        app="profile"
        activeId="docs"
        venueSlug={venue.slug}
        onSelectTab={onSelectTab}
      />
    </div>
  );
}

function formatDocField(value: string | null, kind: "text" | "date"): string {
  if (!value) return "—";
  if (kind === "date") return formatUploadedAt(value) || "—";
  return value;
}

function DocumentSections({
  sections,
  empty,
}: {
  sections: MobileDocsSection[];
  empty: string;
}) {
  if (sections.length === 0) {
    return (
      <p className="text-sm text-black/45 dark:text-white/45">{empty}</p>
    );
  }

  return (
    <div className="space-y-4">
      {sections.map((section, index) => {
        const hasFields = section.fields.length > 0;
        const hasFiles = section.files.length > 0;
        return (
          <section
            key={section.id}
            className={index > 0 ? "border-t border-black/8 pt-3" : ""}
          >
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-black/45 dark:text-white/45">
              {section.title}
            </h3>
            {hasFields ? (
              <dl className="mt-2 space-y-1.5">
                {section.fields.map((field) => (
                  <div
                    key={field.label}
                    className="flex items-start justify-between gap-3"
                  >
                    <dt className="shrink-0 text-xs text-black/40 dark:text-white/40">
                      {field.label}
                    </dt>
                    <dd className="min-w-0 break-all text-right font-medium text-[#3D421F] dark:text-[CanvasText]">
                      {formatDocField(field.value, field.kind)}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {hasFiles ? (
              <ul className="mt-2 space-y-1.5">
                {section.files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-start gap-2 text-[11px] text-black/40 dark:text-white/40"
                  >
                    <FileText
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-black/30 dark:text-white/30"
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[#3D421F]/70 dark:text-[CanvasText]/70">
                        {file.label}
                      </span>
                      <span className="block truncate">
                        {file.fileName}
                        {file.uploadedAt
                          ? ` · ${formatUploadedAt(file.uploadedAt)}`
                          : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : hasFields ? null : (
              <p className="mt-2 text-sm text-black/45 dark:text-white/45">
                No document on file.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function previewKind(file: MobileDocsFile): "image" | "pdf" | "other" {
  const type = (file.contentType ?? "").toLowerCase();
  const ext = file.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    return "image";
  }
  if (type.includes("pdf") || ext === "pdf") return "pdf";
  return "other";
}

function insuranceDownloadUrl(file: MobileDocsFile): string {
  return `/api/hr/workdrive/download/${encodeURIComponent(file.workdriveFileId)}`;
}

function InsuranceCardList({
  files,
  expiry,
}: {
  files: MobileDocsFile[];
  expiry: string | null;
}) {
  if (files.length === 0) {
    return (
      <p className="text-sm text-black/45 dark:text-white/45">
        No insurance card on file.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {expiry ? (
        <p className="text-[11px] text-black/40 dark:text-white/40">
          Expires {formatUploadedAt(expiry)}
        </p>
      ) : null}
      {files.map((file) => {
        const kind = previewKind(file);
        const src = insuranceDownloadUrl(file);
        return (
          <figure key={file.id} className="space-y-1.5">
            {kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt="Insurance card"
                className="w-full rounded-lg border border-black/10 bg-white object-contain"
              />
            ) : kind === "pdf" ? (
              <PdfFirstPage src={src} />
            ) : (
              <p className="text-sm text-black/45">Insurance card on file.</p>
            )}
            <figcaption className="truncate text-[11px] text-black/40 dark:text-white/40">
              {file.fileName}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}

function PdfFirstPage({ src }: { src: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;

    void (async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error("Could not load insurance card.");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        const pdf = await pdfjs.getDocument({ data: bytes }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.7 });
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("No canvas.");
        await page.render({ canvasContext: context, viewport, canvas }).promise;
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <p className="text-sm text-black/45 dark:text-white/45">
        Insurance card is on file, but it could not be previewed here.
      </p>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      className="w-full rounded-lg border border-black/10 bg-white"
    />
  );
}

function MobilePayslipPreview({
  input,
  venueLogoUrl,
}: {
  input: PayslipPdfInput;
  venueLogoUrl: string | null;
}) {
  const legalName =
    input.employerLegalName?.trim() || input.venueName?.trim() || "Employer";
  const leaveKinds = (input.leaveKinds ?? []).filter((kind) => kind.days > 0);

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-white px-4 py-4 text-[#3D421F]">
      <div className="mx-auto max-w-md space-y-4">
        {venueLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={venueLogoUrl}
            alt=""
            className="mx-auto h-10 w-auto object-contain"
          />
        ) : null}
        <div className="text-center">
          <p className="font-serif text-lg font-semibold">Payslip {legalName}</p>
          {input.companyAddress ? (
            <p className="mt-1 text-[11px] leading-relaxed text-black/50">
              {input.companyAddress}
            </p>
          ) : null}
        </div>

        <dl className="space-y-1.5 text-xs">
          <MetaRow
            label="Period"
            value={`${formatPayslipDate(input.periodStart)} – ${formatPayslipDate(input.periodEnd)}`}
          />
          <MetaRow label="Payroll month" value={input.payrollMonthLabel || "—"} />
          <MetaRow
            label="Employee"
            value={`${input.fullName} (${input.empNo})`}
          />
          <MetaRow label="Joining date" value={formatPayslipDate(input.joiningDate)} />
          <MetaRow label="Department" value={input.departmentName?.trim() || "—"} />
          <MetaRow label="Position" value={input.positionName?.trim() || "—"} />
          <MetaRow label="Paid days" value={String(input.paidDays)} />
          <MetaRow label="Unpaid days" value={String(input.unpaidDays)} />
          <MetaRow label="Version" value={`v${input.version}`} />
        </dl>

        {leaveKinds.length > 0 ? (
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-black/45">
              Leave in this period
            </h3>
            <ul className="mt-2 space-y-1.5">
              {leaveKinds.map((kind) => (
                <li
                  key={`${kind.code}-${kind.name}`}
                  className="flex items-start justify-between gap-3 text-xs"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{kind.name}</span>
                    <span className="text-black/40"> · {kind.code}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">{kind.days}d</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Breakdown
          </h3>
          <ul className="mt-2 divide-y divide-black/8">
            {input.lines.map((line, index) => (
              <li
                key={`${line.category}-${line.label}-${index}`}
                className="flex items-start justify-between gap-3 py-1.5 text-xs"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{line.label}</span>
                  <span className="text-black/40">{line.category}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatAed(line.amount)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-[#3D421F]/20 bg-[#F0F3DD] px-3 py-3 text-sm">
          <p className="flex justify-between gap-3">
            <span>Gross earnings</span>
            <span className="tabular-nums">{formatAed(input.grossEarnings)}</span>
          </p>
          <p className="mt-1 flex justify-between gap-3">
            <span>Total deductions</span>
            <span className="tabular-nums">
              {formatAed(input.totalDeductions)}
            </span>
          </p>
          <p className="mt-2 flex justify-between gap-3 font-semibold">
            <span>Net salary</span>
            <span className="tabular-nums">{formatAed(input.netSalary)}</span>
          </p>
        </section>

        {input.paymentMethod || input.bankName || input.accountNumber ? (
          <dl className="space-y-1.5 text-xs">
            {input.paymentMethod ? (
              <MetaRow
                label="Payment"
                value={input.paymentMethod.toUpperCase()}
              />
            ) : null}
            {input.bankName ? (
              <MetaRow label="Bank" value={input.bankName} />
            ) : null}
            {input.accountNumber ? (
              <MetaRow label="Account" value={input.accountNumber} />
            ) : null}
          </dl>
        ) : null}

        {input.footerDisclaimer ? (
          <p className="text-[10px] leading-relaxed text-black/35">
            {input.footerDisclaimer}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-black/45">{label}</dt>
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  );
}

function InCanvasOverlay({
  venue,
  title,
  onClose,
  children,
}: {
  venue: Venue;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-black/8 px-4 py-3">
        <h2 className="min-w-0 truncate font-serif text-lg text-[#3D421F] dark:text-[CanvasText]">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]",
          )}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
