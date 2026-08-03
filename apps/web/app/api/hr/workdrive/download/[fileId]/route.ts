import { NextResponse } from "next/server";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  credentialsFromSettings,
  downloadFile,
  ensureAccessToken,
} from "@/lib/hr/workdrive/client";
import { getStaffWorkDriveDocumentByFileId } from "@/lib/hr/workdrive/documents";
import { loadWorkDriveSettings } from "@/lib/hr/workdrive/settings";
import { canEditStaff, canViewStaff } from "@/lib/hr/permissions";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ fileId: string }>;
};

/**
 * Authenticated proxy: streams WorkDrive bytes so previews never expose
 * OAuth tokens or public share links.
 *
 * GET /api/hr/workdrive/download/[fileId]
 */
export async function GET(_request: Request, context: RouteContext) {
  const { fileId: rawId } = await context.params;
  const fileId = decodeURIComponent(rawId || "").trim();
  if (!fileId) {
    return NextResponse.json({ error: "Missing file id." }, { status: 400 });
  }

  const auth = await getActionAuthContext();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const { venue, permissions } = auth;
  if (
    !canViewStaff(permissions, venue.id) &&
    !canEditStaff(permissions, venue.id)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = createServiceClient();
  const meta = await getStaffWorkDriveDocumentByFileId(
    service,
    venue.id,
    fileId,
  );
  if (meta && meta.venue_id !== venue.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const settings = await loadWorkDriveSettings(service, venue.id);
    const credentials = credentialsFromSettings(settings);
    const { accessToken, apiDomain } = await ensureAccessToken(
      venue.id,
      credentials,
    );
    const downloaded = await downloadFile({
      region: settings.region,
      apiDomain,
      accessToken,
      resourceId: fileId,
    });

    if (!downloaded.body) {
      return NextResponse.json(
        { error: "Empty download body from WorkDrive." },
        { status: 502 },
      );
    }

    const headers = new Headers();
    headers.set("Content-Type", downloaded.contentType);
    if (downloaded.contentLength) {
      headers.set("Content-Length", downloaded.contentLength);
    }
    const name =
      downloaded.fileName || meta?.file_name || `workdrive-${fileId}`;
    headers.set(
      "Content-Disposition",
      `inline; filename="${name.replace(/"/g, "")}"`,
    );
    headers.set("Cache-Control", "private, no-store");

    return new NextResponse(downloaded.body, { status: 200, headers });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "WorkDrive download failed.";
    const scopeIssue = /INVALID_OAUTHSCOPE/i.test(message);
    return NextResponse.json(
      {
        error: scopeIssue
          ? "WorkDrive token is missing download permission. In Zoho API Console, generate a new Self Client code with scopes WorkDrive.files.ALL,WorkDrive.teamfolders.READ, then exchange it under Drive config."
          : message,
      },
      { status: scopeIssue ? 403 : 502 },
    );
  }
}
