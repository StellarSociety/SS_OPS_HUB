# Cursor prompt — PWA install kit (`/install`)

Paste this file into Cursor (Composer / agent mode) with the **target** repo open.
Goal: recreate the SS Ops HUB install experience — a public `/install` page that
adds the web app to a phone Home Screen (Android prompt, iOS Safari steps,
desktop QR), plus a conservative service worker and web app manifest.

**Source of truth (already shipped):** https://ssopshub.vercel.app/install
Implemented in `StellarSociety/SS_OPS_HUB` (`apps/web`). Port the *behavior*,
not the venue/HR product.

---

You are adding a **PWA install kit** to this project. Do not invent a second
install flow. Follow this spec exactly.

## 0. Fill these values first

Replace every `YOUR_*` before writing files.

| Token | SS Ops HUB value | Your project |
|---|---|---|
| `YOUR_APP_NAME` | `SS Ops HUB` | |
| `YOUR_INSTALL_PATH` | `/install` | `/install` unless you must change it |
| `YOUR_INSTALL_URL` | `https://ssopshub.vercel.app/install` | production origin + install path |
| `YOUR_START_URL` | `/m/` | in-scope start URL (**trailing slash required** if scope ends with `/`) |
| `YOUR_SCOPE` | `/m/` | path prefix the installed app may navigate |
| `YOUR_THEME_COLOR` | `#818a40` | status bar / chrome |
| `YOUR_BG_COLOR` | `#E9E3D6` | splash / manifest background |
| `YOUR_SW_CACHE` | `ss-ops-hub-pwa-v8` | `{app-slug}-pwa-v1` — bump when precache list changes |
| `YOUR_BANNER_KEY` | `ss-ops-pwa-banner-dismissed` | `{app-slug}-pwa-banner-dismissed` |
| `YOUR_RETURN_KEY` | `ss-ops-pwa-return-path` | `{app-slug}-pwa-return-path` |
| `YOUR_OPEN_PATH` | `/m` | default route after “Open {app}” |

**Hard constraint:** `start_url` must sit *inside* `scope`. `/m` is **outside**
scope `/m/`. Always use `/m/` (or make both `/`).

---

## 1. What this kit does

One public page. Device detection. Four UIs.

| Surface | Who sees it | What they get |
|---|---|---|
| Desktop | mouse / non-phone UA | QR to `YOUR_INSTALL_URL` + copy link |
| iPhone Safari | iOS Safari | numbered “Add to Home Screen” steps |
| iPhone Chrome / in-app | CriOS, WhatsApp, Instagram, etc. | “Open this page in Safari” |
| Android Chrome | Android + `beforeinstallprompt` | `Install {app}` button that calls `prompt()` |
| Already installed | standalone / `appinstalled` / related apps | “is installed” + **Open {app}** |

Optional extras (include them — they are part of the kit):

- Sidebar / settings **Install** dialog (same desktop QR panel).
- In-app **bottom banner** on the start-url scope only, dismissible 30 days.
- Dev-only preview toolbar: `?preview=ios|ios-chrome|android|desktop|installed`.

The page is **black**, logo on top, serif title, muted subtitle, max-width
`max-w-sm`. Metadata: `robots: noindex`. Auth: **public**. Not venue-scoped.

---

## 2. Installability (Chrome / Android)

All of these must be true on the **production HTTPS origin** or the Install
button stays disabled and only the menu fallback appears.

1. Served over HTTPS (localhost is OK for local testing).
2. `manifest.webmanifest` linked (Next.js `app/manifest.ts` does this).
3. Manifest has `name`/`short_name`, `start_url`, `display: standalone` (or
   `minimal-ui` / `fullscreen`), and **PNG icons ≥ 192 and 512**.
4. A service worker is registered and controlling the page.
5. `beforeinstallprompt` is captured **before** the browser fires it — mount
   the provider in the **root layout**, not only on `/install`.

iOS never fires `beforeinstallprompt`. Do not fake an Install button on iOS.

---

## 3. File tree to create

```
app/manifest.ts
app/install/page.tsx
app/install/layout.tsx
public/sw.js
public/icons/icon-192.png
public/icons/icon-512.png
public/icons/icon-512-maskable.png
public/icons/install-qr.svg
public/apple-touch-icon.png          # 180×180 PNG, also copy under /icons if you precache both
public/brand/{app-icon}.webp         # logo shown on /install (not the Home Screen PNG)

lib/pwa/constants.ts
lib/pwa/device.ts
lib/pwa/standalone.ts
lib/pwa/use-standalone-mode.ts
lib/pwa/return-path.ts
lib/pwa/install-preview.ts
lib/pwa/__tests__/pwa.test.ts

components/pwa/pwa-install-provider.tsx
components/pwa/install-app-page.tsx
components/pwa/android-install-button.tsx
components/pwa/ios-install-instructions.tsx
components/pwa/desktop-install-panel.tsx
components/pwa/install-app-dialog.tsx
components/pwa/install-app-banner.tsx
components/pwa/install-preview-toolbar.tsx
```

