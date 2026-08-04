import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Department,
  Position,
  UniformPieceEntitlement,
  UniformPieceRow,
  UniformProductStatus,
  UniformStaffItemRow,
  UniformStaffSummaryRow,
  UniformStockReceiptRow,
  UniformSupplierRow,
} from "./types";
import {
  listAllStaff,
  listDepartments,
  listEmploymentStatuses,
  listPositions,
} from "./store";

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

  return (data ?? []).map((raw) => {
    const row = raw as {
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
    };
    const piece = unwrapOne(row.piece);
    return {
      id: row.id,
      staff_id: row.staff_id,
      piece_id: row.piece_id,
      quantity: row.quantity,
      provided_at: row.provided_at,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      piece: piece
        ? {
            id: piece.id,
            name: piece.name,
            unit_value: Number(piece.unit_value ?? 0),
          }
        : null,
    } satisfies UniformStaffItemRow;
  });
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

export async function loadUniformEmployeesPage(
  supabase: SupabaseClient,
  venueId: string,
) {
  const [pieces, staff, items, departments, positions, statuses] =
    await Promise.all([
      listUniformPieces(supabase),
      listAllStaff(supabase),
      listUniformStaffItems(supabase),
      listDepartments(supabase, venueId),
      listPositions(supabase, venueId),
      listEmploymentStatuses(supabase),
    ]);

  const itemsByStaff = new Map<string, UniformStaffItemRow[]>();
  for (const item of items) {
    const list = itemsByStaff.get(item.staff_id) ?? [];
    list.push(item);
    itemsByStaff.set(item.staff_id, list);
  }

  const rows = staff.map((member) => {
    const memberItems = itemsByStaff.get(member.id) ?? [];
    const total_value = memberItems.reduce((sum, item) => {
      const unit = item.piece?.unit_value ?? 0;
      return sum + unit * item.quantity;
    }, 0);
    return {
      staff: member,
      items: memberItems,
      total_value,
    } satisfies UniformStaffSummaryRow;
  });

  return { rows, pieces, staff, departments, positions, statuses };
}
