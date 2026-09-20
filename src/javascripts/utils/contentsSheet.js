/* ==========================================================================
 * contentsSheet.js — оглавление кейса шторкой снизу.
 *
 * Один <dialog> на страницу, собирается здесь же: в шаблонах его нет. Странице
 * достаточно кнопки с атрибутом, см. A_ButtonContents.css:
 *
 *     <button class="A_Button A_ButtonContents only-mobile" data-contents>
 *
 * Как выглядят фон, панель и крест — решает CSS, см. O_ContentsSheet.css.
 *
 * --------------------------------------------------------------------------
 * ПОЧЕМУ МЕНЮ ПЕРЕЕЗЖАЕТ, А НЕ КОПИРУЕТСЯ
 *
 * Список внутри шторки — это то самое <nav class="O_NavMenu">, которое на
 * широком экране стоит на полях: модуль вынимает его из разметки и кладёт в
 * панель, а на выходе возвращает на место по оставленной метке.
 *
 * Копия была бы вторым таким же списком в DOM: те же ссылки, те же якоря,
 * и оба надо держать в согласии с разметкой страницы. Согласовывать при этом
 * нечего — список один и тот же, просто показан он то на полях, то в шторке.
 * Переезд это и говорит: меню одно, у шторки нет своего содержимого, она
 * только место, где оно помещается на узком экране.
 *
 * --------------------------------------------------------------------------
 * КТО ЧТО АНИМИРУЕТ
 *
 * Панель едет в JS: её ведёт то анимация, то палец, и посередине жеста они
 * меняются местами — CSS-переход такое не переживёт. Фон гаснет обычным
 * переходом по атрибуту data-open. Общего у них длительность и кривая
 * (--duration-zoom, --ease-out), поэтому читаются они как одно движение.
 *
 * Тайминги берутся из тех же токенов, что у лайтбокса: это одно и то же
 * действие — что-то раскрылось поверх страницы, — и у сайта не должно
 * завестись двух семей кривых.
 * ========================================================================== */

import { lockScroll, unlockScroll } from "./scrollLock";

const OPEN = "data-open";
const DRAGGING = "data-dragging";
const EXPANDED = "aria-expanded";

