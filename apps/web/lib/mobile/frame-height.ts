/** Standalone iPhone PWAs often report a viewport ~34px short of the screen. */
const STANDALONE_SCREEN_SLACK_PX = 96;

/**
 * CSS-pixel height for the phone app frame. Prefer the layout viewport, then
 * grow to the hardware screen when a standalone PWA sits short of it.
 * Never use visualViewport.height alone — it is often smaller than the
 * painted screen and leaves a dead band above the home indicator.
 *
 * `window.screen.height` and `outerHeight` are only used when they are a
 * small step above the layout viewport (home-indicator slack), not when
 * they look like physical-pixel Android values.
 */
export function mobileAppFrameHeight(input: {
  innerHeight: number;
  clientHeight: number;
  visualViewportHeight?: number;
  visualViewportOffsetTop?: number;
  screenHeight?: number;
  outerHeight?: number;
  standalone?: boolean;
}): number {
  const visual = Math.round(
    (input.visualViewportHeight ?? 0) + (input.visualViewportOffsetTop ?? 0),
  );
  const layout = Math.max(
    Math.round(input.innerHeight) || 0,
    Math.round(input.clientHeight) || 0,
    visual,
  );
  if (!input.standalone) return layout;

  const grown = [input.screenHeight, input.outerHeight]
    .map((value) => Math.round(value ?? 0))
    .filter(
      (value) => value > layout && value - layout <= STANDALONE_SCREEN_SLACK_PX,
    );
  return grown.length > 0 ? Math.max(layout, ...grown) : layout;
}
