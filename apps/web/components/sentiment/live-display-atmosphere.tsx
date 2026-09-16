/** Dark atmosphere for the restaurant live display. */
export function LiveDisplayAtmosphere({ glowTop = "38%" }: { glowTop?: string }) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 120% 80% at 50% -10%, rgba(255, 255, 255, 0.06) 0%, transparent 55%),
            radial-gradient(ellipse 90% 70% at 100% 100%, rgba(196, 163, 90, 0.09) 0%, transparent 50%),
            radial-gradient(ellipse 70% 60% at 0% 80%, rgba(196, 163, 90, 0.06) 0%, transparent 45%),
            #000000
          `,
        }}
      />

      <div
        className="live-display-glow absolute left-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"
        style={{
          top: glowTop,
          background:
            "radial-gradient(circle, rgba(196, 163, 90, 0.12) 0%, rgba(196, 163, 90, 0.04) 45%, transparent 70%)",
        }}
      />

      <div
        className="live-display-orb-a pointer-events-none absolute -left-24 top-[12%] h-72 w-72 rounded-full blur-[90px]"
        style={{ background: "rgba(196, 163, 90, 0.08)" }}
      />
      <div
        className="live-display-orb-b pointer-events-none absolute -right-16 bottom-[8%] h-96 w-96 rounded-full blur-[110px]"
        style={{ background: "rgba(255, 255, 255, 0.04)" }}
      />
      <div
        className="live-display-orb-c pointer-events-none absolute right-[18%] top-[18%] h-40 w-40 rounded-full blur-[60px]"
        style={{ background: "rgba(196, 163, 90, 0.06)" }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
          backgroundSize: "180px 180px",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 65% at 50% 45%, transparent 40%, rgba(0, 0, 0, 0.55) 100%)",
        }}
      />
    </>
  );
}
