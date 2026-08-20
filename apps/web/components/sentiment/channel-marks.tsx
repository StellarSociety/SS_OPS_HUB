import type { LucideProps } from "lucide-react";

export function GoogleMark({ className, ...props }: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      focusable="false"
      {...props}
    >
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.48a5.54 5.54 0 0 1-2.4 3.64v3.02h3.88c2.27-2.09 3.53-5.17 3.53-8.9Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.12A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.26A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.55.38-2.26V6.62H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.38l4-3.12Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.62l4 3.12C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

export function TripAdvisorMark({ className, ...props }: LucideProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      focusable="false"
      {...props}
    >
      <circle cx="12" cy="12" r="10" fill="#34E0A1" />
      <circle cx="8.2" cy="12" r="2.4" fill="#1A2B32" />
      <circle cx="15.8" cy="12" r="2.4" fill="#1A2B32" />
      <circle cx="8.2" cy="12" r="0.9" fill="#fff" />
      <circle cx="15.8" cy="12" r="0.9" fill="#fff" />
    </svg>
  );
}
