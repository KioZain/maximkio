/* ==========================================================================
 * magneticField.js — общий «магнитный слой» страницы.
 *
 * Один слушатель pointermove, один rAF-цикл и один реестр на все элементы:
 * пятьдесят магнитных кнопок стоят почти столько же, сколько одна.
 *
 * Модуль ничего не знает про конкретные компоненты. Он считает физику и пишет
 * на элемент три CSS-переменные (--magnetic-x / -y / -progress), а как на них
 * реагировать — решает CSS. Настройки приходят из magnetic.js, точечные
 * переопределения — из data-атрибутов на самом элементе.
 * ========================================================================== */

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// Затухание к краю радиуса: у самой границы элемент почти не шевелится,
// ближе к центру набирает силу быстрее, чем линейно. Именно это ощущается
// как «магнитное поле», а не как жёсткая зона срабатывания.
const easeOutCubic = (t) => 1 - (1 - t) ** 3;

// Ниже этого порога (px и px/кадр) считаем, что элемент успокоился,
// дописываем ему точное целевое значение и усыпляем цикл.
const REST_THRESHOLD = 0.01;

export function createMagneticField(defaults) {
  // el -> состояние. Map, а не WeakMap: нам нужно обходить всех в каждом кадре.
  const items = new Map();
  const pointer = { x: 0, y: 0, known: false };

  let frame = null;
  let needsMeasure = true;

  const viewport =
    "IntersectionObserver" in window
      ? new IntersectionObserver(handleIntersect, { rootMargin: "25%" })
      : null;

  /* --- Опции ----------------------------------------------------------- */

  function readOptions(el) {
    const number = (key, fallback) => {
      const parsed = parseFloat(el.dataset[key]);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    return {
      strength: number("magneticStrength", defaults.strength),
      radius: number("magneticRadius", defaults.radius),
      max: number("magneticMax", defaults.max),
      ease: number("magneticEase", defaults.ease),
      stiffness: number("magneticStiffness", defaults.stiffness),
      damping: number("magneticDamping", defaults.damping),
      mode: el.dataset.magneticMode || defaults.mode,
      axis: el.dataset.magneticAxis || defaults.axis,
    };
  }

  /* --- Реестр ---------------------------------------------------------- */

  function add(el) {
    if (items.has(el)) return;

    items.set(el, {
      el,
      options: readOptions(el),
      centerX: 0,
      centerY: 0,
      reach: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      progress: 0,
      // Без IntersectionObserver считаем все элементы видимыми.
      visible: !viewport,
      written: "",
    });

    if (viewport) viewport.observe(el);
    needsMeasure = true;
    wake();
  }

  function remove(el) {
    const item = items.get(el);
    if (!item) return;

    if (viewport) viewport.unobserve(el);
    item.x = item.y = item.vx = item.vy = item.progress = 0;
    write(item);
    items.delete(el);
  }

  function scan(root = document) {
    root.querySelectorAll(defaults.selector).forEach(add);
  }

  /* --- Измерения ------------------------------------------------------- */

  function measure(item) {
    const rect = item.el.getBoundingClientRect();

    // rect уже включает наше собственное смещение — вычитаем его, иначе центр
    // «убегает» от курсора вместе с элементом и тот начинает дрожать.
    // Компенсация точна, пока в transform только translate; если компонент
    // добавит scale, центр останется верным, а reach чуть «поплывёт».
    item.centerX = rect.left + rect.width / 2 - item.x;
    item.centerY = rect.top + rect.height / 2 - item.y;

    // Радиус считаем от размера элемента, а не в абсолютных px: маленькая
    // ссылка и крупная карточка при одном и том же radius ощущаются одинаково.
    item.reach = (Math.hypot(rect.width, rect.height) / 2) * item.options.radius;
  }

  /* --- Запись ---------------------------------------------------------- */

  function write(item) {
    const x = item.x.toFixed(2);
    const y = item.y.toFixed(2);
    const progress = item.progress.toFixed(3);

    // Не трогаем стили, если с прошлого кадра ничего не изменилось —
    // это экономит пересчёт стилей на элементах в покое.
    const stamp = `${x}|${y}|${progress}`;
    if (stamp === item.written) return;
    item.written = stamp;

    const { style } = item.el;
    style.setProperty("--magnetic-x", `${x}px`);
    style.setProperty("--magnetic-y", `${y}px`);
    style.setProperty("--magnetic-progress", progress);

    if (x === "0.00" && y === "0.00" && progress === "0.000") {
      item.el.removeAttribute("data-magnetic-active");
    } else {
      item.el.setAttribute("data-magnetic-active", "");
    }
  }

  /* --- Цикл ------------------------------------------------------------ */

  function tick() {
    frame = null;
    let awake = false;

    // Сначала все чтения геометрии, потом все записи в стили. Смешивать нельзя:
    // браузер будет пересчитывать layout по кругу внутри одного кадра.
    if (needsMeasure) {
      items.forEach((item) => {
        if (item.visible) measure(item);
      });
      needsMeasure = false;
    }

    items.forEach((item) => {
      const { options } = item;

      let targetX = 0;
      let targetY = 0;
      let progress = 0;

      if (item.visible && pointer.known) {
        const dx = pointer.x - item.centerX;
        const dy = pointer.y - item.centerY;
        const distance = Math.hypot(dx, dy);

        if (distance < item.reach) {
          progress = easeOutCubic(1 - distance / item.reach);
          // max обрезает смещение в px: без него крупный блок с тем же
          // strength улетал бы заметно дальше маленькой кнопки.
          targetX = clamp(dx * options.strength * progress, -options.max, options.max);
          targetY = clamp(dy * options.strength * progress, -options.max, options.max);
        }
      }

      if (options.axis === "x") targetY = 0;
      if (options.axis === "y") targetX = 0;

      item.progress = progress;

      if (options.mode === "spring") {
        // Дискретная пружина: даёт лёгкий перелёт на возврате.
        item.vx = (item.vx + (targetX - item.x) * options.stiffness) * options.damping;
        item.vy = (item.vy + (targetY - item.y) * options.stiffness) * options.damping;
        item.x += item.vx;
        item.y += item.vy;
      } else {
        item.vx = item.vy = 0;
        item.x += (targetX - item.x) * options.ease;
        item.y += (targetY - item.y) * options.ease;
      }

      const settled =
        Math.abs(targetX - item.x) < REST_THRESHOLD &&
        Math.abs(targetY - item.y) < REST_THRESHOLD &&
        Math.abs(item.vx) < REST_THRESHOLD &&
        Math.abs(item.vy) < REST_THRESHOLD;

      if (settled) {
        item.x = targetX;
        item.y = targetY;
        item.vx = item.vy = 0;
      } else {
        awake = true;
      }

      write(item);
    });

    // Цикл живёт, только пока что-то движется. В покое — ноль работы за кадр,
    // следующий pointermove разбудит заново.
    if (awake) frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (frame === null) frame = requestAnimationFrame(tick);
  }

  /* --- События --------------------------------------------------------- */

  function handlePointerMove(event) {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.known = true;
    wake();
  }

  function handlePointerLeave() {
    // Курсор ушёл за пределы окна — отпускаем всех.
    pointer.known = false;
    wake();
  }

  function handleViewportChange() {
    needsMeasure = true;
    wake();
  }

  function handleIntersect(entries) {
    entries.forEach((entry) => {
      const item = items.get(entry.target);
      if (!item) return;
      item.visible = entry.isIntersecting;
      if (item.visible) needsMeasure = true;
    });
    wake();
  }

  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.addEventListener("pointerleave", handlePointerLeave);
  window.addEventListener("resize", handleViewportChange);
  // capture: true — ловим и скролл внутренних контейнеров, он тоже сдвигает rect.
  window.addEventListener("scroll", handleViewportChange, {
    passive: true,
    capture: true,
  });

  /* --- API ------------------------------------------------------------- */

  return {
    add,
    remove,
    scan,

    // Перечитать data-атрибуты и геометрию: после смены разметки или шрифтов.
    refresh() {
      items.forEach((item) => {
        item.options = readOptions(item.el);
      });
      needsMeasure = true;
      wake();
    },

    destroy() {
      window.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, { capture: true });

      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;

      if (viewport) viewport.disconnect();
      Array.from(items.keys()).forEach(remove);
    },
  };
}
