export function IosShareIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M12 3v11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8 7l4-4 4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 13v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IosAddIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="4"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 8v8M8 12h8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IOSInstallInstructions({
  appName,
}: {
  appName: string;
}) {
  const steps = [
    {
      icon: <IosShareIcon className="size-6" />,
      title: "Tap the Share button",
      body: "It’s the square with the arrow pointing up in Safari’s toolbar.",
    },
    {
      icon: <IosAddIcon className="size-6" />,
      title: "Tap “Add to Home Screen”",
      body: "Scroll the share sheet if you don’t see it at first.",
    },
    {
      icon: null,
      title: "Turn on “Open as Web App” if you see it",
      body: `This keeps ${appName} opening as an app, not a Safari tab.`,
    },
    {
      icon: null,
      title: "Tap Add",
      body: `${appName} will appear on your Home Screen.`,
    },
  ];

  return (
    <ol className="space-y-3 text-left">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="flex gap-3 rounded-2xl bg-neutral-900 px-3 py-3 ring-1 ring-white/12"
        >
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-sm font-semibold text-white">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 font-medium text-white">
              {step.icon}
              <span>{step.title}</span>
            </p>
            <p className="mt-1 text-sm leading-5 text-white/60">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