Wire the provider in the **root** `app/layout.tsx`. Add headers in `next.config`.
Exclude `sw.js` and `manifest.webmanifest` from auth middleware.

---

## 4. Assets

### Home Screen icons (PNG, required)

Chrome will not install with WebP-only icons. Generate from the square app mark:

| File | Size | Purpose |
|---|---|---|
| `icon-192.png` | 192×192 | `purpose: any` |
| `icon-512.png` | 512×512 | `purpose: any` |
| `icon-512-maskable.png` | 512×512 | `purpose: maskable` — keep the mark in the **center 80%**, padded so Android crop does not clip it |
| `apple-touch-icon.png` | 180×180 | iOS Home Screen; also list in root metadata `icons.apple` |

Use Sharp or any raster tool. Commit the PNGs. Do not rely on a remote CMS URL
for the manifest icons (installability breaks if that URL 404s).

### Install-page logo

A wide wordmark / group logo is fine on `/install` (SS Ops uses a WebP
wordmark ~260px wide). That is **not** the Home Screen icon.

### QR code

Generate a static SVG (or PNG) that encodes **exactly** `YOUR_INSTALL_URL`.
SS Ops used a 256×256 crisp-edges SVG, light grey `#E5E5E5` background, dark
modules `#0A0A0A`. Cache-bust with `?v=2` in the `src` constant when you
regenerate.

```bash
# example — any QR CLI is fine
npx --yes qrcode --type svg --width 256 --output public/icons/install-qr.svg "YOUR_INSTALL_URL"
```

---

## 5. Constants — `lib/pwa/constants.ts`

Single source of truth. No magic strings in components.

```ts
export const PWA_APP_NAME = "YOUR_APP_NAME";
export const PWA_START_PATH = "/m";           // no trailing slash — used as “open app” href
export const PWA_START_URL = "/m/";           // WITH slash — manifest start_url
export const PWA_SCOPE = "/m/";
export const PWA_INSTALL_PATH = "/install";
export const PWA_INSTALL_URL = "YOUR_INSTALL_URL";
export const PWA_THEME_COLOR = "#818a40";
export const PWA_BACKGROUND_COLOR = "#E9E3D6";
export const PWA_SW_PATH = "/sw.js";
export const PWA_MANIFEST_PATH = "/manifest.webmanifest";
export const PWA_ICON_192 = "/icons/icon-192.png";
export const PWA_ICON_512 = "/icons/icon-512.png";
export const PWA_ICON_MASKABLE = "/icons/icon-512-maskable.png";
export const PWA_APPLE_TOUCH_ICON = "/apple-touch-icon.png";
export const PWA_INSTALL_QR_SRC = "/icons/install-qr.svg?v=2";
export const PWA_BANNER_DISMISS_KEY = "YOUR_BANNER_KEY";
export const PWA_RETURN_PATH_KEY = "YOUR_RETURN_KEY";
export const PWA_BANNER_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
```

If the app already has a CMS/settings app name, resolve it on the **server**
(install page + `manifest.ts`) and fall back to `PWA_APP_NAME`. Keep the
manifest icons on static `/icons/*` paths.

---

## 6. Manifest — `app/manifest.ts`

Next.js App Router file convention. Served at `/manifest.webmanifest`.

