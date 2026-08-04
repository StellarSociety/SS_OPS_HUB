import { NextResponse } from "next/server";
import {
  getAccessToken,
  getCurrentUser,
  listTeamFolders,
  ZohoWorkDriveError,
} from "@/lib/zoho/workdrive";

export const dynamic = "force-dynamic";

/**
 * GET /api/zoho/health — refresh OAuth + list team folders.
 * Confirms ZOHO_* env credentials can reach WorkDrive.
 */
export async function GET() {
  try {
    await getAccessToken({ forceRefresh: true });
    const user = await getCurrentUser();
    const folders = await listTeamFolders();
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      teamFolderCount: folders.length,
      sample: folders.slice(0, 5).map((f) => ({
        id: f.id,
        name: f.name,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      err instanceof ZohoWorkDriveError && err.status >= 400
        ? err.status
        : 500;
    return NextResponse.json(
      {
        ok: false,
        error: message,
        body:
          err instanceof ZohoWorkDriveError
            ? err.body.slice(0, 400)
            : undefined,
      },
      { status },
    );
  }
}
