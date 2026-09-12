/* ==========================================================================
 * clock — часы города в баннере на главной.
 *
 * Как пользоваться: разметить блок атрибутами, ничего больше.
 *
 *     <p data-clock data-timezone="Europe/Moscow">
 *       <time data-clock-time>--:--</time>
 *       <span>Москва</span>
 *       <span data-clock-offset>GMT+3</span>
 *     </p>
 *
 *   data-timezone       пояс из базы IANA: "Europe/Moscow", "Asia/Tokyo"…
 *                       Полный список — Intl.supportedValuesOf("timeZone").
 *   data-clock-time     сюда пишется время, например «13:24» или «1:24 PM»
 *   data-clock-offset   сюда — смещение от UTC, например «GMT+3»
 *
 * Время всегда показывается по поясу из data-timezone, пояс посетителя
 * ни на что не влияет: от устройства берётся только текущий момент (он
 * одинаков во всём мире), а переводит его в местное время города сам
 * браузер через Intl. Летнее время учитывается автоматически.
 *
 * Название города — обычный текст из словаря (clock.city в src/locales),
 * скрипт его не трогает. Блоков на странице может быть сколько угодно,
 * у каждого свой пояс; обновляет их один общий таймер.
 * ========================================================================== */

const SETTINGS = {
  selector: "[data-clock]",

  // Пояс на случай, если data-timezone не указан.
  fallbackTimeZone: "Europe/Moscow",

  // Формат часов: null — как принято в языке страницы (ru — «13:24»,
  // en — «1:24 PM»), true — всегда 12-часовой, false — всегда 24-часовой.
  hour12: null,

  // Сверить часы устройства с заголовком Date ответа сервера. Помогает,
  // если у посетителя часы переведены вручную. Стоит один HEAD-запрос
  // к своему же сайту при загрузке, без сторонних сервисов.
  syncWithServer: true,

  // Меньшее расхождение с сервером не исправляем: точность заголовка Date —
  // секунда, плюс сеть, а часы всё равно показывают только минуты.
  syncThreshold: 2000,
};

// Поправка к часам устройства, мс. Меняется только после сверки с сервером.
let drift = 0;

function now() {
  return new Date(Date.now() + drift);
}

async function syncWithServer() {
  try {
    const sent = Date.now();
    const response = await fetch(location.pathname, {
      method: "HEAD",
      cache: "no-store",
    });
    const received = Date.now();
    const serverTime = Date.parse(response.headers.get("Date"));
    if (Number.isNaN(serverTime)) return;

    // Сервер отметил время примерно посередине пути запроса.
    const diff = serverTime + (received - sent) / 2 - received;
    if (Math.abs(diff) > SETTINGS.syncThreshold) drift = diff;
  } catch {
    // Нет сети или заголовка — остаёмся на часах устройства.
  }
}

function createClock(root, locale) {
  const timeZone = root.dataset.timezone || SETTINGS.fallbackTimeZone;
  const timeEl = root.querySelector("[data-clock-time]");
  const offsetEl = root.querySelector("[data-clock-offset]");
  if (!timeEl) return null;

  let timeFormat;
  let offsetFormat;
  try {
    timeFormat = new Intl.DateTimeFormat(locale, {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      ...(SETTINGS.hour12 === null ? {} : { hour12: SETTINGS.hour12 }),
    });
    offsetFormat = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    });
  } catch {
    console.warn(`clock: неизвестный часовой пояс "${timeZone}"`);
    return null;
  }

  return (date) => {
    timeEl.textContent = timeFormat.format(date);
    if (timeEl.tagName === "TIME") timeEl.dateTime = date.toISOString();

    if (offsetEl) {
      const part = offsetFormat
        .formatToParts(date)
        .find(({ type }) => type === "timeZoneName");
      // У UTC-поясов браузер пишет просто «GMT» — так и оставляем.
      if (part) offsetEl.textContent = part.value;
    }
  };
}

function init() {
  const locale = document.documentElement.lang === "en" ? "en-US" : "ru-RU";
  const clocks = [...document.querySelectorAll(SETTINGS.selector)]
    .map((root) => createClock(root, locale))
    .filter(Boolean);
  if (!clocks.length) return;

  let timer;

  // Перерисовка ровно на смене минуты, а не «раз в секунду примерно».
  // Небольшой запас в 50 мс — чтобы не проснуться за миг до новой минуты.
  function tick() {
    clearTimeout(timer);
    const date = now();
    clocks.forEach((render) => render(date));
    timer = setTimeout(tick, 60000 - (date.getTime() % 60000) + 50);
  }

  // В фоновой вкладке таймеры засыпают — при возвращении обновляем сразу.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tick();
  });

  tick();
  if (SETTINGS.syncWithServer) syncWithServer().then(tick);
}

init();