```ts
import type { MetadataRoute } from "next";
import {
  PWA_APP_NAME,
  PWA_BACKGROUND_COLOR,
  PWA_ICON_192,
  PWA_ICON_512,
  PWA_ICON_MASKABLE,
  PWA_INSTALL_URL,
  PWA_MANIFEST_PATH,
  PWA_SCOPE,
  PWA_START_URL,
  PWA_THEME_COLOR,
} from "@/lib/pwa/constants";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = PWA_APP_NAME; // or fetch settings name
  return {
    id: PWA_START_URL,
    name,
    short_name: name,
    description: `Install ${name} for Home Screen access.`,
    start_url: PWA_START_URL,
    scope: PWA_SCOPE,
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    related_applications: [
      {
        platform: "webapp",
        url: `${new URL(PWA_MANIFEST_PATH, PWA_INSTALL_URL).origin}${PWA_MANIFEST_PATH}`,
      },
    ],
    icons: [
      { src: PWA_ICON_192, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: PWA_ICON_512, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: PWA_ICON_MASKABLE, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

`related_applications` + `getInstalledRelatedApps()` lets Chromium report
“already installed” even after a refresh.

---

## 7. Service worker — `public/sw.js`

Conservative. **Purpose: installability + static icons.** Do **not** cache HTML
documents, auth responses, or API data.

```js
const CACHE_NAME = "YOUR_SW_CACHE";
const PRECACHE = [
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-512-maskable.png",
  "/icons/install-qr.svg",
  "/apple-touch-icon.png",
  // add your install-page logo / brand files that must survive offline
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isDevHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local") ||
    /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)
  );
}

function shouldCacheRequest(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;
  if (request.mode === "navigate") return false;
  if (request.destination === "document") return false;
  const path = url.pathname;
  if (path.startsWith("/api/") || path.startsWith("/auth/")) return false;
  if (path.startsWith("/icons/") || path === "/apple-touch-icon.png") return true;
  if (path.startsWith("/brand/")) return true;
  if (path.startsWith("/_next/static/") && !isDevHost(url.hostname)) return true;
  if (/\.(?:woff2?|ttf|otf)$/i.test(path)) return true;
  return false;
}

