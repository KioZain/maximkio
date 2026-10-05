/* ==========================================================================
 * caseCursor.js — плашка вместо курсора над карточками кейсов.
 *
 * Модуль ничего не рисует сам — вид, появление, моргание и встряхивание
 * живут в A_CaseCursor.css. Он делает четыре вещи:
 *   1) возит плашку за курсором и показывает/прячет её (data-visible);
 *   2) по клику просит CSS моргнуть или встряхнуться (data-play);
 *   3) не пускает по ссылке кейс с data-available="false";
 *   4) придерживает переход на доступный кейс, пока глаз не доморгает, —
 *      через data-click-delay, который читает чанк «click».
 * ========================================================================== */

/* ==========================================================================
 * TUNABLE PARAMETERS
 * ========================================================================== */

const SETTINGS = {
  card: ".O_ProjectCard",
  cursor: ".A_CaseCursor",

  // Над чем появляется плашка после тапа или Enter: центр обложки, а не
  // место касания. Палец закрывает точку под собой, а обложка — самое
  // заметное в карточке, взгляд и так на ней.
  anchor: ".Q_ProjectCover",

  // Сколько плашка висит после тапа или Enter по недоступному кейсу (мс).
  // Курсора, за которым она бы ушла, тут нет, поэтому уходит сама — когда
  // встряхивание доиграло и подпись успела прочитаться.
  flashHold: 1200,
};

const PLAY = "data-play";
const VISIBLE = "data-visible";

/* --- Утилиты ------------------------------------------------------------- */

// Длительности живут в vars.css: тут они нужны только чтобы знать, сколько
// ждать, и дублировать числа в JS значило бы разъехаться при первой правке.
function readDuration(name) {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  return raw.endsWith("ms") ? value : value * 1000;
}

// Перезапуск одноразовой анимации: снять атрибут, дать браузеру это
// заметить и поставить снова. Без чтения layout посередине браузер склеит
// оба изменения в одно и анимация не начнётся заново.
function play(cursor, name) {
  cursor.removeAttribute(PLAY);
  void cursor.offsetWidth;
  cursor.setAttribute(PLAY, name);
}

/* --- Карточки ------------------------------------------------------------ */

