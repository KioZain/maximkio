import gsap from "gsap";
import { horizontalLoop } from "./utils/horizontalLoop";

/* ==========================================================================
 * TUNABLE PARAMETERS — everything you may want to tweak lives here.
 * Per-row overrides are possible through data-attributes in the markup
 * (see the DATA-ATTRIBUTES block below).
 * ========================================================================== */

const SETTINGS = {
  /* --- Autoplay -------------------------------------------------------- */

  // Base speed in pixels per second. 40–80 reads as a calm marquee,
  // 100+ starts to feel nervous. Stays constant no matter how many
  // images the row contains.
  speed: 60,

  // Default travel direction: "left" or "right".
  direction: "left",

  /* --- Filling the row ------------------------------------------------- */

  // How many container widths the strip must cover before the loop starts.
  // 2 is the minimum for a seamless loop; raise it only if you ever see a
  // gap on very wide screens.
  fillRatio: 2,

  // Extra space (px) inserted between the last and the first item when the
  // strip wraps around. Keep it equal to the CSS `gap` of .C_RunningImages
  // — it is read from the CSS automatically, this is only the fallback.
  fallbackGap: 16,

  /* --- Drag ------------------------------------------------------------ */

  // Allow grabbing the row with the mouse / finger.
  draggable: true,

  // true turns the row into a carousel that snaps to the nearest image
  // after a drag. false keeps the free, momentum-based marquee feel.
  snapOnRelease: false,

  // Drag friction: 0 = the strip follows the pointer 1:1, 0.5 = it moves
  // half as far as the pointer.
  dragResistance: 0,

  // How fast the throw after a release decays (px/s²). Higher = the glide
  // dies out sooner. The curve itself is always a power3 ease-out.
  throwResistance: 1600,

  // Hard bounds for the glide (seconds). dragMaxDuration is what you feel as
  // "the strip is still coasting instead of running again" — keep it short.
  dragMaxDuration: 0.9,
  dragMinDuration: 0.1,

  // How long autoplay takes to ramp back up to full speed once the glide has
  // finished (seconds). 0 snaps straight back to the base speed.
  dragResumeRamp: 0.3,

  /* --- Misc ------------------------------------------------------------ */

  // Freeze the row while the pointer hovers over it.
  pauseOnHover: false,
};

/* ==========================================================================
 * DATA-ATTRIBUTES (per row, all optional)
 *
 *   data-marquee                 — marks a row as a marquee (required)
 *   data-marquee-speed="45"      — speed in px/s for this row
 *   data-marquee-direction="right"
 *   data-marquee-drag="false"    — disable dragging for this row
 * ========================================================================== */

const CLONE_ATTR = "data-marquee-clone";

const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
);

/** Resolves once every image inside `root` has its final size. */
function imagesReady(root) {
  const images = Array.from(root.querySelectorAll("img"));
  return Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          }),
    ),
  );
}

function readOption(row, name, fallback) {
  const value = row.dataset[name];
  return value === undefined ? fallback : value;
}

