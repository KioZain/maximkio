/* ==========================================================================
 * caseVideo — ролик кейса загружается, только когда до него доскроллили.
 *
 * Как пользоваться: атрибут на <video>, адреса — обычными <source>.
 *
 *     <video class="A_CaseVideo" data-case-video preload="none"
 *            poster="…/drag-poster.webp" muted loop playsinline>
 *       <source src="…/drag.webm" type="video/webm" />
 *     </video>
 *
 * Чанк находит такие ролики и, когда ролик подходит к экрану, зовёт play().
 *
 * --------------------------------------------------------------------------
 * ЗАЧЕМ ЭТО ВООБЩЕ
 *
 * Атрибут autoplay сильнее preload="none": браузер качает ролик целиком сразу,
 * даже если тот лежит на седьмом экране. На странице кейса это пять мегабайт
 * из шести с половиной — больше, чем весь остальной сайт вместе взятый.
 *
 * Поэтому autoplay в разметке и нет: с preload="none" браузер до первого
 * play() не трогает ни байта, и очередь до ролика доходит ровно тогда, когда
 * до него доходит читатель.
 *
 * Адреса при этом остаются в <source>, а не переезжают в data-: их считает
 * html-loader на сборке, а в data-атрибуты он не заглядывает — файлы просто
 * не попали бы в сборку.
 *
 * --------------------------------------------------------------------------
 * БЕЗ JS
 *
 * Виден кадр-заглушка (poster) и подпись под ним — то есть ролик становится
 * картинкой. Это осознанный размен: разметка обещает ровно то, что модуль
 * умеет выполнить, и ничего не обещает заранее — тот же принцип, что
 * у лайтбокса.
 *
 * --------------------------------------------------------------------------
 * REDUCED MOTION
 *
 * Движения, которого не просили, не будет: при включённом «уменьшить
 * движение» ролик не запускается сам, а получает панель управления — кадр
 * на месте, решение за человеком.
 * ========================================================================== */

const SETTINGS = {
  // Какие ролики ведёт чанк. Атрибут — единственный вход в эффект.
  selector: "[data-case-video]",

  /* За сколько до появления начинать загрузку. Экран с запасом: ролик
     успевает догрузиться, пока читатель идёт к нему по тексту, и к моменту
     встречи уже играет. Меньше — будет виден момент запуска, больше —
     начнём качать то, до чего не дойдут. */
  rootMargin: "100% 0px",
};

const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

function attach(video) {
  if (video.dataset.caseVideoReady !== undefined) return;
  video.dataset.caseVideoReady = "";

  if (calm.matches) {
    // Кадр уже стоит постером — остаётся дать способ его запустить.
    video.controls = true;
    return;
  }

  // play() возвращает промис и отклоняется, если автозапуск запретили
  // политикой браузера. Ролик при этом остаётся на постере — это рабочее
  // состояние, а не ошибка, поэтому тихо отдаём управление человеку.
  const started = video.play();
  if (started) started.catch(() => { video.controls = true; });
}

function start() {
  const videos = document.querySelectorAll(SETTINGS.selector);
  if (videos.length === 0) return;

  // Нет IntersectionObserver — момент приближения определять нечем. Тогда
  // лучше тяжёлый ролик, чем его отсутствие: подставляем сразу.
  if (!("IntersectionObserver" in window)) {
    videos.forEach(attach);
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        attach(entry.target);
        // Отписываемся сразу: источники подставляются один раз, дальше
        // ролик живёт сам.
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: SETTINGS.rootMargin },
  );

  videos.forEach((video) => observer.observe(video));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
