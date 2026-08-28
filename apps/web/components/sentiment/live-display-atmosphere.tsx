/** Parchment atmosphere for the restaurant live display (same layers as Chef's Cookbook landing). */
export function LiveDisplayAtmosphere({ glowTop = "38%" }: { glowTop?: string }) {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 120% 80% at 50% -10%, color-mix(in srgb, var(--venue-secondary, #F0F3DD) 28%, white) 0%, transparent 55%),
            radial-gradient(ellipse 90% 70% at 100% 100%, color-mix(in srgb, var(--venue-secondary, #F0F3DD) 88%, #d8cbb8) 0%, transparent 50%),
            radial-gradient(ellipse 70% 60% at 0% 80%, color-mix(in srgb, var(--venue-secondary, #F0F3DD) 82%, #cfc4b0) 0%, transparent 45%),
            linear-gradient(165deg, color-mix(in srgb, var(--venue-secondary, #F0F3DD) 48%, white) 0%, color-mix(in srgb, var(--venue-secondary, #F0F3DD) 78%, white) 42%, var(--venue-secondary, #F0F3DD) 100%)
          `,
        }}
      />

      <div
        className="live-display-glow absolute left-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"
        style={{
          top: glowTop,
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--venue-primary, #818a40) 16%, transparent) 0%, color-mix(in srgb, var(--venue-primary, #818a40) 5%, transparent) 45%, transparent 70%)",
        }}
      />

      <div
        className="live-display-orb-a pointer-events-none absolute -left-24 top-[12%] h-72 w-72 rounded-full blur-[90px]"
        style={{
          background:
            "color-mix(in srgb, var(--venue-primary, #818a40) 11%, transparent)",
        }}
      />
      <div
        className="live-display-orb-b pointer-events-none absolute -right-16 bottom-[8%] h-96 w-96 rounded-full blur-[110px]"
        style={{ background: "rgba(61, 66, 31, 0.10)" }}
      />
      <div
        className="live-display-orb-c pointer-events-none absolute right-[18%] top-[18%] h-40 w-40 rounded-full blur-[60px]"
        style={{
          background:
            "color-mix(in srgb, var(--venue-primary, #818a40) 8%, transparent)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
          backgroundSize: "180px 180px",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 31px, #3D421F 31px, #3D421F 32px)",
          maskImage:
            "radial-gradient(ellipse 70% 55% at 50% 48%, black 20%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 70% 55% at 50% 48%, black 20%, transparent 75%)",
        }}
      />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 75% 65% at 50% 45%, transparent 40%, rgba(61, 66, 31, 0.06) 100%)",
        }}
      />
    </>
  );
}