self.addEventListener("fetch", (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return;
  }
  if (!shouldCacheRequest(event.request, url)) return;
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    }),
  );
});
```

Register from the provider (root layout), **not** from `/install` only:

```ts
await navigator.serviceWorker.register("/sw.js", {
  scope: "/",
  updateViaCache: "none",
});
```

Scope `/` is required so `/install` (outside `/m/`) is still controlled.
The **manifest** scope stays `/m/` so the installed app opens into the mobile
shell, not the desktop webapp.

---

## 8. Next.js headers — `next.config.ts`

```ts
async headers() {
  return [
    {
      source: "/sw.js",
      headers: [
        { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ],
    },
    {
      source: "/manifest.webmanifest",
      headers: [
        { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
        { key: "Cache-Control", value: "no-cache" },
      ],
    },
  ];
}
```

`Service-Worker-Allowed: /` is mandatory because `sw.js` lives at `/sw.js` and
registers with `scope: "/"`.

Middleware matcher must **skip** `sw.js` and `manifest.webmanifest` (and static
image extensions). Add `YOUR_INSTALL_PATH` to the public-route allowlist so
unauthenticated phones can open it. Do **not** venue-prefix `/install`.

---

## 9. Device + standalone helpers

### `lib/pwa/device.ts`

Detect from `userAgent` + `platform` + `maxTouchPoints`:

- iOS: `/iPad|iPhone|iPod/i` **or** Macintosh / `MacIntel` with `maxTouchPoints > 1` (iPadOS 13+).
- Android: `/Android/i` and not iOS.
- Desktop: neither.
- iOS Safari: has `Safari`, and is **not** CriOS / FxiOS / EdgiOS / OPiOS /
  DuckDuckGo / YaBrowser / Brave, and **not** in-app
  (`FBAN|FBAV|FBIOS|Instagram|Line/|WhatsApp|Snapchat|Twitter|LinkedInApp|GSA/|musical_ly|BytedanceWebview|Pinterest`).
- `needsSafari`: iOS and (not Safari or in-app).
- `isChromiumInstallable`: Android.

Export `detectPWADevice(input)` (pure, testable) and
`detectPWADeviceFromWindow()`.

### `lib/pwa/standalone.ts`

Standalone if any of:

- `matchMedia("(display-mode: standalone|fullscreen|minimal-ui)")`
- iOS `navigator.standalone === true`

### `lib/pwa/use-standalone-mode.ts`

`useSyncExternalStore` on those media queries. Server snapshot: `false`.

### `lib/pwa/return-path.ts`

`?next=` is stored in `sessionStorage` under `PWA_RETURN_PATH_KEY`.

**Security:** only allow same-origin paths under `YOUR_START_PATH`. Reject
`//`, `://`, `\`, `..` traversal, and `/install` itself. Resolve with
`new URL(trimmed, YOUR_ORIGIN)` and require that origin + prefix. Default
“Open app” href = validated next path or `YOUR_OPEN_PATH`.

### `lib/pwa/install-preview.ts`

Parse `?preview=` only in **development**. Kinds:
`ios | ios-chrome | android | desktop | installed`. Map each to a fake
`PWADeviceState` so the page can be designed on a laptop.

---

## 10. Provider — `components/pwa/pwa-install-provider.tsx`

Client component. Wrap `{children}` in root layout.

On mount:

1. `registerServiceWorker()`.
2. If `navigator.getInstalledRelatedApps` exists, set `relatedInstalled` when
   the array is non-empty.
3. Listen `beforeinstallprompt`: `event.preventDefault()`, store the event.
4. Listen `appinstalled`: set installed, clear deferred prompt.

Expose:

```ts
{
  standalone: boolean;
  installed: boolean;          // standalone || appinstalled || relatedApps
  canPrompt: boolean;          // deferredPrompt && !dismissedThisSession
  dismissedThisSession: boolean;
  device: PWADeviceState | null; // null on server; detect via useSyncExternalStore
  promptInstall(): Promise<"accepted" | "dismissed" | "unavailable">;
}
```

`promptInstall` must call `prompt()` then `userChoice`. After accept, treat as
installed. After dismiss, hide the primary button this session.

`usePWAInstall()` throws if used outside the provider.
`useOptionalPWAInstall()` returns null.

Cache device detection in a module-level variable so `useSyncExternalStore`
is stable (empty subscribe is fine — UA does not change mid-session).

---

## 11. Install page UI

### `app/install/layout.tsx`

Black page. Lock pinch-zoom (native-app feel):

```ts
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};
```

### `app/install/page.tsx` (server)

- `generateMetadata`: title `Install {appName}`, description
  `Add {appName} to your Home Screen for quick and easy access.`,
  `appleWebApp: { capable: true, title, statusBarStyle: "black-translucent" }`,
  `robots: { index: false, follow: false }`.
- Read `searchParams.next` and `searchParams.preview`.
- Pass logo + appName + sanitized next + preview into `<InstallAppPage />`.

### `components/pwa/install-app-page.tsx` (client)

Layout:

```
<main className="flex min-h-dvh flex-col items-center justify-center bg-black px-5 py-12 text-white">
  <div className="w-full max-w-sm text-center">
    {logo}
    {installed ? InstalledBlock : InstallBlock}
  </div>
</main>
```

- Title: `font-serif text-3xl` — `Install {appName}` / `{appName} is installed`
  / `{appName} has been installed.`
- Subtitle: `text-white/70`. On desktop append
  `Scan the QR Code to install {appName} on your phone`.
- Until `device` hydrates, show a `h-12` neutral skeleton — do not flash the
  wrong platform.
- Installed → full-width button `Open {appName}` → `router.push(defaultOpenPath)`.
- Branch: desktop → `DesktopInstallPanel`; iOS + needsSafari → Safari message
  in a `rounded-2xl bg-neutral-900 ring-1 ring-white/15` box; iOS Safari →
  `IOSInstallInstructions`; else → `AndroidInstallButton`.
- Dev only: render `InstallPreviewToolbar`. Ignore `preview` in production
  (`process.env.NODE_ENV === "development"`).

### Android button

- Primary: `Install {appName}`, disabled until `canPrompt`.
- After 2s without a prompt, show fallback:

  1. Tap the menu in Chrome (three dots).
  2. Tap “Install app” or “Add to Home screen”.
  3. Confirm to add {appName}.

- If the user dismissed the native sheet this session, replace the button with
  “You can install {app} later from your browser menu…”.

### iOS steps (4)

1. Tap the Share button — square + up arrow SVG.
2. Tap “Add to Home Screen” — plus-in-rounded-rect SVG. “Scroll the share sheet
   if you don’t see it at first.”
3. Turn on “Open as Web App” if you see it.
4. Tap Add — `{app} will appear on your Home Screen.`

Numbered circles, `rounded-2xl bg-neutral-900`, left-aligned.

### Desktop panel

QR (`size-48`) in `rounded-3xl bg-neutral-800 p-3`. Show the raw URL in
`<code>`. Copy button → `navigator.clipboard.writeText(PWA_INSTALL_URL)` →
label flips to “Copied” for 2s.

### Dialog (sidebar)

Portal overlay `bg-black/40`, card `max-w-sm rounded-3xl bg-black`, Escape
closes, click-outside closes, same logo + title + `DesktopInstallPanel`.
This is the desktop “how do I get this on my phone?” entry.

### Banner (inside start-url app only)

Fixed bottom, brand colors (SS Ops: bar `#3D421F`, CTA `#818a40`).
Copy: `Install {appName} for easier access`.

- If `canPrompt` → button calls `promptInstall()`.
- Else → `Link` to `/install?next={currentPath}`.
- Dismiss writes `Date.now()` to localStorage; hide for 30 days.
- Hide when `standalone`, `installed`, dismissed, or already on `/install`.
- Remember current path in sessionStorage before navigating to `/install`.

---

## 12. Root layout wiring

```ts
// generateMetadata
applicationName: appName,
appleWebApp: { capable: true, title: appName, statusBarStyle: "black-translucent" },
icons: {
  apple: [{ url: PWA_APPLE_TOUCH_ICON, sizes: "180x180", type: "image/png" }],
  icon: [
    { url: PWA_ICON_192, sizes: "192x192", type: "image/png" },
    { url: PWA_ICON_512, sizes: "512x512", type: "image/png" },
  ],
},
other: { "apple-mobile-web-app-capable": "yes" },

// viewport
export const viewport = { themeColor: PWA_THEME_COLOR };

// body
<PWAInstallProvider>{children}</PWAInstallProvider>
```

Install layout overrides `themeColor` to `#000000`.

---

## 13. Tests — `lib/pwa/__tests__/pwa.test.ts`

Cover at least:

- iPhone Safari → `kind: ios`, `isIOSSafari`, not `needsSafari`.
- iPhone Chrome (CriOS) and WhatsApp → `needsSafari`.
- Android Pixel Chrome → `kind: android`, `isChromiumInstallable`.
- Desktop Mac Chrome (`maxTouchPoints: 0`) → `kind: desktop`.
- iPadOS: Macintosh + `MacIntel` + `maxTouchPoints: 5` → iOS.
- Standalone: media query **or** `navigator.standalone`.
- Return path: allow `/m/...`, reject `/dashboard`, `https://evil`, `//evil`,
  `/install`, `/m/../login`.
- Preview parser: known kinds in, unknown / undefined → null.

---

## 14. Do not

- Do not cache HTML or `/api` in the service worker.
- Do not use `<input type="date">` anywhere you touch forms (unrelated, but
  do not regress it).
- Do not store raster uploads as JPEG/PNG if this repo converts to WebP —
  Home Screen **manifest icons** stay PNG; that is the exception.
- Do not put `/install` behind login. Phones must open the QR without an
  existing session.
- Do not register the SW only on `/install`. `beforeinstallprompt` is easy
  to miss.
- Do not use a WebP-only icon set in the manifest.

---

## 15. Verify

Local (Next.js dev on HTTPS or `localhost`):

1. `/install` — black page, logo, title, no login wall.
2. `http://localhost:3000/install?preview=ios` — four Safari steps.
3. `?preview=ios-chrome` — “Open this page in Safari”.
4. `?preview=android` — Install button (disabled until a real prompt).
5. `?preview=desktop` — QR + copy link.
6. `?preview=installed` — Open button.
7. `GET /manifest.webmanifest` — JSON, correct name / start_url / icons 200.
8. `GET /sw.js` — JS, `Service-Worker-Allowed: /`, no-store cache.
9. Application tab → Manifest + SW registered after any page load.
10. Middleware: `/install` does not redirect to login.

Production (required for a real Android install):

1. Open `YOUR_INSTALL_URL` on Android Chrome (or scan the QR from desktop).
2. `beforeinstallprompt` fires → Install button enables → sheet appears.
3. After install, page flips to “installed” and Home Screen icon is the 512 PNG.
4. Launching the icon opens `YOUR_START_URL` in standalone (no browser chrome).
5. iPhone Safari: Share → Add to Home Screen → icon + name match settings.
6. iPhone Chrome: Safari message only.

---

## Done =

`/install` matches the four-state kit above. Manifest + SW make the app
installable. Desktop QR points at the production install URL. iOS has
manual steps. Android uses the native prompt with a menu fallback. Tests pass.

Reference implementation in this monorepo (read these if the target is a
sibling checkout of SS Ops HUB):

- `apps/web/app/install/page.tsx`
- `apps/web/app/install/layout.tsx`
- `apps/web/app/manifest.ts`
- `apps/web/public/sw.js`
- `apps/web/lib/pwa/*`
- `apps/web/components/pwa/*`
- `apps/web/app/layout.tsx` (provider + apple icons + themeColor)
- `apps/web/next.config.ts` (`headers()`)
- `apps/web/lib/constants.ts` (`PUBLIC_ROUTES` includes `/install`)
- `apps/web/lib/venue/scope-routing.ts` (`/install` is unscoped)
- `apps/web/middleware.ts` (matcher skips `sw.js` + manifest)
