type StandaloneNavigator = Navigator & { standalone?: boolean };

export function isStandaloneDisplayMode(
  matchMedia: ((query: string) => { matches: boolean }) | null | undefined,
  navigatorLike: { standalone?: boolean } | null | undefined,
): boolean {
  if (matchMedia?.("(display-mode: standalone)").matches) return true;
  if (matchMedia?.("(display-mode: fullscreen)").matches) return true;
  if (matchMedia?.("(display-mode: minimal-ui)").matches) return true;
  if (navigatorLike?.standalone === true) return true;
  return false;
}

export function readStandaloneFromWindow(
  target: Window & { navigator: Navigator } = window,
): boolean {
  return isStandaloneDisplayMode(
    target.matchMedia.bind(target),
    target.navigator as StandaloneNavigator,
  );
}
