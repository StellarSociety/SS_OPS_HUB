import Image from "next/image";
import { getUserInitials } from "@/lib/user/display";

type SelectVenueWelcomeProps = {
  fullName: string | null;
  email: string;
  avatarUrl: string | null;
  empNo: string | null;
  position: string | null;
};

export function SelectVenueWelcome({
  fullName,
  email,
  avatarUrl,
  empNo,
  position,
}: SelectVenueWelcomeProps) {
  const displayName = fullName?.trim() || email;
  const firstName = fullName?.trim().split(/\s+/)[0] ?? null;
  const initials = getUserInitials(fullName, email);

  return (
    <div className="mx-auto w-full max-w-md px-4 sm:max-w-lg">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full border-2 border-white shadow-md ring-1 ring-black/10 sm:h-40 sm:w-40">
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
            <div className="flex h-full w-full items-center justify-center bg-[#3D421F] text-4xl font-medium text-white sm:text-5xl">
              {initials}
            </div>
          )}
        </div>
        <div className="min-w-0 w-full space-y-0.5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-black/45">
            Welcome back
          </p>
          <h2 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-[#3D421F] sm:text-3xl">
            {firstName ?? displayName}
          </h2>
          {firstName &&
          fullName?.trim().includes(" ") &&
          displayName !== firstName ? (
            <p className="truncate text-sm text-black/50">{displayName}</p>
          ) : null}
          {empNo || position ? (
            <dl className="mt-2 flex flex-col items-center gap-1 text-xs text-black/55">
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