function init() {
  const cards = Array.from(document.querySelectorAll(SETTINGS.card)).filter(
    (card) => card.querySelector(SETTINGS.cursor),
  );
  if (cards.length === 0) return;

  const blinkDuration = readDuration("--duration-blink");

  // Карточка, над которой сейчас мышь, и последняя позиция указателя.
  // Позиция нужна прокрутке: колесо двигает карточки под неподвижным
  // курсором, а pointermove при этом не приходит.
  let active = null;
  let pointer = null;
  let frame = 0;

  const cursorOf = (card) => card.querySelector(SETTINGS.cursor);
  const isLocked = (card) => card.dataset.available === "false";

  // Координаты внутри карточки. Делим на её текущий масштаб: при нажатии
  // E_Click сжимает карточку, а translate плашки живёт в несжатых пикселях.
  function place(card, clientX, clientY) {
    const rect = card.getBoundingClientRect();
    const ratio = rect.width / card.offsetWidth || 1;
    const x = (clientX - rect.left) / ratio;
    const y = (clientY - rect.top) / ratio;

    cursorOf(card).style.translate = `calc(${x}px - 50%) calc(${y}px - 50%)`;
  }

  function show(card) {
    cursorOf(card).setAttribute(VISIBLE, "");
  }

  function hide(card) {
    cursorOf(card).removeAttribute(VISIBLE);
  }

  function activate(card) {
    if (active === card) return;
    if (active) hide(active);
    active = card;
    if (!card) return;
    place(card, pointer.x, pointer.y);
    show(card);
  }

  /* --- Мышь -------------------------------------------------------------- */

  // На таче курсора нет, а pointerenter прилетает на каждый тап — плашка
  // оставалась бы висеть на месте пальца. Поэтому следим только за мышью.
  const isMouse = (event) => event.pointerType === "mouse";

  function onPointerMove(event) {
    if (!isMouse(event)) return;
    pointer = { x: event.clientX, y: event.clientY };

    if (!active || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (active) place(active, pointer.x, pointer.y);
    });
  }

  function onPointerEnter(event) {
    if (!isMouse(event)) return;
    pointer = { x: event.clientX, y: event.clientY };
    activate(event.currentTarget);
  }

  function onPointerLeave(event) {
    if (!isMouse(event)) return;
    if (active === event.currentTarget) activate(null);
  }

  // Под неподвижным курсором проехала карточка — или курсор с неё съехал.
  function onScroll() {
    if (!pointer) return;
    const under = document
      .elementFromPoint(pointer.x, pointer.y)
      ?.closest(SETTINGS.card);
    activate(cards.includes(under) ? under : null);
    if (active) place(active, pointer.x, pointer.y);
  }

  /* --- Клик -------------------------------------------------------------- */

  // Тап или Enter по недоступному кейсу: курсора нет, поэтому плашка
  // появляется сама — в центре обложки, — встряхивается и уходит.
  const flashTimers = new WeakMap();

  function flash(card) {
    const anchor = card.querySelector(SETTINGS.anchor) || card;
    const rect = anchor.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    clearTimeout(flashTimers.get(card));
    place(card, x, y);
    show(card);
    play(cursorOf(card), "shake");

    flashTimers.set(
      card,
      setTimeout(() => {
        if (active !== card) hide(card);
      }, SETTINGS.flashHold),
    );
  }

  // Переход держит чанк «click». Мышиному клику даём паузу ровно на
  // моргание; тапу — его обычную, моргать там некому.
  function onPointerDown(event) {
    const card = event.currentTarget;

    if (!isMouse(event)) {
      delete card.dataset.clickDelay;
      return;
    }

    card.dataset.clickDelay = String(blinkDuration);

    // Курсор стоял над карточкой с самой загрузки и ни разу не двигался —
    // pointerenter не приходил. Плашка нужна хотя бы к клику.
    pointer = { x: event.clientX, y: event.clientY };
    activate(card);
  }

  function onClick(event) {
    const card = event.currentTarget;

    if (isLocked(card)) {
      // Свой слушатель на карточке срабатывает раньше документного у чанка
      // «click», и тот, увидев defaultPrevented, переход уже не тронет.
      event.preventDefault();
      if (active === card) play(cursorOf(card), "shake");
      else flash(card);
      return;
    }

    if (active === card) play(cursorOf(card), "blink");
  }

  // Средняя кнопка открывает ссылку в новой вкладке мимо click.
  function onAuxClick(event) {
    if (isLocked(event.currentTarget)) event.preventDefault();
  }

  function onAnimationEnd(event) {
    event.currentTarget.removeAttribute(PLAY);
  }

  /* --- Подписки ---------------------------------------------------------- */

  cards.forEach((card) => {
    if (isLocked(card)) card.setAttribute("aria-disabled", "true");
    card.setAttribute("data-cursor-ready", "");

    card.addEventListener("pointerenter", onPointerEnter);
    card.addEventListener("pointerleave", onPointerLeave);
    card.addEventListener("pointerdown", onPointerDown, { passive: true });
    card.addEventListener("click", onClick);
    card.addEventListener("auxclick", onAuxClick);
    cursorOf(card).addEventListener("animationend", onAnimationEnd);
  });

  document.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });

  // Возврат кнопкой «назад» достаёт страницу из bfcache ровно такой, какой
  // её оставили: с плашкой посреди моргания над карточкой, с которой давно
  // ушли. Сбрасываем до чистого состояния.
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    active = null;
    cards.forEach((card) => {
      const cursor = cursorOf(card);
      cursor.removeAttribute(VISIBLE);
      cursor.removeAttribute(PLAY);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
