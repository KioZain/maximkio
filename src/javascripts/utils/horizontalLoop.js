import gsap from "gsap";
import { Draggable } from "gsap/Draggable";
import { InertiaPlugin } from "gsap/InertiaPlugin";

gsap.registerPlugin(Draggable, InertiaPlugin);

/**
 * Seamless horizontal loop.
 *
 * Adapted from the official GSAP helper function:
 * https://gsap.com/docs/v3/HelperFunctions/#loop
 *
 * Every item is animated individually along the x-axis; as soon as an item
 * leaves the left edge of the container it is instantly placed after the last
 * one, so the loop never has a visible seam regardless of how many items there
 * are or how wide the container is.
 *
 * Config options used by this project:
 *   speed         — pixels per second / 100 (0.6 === 60px/s)
 *   reversed      — true makes the row travel to the right
 *   paused        — start without autoplay
 *   draggable     — enable drag + inertia (needs Draggable + InertiaPlugin)
 *   snapOnRelease — false (default) keeps the free "marquee" feel after a drag,
 *                   true snaps to the nearest item like a carousel
 *   paddingRight  — extra gap between the last and the first item (px)
 *
 * Returns the timeline. `timeline.ctx.revert()` fully tears everything down
 * (timeline, Draggable instance, inline styles and the resize listener).
 */
