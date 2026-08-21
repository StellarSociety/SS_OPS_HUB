"use client";

export function MobileAccessDenied() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[var(--venue-secondary,#F0F3DD)] px-6 text-center">
      <div>
        <p className="font-serif text-2xl text-[#3D421F]">No access</p>
        <p className="mt-2 text-sm text-[#3D421F]/70">
          You don’t have access to the mobile app for this venue.
        </p>
      </div>
    </div>
  );
}
