/* ==========================================================================
 * imageLightbox.js — раскрытие картинки поверх страницы.
 *
 * Один <dialog> на всю страницу, сколько бы картинок на ней ни было, и два
 * делегированных слушателя. Диалог собирается здесь же: в шаблонах его нет,
 * поэтому новая страница подключает лайтбокс одной строчкой в chunks и одним
 * атрибутом на картинке.
 *
 * Модуль ничего не знает про A_CaseImage. Его контракт — три вещи:
 *
 *   1) элемент с data-zoomable содержит ровно одну <img>;
 *   2) родитель этой <img> — рамка: то, что человек видит как «картинку»,
 *      и то, из чего и во что летит анимация;
 *   3) пропорция берётся из width/height в разметке.
 *
 * Как выглядят фон, крест и скрытая рамка — решает CSS, см. O_Lightbox.css.
 *
 * --------------------------------------------------------------------------
 * ПРО ЗАГРУЗКУ
 *
 * В модалку идёт currentSrc исходной картинки — ровно тот файл, который
 * браузер уже выбрал из srcset и уже держит расшифрованным. Это не экономия
 * ради экономии: совпадение адреса до символа — единственное, что гарантирует
 * попадание в кэш, а значит и отсутствие догрузки прямо во время анимации.
 * Скачок «в первую секунду появилась картинка» лечится здесь, а не таймингами.
 *
 * Ширина модалки (1066) больше слота в статье (756) всего в 1.41 раза, а на
 * DPR 2 браузер и так скачал 1512 — то есть на ретине докачивать нечего в
 * принципе. Поэтому второго, «модального» файла у картинки нет и не нужно.
 *
 * --------------------------------------------------------------------------
 * ПРО FLIP
 *
 * Картинка в модалке сразу ставится в конечный размер, а потом обратным
 * преобразованием прижимается на место рамки — и уже оттуда отпускается.
 * Обе геометрии известны только в момент клика, поэтому это JS, а не CSS.
 *
 * Едут только transform и border-radius. Первый ничего не стоит: он идёт
 * мимо лейаута и отрисовки. Второй стоит перерисовки кадра — но без него
 * угол на старте был бы 24 × scale, то есть 17px вместо 24, и рамка на
 * глазах «оплывала» бы. Это единственное неcomposited свойство во всей
 * анимации; если на слабой машине будет заметно, убирается одной строчкой
 * (см. radiusOf).
 *
 * Обе геометрии перелёта посчитаны один раз, в момент клика. Любой resize
 * делает их неправдой, поэтому размеры пересчитываются, а недоигранный
 * перелёт доводится до конца досрочно — см. relayout().
 * ========================================================================== */

const FRAME = "data-lightbox-frame";
const SOURCE = "data-lightbox-source";
const OPEN = "data-open";

// Лайтбокс в reduced motion не отключается — он не украшение, а способ
// разглядеть картинку. Уходит ровно то, что этот режим и просит убрать:
// движение. Картинка не летит из рамки, а проявляется на своём конечном
// месте, одновременно с фоном и за то же время. Длительность остаётся
// прежней: мгновенное появление — это и есть тот скачок, ради которого
// режим включают.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const CROSS = `
  <svg class="Q_Icon" width="24" height="24" viewBox="0 0 24 24" fill="none"
       xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M18 6L6.00081 17.9992M17.9992 18L6 6.00085"
          stroke="currentColor" stroke-width="1.9"
          stroke-linecap="round" stroke-linejoin="round" />
  </svg>
