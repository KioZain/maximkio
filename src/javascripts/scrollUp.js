/* ==========================================================================
 * scrollUp — плавающая кнопка «наверх».
 *
 * Как пользоваться: положить на страницу кнопку с id="up", ничего больше.
 *
 *     <button id="up" class="A_Button E_Click E_Magnetic">Только наверх</button>
 *
 * Дальше чанк сам её находит, следит за прокруткой и, когда человек ушёл
 * ниже порога, ставит на кнопку атрибут:
 *
 *     data-visible
 *
 * JS отвечает только за атрибут и за сам перелёт к началу страницы. Как
 * кнопка появляется — решает CSS, см. A_ButtonUp.css. Кнопка ни к чему не
 * привязана: её можно перенести на любую страницу, лишь бы чанк был в
 * chunks этой страницы (config/i18n/config.js).
 * ========================================================================== */

const SETTINGS = {
  // Кого поднимаем наверх. Один id на страницу — кнопка ровно одна.
  selector: "#up",

  /* --- Пороги (в высотах экрана) ---------------------------------------- */

  // На сколько экранов надо уйти вниз, чтобы кнопка появилась. Полтора —
  // это уже точно осознанный скролл, а не «дёрнул колесо на первом экране»:
  // в первых полутора видимых областях кнопки нет вовсе.
  showAt: 1,

  // Порог обратного хода. Он ниже порога появления намеренно: с одним общим
  // значением кнопка мигала бы туда-сюда, пока человек стоит ровно на нём.
  hideAt: 0.9,
};

/* ==========================================================================
 * DATA-ATTRIBUTES — переопределения на конкретной кнопке:
 *
 *   data-up-show   свой порог появления, в высотах экрана
 *   data-up-hide   свой порог исчезновения, в высотах экрана
 *
 *   <button id="up" data-up-show="2" data-up-hide="1.8">
 * ========================================================================== */

const VISIBLE = "data-visible";

// Скрытое состояние кнопки живёт целиком в CSS и никакого флага готовности от
// нас не ждёт (см. A_ButtonUp.css): любая отметка «скрипт доехал» означала бы,
// что кнопка висит на экране от первой отрисовки до выполнения чанка.

// Человек попросил не двигать интерфейс — перелёт делаем мгновенным. Читаем
// каждый раз заново: настройку меняют на живой странице.
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

function number(el, name, fallback) {
  const value = parseFloat(el.dataset[name]);
  return Number.isFinite(value) ? value : fallback;
}

function start() {
  const button = document.querySelector(SETTINGS.selector);
  if (!button) return;

  const showAt = number(button, "upShow", SETTINGS.showAt);
  const hideAt = number(button, "upHide", SETTINGS.hideAt);

  let visible = false;
  let frame = 0;

  function sync() {
    frame = 0;

    const screens = window.scrollY / window.innerHeight;
    const next = visible ? screens > hideAt : screens > showAt;
    if (next === visible) return;

    visible = next;
    if (visible) button.setAttribute(VISIBLE, "");
    else button.removeAttribute(VISIBLE);
  }

  // Обработчик скролла считает только координату, а решение принимает раз в
  // кадр: на длинной странице событий приходит куда больше, чем отрисовок.
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(sync);
  }

  button.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: reduced.matches ? "auto" : "smooth",
    });
  });

  window.addEventListener("scroll", schedule, { passive: true });
  // Порог считается в высотах экрана, поэтому поворот телефона его меняет.
  window.addEventListener("resize", schedule, { passive: true });

  // Первый расчёт: страницу могли открыть по якорю или вернуться на неё с
  // восстановленной позицией — тогда кнопка нужна сразу, без прокрутки.
  sync();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
