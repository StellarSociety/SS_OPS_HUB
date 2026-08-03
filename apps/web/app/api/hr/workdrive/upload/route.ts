import { NextResponse } from "next/server";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  performStaffWorkDriveUpload,
  staffWorkDriveDocKindSchema,
} from "@/lib/hr/workdrive/staff-upload";
import type { HrWorkDriveDocKind } from "@/lib/hr/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/hr/workdrive/upload
 *
 * Multipart upload outside Server Actions — avoids Next.js busboy
 * "Unexpected end of form" when file inputs live under staff-entry-form.
 *
 * Fields: staff_id, emp_no, full_name, doc_kind, file, optional file_slot_id, doc_expiry
 */
export async function POST(request: Request) {
  const auth = await getActionAuthContext();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    console.error("[workdrive/upload] formData parse failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not read the upload. Check your connection and try again.",
      },
      { status: 400 },
    );
  }

  const staffId = String(formData.get("staff_id") ?? "").trim();
  const empNo = String(formData.get("emp_no") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const docKindRaw = String(formData.get("doc_kind") ?? "").trim();
  const fileSlotId = String(formData.get("file_slot_id") ?? "").trim() || undefined;
  const docExpiry = String(formData.get("doc_expiry") ?? "").trim() || undefined;
  const file = formData.get("file");

  const kindParsed = staffWorkDriveDocKindSchema.safeParse(docKindRaw);
  if (!kindParsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid document type." },
      { status: 400 },
    );
  }

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "Choose a file to upload." },
      { status: 400 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await performStaffWorkDriveUpload(auth, {
    staffId,
    empNo,
    fullName,
    docKind: kindParsed.data as HrWorkDriveDocKind,
    fileSlotId,
    docExpiry,
    bytes,
    originalFileName: file.name,
    contentType: file.type || "application/octet-stream",
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    workdriveFileId: result.workdriveFileId,
    permalink: result.permalink,
    path: result.path,
    fileName: result.fileName,
  });
}
