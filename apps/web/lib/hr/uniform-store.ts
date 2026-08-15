import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Department,
  Position,
  UniformPieceEntitlement,
  UniformPieceRow,
  UniformProductStatus,
  UniformReplacementRow,
  UniformStaffItemRow,
  UniformStaffSummaryRow,
  UniformStockReceiptRow,
  UniformSupplierRow,
} from "./types";
import {
  isOutEmploymentStatus,
} from "./employment-status";
import {
  listAllStaff,
  listDepartments,
  listEmploymentStatuses,
  listPositions,
} from "./store";
import { listPendingPayrollDeductionsForVenue } from "./payroll/pending-deductions";
import { createServiceClient } from "@/lib/supabase/service";

type EntitlementDbRow = {
  id: string;
  piece_id: string;
  department_id: string;
  position_id: string | null;
  department: Department | Department[] | null;
  position: Position | Position[] | null;
};

type StockReceiptDbRow = {
  id: string;
  piece_id: string;
  received_at: string;
  quantity: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

type PieceDbRow = {
  id: string;
  name: string;
  details: string;
  supplier_id: string | null;
  supplier: string;
  supplier_orders_email: string;
  contact_person: string;
  contact_phone: string;
  image_url: string;
  workdrive_file_id: string;
  product_status: UniformProductStatus;
  unit_value: number | string;
  created_at: string;
  updated_at: string;
  entitlements: EntitlementDbRow[] | null;
  stock_receipts: StockReceiptDbRow[] | null;
  supplier_record: UniformSupplierRow | UniformSupplierRow[] | null;
};

function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapEntitlement(row: EntitlementDbRow): UniformPieceEntitlement {
  return {
    id: row.id,
    piece_id: row.piece_id,
    department_id: row.department_id,
    position_id: row.position_id,
    department: unwrapOne(row.department),
    position: unwrapOne(row.position),
  };
}

function mapStockReceipt(row: StockReceiptDbRow): UniformStockReceiptRow {
  return {
    id: row.id,
    piece_id: row.piece_id,
    received_at: row.received_at,
    quantity: Number(row.quantity ?? 0),
    notes: row.notes ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function resolveUniformImageUrl(imageUrl: string, workdriveFileId: string): string {
  const url = imageUrl.trim();
  if (url) return url;
  const fileId = workdriveFileId.trim();
  if (!fileId) return "";
  return `/api/hr/workdrive/download/${encodeURIComponent(fileId)}`;
}

function mapPiece(
  row: PieceDbRow,
  assignedByPiece: Map<string, number>,
): UniformPieceRow {
  const stock_receipts = (row.stock_receipts ?? [])
    .map(mapStockReceipt)
    .sort((a, b) => b.received_at.localeCompare(a.received_at));
  const stock_received = stock_receipts.reduce(
    (sum, receipt) => sum + receipt.quantity,
    0,
  );
  const stock_assigned = assignedByPiece.get(row.id) ?? 0;
  const supplierRecord = unwrapOne(row.supplier_record);
  return {
    id: row.id,
    name: row.name,
    details: row.details,
    supplier_id: row.supplier_id,
    supplier: supplierRecord?.name ?? row.supplier,
    supplier_orders_email:
      supplierRecord?.orders_email ?? row.supplier_orders_email ?? "",
    contact_person: supplierRecord?.contact_person ?? row.contact_person ?? "",
    contact_phone: supplierRecord?.contact_phone ?? row.contact_phone ?? "",
    image_url: resolveUniformImageUrl(
      row.image_url ?? "",
      row.workdrive_file_id ?? "",
    ),
    workdrive_file_id: row.workdrive_file_id ?? "",
    product_status: row.product_status === "old" ? "old" : "active",
    unit_value: Number(row.unit_value ?? 0),
    created_at: row.created_at,
    updated_at: row.updated_at,
    entitlements: (row.entitlements ?? []).map(mapEntitlement),
    stock_receipts,
    stock_received,
    stock_assigned,
    stock_balance: stock_received - stock_assigned,
    supplier_record: supplierRecord,
  };
}

export async function listUniformSuppliers(
  supabase: SupabaseClient,
): Promise<UniformSupplierRow[]> {
  const { data, error } = await supabase
    .from("hr_uniform_suppliers")
    .select(
      "id, name, orders_email, contact_person, contact_phone, notes, created_at, updated_at",
    )
    .order("name");

  if (error) {
    console.error("[hr] listUniformSuppliers:", error.message);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    orders_email: row.orders_email ?? "",
    contact_person: row.contact_person ?? "",
    contact_phone: row.contact_phone ?? "",
    notes: row.notes ?? "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function listUniformPieces(
  supabase: SupabaseClient,
): Promise<UniformPieceRow[]> {
  const [piecesResult, assignmentsResult] = await Promise.all([
    supabase
      .from("hr_uniform_pieces")
      .select(
        `
        id,
        name,
        details,
        supplier_id,
        supplier,
        supplier_orders_email,
        contact_person,
        contact_phone,
        image_url,
        workdrive_file_id,
        product_status,
        unit_value,
        created_at,
        updated_at,
        supplier_record:hr_uniform_suppliers(
          id,
          name,
          orders_email,
          contact_person,
          contact_phone,
          notes,
          created_at,
          updated_at
        ),
        entitlements:hr_uniform_piece_entitlements(
          id,
          piece_id,
          department_id,
          position_id,
          department:departments(id, venue_id, name, sort_order),
          position:positions(id, venue_id, department_id, name, sort_order)
        ),
        stock_receipts:hr_uniform_stock_receipts(
          id,
          piece_id,
          received_at,
          quantity,
          notes,
          created_at,
          updated_at
        )
      `,
      )
      .order("name"),
    supabase.from("hr_uniform_staff_items").select("piece_id, quantity"),
  ]);

  if (piecesResult.error) {
    console.error("[hr] listUniformPieces:", piecesResult.error.message);
    return [];
  }

  if (assignmentsResult.error) {
    console.error(
      "[hr] listUniformPieces assignments:",
      assignmentsResult.error.message,
    );
  }

  const assignedByPiece = new Map<string, number>();
  for (const row of assignmentsResult.data ?? []) {
    const pieceId = String((row as { piece_id: string }).piece_id);
    const qty = Number((row as { quantity: number }).quantity ?? 0);
    assignedByPiece.set(pieceId, (assignedByPiece.get(pieceId) ?? 0) + qty);
  }

  return ((piecesResult.data ?? []) as unknown as PieceDbRow[]).map((row) =>
    mapPiece(row, assignedByPiece),
  );
}

function mapUniformStaffItemRow(raw: {
  id: string;
  staff_id: string;
  piece_id: string;
  quantity: number;
  provided_at: string;
  notes: string;
  created_at: string;
  updated_at: string;
  piece:
    | { id: string; name: string; unit_value: number | string }
    | { id: string; name: string; unit_value: number | string }[]
    | null;
}): UniformStaffItemRow {
  const piece = unwrapOne(raw.piece);
  return {
    id: raw.id,
    staff_id: raw.staff_id,
    piece_id: raw.piece_id,
    quantity: raw.quantity,
    provided_at: raw.provided_at,
    notes: raw.notes,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    piece: piece
      ? {
          id: piece.id,
          name: piece.name,
          unit_value: Number(piece.unit_value ?? 0),
        }
      : null,
  };
}

export async function listUniformStaffItems(
  supabase: SupabaseClient,
): Promise<UniformStaffItemRow[]> {
  const { data, error } = await supabase
    .from("hr_uniform_staff_items")
    .select(
      `
      id,
      staff_id,
      piece_id,
      quantity,
      provided_at,
      notes,
      created_at,
      updated_at,
      piece:hr_uniform_pieces(id, name, unit_value)
    `,
    )
    .order("provided_at", { ascending: false });

  if (error) {
    console.error("[hr] listUniformStaffItems:", error.message);
    return [];
  }

  return (data ?? []).map((raw) =>
    mapUniformStaffItemRow(
      raw as Parameters<typeof mapUniformStaffItemRow>[0],
    ),
  );
}

export async function listUniformItemsForStaff(
  supabase: SupabaseClient,
  staffId: string,
): Promise<UniformStaffItemRow[]> {
  const { data, error } = await supabase
    .from("hr_uniform_staff_items")
    .select(
      `
      id,
      staff_id,
      piece_id,
      quantity,
      provided_at,
      notes,
      created_at,
      updated_at,
      piece:hr_uniform_pieces(id, name, unit_value)
    `,
    )
    .eq("staff_id", staffId)
    .order("provided_at", { ascending: false });

  if (error) {
    console.error("[hr] listUniformItemsForStaff:", error.message);
    return [];
  }

  return (data ?? []).map((raw) =>
    mapUniformStaffItemRow(
      raw as Parameters<typeof mapUniformStaffItemRow>[0],
    ),
  );
}

export async function listUniformStaffSummaries(
  supabase: SupabaseClient,
): Promise<UniformStaffSummaryRow[]> {
  const [staff, items] = await Promise.all([
    listAllStaff(supabase),
    listUniformStaffItems(supabase),
  ]);

  const itemsByStaff = new Map<string, UniformStaffItemRow[]>();
  for (const item of items) {
    const list = itemsByStaff.get(item.staff_id) ?? [];
    list.push(item);
    itemsByStaff.set(item.staff_id, list);
  }

  return staff
    .map((member) => {
      const staffItems = itemsByStaff.get(member.id) ?? [];
      const total_value = staffItems.reduce((sum, item) => {
        const unit = item.piece?.unit_value ?? 0;
        return sum + unit * item.quantity;
      }, 0);
      return {
        staff: member,
        items: staffItems,
        total_value,
      };
    })
    .filter((row) => row.items.length > 0);
}

export async function loadUniformDetailsPage(supabase: SupabaseClient) {
  const [pieces, suppliers] = await Promise.all([
    listUniformPieces(supabase),
    listUniformSuppliers(supabase),
  ]);
  return { pieces, suppliers };
}

export async function loadUniformSuppliersPage(supabase: SupabaseClient) {
  const suppliers = await listUniformSuppliers(supabase);
  return { suppliers };
}

export async function listUniformReplacements(
  supabase: SupabaseClient,
  venueId: string,
  opts?: { staffId?: string },
): Promise<UniformReplacementRow[]> {
  let query = supabase
    .from("hr_uniform_replacements")
    .select(
      `
      id,
      venue_id,
      staff_id,
      piece_id,
      staff_item_id,
      quantity,
      unit_value,
      charged_to_employee,
      deduction_amount,
      notes,
      pending_deduction_id,
      email_sent_at,
      created_at,
      piece:hr_uniform_pieces(name),
      pending_deduction:hr_pending_payroll_deductions!pending_deduction_id(
        status,
        applied_run_id,
        amount,
        original_amount,
        remaining_amount
      )
    `,
    )
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false });

  if (opts?.staffId) {
    query = query.eq("staff_id", opts.staffId);
  }

  const { data, error } = await query;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    // Pre-migration fallback without original/remaining columns.
    if (/original_amount|remaining_amount/i.test(error.message)) {
      return listUniformReplacementsLegacy(supabase, venueId, opts);
    }
    console.error("[hr] listUniformReplacements:", error.message);
    return [];
  }

  type PendingJoin = {
    status: string;
    applied_run_id: string | null;
    amount?: number | string | null;
    original_amount?: number | string | null;
    remaining_amount?: number | string | null;
  };

  const rows = (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      venue_id: string;
      staff_id: string;
      piece_id: string;
      staff_item_id: string | null;
      quantity: number;
      unit_value: number | string;
      charged_to_employee: boolean;
      deduction_amount: number | string;
      notes: string;
      pending_deduction_id: string | null;
      email_sent_at: string | null;
      created_at: string;
      piece: { name: string } | { name: string }[] | null;
      pending_deduction: PendingJoin | PendingJoin[] | null;
    };
    const piece = Array.isArray(row.piece) ? row.piece[0] : row.piece;
    const pending = Array.isArray(row.pending_deduction)
      ? row.pending_deduction[0]
      : row.pending_deduction;
    const status = pending?.status;
    const applied: UniformReplacementRow["pending_deduction_status"] =
      status === "applied" ||
      status === "pending" ||
      status === "cancelled" ||
      status === "cleared"
        ? status
        : null;
    const lineAmount = Number(row.deduction_amount ?? 0);
    const original = Number(
      pending?.original_amount ?? pending?.amount ?? lineAmount,
    );
    const remaining = Number(
      pending?.remaining_amount ??
        (applied === "pending" ? original : applied === "cleared" || applied === "applied" ? 0 : lineAmount),
    );
    const deducted = Math.max(0, Math.round((original - remaining) * 100) / 100);
    return {
      id: row.id,
      venue_id: row.venue_id,
      staff_id: row.staff_id,
      piece_id: row.piece_id,
      staff_item_id: row.staff_item_id,
      quantity: Number(row.quantity ?? 0),
      unit_value: Number(row.unit_value ?? 0),
      charged_to_employee: Boolean(row.charged_to_employee),
      deduction_amount: lineAmount,
      notes: String(row.notes ?? ""),
      pending_deduction_id: row.pending_deduction_id,
      email_sent_at: row.email_sent_at,
      created_at: row.created_at,
      piece_name: piece?.name ?? null,
      pending_deduction_status: applied,
      applied_run_id: (pending?.applied_run_id as string | null) ?? null,
      applied_run_status: null as string | null,
      payroll_month: null as string | null,
      payroll_editable: applied !== "applied" && applied !== "cleared",
      original_amount: row.charged_to_employee ? original : 0,
      remaining_amount: row.charged_to_employee ? remaining : 0,
      deducted_amount: row.charged_to_employee ? deducted : 0,
      deduction_applications: [] as UniformReplacementRow["deduction_applications"],
    } satisfies UniformReplacementRow;
  });

  const pendingIds = [
    ...new Set(
      rows
        .map((row) => row.pending_deduction_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const applicationsByPending = new Map<
    string,
    NonNullable<UniformReplacementRow["deduction_applications"]>
  >();

  if (pendingIds.length > 0) {
    const { data: apps, error: appsError } = await supabase
      .from("hr_payroll_deduction_applications")
      .select("pending_deduction_id, run_id, amount")
      .eq("venue_id", venueId)
      .in("pending_deduction_id", pendingIds)
      .order("created_at", { ascending: true });

    if (!appsError && (apps?.length ?? 0) > 0) {
      const appRunIds = [
        ...new Set((apps ?? []).map((a) => String(a.run_id))),
      ];
      const { data: appRuns } = await supabase
        .from("hr_payroll_runs")
        .select("id, status, payroll_month")
        .in("id", appRunIds);
      const runById = new Map(
        (appRuns ?? []).map((run) => [
          String(run.id),
          {
            status: String(run.status ?? ""),
            payroll_month: run.payroll_month
              ? String(run.payroll_month).slice(0, 10)
              : null,
          },
        ]),
      );
      for (const app of apps ?? []) {
        const pendingId = String(app.pending_deduction_id);
        const runId = String(app.run_id);
        const run = runById.get(runId);
        const list = applicationsByPending.get(pendingId) ?? [];
        list.push({
          runId,
          payrollMonth: run?.payroll_month ?? null,
          amount: Math.round(Number(app.amount ?? 0) * 100) / 100,
          runStatus: run?.status ?? null,
        });
        applicationsByPending.set(pendingId, list);
      }
    }
  }

  // Legacy single-run applied_run_id when applications table is empty/missing.
  const legacyRunIds = [
    ...new Set(
      rows
        .filter(
          (row) =>
            row.pending_deduction_id &&
            row.applied_run_id &&
            !(applicationsByPending.get(row.pending_deduction_id)?.length),
        )
        .map((row) => row.applied_run_id as string),
    ),
  ];

  const legacyRunById = new Map<
    string,
    { status: string; payroll_month: string | null }
  >();
  if (legacyRunIds.length > 0) {
    const { data: runs } = await supabase
      .from("hr_payroll_runs")
      .select("id, status, payroll_month")
      .in("id", legacyRunIds);
    for (const run of runs ?? []) {
      legacyRunById.set(String(run.id), {
        status: String(run.status ?? ""),
        payroll_month: run.payroll_month
          ? String(run.payroll_month).slice(0, 10)
          : null,
      });
    }
  }

  return rows.map((row) => {
    const apps =
      (row.pending_deduction_id
        ? applicationsByPending.get(row.pending_deduction_id)
        : null) ?? [];

    let deductionApplications = apps;
    if (
      deductionApplications.length === 0 &&
      row.applied_run_id &&
      (row.pending_deduction_status === "applied" ||
        row.pending_deduction_status === "cleared")
    ) {
      const run = legacyRunById.get(row.applied_run_id);
      deductionApplications = [
        {
          runId: row.applied_run_id,
          payrollMonth: run?.payroll_month ?? null,
          amount: Number(row.deducted_amount ?? row.original_amount ?? 0),
          runStatus: run?.status ?? null,
        },
      ];
    }

    const primaryRunId =
      deductionApplications[deductionApplications.length - 1]?.runId ??
      row.applied_run_id;
    const primaryRun =
      (primaryRunId
        ? applicationsByPending
            .get(row.pending_deduction_id ?? "")
            ?.find((a) => a.runId === primaryRunId)
        : null) ??
      (primaryRunId ? legacyRunById.get(primaryRunId) : null);

    const runStatus =
      deductionApplications[deductionApplications.length - 1]?.runStatus ??
      (primaryRun && "status" in primaryRun ? primaryRun.status : null) ??
      null;
    const payrollMonth =
      deductionApplications[deductionApplications.length - 1]?.payrollMonth ??
      (primaryRun && "payroll_month" in primaryRun
        ? primaryRun.payroll_month
        : null) ??
      null;

    const anyLockedApp = deductionApplications.some(
      (a) =>
        a.runStatus === "paid" ||
        a.runStatus === "locked" ||
        a.runStatus === "payment_processing",
    );
    const payrollEditable =
      row.pending_deduction_status !== "applied" &&
      row.pending_deduction_status !== "cleared"
        ? true
        : !anyLockedApp &&
          (!runStatus ||
            (runStatus !== "paid" &&
              runStatus !== "locked" &&
              runStatus !== "payment_processing"));

    return {
      ...row,
      applied_run_id: primaryRunId ?? row.applied_run_id,
      applied_run_status: runStatus,
      payroll_month: payrollMonth,
      payroll_editable: payrollEditable,
      deduction_applications: deductionApplications,
    } satisfies UniformReplacementRow;
  });
}

async function listUniformReplacementsLegacy(
  supabase: SupabaseClient,
  venueId: string,
  opts?: { staffId?: string },
): Promise<UniformReplacementRow[]> {
  let query = supabase
    .from("hr_uniform_replacements")
    .select(
      `
      id,
      venue_id,
      staff_id,
      piece_id,
      staff_item_id,
      quantity,
      unit_value,
      charged_to_employee,
      deduction_amount,
      notes,
      pending_deduction_id,
      email_sent_at,
      created_at,
      piece:hr_uniform_pieces(name),
      pending_deduction:hr_pending_payroll_deductions!pending_deduction_id(
        status,
        applied_run_id,
        amount
      )
    `,
    )
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false });

  if (opts?.staffId) {
    query = query.eq("staff_id", opts.staffId);
  }

  const { data, error } = await query;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    console.error("[hr] listUniformReplacements legacy:", error.message);
    return [];
  }

  return (data ?? []).map((raw) => {
    const row = raw as {
      id: string;
      venue_id: string;
      staff_id: string;
      piece_id: string;
      staff_item_id: string | null;
      quantity: number;
      unit_value: number | string;
      charged_to_employee: boolean;
      deduction_amount: number | string;
      notes: string;
      pending_deduction_id: string | null;
      email_sent_at: string | null;
      created_at: string;
      piece: { name: string } | { name: string }[] | null;
      pending_deduction:
        | { status: string; applied_run_id: string | null; amount?: number | string }
        | { status: string; applied_run_id: string | null; amount?: number | string }[]
        | null;
    };
    const piece = Array.isArray(row.piece) ? row.piece[0] : row.piece;
    const pending = Array.isArray(row.pending_deduction)
      ? row.pending_deduction[0]
      : row.pending_deduction;
    const status = pending?.status;
    const applied: UniformReplacementRow["pending_deduction_status"] =
      status === "applied" ||
      status === "pending" ||
      status === "cancelled" ||
      status === "cleared"
        ? status
        : null;
    const amount = Number(row.deduction_amount ?? pending?.amount ?? 0);
    const remaining =
      applied === "pending" ? amount : applied === "cleared" || applied === "applied" ? 0 : amount;
    return {
      id: row.id,
      venue_id: row.venue_id,
      staff_id: row.staff_id,
      piece_id: row.piece_id,
      staff_item_id: row.staff_item_id,
      quantity: Number(row.quantity ?? 0),
      unit_value: Number(row.unit_value ?? 0),
      charged_to_employee: Boolean(row.charged_to_employee),
      deduction_amount: amount,
      notes: String(row.notes ?? ""),
      pending_deduction_id: row.pending_deduction_id,
      email_sent_at: row.email_sent_at,
      created_at: row.created_at,
      piece_name: piece?.name ?? null,
      pending_deduction_status: applied,
      applied_run_id: (pending?.applied_run_id as string | null) ?? null,
      payroll_editable: applied !== "applied" && applied !== "cleared",
      original_amount: row.charged_to_employee ? amount : 0,
      remaining_amount: row.charged_to_employee ? remaining : 0,
      deducted_amount: row.charged_to_employee ? amount - remaining : 0,
      deduction_applications: [],
    } satisfies UniformReplacementRow;
  });
}

