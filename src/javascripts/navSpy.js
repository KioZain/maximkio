/* ==========================================================================
 * navSpy — отметка «вы читаете этот раздел» в оглавлении кейса.
 *
 * Как пользоваться: ничего. Меню собирает сборка, чанк сам находит его на
 * странице и по ходу прокрутки переставляет класс на текущем пункте:
 *
 *     class="active"  и  aria-current="true"
 *
 * JS отвечает только за то, какой пункт текущий. Как выглядит отметка и как
 * она переезжает — решает CSS, см. O_NavMenu.css.
 *
 * --------------------------------------------------------------------------
 * ПОЧЕМУ НЕ IntersectionObserver
 *
 * Наблюдатель отвечает на вопрос «этот заголовок виден?», а нужен ответ на
 * «какой раздел человек сейчас читает». Это разные вопросы: на экран разом
 * попадают два-три заголовка, а короткий раздел не попадает вовсе. Поэтому
 * здесь обычное правило — текущий тот, чей заголовок последним прошёл линию
 * чтения, — и оно всегда даёт ровно один ответ.
 *
 * Координаты заголовков считаются заранее и пересчитываются, только когда
 * страница меняет высоту. На самой прокрутке не читается ни один размер:
 * иначе каждое событие заставляло бы браузер пересчитывать макет.
 * ========================================================================== */

const SETTINGS = {
  // Меню и пункты в нём. Пункт ведёт на заголовок якорем — из href и берётся,
  // за чем следить, так что второго списка id заводить не нужно.
  menu: ".O_NavMenu",
  link: 'a[href^="#"]',

  /* --- Линия чтения ------------------------------------------------------ */

  // На какой высоте экрана проходит линия, по которой выбирается текущий
  // раздел, в долях высоты экрана. Треть сверху, а не самая кромка: раздел
  // становится текущим, когда его заголовок доехал до зоны чтения, а не в
  // тот момент, когда он едва выглянул снизу.
  line: 0.3,
};

const ACTIVE = "active";
const CURRENT = "aria-current";

function start() {
  const menu = document.querySelector(SETTINGS.menu);
  if (!menu) return;

  const links = Array.from(menu.querySelectorAll(SETTINGS.link));
  if (links.length === 0) return;

  // Пункт без заголовка на странице молча выбрасывается: меню собирает
  // сборка, но переживать разъезд оно должно без единой ошибки в консоли.
  const items = links
    .map((link) => ({
      link,
      target: document.getElementById(decodeURIComponent(link.hash.slice(1))),
      top: 0,
    }))
    .filter((item) => item.target);

  if (items.length === 0) return;

  let active = null;
  let frame = 0;

  function measure() {
    const scrolled = window.scrollY;
    for (const item of items) {
      item.top = item.target.getBoundingClientRect().top + scrolled;
    }
  }

  function pick() {
    // Внизу страницы последний раздел текущий по определению: если он короче
    // экрана, его заголовок линию чтения так и не пересечёт.
    const bottom =
      window.scrollY + window.innerHeight >=
      document.documentElement.scrollHeight - 2;

    if (bottom) return items[items.length - 1];

    const line = window.scrollY + window.innerHeight * SETTINGS.line;

    // Последний заголовок, который линию уже прошёл. Не прошёл ни один —
    // человек ещё в самом начале, текущий первый.
    let found = items[0];
    for (const item of items) {
      if (item.top <= line) found = item;
    }

    return found;
  }

  function sync() {
    frame = 0;

    const next = pick();
    if (next === active) return;

    if (active) {
      active.link.classList.remove(ACTIVE);
      active.link.setAttribute(CURRENT, "false");
    }

    next.link.classList.add(ACTIVE);
    next.link.setAttribute(CURRENT, "true");
    active = next;
  }

  // Событий прокрутки приходит куда больше, чем отрисовок, поэтому решение
  // принимается раз в кадр — как в scrollUp.
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(sync);
  }

  function remeasure() {
    measure();
    schedule();
  }

  measure();
  sync();

  window.addEventListener("scroll", schedule, { passive: true });

  // Высота страницы меняется не только от поворота экрана: доезжают шрифты,
  // догружаются картинки. Наблюдатель ловит всё это разом, поэтому отдельных
  // подписок на load и fonts.ready не нужно.
  if ("ResizeObserver" in window) {
    new ResizeObserver(remeasure).observe(document.body);
  } else {
    window.addEventListener("resize", remeasure, { passive: true });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
