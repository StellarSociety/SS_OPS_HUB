export default function AttendanceInsightsPage() {
  return (
    <div className="rounded-xl border border-black/5 bg-white/60 px-5 py-10 shadow-sm backdrop-blur-xl">
      <h2 className="font-serif text-2xl text-[#3D421F]">Insights</h2>
      <p className="mt-2 max-w-lg text-sm text-black/55">
        Attendance graphs and trends will live here — hours worked, late
        arrivals, missing punches, and department comparisons. Charts will be
        added once records are flowing from imports.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {["Hours by week", "Missing punches", "Late vs on-time"].map((label) => (
          <div
            key={label}
            className="flex h-36 items-center justify-center rounded-lg border border-dashed border-black/15 bg-black/[0.02] text-sm text-black/40"
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