export async function listUniformStaffArchives(
  supabase: SupabaseClient,
  venueId: string,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("hr_uniform_staff_archives")
    .select("staff_id, archived_at")
    .eq("venue_id", venueId);

  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return new Map();
    console.error("[hr] listUniformStaffArchives:", error.message);
    return new Map();
  }

  return new Map(
    (data ?? []).map((row) => [
      String(row.staff_id),
      String(row.archived_at ?? ""),
    ]),
  );
}

/** Persist a uniform-list hide for a staff member (idempotent). */
export async function upsertUniformStaffArchive(
  supabase: SupabaseClient,
  input: {
    venueId: string;
    staffId: string;
    archivedBy?: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("hr_uniform_staff_archives").upsert(
    {
      venue_id: input.venueId,
      staff_id: input.staffId,
      archived_at: new Date().toISOString(),
      archived_by: input.archivedBy ?? null,
    },
    { onConflict: "venue_id,staff_id" },
  );
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return;
    console.error("[hr] upsertUniformStaffArchive:", error.message);
  }
}

/**
 * When employment status becomes OUT, hide the employee from the default
 * Uniform Employees list (same as the manual “Hide from list” action).
 */
export async function archiveUniformStaffIfEmploymentOut(
  supabase: SupabaseClient,
  input: {
    venueId: string;
    staffId: string;
    employmentStatusId?: string | null;
    employmentStatusName?: string | null;
    archivedBy?: string | null;
  },
): Promise<boolean> {
  let statusName = input.employmentStatusName?.trim() || "";
  if (!statusName && input.employmentStatusId) {
    const { data, error } = await supabase
      .from("employment_statuses")
      .select("name")
      .eq("id", input.employmentStatusId)
      .maybeSingle();
    if (error) {
      console.error(
        "[hr] archiveUniformStaffIfEmploymentOut status lookup:",
        error.message,
      );
      return false;
    }
    statusName = data?.name?.trim() ?? "";
  }

  if (!isOutEmploymentStatus(statusName)) {
    return false;
  }

  await upsertUniformStaffArchive(supabase, {
    venueId: input.venueId,
    staffId: input.staffId,
    archivedBy: input.archivedBy,
  });
  return true;
}

