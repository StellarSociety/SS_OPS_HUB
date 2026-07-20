"use client";

import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronsUpDown, ChevronUp, Search, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { StatusBadge } from "@/components/hr/status-badge";
import {
  formatAed,
  formatDateOnly,
  isInAccommodation,
} from "@/lib/hr/derived";
import type { SalaryPercentages } from "@/lib/hr/derived";
import {
  employmentStatusSurfaceClass,
  findStatusNameById,
} from "@/lib/hr/employment-status";
import type {
  Department,
  EmploymentStatus,
  Nationality,
  Position,
  StaffWithLookups,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

type StaffDatabaseProps = {
  staff: StaffWithLookups[];
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  nationalities: Nationality[];
  salaryPct: SalaryPercentages;
  canViewSalary: boolean;
};

type ColumnKind = "text" | "number" | "date" | "status";

type Column = {
  key: string;
  label: string;
  kind: ColumnKind;
  salary?: boolean;
  /** Raw comparable value for sorting (number for number/date, else string). */
  sortValue: (s: StaffWithLookups) => number | string | null;
  /** Human-readable display text used for per-column search and filtering. */
  text: (s: StaffWithLookups) => string;
  render: (s: StaffWithLookups) => React.ReactNode;
};

const filterFieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

const STICKY_COLUMN_KEYS = new Set(["emp_no", "full_name"]);

const STICKY_COLUMN_LAYOUT: Record<string, { width: string; left: string }> = {
  emp_no: { width: "5.5rem", left: "0px" },
  full_name: { width: "11.5rem", left: "5.5rem" },
};

function stickyColumnStyle(key: string): React.CSSProperties | undefined {
  const layout = STICKY_COLUMN_LAYOUT[key];
  if (!layout) return undefined;
  return {
    left: layout.left,
    width: layout.width,
    minWidth: layout.width,
    maxWidth: layout.width,
  };
}

function ClearButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Clear filter"
      className={cn(
        "absolute top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-black/5 text-black/45 transition-colors hover:bg-black/15 hover:text-[#3D421F]",
        className,
      )}
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function num(v: number | null | undefined): number | null {
  return v == null || Number.isNaN(v) ? null : v;
}

function dateSort(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = new Date(`${v}T00:00:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

function salaryToPay(
  s: StaffWithLookups,
  pct: SalaryPercentages,
): number | null {
  if (s.wage_package == null) return null;
  const basic = s.basic_salary_60 ?? (s.wage_package * pct.basic) / 100;
  return isInAccommodation(s.company_accommodation) ? basic : s.wage_package;
}

export function StaffDatabase({
  staff,
  departments,
  positions,
  statuses,
  nationalities,
  salaryPct,
  canViewSalary,
}: StaffDatabaseProps) {
  const [name, setName] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [nationalityId, setNationalityId] = useState("");

  const [colFilters, setColFilters] = useState<Record<string, string[]>>(
    () => {
      const statusNames = new Set<string>();
      for (const s of staff) {
        const n = s.employment_status?.name?.trim();
        if (n) statusNames.add(n);
      }
      return {
        status: Array.from(statusNames).filter(
          (n) => n.toUpperCase() !== "OUT",
        ),
      };
    },
  );
  const [sortKey, setSortKey] = useState<string>("emp_no");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const columns = useMemo<Column[]>(() => {
    const money = (v: number | null | undefined) => formatAed(num(v));
    const base: Column[] = [
      {
        key: "emp_no",
        label: "Emp no",
        kind: "text",
        sortValue: (s) => s.emp_no,
        text: (s) => s.emp_no,
        render: (s) => (
          <Link
            href={`/hr/${s.id}`}
            className="font-mono text-xs text-[#3D421F] hover:underline"
          >
            {s.emp_no}
          </Link>
        ),
      },
      {
        key: "full_name",
        label: "Full name",
        kind: "text",
        sortValue: (s) => s.full_name,
        text: (s) => s.full_name,
        render: (s) => (
          <Link
            href={`/hr/${s.id}`}
            className="font-medium text-[#3D421F] hover:underline"
          >
            {s.full_name}
          </Link>
        ),
      },
      {
        key: "department",
        label: "Department",
        kind: "text",
        sortValue: (s) => s.department?.name ?? "",
        text: (s) => s.department?.name ?? "",
        render: (s) => s.department?.name ?? "—",
      },
      {
        key: "status",
        label: "Status",
        kind: "status",
        sortValue: (s) => s.employment_status?.name ?? "",
        text: (s) => s.employment_status?.name ?? "",
        render: (s) => <StatusBadge status={s.employment_status?.name} />,
      },
      {
        key: "first_name",
        label: "First name",
        kind: "text",
        sortValue: (s) => s.first_name ?? "",
        text: (s) => s.first_name ?? "",
        render: (s) => s.first_name ?? "—",
      },
      {
        key: "last_name",
        label: "Last name",
        kind: "text",
        sortValue: (s) => s.last_name ?? "",
        text: (s) => s.last_name ?? "",
        render: (s) => s.last_name ?? "—",
      },
      {
        key: "contact_phone",
        label: "Contact phone",
        kind: "text",
        sortValue: (s) => s.contact_phone ?? "",
        text: (s) => s.contact_phone ?? "",
        render: (s) => s.contact_phone ?? "—",
      },
      {
        key: "personal_email",
        label: "Personal email",
        kind: "text",
        sortValue: (s) => s.personal_email ?? "",
        text: (s) => s.personal_email ?? "",
        render: (s) => s.personal_email ?? "—",
      },
      {
        key: "work_email",
        label: "Work email",
        kind: "text",
        sortValue: (s) => s.work_email ?? "",
        text: (s) => s.work_email ?? "",
        render: (s) => s.work_email ?? "—",
      },
      {
        key: "gender",
        label: "Gender",
        kind: "text",
        sortValue: (s) => s.gender ?? "",
        text: (s) => s.gender ?? "",
        render: (s) => s.gender ?? "—",
      },
      {
        key: "civil_status",
        label: "Civil status",
        kind: "text",
        sortValue: (s) => s.civil_status ?? "",
        text: (s) => s.civil_status ?? "",
        render: (s) => s.civil_status ?? "—",
      },
      {
        key: "dob",
        label: "Date of birth",
        kind: "date",
        sortValue: (s) => dateSort(s.dob),
        text: (s) => formatDateOnly(s.dob),
        render: (s) => formatDateOnly(s.dob),
      },
      {
        key: "nationality",
        label: "Nationality",
        kind: "text",
        sortValue: (s) => s.nationality?.name ?? "",
        text: (s) => s.nationality?.name ?? "",
        render: (s) => s.nationality?.name ?? "—",
      },
      {
        key: "passport_no",
        label: "Passport no.",
        kind: "text",
        sortValue: (s) => s.passport_no ?? "",
        text: (s) => s.passport_no ?? "",
        render: (s) => s.passport_no ?? "—",
      },
      {
        key: "passport_expiry",
        label: "Passport expiry",
        kind: "date",
        sortValue: (s) => dateSort(s.passport_expiry),
        text: (s) => formatDateOnly(s.passport_expiry),
        render: (s) => formatDateOnly(s.passport_expiry),
      },
      {
        key: "eid_no",
        label: "EID no.",
        kind: "text",
        sortValue: (s) => s.eid_no ?? "",
        text: (s) => s.eid_no ?? "",
        render: (s) => s.eid_no ?? "—",
      },
      {
        key: "eid_expiry",
        label: "EID expiry",
        kind: "date",
        sortValue: (s) => dateSort(s.eid_expiry),
        text: (s) => formatDateOnly(s.eid_expiry),
        render: (s) => formatDateOnly(s.eid_expiry),
      },
      {
        key: "iban",
        label: "IBAN",
        kind: "text",
        sortValue: (s) => s.iban ?? "",
        text: (s) => s.iban ?? "",
        render: (s) => s.iban ?? "—",
      },
      {
        key: "swift_code",
        label: "Swift code",
        kind: "text",
        sortValue: (s) => s.swift_code ?? "",
        text: (s) => s.swift_code ?? "",
        render: (s) => s.swift_code ?? "—",
      },
      {
        key: "bank_name",
        label: "Bank name",
        kind: "text",
        sortValue: (s) => s.bank_name ?? "",
        text: (s) => s.bank_name ?? "",
        render: (s) => s.bank_name ?? "—",
      },
      {
        key: "position",
        label: "Position",
        kind: "text",
        sortValue: (s) => s.position?.name ?? "",
        text: (s) => s.position?.name ?? "",
        render: (s) => s.position?.name ?? "—",
      },
      {
        key: "joining_date",
        label: "Joining date",
        kind: "date",
        sortValue: (s) => dateSort(s.joining_date),
        text: (s) => formatDateOnly(s.joining_date),
        render: (s) => formatDateOnly(s.joining_date),
      },
      {
        key: "termination_date",
        label: "Termination date",
        kind: "date",
        sortValue: (s) => dateSort(s.termination_date),
        text: (s) => formatDateOnly(s.termination_date),
        render: (s) => formatDateOnly(s.termination_date),
      },
      {
        key: "contract_kind",
        label: "Contract type",
        kind: "text",
        sortValue: (s) => s.contract_kind ?? "",
        text: (s) => s.contract_kind ?? "",
        render: (s) => s.contract_kind ?? "—",
      },
      {
        key: "visa_status",
        label: "Visa status",
        kind: "text",
        sortValue: (s) => s.visa_status ?? "",
        text: (s) => s.visa_status ?? "",
        render: (s) => s.visa_status ?? "—",
      },
      {
        key: "visa_expiry",
        label: "Visa expiry",
        kind: "date",
        sortValue: (s) => dateSort(s.visa_expiry),
        text: (s) => formatDateOnly(s.visa_expiry),
        render: (s) => formatDateOnly(s.visa_expiry),
      },
      {
        key: "probation_duration",
        label: "Probation duration",
        kind: "text",
        sortValue: (s) => {
          if (s.probation_duration_value == null) return null;
          const unit = s.probation_duration_unit === "days" ? 1 : 30;
          return s.probation_duration_value * unit;
        },
        text: (s) => {
          if (s.probation_duration_value == null) return "";
          const unit = s.probation_duration_unit?.trim() || "";
          return `${s.probation_duration_value}${unit ? ` ${unit}` : ""}`;
        },
        render: (s) => {
          if (s.probation_duration_value == null) return "—";
          const unit = s.probation_duration_unit?.trim() || "";
          return `${s.probation_duration_value}${unit ? ` ${unit}` : ""}`;
        },
      },
      {
        key: "probation_status",
        label: "Probation status",
        kind: "text",
        sortValue: (s) => s.probation_status ?? "",
        text: (s) => s.probation_status ?? "",
        render: (s) => s.probation_status ?? "—",
      },
      {
        key: "photo",
        label: "Photo",
        kind: "text",
        sortValue: (s) => (s.photo_url ? 1 : 0),
        text: (s) => (s.photo_url ? "Yes" : ""),
        render: (s) =>
          s.photo_url ? (
            <img
              src={s.photo_url}
              alt=""
              className="h-8 w-6 rounded object-cover"
            />
          ) : (
            "—"
          ),
      },
      {
        key: "company_accommodation",
        label: "Company accom.",
        kind: "text",
        salary: true,
        sortValue: (s) => s.company_accommodation ?? "",
        text: (s) => s.company_accommodation ?? "",
        render: (s) => s.company_accommodation ?? "—",
      },
      {
        key: "wage_package",
        label: "Wage package",
        kind: "number",
        salary: true,
        sortValue: (s) => num(s.wage_package),
        text: (s) => money(s.wage_package),
        render: (s) => money(s.wage_package),
      },
      {
        key: "basic_salary_60",
        label: `Basic ${salaryPct.basic}%`,
        kind: "number",
        salary: true,
        sortValue: (s) => num(s.basic_salary_60),
        text: (s) => money(s.basic_salary_60),
        render: (s) => money(s.basic_salary_60),
      },
      {
        key: "accom_all_25",
        label: `Accom. ${salaryPct.accom}%`,
        kind: "number",
        salary: true,
        sortValue: (s) => num(s.accom_all_25),
        text: (s) => money(s.accom_all_25),
        render: (s) => money(s.accom_all_25),
      },
      {
        key: "transp_all_15",
        label: `Transp. ${salaryPct.transp}%`,
        kind: "number",
        salary: true,
        sortValue: (s) => num(s.transp_all_15),
        text: (s) => money(s.transp_all_15),
        render: (s) => money(s.transp_all_15),
      },
      {
        key: "salary_to_pay",
        label: "Salary to pay",
        kind: "number",
        salary: true,
        sortValue: (s) => salaryToPay(s, salaryPct),
        text: (s) => money(salaryToPay(s, salaryPct)),
        render: (s) => money(salaryToPay(s, salaryPct)),
      },
      {
        key: "fly_home_ticket_per_year",
        label: "Fly home ticket / yr",
        kind: "number",
        salary: true,
        sortValue: (s) => num(s.fly_home_ticket_per_year),
        text: (s) => money(s.fly_home_ticket_per_year),
        render: (s) => money(s.fly_home_ticket_per_year),
      },
    ];
    return canViewSalary ? base : base.filter((c) => !c.salary);
  }, [salaryPct, canViewSalary]);

  const columnOptions = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const col of columns) {
      const set = new Set<string>();
      for (const s of staff) {
        const t = col.text(s).trim();
        if (t && t !== "—") set.add(t);
      }
      map[col.key] = Array.from(set).sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );
    }
    return map;
  }, [columns, staff]);

  const filtered = useMemo(() => {
    const q = name.trim().toLowerCase();
    const activeColFilters = Object.entries(colFilters).filter(
      ([, v]) => v.length > 0,
    );

    const rows = staff.filter((s) => {
      if (departmentId && s.department_id !== departmentId) return false;
      if (positionId && s.position_id !== positionId) return false;
      if (statusId && s.employment_status_id !== statusId) return false;
      if (nationalityId && s.nationality_id !== nationalityId) return false;
      if (
        q &&
        !(
          s.full_name.toLowerCase().includes(q) ||
          (s.first_name?.toLowerCase().includes(q) ?? false) ||
          (s.last_name?.toLowerCase().includes(q) ?? false) ||
          s.emp_no.toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      for (const [key, values] of activeColFilters) {
        const col = columns.find((c) => c.key === key);
        if (!col) continue;
        if (!values.includes(col.text(s).trim())) {
          return false;
        }
      }
      return true;
    });

    const col = columns.find((c) => c.key === sortKey);
    if (col) {
      const dir = sortDir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const av = col.sortValue(a);
        const bv = col.sortValue(b);
        const aEmpty = av === null || av === "";
        const bEmpty = bv === null || bv === "";
        if (aEmpty && bEmpty) return 0;
        if (aEmpty) return 1;
        if (bEmpty) return -1;
        if (typeof av === "number" && typeof bv === "number") {
          return (av - bv) * dir;
        }
        return String(av).localeCompare(String(bv)) * dir;
      });
    }

    return rows;
  }, [
    staff,
    name,
    departmentId,
    positionId,
    statusId,
    nationalityId,
    colFilters,
    columns,
    sortKey,
    sortDir,
  ]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const departmentPositions = positionId
    ? positions
    : departmentId
      ? positions.filter((p) => p.department_id === departmentId)
      : positions;

  const anyFilter =
    name !== "" ||
    departmentId !== "" ||
    positionId !== "" ||
    statusId !== "" ||
    nationalityId !== "" ||
    Object.values(colFilters).some((v) => v.length > 0);

  function clearAllFilters() {
    setName("");
    setDepartmentId("");
    setPositionId("");
    setStatusId("");
    setNationalityId("");
    setColFilters({});
  }

  return (
    <div className="space-y-4">
      {/* Filters ------------------------------------------------------- */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-black/45">
            Search &amp; filter
          </h3>
          {anyFilter ? (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-black/50 transition-colors hover:text-[#3D421F]"
            >
              <X className="h-3.5 w-3.5" />
              Clear all
            </button>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-black/40" />
            <input
              placeholder="Search by name…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(filterFieldClass, "pl-9", name && "pr-9")}
            />
            {name ? (
              <ClearButton onClick={() => setName("")} className="right-2" />
            ) : null}
          </div>
          <div className="relative">
            <select
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setPositionId("");
              }}
              className={cn(filterFieldClass, departmentId && "pr-14")}
            >
              <option value="">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            {departmentId ? (
              <ClearButton
                onClick={() => {
                  setDepartmentId("");
                  setPositionId("");
                }}
                className="right-7"
              />
            ) : null}
          </div>
          <SearchableSelect
            value={positionId}
            onChange={setPositionId}
            options={departmentPositions.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            placeholder="All positions"
            searchPlaceholder="Search position…"
          />
          <div className="relative">
            <select
              value={statusId}
              onChange={(e) => setStatusId(e.target.value)}
              className={cn(
                filterFieldClass,
                statusId && "pr-14",
                employmentStatusSurfaceClass(
                  findStatusNameById(statuses, statusId),
                ),
              )}
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {statusId ? (
              <ClearButton onClick={() => setStatusId("")} className="right-7" />
            ) : null}
          </div>
          <SearchableSelect
            value={nationalityId}
            onChange={setNationalityId}
            options={nationalities.map((n) => ({
              value: n.id,
              label: n.name,
            }))}
            placeholder="All nationalities"
            searchPlaceholder="Search nationality…"
          />
        </div>
      </Card>

      <p className="text-sm text-black/50">
        {filtered.length} of {staff.length} staff member
        {staff.length === 1 ? "" : "s"}
      </p>

      {/* Data grid ----------------------------------------------------- */}
      <Card className="overflow-hidden p-0">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--venue-secondary)]/60 backdrop-blur">
              <tr>
                {columns.map((col) => {
                  const active = sortKey === col.key;
                  const sticky = STICKY_COLUMN_KEYS.has(col.key);
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        "border-b border-black/10 px-3 py-2 align-top",
                        sticky &&
                          "sticky z-30 border-r border-black/10 bg-[var(--venue-secondary)]/95 backdrop-blur-md",
                      )}
                      style={stickyColumnStyle(col.key)}
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="flex w-full items-center gap-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-black/60 transition-colors hover:text-[#3D421F]"
                      >
                        {col.label}
                        {active ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="h-3.5 w-3.5 text-[var(--venue-primary)]" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5 text-[var(--venue-primary)]" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 text-black/25" />
                        )}
                      </button>
                      <div className="mt-2">
                        <MultiSelect
                          options={columnOptions[col.key] ?? []}
                          selected={colFilters[col.key] ?? []}
                          onChange={(next) =>
                            setColFilters((prev) => ({
                              ...prev,
                              [col.key]: next,
                            }))
                          }
                          placeholder="Select…"
                          searchPlaceholder={`Search ${col.label.toLowerCase()}…`}
                        />
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  className="group border-b border-black/5 hover:bg-[var(--venue-secondary)]/30"
                >
                  {columns.map((col) => {
                    const sticky = STICKY_COLUMN_KEYS.has(col.key);
                    return (
                    <td
                      key={col.key}
                      className={cn(
                        "whitespace-nowrap px-3 py-2 text-black/70",
                        col.kind === "number" && "text-right tabular-nums",
                        sticky &&
                          "sticky z-10 border-r border-black/10 bg-white/90 backdrop-blur-sm group-hover:bg-[var(--venue-secondary)]/30",
                      )}
                      style={stickyColumnStyle(col.key)}
                    >
                      {col.render(s)}
                    </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-black/50">
            No staff match your filters.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
