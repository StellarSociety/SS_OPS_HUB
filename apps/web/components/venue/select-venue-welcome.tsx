import Image from "next/image";
import { cn } from "@/lib/utils";
import { getUserInitials } from "@/lib/user/display";

type SelectVenueWelcomeProps = {
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  empNo: string | null;
  position: string | null;
  compact?: boolean;
};

export function SelectVenueWelcome({
  fullName,
  email,
  avatarUrl,
  empNo,
  position,
  compact = false,
}: SelectVenueWelcomeProps) {
  const displayName = fullName?.trim() || email;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;
  const initials = getUserInitials(fullName, email);

  return (
    <div className={cn("mx-auto w-full px-4", compact ? "max-w-sm" : "max-w-lg")}>
      <div
        className={cn(
          "flex flex-col items-center text-center",
          compact ? "gap-2.5" : "gap-4",
        )}
      >
        <div
          className={cn(
            "relative shrink-0 overflow-hidden rounded-full border-2 border-white shadow-md ring-1 ring-black/10",
            compact ? "h-24 w-24" : "h-40 w-40",
          )}
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt=""
              fill
              className="object-cover"
              unoptimized
              priority
            />
          ) : (
            <div
              className={cn(
                "flex h-full w-full items-center justify-center bg-[#3D421F] font-medium text-white",
                compact ? "text-2xl" : "text-5xl",
              )}
            >
              {initials}
            </div>
          )}
        </div>
        <div className="min-w-0 w-full space-y-0.5">
          <p
            className={cn(
              "font-medium uppercase tracking-[0.12em] text-black/45",
              compact ? "text-[10px]" : "text-xs",
            )}
          >
            Welcome back
          </p>
          <h2
            className={cn(
              "font-serif font-semibold leading-tight tracking-tight text-[#3D421F]",
              compact ? "text-2xl" : "text-3xl",
            )}
          >
            {firstName ?? displayName}
          </h2>
          {empNo || position ? (
            <dl
              className={cn(
                "flex flex-col items-center gap-1 text-black/55",
                compact ? "mt-1 text-[11px]" : "mt-2 text-xs",
              )}
            >
              {empNo ? (
                <div className="flex items-center gap-1.5">
                  <dt className="text-black/40">Emp. no.</dt>
                  <dd className="font-mono font-medium text-[#3D421F]/80">
                    {empNo}
                  </dd>
                </div>
              ) : null}
              {position ? (
                <div className="flex items-center gap-1.5">
                  <dt className="text-black/40">Position</dt>
                  <dd className="font-medium text-[#3D421F]/80">{position}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </div>
      </div>
    </div>
  );
}