function createMarquee(row) {
  const originals = Array.from(row.children).filter(
    (el) => !el.hasAttribute(CLONE_ATTR),
  );
  if (!originals.length) return null;

  const host = row.parentElement || row;

  const speed = parseFloat(readOption(row, "marqueeSpeed", SETTINGS.speed));
  const direction = readOption(row, "marqueeDirection", SETTINGS.direction);
  const draggable =
    readOption(row, "marqueeDrag", String(SETTINGS.draggable)) !== "false";

  // The helper travels to the left by default, so "right" means reversed.
  const reversed = direction === "right";

  // GSAP keeps an animation's direction in the SIGN of its timeScale, so a
  // reversed row runs at -1. Every speed change has to preserve that sign —
  // writing a plain positive timeScale would silently turn the row around.
  const baseScale = reversed ? -1 : 1;

  let loop = null;
  let cloneCount = 0;

  const gap = () =>
    parseFloat(getComputedStyle(row).columnGap) || SETTINGS.fallbackGap;

  /** How many extra copies of the original set are needed to fill the row. */
  function neededCloneCount() {
    const setWidth =
      originals.reduce((total, el) => total + el.offsetWidth, 0) +
      gap() * originals.length;
    if (!setWidth) return 0;
    const target = host.offsetWidth * SETTINGS.fillRatio;
    return Math.max(0, Math.ceil(target / setWidth) - 1);
  }

  function addClones(count) {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      originals.forEach((el) => {
        const clone = el.cloneNode(true);
        clone.setAttribute(CLONE_ATTR, "");
        // Clones are decorative duplicates: hide them from assistive tech
        // and keep them out of the tab order.
        clone.setAttribute("aria-hidden", "true");
        clone.inert = true;
        fragment.appendChild(clone);
      });
    }
    row.appendChild(fragment);
  }

  function removeClones() {
    row.querySelectorAll(`[${CLONE_ATTR}]`).forEach((el) => el.remove());
  }

  function teardown() {
    if (loop) {
      loop.ctx.revert(); // kills the timeline, Draggable and inline styles
      loop = null;
    }
    removeClones();
  }

  /** Eases autoplay back in after a drag instead of snapping to full speed. */
  function resumeAfterDrag(tl) {
    gsap.killTweensOf(tl);
    tl.timeScale(0);
    tl.resume();
    gsap.to(tl, {
      timeScale: baseScale,
      duration: SETTINGS.dragResumeRamp,
      ease: "power2.out",
      overwrite: true,
    });
  }

  function connectHoverPause() {
    if (!SETTINGS.pauseOnHover) return;
    row.addEventListener("mouseenter", () => loop && loop.pause());
    row.addEventListener("mouseleave", () => loop && loop.resume());
  }

  function build() {
    teardown();
    cloneCount = neededCloneCount();
    addClones(cloneCount);

    loop = horizontalLoop(Array.from(row.children), {
      speed: speed / 100, // the helper expects hundreds of px/s
      repeat: -1,
      reversed,
      draggable,
      snapOnRelease: SETTINGS.snapOnRelease,
      dragResistance: SETTINGS.dragResistance,
      throwResistance: SETTINGS.throwResistance,
      maxDuration: SETTINGS.dragMaxDuration,
      minDuration: SETTINGS.dragMinDuration,
      onResume: SETTINGS.dragResumeRamp ? resumeAfterDrag : null,
      paddingRight: gap(),
      // With reduced motion the row is built but never plays — it can still
      // be dragged by hand.
      paused: prefersReducedMotion.matches,
    });

    // A reversed timeline is started by reverse(), which also un-pauses it —
    // so the reduced-motion pause has to be re-applied afterwards.
    if (prefersReducedMotion.matches) loop.pause();

    // The loop starts on the widths the CSS already guarantees (height +
    // aspect-ratio), so it never waits for the images to download. Once they
    // are in, re-measure in case a real image differs from its CSS ratio —
    // refresh() keeps the current progress, so nothing jumps.
    const current = loop;
    imagesReady(row).then(() => {
      if (loop === current && loop) loop.refresh(true);
    });

    connectHoverPause();
  }

  // Rebuild only when the container got wide enough to need a different
  // number of clones; ordinary resizes are handled inside the loop helper.
  let resizeFrame = null;
  const observer = new ResizeObserver(() => {
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      if (loop && neededCloneCount() > cloneCount) build();
    });
  });

  build();
  observer.observe(host);

  prefersReducedMotion.addEventListener("change", () => build());

  return { row, build, teardown };
}

export function initMarquees(root = document) {
  const rows = Array.from(root.querySelectorAll("[data-marquee]"));
  return rows.map(createMarquee).filter(Boolean);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initMarquees());
} else {
  initMarquees();
}