// В reduced motion шторка не отключается — без неё оглавление на узком экране
// недоступно вовсе. Уходит ровно то, ради чего режим включают: движение.
// Панель не приезжает снизу, а проявляется на своём месте, за то же время и
// вместе с фоном. Жест остаётся жестом: палец двигает панель в любом режиме,
// это не анимация, а прямое управление.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const CROSS = `
  <svg class="Q_Icon" width="24" height="24" viewBox="0 0 24 24" fill="none"
       xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M18 6L6.00081 17.9992M17.9992 18L6 6.00085"
          stroke="currentColor" stroke-width="1.9"
          stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`;

export function createContentsSheet(defaults) {
  const menu = document.querySelector(defaults.menu);
  const trigger = document.querySelector(defaults.trigger);

  // Без меню или без кнопки показывать нечего и нечем — страница просто
  // остаётся такой, какой была.
  if (!menu || !trigger) return null;

  /* --- Разметка --------------------------------------------------------- */

  const dialog = document.createElement("dialog");
  dialog.className = "O_ContentsSheet";

  const panel = document.createElement("div");
  panel.className = "M_ContentsPanel";

  const head = document.createElement("div");
  head.className = "M_ContentsHead";

  // Заголовок шторки — это подпись кнопки, которая её открыла. Второй строки
  // в словаре не заводим: они обязаны совпадать, а совпадать надёжнее всего
  // то, что взято из одного места.
  const title = document.createElement("h2");
  title.className = "Q_ContentsTitle";
  title.id = defaults.titleId;
  title.textContent = trigger.textContent.trim();

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "A_Button E_Click Q_ContentsClose";
  closeButton.setAttribute("aria-label", defaults.closeLabel);
  closeButton.innerHTML = CROSS;

  dialog.setAttribute("aria-labelledby", title.id);

  head.append(title, closeButton);
  panel.append(head);
  dialog.append(panel);
  document.body.append(dialog);

  // Метка места, откуда взято меню: по ней оно вернётся на поля, когда экран
  // снова станет широким.
  const anchor = document.createComment("O_NavMenu");
  menu.before(anchor);
  panel.append(menu);

  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute(EXPANDED, "false");

  /* --- Состояние -------------------------------------------------------- */

  let opened = false;
  let closing = false;
  // Текущая анимация панели. Всегда ровно одна: у неё fill: both, и две
  // невыключенные означали бы, что панель стоит не там, где её оставили.
  let slide = null;
  // Жест: { id, startY, dy, active }. active — порог уже пройден и панель
  // едет за пальцем; до порога жест ещё может оказаться обычным нажатием.
  let drag = null;
  // Когда закончился последний жест. Браузер после перетаскивания всё равно
  // присылает click, и без этой отметки отпущенная на полпути шторка успевала
  // бы «нажать» ссылку под пальцем.
  let draggedAt = 0;

  /* --- Значения из CSS -------------------------------------------------- */

  function motion() {
    const styles = getComputedStyle(document.documentElement);
    const duration = parseFloat(styles.getPropertyValue("--duration-zoom"));
    const easing = styles.getPropertyValue("--ease-out").trim();

    return {
      duration: Number.isFinite(duration) ? duration : defaults.duration,
      easing: easing || "ease-out",
    };
  }

  // Путь шторки: от нижней кромки экрана до её верха. Меряется каждый раз
  // заново — высота панели зависит от длины оглавления, а у закрытого диалога
  // её нет вовсе, поэтому замер всегда идёт после showModal().
  function distance() {
    return panel.offsetHeight || window.innerHeight;
  }

  /* --- Движение --------------------------------------------------------- */

  // Каждое движение — новая анимация, старая снимается. Разворачивать одну и
  // ту же через reverse() нельзя: у неё остаётся прежний, уже разрешённый
  // promise finished, и закрытие срабатывало бы раньше, чем панель тронется.
  function play(frames, duration) {
    slide?.cancel();

    const { easing } = motion();
    slide = panel.animate(frames, { duration, easing, fill: "both" });

    return slide;
  }

  function travel(fromY, toY) {
    return [{ translate: `0 ${fromY}px` }, { translate: `0 ${toY}px` }];
  }

  function fade(from, to) {
    return [{ opacity: from }, { opacity: to }];
  }

  /* --- Открытие --------------------------------------------------------- */

  function open() {
    if (opened || closing) return;
    opened = true;

    dialog.showModal();
    lockScroll();

    slide?.cancel();
    slide = null;

    // Замер высоты заодно пересчитывает лейаут — и это единственный момент,
    // когда ::backdrop успевает вычислить свою нулевую opacity. Поставь
    // data-open раньше, и фон появился бы мгновенно, без перехода. Тот же
    // порядок в лайтбоксе, см. present() в imageLightbox.js.
    const y = distance();

    dialog.setAttribute(OPEN, "");
    trigger.setAttribute(EXPANDED, "true");

    const { duration } = motion();
    play(reducedMotion.matches ? fade(0, 1) : travel(y, 0), duration);
  }

  /* --- Закрытие --------------------------------------------------------- */

  // fromY — с какой высоты уезжать. Ноль для обычного закрытия, смещение
  // пальца, если шторку дотянули до порога и отпустили.
  function requestClose(fromY = 0) {
    if (!opened || closing) return;
    closing = true;

    dialog.removeAttribute(OPEN);
    trigger.setAttribute(EXPANDED, "false");

    const y = distance();
    const { duration } = motion();

    // Сколько шторке осталось пройти — столько она и едет. Утянутая пальцем
    // почти до низа не должна доезжать оставшиеся пиксели полные 260 мс.
    const left = Math.max(0, y - fromY) / y;
    const away =
      reducedMotion.matches && fromY === 0 ? fade(1, 0) : travel(fromY, y);

    const run = play(away, duration * left);

    // Фон гаснет свои полные 260 мс: его путь от доли не зависит. Диалог
    // закрывается по тому из двух, кто дольше, — иначе шторка, утянутая почти
    // до низа, сносила бы фон рывком.
    Promise.all([
      run.finished,
      new Promise((resolve) => setTimeout(resolve, duration)),
    ]).then(
      () => {
        if (run === slide) finish();
      },
      () => {},
    );
  }

  function finish() {
    // Анимацию надо снять здесь, а не оставить дожидаться следующего
    // открытия: с fill: both она держит на панели смещение, и ближайший же
    // замер вернул бы неправду.
    slide?.cancel();
    slide = null;
    panel.style.translate = "";

    opened = false;
    closing = false;

    dialog.close();
    unlockScroll();

    // Фокус возвращается туда, откуда пришёл. preventScroll обязателен: по
    // клику на пункт оглавления страница в этот момент уже едет к заголовку,
    // и прыжок к кнопке отменил бы весь переход.
    trigger.focus({ preventScroll: true });
  }

  /* --- Жест ------------------------------------------------------------- */

  function snapBack(fromY) {
    const { duration } = motion();
    play(travel(fromY, 0), duration);
  }

  function endDrag(event) {
    dialog.removeAttribute(DRAGGING);
    panel.style.translate = "";
    draggedAt = event.timeStamp;
  }

  function onPointerDown(event) {
    if (!opened || closing || drag) return;
    if (event.button > 0) return;
    if (!panel.contains(event.target)) return;

    // Внутри списка шторка тянется только с самого верха: ниже палец
    // прокручивает список, и перехватывать это движение нельзя.
    if (menu.contains(event.target) && menu.scrollTop > 0) return;

    drag = { id: event.pointerId, startY: event.clientY, dy: 0, active: false };
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;

    const dy = event.clientY - drag.startY;

    if (!drag.active) {
      // До порога не двигаем ничего: дрожание пальца на ссылке не должно
      // читаться как начало перетаскивания.
      if (dy < defaults.slop) return;

      drag.active = true;
      slide?.cancel();
      slide = null;
      dialog.setAttribute(DRAGGING, "");
      panel.setPointerCapture?.(drag.id);
    }

    // Вверх шторка не тянется: выше ей некуда, а резинка добавила бы
    // движение, которого в макете нет.
    drag.dy = Math.max(0, dy);
    panel.style.translate = `0 ${drag.dy}px`;
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;

    const { dy, active } = drag;
    drag = null;
    if (!active) return;

    endDrag(event);

    // Порог в долях высоты, а не в пикселях: у короткого оглавления и путь
    // короче, и треть его — по-прежнему «человек потянул закрывать».
    if (dy >= distance() * defaults.dismiss) requestClose(dy);
    else snapBack(dy);
  }

  // Браузер забрал жест себе — обычно потому, что решил прокрутить список.
  // Панель возвращается на место: никакого решения человек не принял.
  function onPointerCancel(event) {
    if (!drag || event.pointerId !== drag.id) return;

    const { dy, active } = drag;
    drag = null;
    if (!active) return;

    endDrag(event);
    snapBack(dy);
  }

  /* --- События ---------------------------------------------------------- */

  function onTriggerClick() {
    open();
  }

  function onDialogClick(event) {
    // След только что закончившегося жеста. Клик после перетаскивания — не
    // выбор человека, а побочный эффект, и ни закрывать, ни переходить по
    // ссылке он не должен.
    if (event.timeStamp - draggedAt < defaults.clickGuard) return;

    // Диалог занимает весь экран, панель прижата к низу — значит всё, что
    // пришло на сам диалог, это клик мимо шторки. Сюда же попадает клик по
    // ::backdrop: он тоже приходит на элемент диалога.
    if (event.target === dialog) {
      requestClose();
      return;
    }

    if (closeButton.contains(event.target)) {
      requestClose();
      return;
    }

    // Выбрали раздел — шторка уходит: она своё дело сделала, а перелистывать
    // страницу под ней нечем. Переход по якорю при этом не трогаем.
    if (event.target.closest?.('a[href^="#"]')) requestClose();
  }

  // Esc браузер обрабатывает сам и закрывает диалог мгновенно. Отменяем и
  // закрываем своим путём — иначе шторка исчезала бы без движения.
  function onCancel(event) {
    event.preventDefault();
    requestClose();
  }

  // Поворот экрана меняет и высоту панели, и путь до нижней кромки. Открытую
  // шторку это не ломает (она стоит на нуле), а вот недоигранную анимацию —
  // да: в её кадрах пиксели, посчитанные до поворота.
  function onResize() {
    if (!opened || closing) return;
    slide?.finish();
  }

  const listeners = [
    [trigger, "click", onTriggerClick],
    [dialog, "click", onDialogClick],
    [dialog, "cancel", onCancel],
    [dialog, "pointerdown", onPointerDown],
    [dialog, "pointermove", onPointerMove],
    [dialog, "pointerup", onPointerUp],
    [dialog, "pointercancel", onPointerCancel],
    [window, "resize", onResize],
  ];

  listeners.forEach(([target, type, handler]) => {
    target.addEventListener(type, handler);
  });

  return {
    destroy() {
      slide?.cancel();
      slide = null;
      drag = null;

      if (opened) {
        dialog.close();
        unlockScroll();
      }

      opened = false;
      closing = false;

      listeners.forEach(([target, type, handler]) => {
        target.removeEventListener(type, handler);
      });

      trigger.removeAttribute("aria-haspopup");
      trigger.removeAttribute(EXPANDED);

      // Меню возвращается на своё место в разметке: на широком экране оно
      // снова оглавление на полях, а не содержимое шторки.
      panel.style.translate = "";
      anchor.replaceWith(menu);

      dialog.remove();
    },
  };
}
