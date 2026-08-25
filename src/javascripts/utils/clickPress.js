/* ==========================================================================
 * clickPress.js — общий слой нажатий страницы.
 *
 * Четыре делегированных слушателя на весь документ и один объект состояния:
 * сколько бы ни было .E_Click в разметке, стоимость одинаковая. Реестра
 * элементов нет вообще, поэтому новые .E_Click, дорисованные скриптами,
 * работают сразу — без scan() и MutationObserver.
 *
 * Модуль ничего не знает про конкретные компоненты. Он делает ровно две вещи:
 *   1) держит на элементе атрибут data-click-pressed, пока идёт нажатие;
 *   2) придерживает переход по ссылке, чтобы отскок успел проиграться.
 * Как выглядит сама просадка — решает CSS, см. E_Click.css.
 * ========================================================================== */

const PRESSED = "data-click-pressed";

export function createClickPress(defaults) {
  // Нажатие в процессе: от pointerdown до pointerup.
  let current = null;
  // Последнее отпускание. Событие click приходит уже после pointerup, а ему
  // нужно знать, было ли вообще нажатие указателем и когда закончится отскок.
  let recent = null;
  // Элемент, на котором прямо сейчас висит data-click-pressed, и таймер его
  // снятия. Хранятся отдельно от current: атрибут переживает pointerup —
  // столько, сколько нужно, чтобы добрать минимальную длительность нажатия.
  let pressedEl = null;
  let releaseTimer = 0;

  /* --- Опции ----------------------------------------------------------- */

  function readDelay(el) {
    const parsed = parseFloat(el.dataset.clickDelay);
    return Number.isFinite(parsed) ? parsed : defaults.navDelay;
  }

  /* --- Состояние нажатия ------------------------------------------------ */

  function press(el) {
    // Новое нажатие всегда отменяет предыдущее вместе с его отложенным
    // снятием: иначе быстрый переход с кнопки на кнопку оставил бы первую
    // навсегда вдавленной, а её таймер снял бы атрибут уже со второй.
    release();
    pressedEl = el;
    el.setAttribute(PRESSED, "");
  }

  function release() {
    clearTimeout(releaseTimer);
    releaseTimer = 0;
    if (!pressedEl) return;
    pressedEl.removeAttribute(PRESSED);
    pressedEl = null;
  }

  function releaseAfter(delay) {
    if (delay <= 0) release();
    else releaseTimer = setTimeout(release, delay);
  }

  // Отменяет незавершённое нажатие: увели палец в скролл, пришёл
  // pointercancel, окно потеряло фокус.
  function abort() {
    release();
    current = null;
  }

  /* --- Указатель -------------------------------------------------------- */

  function onPointerDown(event) {
    // Только основная кнопка основного указателя: правый клик открывает меню,
    // второй палец не должен перехватывать нажатие у первого.
    if (!event.isPrimary || event.button !== 0) return;

    const el = event.target.closest?.(defaults.selector);
    if (!el) return;

    current = {
      el,
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
    };
    press(el);
  }

  // Указатель уехал далеко — это скролл или перетаскивание, а не нажатие.
  // На тач-устройствах pointercancel приходит не всегда и не сразу, поэтому
  // порог по расстоянию нужен и здесь.
  function onPointerMove(event) {
    if (!current || event.pointerId !== current.id) return;

    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) > defaults.moveTolerance) abort();
  }

  function onPointerUp(event) {
    if (!current || event.pointerId !== current.id) return;

    const { el } = current;
    const now = performance.now();

    // Пол длительности нажатия. Клик может уложиться в 30 мс — без этой
    // задержки элемент успел бы уйти вниз процента на два и вернуться,
    // то есть эффекта бы просто не было видно.
    const hold = Math.max(0, defaults.minPress - (now - current.at));

    releaseAfter(hold);
    recent = { el, at: now, releaseAt: now + hold };
    current = null;
  }

  /* --- Переход по ссылке ------------------------------------------------ */

  // Задерживать имеет смысл только тот клик, после которого страница реально
  // уходит. Во всех остальных случаях анимации ничто не мешает доиграть,
  // а лишний preventDefault только ломал бы поведение браузера.
  function shouldDelay(el, event) {
    if (event.defaultPrevented) return false;
    // Клик с модификатором — «открыть в новой вкладке/окне»: текущая страница
    // остаётся на месте.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return false;
    }
    if (el.dataset.clickNav === "off") return false;
    if (!(el instanceof HTMLAnchorElement)) return false;
    if (el.hasAttribute("download")) return false;
    if (el.target && el.target !== "_self") return false;

    const href = el.getAttribute("href");
    if (href === null) return false;
    // Якорь никуда не уводит, mailto:/tel: отдают ссылку другому приложению —
    // страница в обоих случаях жива.
    if (href.startsWith("#")) return false;
    if (el.protocol !== "http:" && el.protocol !== "https:") return false;

    return true;
  }

  function onClick(event) {
    const el = event.target.closest?.(defaults.selector);
    const pressed = recent;
    recent = null;

    if (!el) return;

    // Клик с клавиатуры (Enter/Пробел) приходит без pointerdown, то есть без
    // recent. Анимации на нём не было — ждать нечего, да и клавиатурные
    // действия притормаживать нельзя: их повторяют десятки раз подряд.
    // Окно в 400 мс отсекает залежавшийся recent: обычно он живёт единицы
    // миллисекунд, потому что click приходит сразу за pointerup и забирает его.
    const fromPointer =
      pressed && pressed.el === el && performance.now() - pressed.at < 400;

    if (!fromPointer) return;
    if (!shouldDelay(el, event)) return;

    const delay = readDelay(el);
    if (delay <= 0) return;

    event.preventDefault();

    // Отсчитываем от конца удержания, а не от клика: иначе при быстром нажатии
    // страница ушла бы, пока элемент ещё внизу и отскок не начался.
    const wait = Math.max(0, pressed.releaseAt - performance.now()) + delay;
    const { href } = el;

    setTimeout(() => {
      window.location.href = href;
    }, wait);
  }

  /* --- Подписки --------------------------------------------------------- */

  // Все слушатели указателя пассивные — они ничего не отменяют и не должны
  // мешать скроллу. У click опций нет намеренно: пассивному обработчику
  // браузер игнорирует preventDefault, а на нём вся задержка и держится.
  const passive = { passive: true };

  const listeners = [
    [document, "pointerdown", onPointerDown, passive],
    [document, "pointermove", onPointerMove, passive],
    [document, "pointerup", onPointerUp, passive],
    [document, "pointercancel", abort, passive],
    // Долгое нажатие открыло контекстное меню — нажатие считаем прерванным.
    [document, "contextmenu", abort, passive],
    [document, "click", onClick],
    [window, "blur", abort, passive],
  ];

  listeners.forEach(([target, type, handler, options]) => {
    target.addEventListener(type, handler, options);
  });

  return {
    destroy() {
      abort();
      recent = null;
      listeners.forEach(([target, type, handler]) => {
        target.removeEventListener(type, handler);
      });
    },
  };
}