async function countUniformTermsEmailsByStaff(
  venueId: string,
): Promise<Map<string, number>> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("audit_log")
      .select("entity_id")
      .eq("venue_id", venueId)
      .eq("entity", "staff")
      .eq("action", "uniform_terms_email.sent");
    if (error) {
      console.error("[hr] countUniformTermsEmailsByStaff:", error.message);
      return new Map();
    }
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const staffId = String(row.entity_id ?? "").trim();
      if (!staffId) continue;
      counts.set(staffId, (counts.get(staffId) ?? 0) + 1);
    }
    return counts;
  } catch (error) {
    console.error("[hr] countUniformTermsEmailsByStaff:", error);
    return new Map();
  }
}

export async function loadUniformEmployeesPage(
  supabase: SupabaseClient,
  venueId: string,
) {
  const [
    pieces,
    suppliers,
    staff,
    items,
    departments,
    positions,
    statuses,
    pending,
    replacements,
    archives,
    termsEmailCounts,
  ] = await Promise.all([
    listUniformPieces(supabase),
    listUniformSuppliers(supabase),
    listAllStaff(supabase),
    listUniformStaffItems(supabase),
    listDepartments(supabase, venueId),
    listPositions(supabase, venueId),
    listEmploymentStatuses(supabase),
    listPendingPayrollDeductionsForVenue(supabase, venueId, {
      status: "pending",
    }),
    listUniformReplacements(supabase, venueId),
    listUniformStaffArchives(supabase, venueId),
    countUniformTermsEmailsByStaff(venueId),
  ]);

  const itemsByStaff = new Map<string, UniformStaffItemRow[]>();
  for (const item of items) {
    const list = itemsByStaff.get(item.staff_id) ?? [];
    list.push(item);
    itemsByStaff.set(item.staff_id, list);
  }

  const pendingByStaff = new Map<string, number>();
  for (const row of pending) {
    if (row.source !== "uniform_replacement") continue;
    const outstanding = Number(row.remaining_amount ?? row.amount ?? 0);
    if (!(outstanding > 0)) continue;
    pendingByStaff.set(
      row.staff_id,
      (pendingByStaff.get(row.staff_id) ?? 0) + outstanding,
    );
  }

  const replacementsByStaff = new Map<string, UniformReplacementRow[]>();
  for (const row of replacements) {
    const list = replacementsByStaff.get(row.staff_id) ?? [];
    list.push(row);
    replacementsByStaff.set(row.staff_id, list);
  }

  const rows = staff.map((member) => {
    const memberItems = itemsByStaff.get(member.id) ?? [];
    const total_value = memberItems.reduce((sum, item) => {
      const unit = item.piece?.unit_value ?? 0;
      return sum + unit * item.quantity;
    }, 0);
    const archivedAt = archives.get(member.id) ?? null;
    const hiddenByOut = isOutEmploymentStatus(
      member.employment_status?.name,
    );
    return {
      staff: member,
      items: memberItems,
      total_value,
      pending_deduction_total: pendingByStaff.get(member.id) ?? 0,
      replacements: replacementsByStaff.get(member.id) ?? [],
      archived: archivedAt != null || hiddenByOut,
      archived_at: archivedAt,
      terms_email_count: termsEmailCounts.get(member.id) ?? 0,
    } satisfies UniformStaffSummaryRow;
  });

  return { rows, pieces, suppliers, staff, departments, positions, statuses };
}
