/* ==========================================================================
 * reveal — одноразовая отметка «блок доехал до экрана».
 *
 * Как пользоваться: добавить класс к любому элементу, ничего больше.
 *
 *     <div class="C_ImagesAbout E_Reveal">…</div>
 *
 * Дальше чанк сам находит все .E_Reveal и, когда элемент впервые появляется
 * в зоне видимости, ставит на него атрибут:
 *
 *     data-in-view
 *
 * И сразу перестаёт за ним следить. Отметка одноразовая намеренно: контент,
 * который человек уже прочитал, не должен заново уезжать и приезжать при
 * скролле вверх — это единственная по-настоящему раздражающая ошибка
 * анимаций появления.
 *
 * JS отвечает только за атрибут. Как выглядит появление — решает CSS в файле
 * самого компонента, см. E_Reveal.css и C_ImagesAbout.css.
 * ========================================================================== */

const SETTINGS = {
  // Какие элементы получают отметку. Класс — единственный вход в эффект.
  selector: ".E_Reveal",

  // Какая доля элемента должна войти в экран, чтобы он считался появившимся.
  // 0.2 — блок уже виден, но ещё не прочитан: анимация успевает доиграть
  // до того, как на неё посмотрят в упор.
  threshold: 0.2,

  // Отступ от краёв экрана (синтаксис CSS-margin). Отрицательный снизу —
  // не считать появившимся то, что едва выглянуло из-за нижней кромки.
  rootMargin: "0px 0px -10% 0px",

  // Флаг на <html>: он включает начальное скрытое состояние в CSS. Ставится
  // до наблюдения, поэтому без JS (или пока он не загрузился) блоки просто
  // стоят в своём конечном виде и ничего не пропадает.
  readyAttribute: "data-reveal-ready",
};

const IN_VIEW = "data-in-view";

function markAll() {
  document
    .querySelectorAll(SETTINGS.selector)
    .forEach((el) => el.setAttribute(IN_VIEW, ""));
}

// Нет IntersectionObserver — момент появления определять нечем, а скрытым
// контент оставлять нельзя. Флаг не ставим вовсе: начальное состояние в CSS
// не включится, блоки останутся в конечном виде.
const supported = "IntersectionObserver" in window;

// Флаг ставится прямо здесь, на выполнении скрипта, а не по DOMContentLoaded:
// иначе между первой отрисовкой и готовностью документа блок успел бы
// мелькнуть в конечном виде и только потом спрятаться.
if (supported) {
  document.documentElement.setAttribute(SETTINGS.readyAttribute, "");
}

function start() {
  if (!supported) {
    markAll();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.setAttribute(IN_VIEW, "");
        // Отписываемся сразу: элемент своё отыграл, дальше он просто контент.
        observer.unobserve(entry.target);
      });
    },
    { threshold: SETTINGS.threshold, rootMargin: SETTINGS.rootMargin },
  );

  document.querySelectorAll(SETTINGS.selector).forEach((el) => {
    observer.observe(el);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