export function horizontalLoop(items, config) {
  let timeline;
  items = gsap.utils.toArray(items);
  config = config || {};

  const ctx = gsap.context(() => {
    let onChange = config.onChange,
      lastIndex = 0,
      tl = gsap.timeline({
        repeat: config.repeat,
        onUpdate:
          onChange &&
          function () {
            let i = tl.closestIndex();
            if (lastIndex !== i) {
              lastIndex = i;
              onChange(items[i], i);
            }
          },
        paused: config.paused,
        defaults: { ease: "none" },
        onReverseComplete: () =>
          tl.totalTime(tl.rawTime() + tl.duration() * 100),
      }),
      length = items.length,
      startX = items[0].offsetLeft,
      times = [],
      widths = [],
      spaceBefore = [],
      xPercents = [],
      curIndex = 0,
      indexIsDirty = false,
      center = config.center,
      pixelsPerSecond = (config.speed || 1) * 100,
      // Browsers can shift sub-pixel widths back and forth in flex layouts,
      // so snap to whole pixels to keep the spacing visually stable.
      snap =
        config.snap === false ? (v) => v : gsap.utils.snap(config.snap || 1),
      timeOffset = 0,
      container =
        center === true
          ? items[0].parentNode
          : gsap.utils.toArray(center)[0] || items[0].parentNode,
      totalWidth,
      getTotalWidth = () =>
        items[length - 1].offsetLeft +
        (xPercents[length - 1] / 100) * widths[length - 1] -
        startX +
        spaceBefore[0] +
        items[length - 1].offsetWidth *
          gsap.getProperty(items[length - 1], "scaleX") +
        (parseFloat(config.paddingRight) || 0),
      populateWidths = () => {
        let b1 = container.getBoundingClientRect(),
          b2;
        items.forEach((el, i) => {
          widths[i] = parseFloat(gsap.getProperty(el, "width", "px"));
          xPercents[i] = snap(
            (parseFloat(gsap.getProperty(el, "x", "px")) / widths[i]) * 100 +
              gsap.getProperty(el, "xPercent"),
          );
          b2 = el.getBoundingClientRect();
          spaceBefore[i] = b2.left - (i ? b1.right : b1.left);
          b1 = b2;
        });
        // Convert "x" to "xPercent" so the loop stays responsive.
        gsap.set(items, { xPercent: (i) => xPercents[i] });
        totalWidth = getTotalWidth();
      },
      timeWrap,
      populateOffsets = () => {
        timeOffset = center
          ? (tl.duration() * (container.offsetWidth / 2)) / totalWidth
          : 0;
        center &&
          times.forEach((t, i) => {
            times[i] = timeWrap(
              tl.labels["label" + i] +
                (tl.duration() * widths[i]) / 2 / totalWidth -
                timeOffset,
            );
          });
      },
      getClosest = (values, value, wrap) => {
        let i = values.length,
          closest = 1e10,
          index = 0,
          d;
        while (i--) {
          d = Math.abs(values[i] - value);
          if (d > wrap / 2) {
            d = wrap - d;
          }
          if (d < closest) {
            closest = d;
            index = i;
          }
        }
        return index;
      },
      populateTimeline = () => {
        let i, item, curX, distanceToStart, distanceToLoop;
        tl.clear();
        for (i = 0; i < length; i++) {
          item = items[i];
          curX = (xPercents[i] / 100) * widths[i];
          distanceToStart = item.offsetLeft + curX - startX + spaceBefore[0];
          distanceToLoop =
            distanceToStart + widths[i] * gsap.getProperty(item, "scaleX");
          tl.to(
            item,
            {
              xPercent: snap(((curX - distanceToLoop) / widths[i]) * 100),
              duration: distanceToLoop / pixelsPerSecond,
            },
            0,
          )
            .fromTo(
              item,
              {
                xPercent: snap(
                  ((curX - distanceToLoop + totalWidth) / widths[i]) * 100,
                ),
              },
              {
                xPercent: xPercents[i],
                duration:
                  (curX - distanceToLoop + totalWidth - curX) / pixelsPerSecond,
                immediateRender: false,
              },
              distanceToLoop / pixelsPerSecond,
            )
            .add("label" + i, distanceToStart / pixelsPerSecond);
          times[i] = distanceToStart / pixelsPerSecond;
        }
        timeWrap = gsap.utils.wrap(0, tl.duration());
      },
      refresh = (deep) => {
        let progress = tl.progress();
        tl.progress(0, true);
        populateWidths();
        deep && populateTimeline();
        populateOffsets();
        deep && tl.draggable && tl.paused()
          ? tl.time(times[curIndex], true)
          : tl.progress(progress, true);
      },
      onResize = () => refresh(true),
      proxy;

    gsap.set(items, { x: 0 });
    populateWidths();
    populateTimeline();
    populateOffsets();
    window.addEventListener("resize", onResize);

    function toIndex(index, vars) {
      vars = vars || {};
      // Always travel in the shortest direction.
      Math.abs(index - curIndex) > length / 2 &&
        (index += index > curIndex ? -length : length);
      let newIndex = gsap.utils.wrap(0, length, index),
        time = times[newIndex];
      if (time > tl.time() !== index > curIndex && index !== curIndex) {
        time += tl.duration() * (index > curIndex ? 1 : -1);
      }
      if (time < 0 || time > tl.duration()) {
        vars.modifiers = { time: timeWrap };
      }
      curIndex = newIndex;
      vars.overwrite = true;
      gsap.killTweensOf(proxy);
      return vars.duration === 0
        ? tl.time(timeWrap(time))
        : tl.tweenTo(time, vars);
    }

    tl.toIndex = (index, vars) => toIndex(index, vars);
    tl.closestIndex = (setCurrent) => {
      let index = getClosest(times, tl.time(), tl.duration());
      if (setCurrent) {
        curIndex = index;
        indexIsDirty = false;
      }
      return index;
    };
    tl.current = () => (indexIsDirty ? tl.closestIndex(true) : curIndex);
    tl.next = (vars) => toIndex(tl.current() + 1, vars);
    tl.previous = (vars) => toIndex(tl.current() - 1, vars);
    tl.times = times;
    tl.refresh = refresh; // re-measure without losing the current progress
    tl.progress(1, true).progress(0, true); // pre-render for performance

    if (config.reversed) {
      tl.vars.onReverseComplete();
      tl.reverse();
    }

    if (config.draggable) {
      proxy = document.createElement("div");
      let wrap = gsap.utils.wrap(0, 1),
        ratio,
        startProgress,
        draggable,
        lastSnap,
        initChangeX,
        wasPlaying,
        resumeAutoplay = () => {
          // resume() (not play()) is required so a reversed row keeps
          // travelling in its original direction. `onResume` lets the caller
          // ease the speed back in instead of snapping to it.
          if (!wasPlaying) return;
          config.onResume ? config.onResume(tl) : tl.resume();
        },
        align = () =>
          tl.progress(
            wrap(startProgress + (draggable.startX - draggable.x) * ratio),
          ),
        syncIndex = () => tl.closestIndex(true);

      draggable = Draggable.create(proxy, {
        trigger: items[0].parentNode,
        type: "x",
        onPressInit() {
          let x = this.x;
          gsap.killTweensOf(tl);
          // Grabbing the strip again mid-throw must not overwrite the pre-drag
          // state, otherwise autoplay would never come back.
          this.isThrowing || (wasPlaying = !tl.paused());
          tl.pause();
          startProgress = tl.progress();
          refresh();
          ratio = 1 / totalWidth;
          initChangeX = startProgress / -ratio - x;
          gsap.set(proxy, { x: startProgress / -ratio });
        },
        onDrag: align,
        onThrowUpdate: align,
        overshootTolerance: 0,
        inertia: true,
        // Momentum after release. InertiaPlugin always decays on a power3
        // curve; these control how far and how long the glide runs.
        dragResistance: config.dragResistance || 0,
        throwResistance: config.throwResistance || 1000,
        maxDuration: config.maxDuration == null ? 2 : config.maxDuration,
        minDuration: config.minDuration == null ? 0 : config.minDuration,
        // Snapping to item boundaries turns the marquee into a carousel —
        // off by default, opt in with `snapOnRelease: true`.
        snap: config.snapOnRelease
          ? function (value) {
              // If the user presses and releases mid-throw, the corrected
              // proxy.x in onPressInit() can produce a huge velocity — detect
              // that and compensate.
              if (Math.abs(startProgress / -ratio - this.x) < 10) {
                return lastSnap + initChangeX;
              }
              let time = -(value * ratio) * tl.duration(),
                wrappedTime = timeWrap(time),
                snapTime = times[getClosest(times, wrappedTime, tl.duration())],
                dif = snapTime - wrappedTime;
              Math.abs(dif) > tl.duration() / 2 &&
                (dif += dif < 0 ? tl.duration() : -tl.duration());
              lastSnap = (time + dif) / tl.duration() / -ratio;
              return lastSnap;
            }
          : undefined,
        onRelease() {
          syncIndex();
          this.isThrowing ? (indexIsDirty = true) : resumeAutoplay();
        },
        onThrowComplete: () => {
          syncIndex();
          resumeAutoplay();
        },
      })[0];
      tl.draggable = draggable;
    }

    tl.closestIndex(true);
    lastIndex = curIndex;
    onChange && onChange(items[curIndex], curIndex);
    timeline = tl;

    return () => window.removeEventListener("resize", onResize); // cleanup
  });

  timeline.ctx = ctx;
  return timeline;
}