`;

export function createImageLightbox(defaults) {
  const dialog = document.createElement("dialog");
  dialog.className = "O_Lightbox";

  const image = document.createElement("img");
  image.className = "Q_LightboxImage";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "A_Button E_Click Q_LightboxClose";
  closeButton.setAttribute("aria-label", defaults.closeLabel);
  closeButton.innerHTML = CROSS;

  dialog.append(image, closeButton);
  document.body.append(dialog);

  // Рамка, которая сейчас «переехала» в модалку. Она же — куда возвращать
  // картинку на закрытии и куда возвращать фокус.
  let source = null;
  // Текущая анимация перелёта. Всегда ровно одна: у неё fill: both, и две
  // невыключенные анимации на одной картинке означали бы, что замер геометрии
  // возвращает не лейаут-бокс, а то, куда картинку увела предыдущая.
  let flip = null;
  // Радиус картинки в покое. Снимается один раз при открытии: во время
  // анимации getComputedStyle вернёт уже анимированное значение.
  let radius = 0;
  let closing = false;
  let scrollbarGap = 0;
  let resizeFrame = 0;

  const frames = [];

  /* --- Значения из CSS -------------------------------------------------- */

  // Тайминги и радиус читаются из токенов, а не дублируются числами: кривая
  // у сайта одна на всё, и лайтбокс не должен заводить себе вторую.
  function motion() {
    const styles = getComputedStyle(document.documentElement);
    const duration = parseFloat(styles.getPropertyValue("--duration-zoom"));
    const easing = styles.getPropertyValue("--ease-out").trim();

    return {
      duration: Number.isFinite(duration) ? duration : defaults.duration,
      easing: easing || "ease-out",
    };
  }

  function radiusOf(el) {
    return parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  }

  function gutter() {
    const value = parseFloat(
      getComputedStyle(dialog).getPropertyValue("--lightbox-gutter"),
    );
    return Number.isFinite(value) ? value : defaults.gutter;
  }

  /* --- Разметка --------------------------------------------------------- */

  // Пропорция берётся из атрибутов, а не из naturalWidth: с srcset natural
  // зависит от того, какой кандидат достался этому экрану, а разметка одна
  // для всех. Natural остаётся резервом для картинок без атрибутов.
  function ratioOf(img) {
    const width = Number(img.getAttribute("width"));
    const height = Number(img.getAttribute("height"));
    if (width > 0 && height > 0) return width / height;
    if (img.naturalWidth > 0) return img.naturalWidth / img.naturalHeight;
    return 0;
  }

  // Во что упирается картинка: в потолок по ширине или в высоту экрана.
  function box(ratio, limit) {
    const inset = gutter() * 2;
    const maxWidth = Math.min(limit, window.innerWidth - inset);
    const maxHeight = window.innerHeight - inset;

    let width = maxWidth;
    let height = width / ratio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }

    return { width, height };
  }

  // Единственное место, где картинке в модалке ставятся размеры. Их считает
  // JS, а не CSS: max-width не умеет увеличивать картинку сверх исходной,
  // а модалка как раз крупнее слота в статье.
  function fitImage(zoomable, img) {
    const ratio = ratioOf(img);
    if (!ratio) return;

    const limit = Number(zoomable.dataset.zoomMax) || defaults.maxWidth;
    const size = box(ratio, limit);

    image.style.width = `${size.width}px`;
    image.style.height = `${size.height}px`;
  }

  /* --- Подготовка картинок ---------------------------------------------- */

  // Всё, что делает картинку кликабельной, вешается отсюда, а не из шаблона.
  // Разметка обещает ровно то, что модуль умеет выполнить прямо сейчас: если
  // лайтбокс выключен (узкий экран, грубый указатель), обещания нет вовсе —
  // ни курсора, ни просадки под пальцем, ни кнопки для скринридера.
  function prepare(zoomable) {
    const img = zoomable.querySelector("img");
    if (!img) return;

    const frame = img.parentElement;
    if (!frame || frame.hasAttribute(FRAME)) return;

    frame.setAttribute(FRAME, "");
    frame.setAttribute("role", "button");
    frame.setAttribute("tabindex", "0");
    frame.setAttribute("aria-label", zoomable.dataset.zoomLabel || defaults.openLabel);
    frame.classList.add("E_Click");

    frames.push(frame);
  }

  function unprepare(frame) {
    frame.removeAttribute(FRAME);
    frame.removeAttribute(SOURCE);
    frame.removeAttribute("role");
    frame.removeAttribute("tabindex");
    frame.removeAttribute("aria-label");
    frame.classList.remove("E_Click");
  }

  /* --- Прокрутка -------------------------------------------------------- */

  // Полосу прокрутки надо не просто убрать, а компенсировать её ширину:
  // без padding-right тело страницы станет шире, и вся центрированная
  // вёрстка под блюром сдвинется вбок ровно в момент открытия.
  function lockScroll() {
    scrollbarGap = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarGap > 0) document.body.style.paddingRight = `${scrollbarGap}px`;
  }

  function unlockScroll() {
    document.body.style.overflow = "";
    document.body.style.paddingRight = "";
  }

  /* --- Перелёт ---------------------------------------------------------- */

  // Картинка, прижатая обратно в рамку: from — рамка в статье, to — лейаут-бокс
  // картинки в модалке. Оба замера должны делаться при снятой анимации, иначе
  // to вернёт не бокс, а то место, куда картинку увёл transform.
  //
  // В reduced motion координаты не нужны вовсе: свёрнутое состояние — это не
  // «в рамке», а «ещё не проявилась».
  function collapsed(from, to) {
    if (reducedMotion.matches) return { opacity: 0 };

    const scale = from.width / to.width;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);

    return {
      transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
      // Радиус масштабируется вместе с картинкой, поэтому здесь его надо
      // заранее поделить: после умножения на scale получится ровно тот угол,
      // что у рамки, и он не изменится за весь перелёт.
      borderRadius: `${radius / scale}px`,
    };
  }

  function expanded() {
    if (reducedMotion.matches) return { opacity: 1 };

    return { transform: "none", borderRadius: `${radius}px` };
  }

  // Где картинка прямо сейчас, вместе с недоигранной анимацией. Набор свойств
  // тот же, что и у ключевых кадров: смешивать opacity с transform в одной
  // анимации нельзя — недостающее свойство браузер возьмёт из вычисленного
  // стиля, и получится переход из состояния, которого никто не задавал.
  function currentState() {
    const styles = getComputedStyle(image);

    if (reducedMotion.matches) return { opacity: styles.opacity };

    return {
      transform: styles.transform,
      borderRadius: styles.borderTopLeftRadius,
    };
  }

  // Каждый перелёт — новая анимация, старая снимается. Разворачивать одну и ту
  // же через reverse() нельзя: после reverse() у анимации остаётся прежний,
  // уже разрешённый promise finished, и обработчик закрытия срабатывает
  // мгновенно — диалог успевает закрыться раньше, чем картинка тронется.
  function flyTo(keyframes, duration, easing) {
    flip?.cancel();
    flip = image.animate(keyframes, { duration, easing, fill: "both" });

    return flip;
  }

  /* --- Открытие --------------------------------------------------------- */

  function open(zoomable) {
    if (source || closing) return;

    const img = zoomable.querySelector("img");
    const frame = img && img.parentElement;
    if (!frame) return;

    // Показывать нечего — значит и раскрывать нечего. Без этой проверки
    // модалка открылась бы на пустое место.
    if (!img.complete || !img.naturalWidth) return;

    if (!ratioOf(img)) return;

    image.alt = img.alt;

    // Присваиваем, только если адрес другой: повторное присваивание того же
    // src перезапускает загрузку картинки, и complete на кадр становится
    // false — ровно тот скачок, которого мы избегаем.
    const src = img.currentSrc || img.src;
    if (image.src !== src) image.src = src;

    fitImage(zoomable, img);

    // На том же адресе картинка обычно готова прямо здесь, синхронно. Ветка
    // с decode() — страховка на случай, когда это не так: лучше подождать
    // кадр, чем начать перелёт с пустого прямоугольника.
    if (image.complete) present(frame);
    else image.decode().then(() => present(frame), () => present(frame));
  }

  function present(frame) {
    if (source || closing) return;
    if (!frame.isConnected) return;

    source = frame;

    dialog.showModal();
    lockScroll();

    // Снять всё, что могло остаться от прошлого закрытия: у анимации fill:
    // both, и невыключенная она отдала бы вместо лейаут-бокса картинки то
    // место, в которое её увёл прошлый перелёт.
    flip?.cancel();
    flip = null;

    // Замер геометрии заодно сбрасывает стили — и это единственный момент,
    // когда ::backdrop успевает вычислить свою нулевую opacity. Поставь
    // data-open раньше, и фон появился бы мгновенно, без перехода.
    const from = frame.getBoundingClientRect();
    const to = image.getBoundingClientRect();
    radius = radiusOf(image);

    dialog.setAttribute(OPEN, "");

    const { duration, easing } = motion();
    flyTo([collapsed(from, to), expanded()], duration, easing);

    // Рамка прячется в этой же задаче, поэтому кадра с двумя картинками
    // сразу не бывает: браузер отрисует оба изменения вместе.
    frame.setAttribute(SOURCE, "");
  }

  /* --- Закрытие --------------------------------------------------------- */

  function requestClose() {
    if (!source || closing) return;
    closing = true;

    dialog.removeAttribute(OPEN);

    const { duration, easing } = motion();

    // Сколько успел проиграть перелёт — столько же занимает возврат. Если
    // открытие прервали на середине, картинка идёт назад с той же скоростью,
    // а не тащится полную длительность с полдороги.
    const played = flip ? Math.min(Number(flip.currentTime) || 0, duration) : duration;

    // Отсюда поедем: перелёт не должен начинаться с рывка к полному размеру.
    const current = currentState();

    // Анимацию снимаем до замеров, иначе to вернёт не лейаут-бокс. Между
    // снятием и запуском новой отрисовки не происходит — обе операции в
    // одной задаче, — поэтому картинка никуда не дёргается.
    flip?.cancel();

    const from = source.getBoundingClientRect();
    const to = image.getBoundingClientRect();

    const run = flyTo([current, collapsed(from, to)], played, easing);
    run.finished.then(
      () => {
        if (run === flip) finish();
      },
      () => {},
    );
  }

  function finish() {
    // Анимацию надо снять здесь, а не оставить дожидаться следующего
    // открытия: с fill: both она держит на картинке трансформ, и ближайший
    // же замер геометрии вернул бы неправду.
    flip?.cancel();
    flip = null;

    if (source) {
      source.removeAttribute(SOURCE);
      source.focus({ preventScroll: true });
      source = null;
    }

    closing = false;

    dialog.close();
    unlockScroll();
  }

  /* --- Пересчёт после resize -------------------------------------------- */

  // Перелёт держит в ключевых кадрах готовые координаты, посчитанные в момент
  // клика. Любое изменение размеров окна делает их неправдой: и рамка в
  // статье уехала, и конечный размер картинки стал другим.
  function relayout() {
    if (!source) return;

    // Закрытие уже построено на старой геометрии, и вести картинку в точку,
    // которой больше нет, незачем. Заканчиваем сразу — модалка всё равно
    // уходит.
    if (closing) {
      finish();
      return;
    }

    // Открытие доводим до конца досрочно. Доскок резкий, но это честнее, чем
    // ехать в уехавшую точку, и случается только если тянуть окно ровно в те
    // четверть секунды, пока картинка летит.
    flip?.finish();

    const img = source.querySelector("img");
    const zoomable = source.closest(defaults.selector);
    if (img && zoomable) fitImage(zoomable, img);
  }

  // resize приходит пачками по десятку событий на один рывок мышью, а каждый
  // пересчёт — это чтение стилей и запись размеров. Собираем всю пачку в один
  // кадр.
  function onResize() {
    if (!source || resizeFrame) return;

    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      relayout();
    });
  }

  /* --- События ---------------------------------------------------------- */

  function zoomableOf(target) {
    const frame = target.closest?.(`[${FRAME}]`);
    return frame ? frame.closest(defaults.selector) : null;
  }

  function onClick(event) {
    const zoomable = zoomableOf(event.target);
    if (!zoomable) return;
    open(zoomable);
  }

  // Рамка — не настоящая кнопка, поэтому Enter и пробел на ней надо обработать
  // руками: role="button" обещает скринридеру ровно это поведение.
  function onKeyDown(event) {
    if (event.key !== "Enter" && event.key !== " ") return;

    const zoomable = zoomableOf(event.target);
    if (!zoomable) return;

    event.preventDefault();
    open(zoomable);
  }

  // Esc браузер обрабатывает сам и закрывает диалог мгновенно. Отменяем и
  // закрываем своим путём — иначе картинка исчезала бы без обратного перелёта.
  function onCancel(event) {
    event.preventDefault();
    requestClose();
  }

  // Клик в любом месте модалки закрывает её: и по фону, и по кресту, и по
  // самой картинке. Отдельный обработчик кнопке поэтому не нужен.
  function onDialogClick() {
    requestClose();
  }

  const listeners = [
    [document, "click", onClick],
    [document, "keydown", onKeyDown],
    [dialog, "cancel", onCancel],
    [dialog, "click", onDialogClick],
    [window, "resize", onResize],
  ];

  listeners.forEach(([target, type, handler]) => {
    target.addEventListener(type, handler);
  });

  document.querySelectorAll(defaults.selector).forEach(prepare);

  return {
    destroy() {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = 0;

      flip?.cancel();
      flip = null;

      if (source) {
        source.removeAttribute(SOURCE);
        source = null;
        dialog.close();
        unlockScroll();
      }

      closing = false;

      listeners.forEach(([target, type, handler]) => {
        target.removeEventListener(type, handler);
      });

      frames.forEach(unprepare);
      frames.length = 0;

      dialog.remove();
    },
  };
}
