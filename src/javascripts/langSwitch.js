/* ==========================================================================
 * langSwitch — поведение выпадашки выбора языка.
 *
 * Разметка держится на <details>/<summary>, поэтому открытие и закрытие
 * работают сами по себе: без JS список всё равно раскрывается кликом
 * и клавиатурой. Скрипт добавляет только то, чего <details> не умеет:
 *
 *   — закрыть, когда кликнули мимо;
 *   — закрыть по Esc и вернуть фокус на кнопку;
 *   — не держать две выпадашки открытыми одновременно.
 *
 * Сам переключатель языка — обычные ссылки на страницу-близнеца, их адреса
 * посчитаны на сборке (см. config/i18n/loader.js). Ничего не хранится
 * и не подменяется в рантайме.
 * ========================================================================== */

const SELECTOR = "[data-lang-switch]";

function openSwitches() {
  return document.querySelectorAll(`${SELECTOR}[open]`);
}

function closeAll(except) {
  openSwitches().forEach((element) => {
    if (element !== except) element.open = false;
  });
}

// Клик по документу: всё, что не внутри текущей выпадашки, её закрывает.
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  closeAll(target ? target.closest(SELECTOR) : null);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  const [opened] = openSwitches();
  if (!opened) return;

  opened.open = false;

  const summary = opened.querySelector("summary");
  if (summary) summary.focus();
});
