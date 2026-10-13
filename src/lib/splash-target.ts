// Where the welcome screen's logo sits in the window. The splash moves its banner there before
// it leaves, so the two look like one logo.
export type Frame = { left: number; top: number; width: number; height: number };

let frame: Frame | null = null;
let listener: ((frame: Frame) => void) | null = null;

export function setSplashTarget(next: Frame) {
  frame = next;
  listener?.(next);
}

/** Calls back with the logo's place now if it is known, and each time it is measured. */
export function watchSplashTarget(onFrame: (frame: Frame) => void) {
  listener = onFrame;
  if (frame) onFrame(frame);
  return () => {
    listener = null;
  };
}
