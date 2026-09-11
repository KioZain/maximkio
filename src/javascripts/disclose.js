/* ==========================================================================
 * disclose — раскрытие панели по клику (аккордеон).
 *
 * Как пользоваться: класс на корне и два data-атрибута внутри, ничего больше.
 *
 *     <div class="O_ListText E_Disclose">
 *       <button data-disclose-head type="button">…</button>
 *       <div data-disclose-panel><div>…</div></div>
 *     </div>
 *
 * Чанк находит все .E_Disclose и по клику переключает на корне атрибут:
 *
 *     data-disclose-open
 *
 * Всё остальное — дело CSS, см. E_Disclose.css. Высоту чанк не считает
 * и вообще про размеры не знает: анимацию везёт grid-template-rows, а высоту
 * на каждом кадре считает браузер. Поэтому панель не ломается ни от смены
 * языка, ни от перетёкшего на другой ширине текста — мерить нечего.
 *
 * Доступность тоже здесь, а не в разметке:
 *
 *     aria-expanded    состояние головы
 *     aria-controls    связь головы с панелью (id панели чанк выдаёт сам,
 *                      если своего нет)
 *
 * Ставится это на инициализации намеренно. Без JS панель открыта, и голова
 * ничего не переключает — атрибут в исходнике врал бы про состояние.
 * ========================================================================== */

/* ==========================================================================
 * TUNABLE PARAMETERS — всё, что имеет смысл крутить, живёт здесь.
 * Длительность и кривая раскрытия сюда не входят: они в CSS,
 * --duration-disclose в vars.css.
 * ========================================================================== */

const SETTINGS = {
  // Какие элементы получают поведение. Класс — единственный вход в эффект.
  selector: ".E_Disclose",

  // Голова и панель внутри корня.
  head: "[data-disclose-head]",
  panel: "[data-disclose-panel]",

  // Флаг на <html>: он включает свёрнутое состояние в CSS. Ставится до того,
  // как панели свернутся, но уже на выполнении скрипта — иначе открытые
  // панели успели бы мелькнуть на первой отрисовке.
  readyAttribute: "data-disclose-ready",

  // Открыт ли пункт. Атрибут на корне, читает CSS.
  openAttribute: "data-disclose-open",

  // Из чего собирается id панели, когда своего у неё нет.
  idPrefix: "disclose-panel-",
};

// Флаг ставится прямо на выполнении скрипта, а не по DOMContentLoaded:
// иначе между первой отрисовкой и готовностью документа открытые панели
// мелькнули бы и только потом свернулись.
document.documentElement.setAttribute(SETTINGS.readyAttribute, "");

let counter = 0;

function setup(root) {
  const head = root.querySelector(SETTINGS.head);
  const panel = root.querySelector(SETTINGS.panel);

  // Половина разметки — не повод валить страницу: пункт просто останется
  // обычной строкой списка.
  if (!head || !panel) return;

  if (!panel.id) {
    counter += 1;
    panel.id = `${SETTINGS.idPrefix}${counter}`;
  }

  head.setAttribute("aria-controls", panel.id);
  head.setAttribute("aria-expanded", root.hasAttribute(SETTINGS.openAttribute) ? "true" : "false");

  head.addEventListener("click", () => {
    const open = root.toggleAttribute(SETTINGS.openAttribute);
    head.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

function start() {
  document.querySelectorAll(SETTINGS.selector).forEach(setup);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
