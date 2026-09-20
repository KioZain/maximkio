/* ==========================================================================
 * Лаборатория: пучок веточек в баннере.
 *
 * Страница для ручной подгонки настроек utils/branchCanvas.js. Собирается
 * только дев-конфигом (config/webpack.dev.js) и открывается по адресу
 *
 *     npm start → http://localhost:8080/lab/branch-canvas.html
 *
 * В прод-сборку и docs/ не попадает.
 *
 * Оба превью рисуются тем же кодом, что пойдёт на главную, в настоящей
 * разметке баннера. Правки сохраняются в localStorage этого браузера.
 * Выгрузка — внизу: скопировать JSON или записать его в
 * .lab/branch-canvas.json, откуда значения переносятся в
 * utils/branchCanvasSettings.js.
 * ========================================================================== */

import "../stylesheets/style.css";
import "./lab.css";

import avatar from "../images/me.png";
import {
  createBranchCanvas,
  layoutFor,
  WIND_PRESETS,
} from "../javascripts/utils/branchCanvas.js";
import {
  BRANCH_CANVAS_PREVIEW,
  BRANCH_CANVAS_SETTINGS,
} from "../javascripts/utils/branchCanvasSettings.js";

const STORAGE_KEY = "lab:branch-canvas";
const SAVE_URL = "/__lab/branch-canvas";

// Стартовые размеры превью — те, на которых подбиралась композиция.
const DEFAULT_PREVIEW = BRANCH_CANVAS_PREVIEW;

const PREVIEWS = [
  { key: "desktop", title: "Десктоп", minWidth: 400, maxWidth: 1100 },
  { key: "mobile", title: "Мобильный", minWidth: 240, maxWidth: 520 },
];

const COMPOSITION_FIELDS = [
  { key: "contentScale", label: "Масштаб содержимого", min: 0.2, max: 3, step: 0.05 },
  { key: "originX", label: "Пучок X", hint: "Доля ширины: 0 — левый край, 1 — правый", min: -1.5, max: 2.5, step: 0.01 },
  { key: "originY", label: "Пучок Y", hint: "Доля высоты, можно за пределы холста", min: -2.5, max: 2.5, step: 0.01 },
  { key: "baseAngle", label: "Направление", hint: "0 — вправо, 90 — вниз", min: 0, max: 360, step: 1 },
  { key: "spread", label: "Раскрытие веера", min: 0, max: 180, step: 1 },
  { key: "branchCount", label: "Количество веточек", min: 1, max: 80, step: 1 },
  { key: "dotCount", label: "Количество шариков", min: 0, max: 400, step: 1 },
];

const GROUPS = [
  {
    title: "Ветер",
    fields: [
      { path: "preset", type: "preset", label: "Пресет" },
      { path: "speed", label: "Скорость", min: 0.05, max: 3, step: 0.05 },
      { path: "amp", label: "Амплитуда", min: 0, max: 3, step: 0.05 },
    ],
  },
  {
    title: "Композиция: десктоп",
    fields: COMPOSITION_FIELDS.map((f) => ({ ...f, path: `layout.${f.key}` })),
  },
  {
    title: "Композиция: мобильный",
    hint: "Работает, когда баннер не шире порога",
    fields: [
      { path: "narrow.maxWidth", label: "Порог ширины баннера, px", min: 150, max: 800, step: 10 },
      ...COMPOSITION_FIELDS.map((f) => ({ ...f, path: `narrow.${f.key}` })),
    ],
  },
  {
    title: "Форма веточек",
    fields: [
      { path: "shape.angleJitter", label: "Разброс углов", min: 0, max: 30, step: 0.5 },
      { path: "shape.curvature", label: "Кривизна", min: 0, max: 140, step: 1 },
      { path: "shape.curveBias", label: "Сторона изгиба", min: 0, max: 1, step: 0.01 },
      { path: "shape.wobble", label: "Дрожание", min: 0, max: 2, step: 0.01 },
      { path: "shape.lenMin", label: "Длина мин", min: 0.05, max: 2, step: 0.01 },
      { path: "shape.lenMax", label: "Длина макс", min: 0.05, max: 2.5, step: 0.01 },
      { path: "shape.gapMin", label: "Отступ от пучка мин", min: 0, max: 1.2, step: 0.01 },
      { path: "shape.gapMax", label: "Отступ от пучка макс", min: 0, max: 1.5, step: 0.01 },
      { path: "steps", label: "Сегментов в веточке", hint: "Меньше — дешевле кадр, но ветка угловатее", min: 8, max: 200, step: 1 },
    ],
  },
  {
    title: "Линия",
    fields: [
      { path: "line.color", type: "color", label: "Цвет линий" },
      { path: "line.weight", label: "Толщина", min: 0.2, max: 12, step: 0.1 },
      { path: "line.taper", label: "Утончение", min: 0, max: 1, step: 0.01 },
      { path: "line.alpha", label: "Непрозрачность, %", min: 0, max: 100, step: 1 },
    ],
  },
  {
    title: "Шарики",
    fields: [
      { path: "dots.min", label: "Размер мин", min: 2, max: 120, step: 1 },
      { path: "dots.max", label: "Размер макс", min: 2, max: 160, step: 1 },
      { path: "dots.perpSpread", label: "Разброс поперёк, px", min: 0, max: 500, step: 1 },
      { path: "dots.alongPow", label: "Сдвиг вдоль ветки", hint: "Меньше 1 — ближе к кончикам", min: 0.25, max: 4, step: 0.05 },
      { path: "dots.alongMin", label: "Начало посева", min: 0, max: 0.9, step: 0.01 },
      { path: "dots.spacing", label: "Дистанция между", min: 0.5, max: 4, step: 0.05 },
      { path: "dots.margin", label: "Отступ от края", min: 0, max: 0.2, step: 0.005 },
      { path: "dots.follow", label: "Следование за веткой", min: 0, max: 1.5, step: 0.01 },
      { path: "dots.lag", label: "Отставание", min: 0, max: 1.5, step: 0.01 },
    ],
  },
  {
    title: "Цвет шариков",
    fields: [
      { path: "colors.hueStart", label: "Начало диапазона", min: 0, max: 360, step: 1 },
      { path: "colors.hueSpan", label: "Ширина диапазона", min: 0, max: 360, step: 1 },
      { path: "colors.hueSteps", label: "Ступеней оттенка", min: 0, max: 12, step: 1 },
      { path: "colors.sat", label: "Насыщенность", min: 0, max: 100, step: 1 },
      { path: "colors.satJitter", label: "Разброс насыщенности", min: 0, max: 60, step: 1 },
      { path: "colors.bri", label: "Яркость", min: 0, max: 100, step: 1 },
      { path: "colors.briJitter", label: "Разброс яркости", min: 0, max: 60, step: 1 },
      { path: "colors.alpha", label: "Непрозрачность, %", min: 0, max: 100, step: 1 },
    ],
  },
  {
    title: "Акцентный цвет",
    fields: [
      { path: "colors.accentAmount", label: "Доля акцента, %", min: 0, max: 100, step: 1 },
      { path: "colors.accentHue", label: "Оттенок акцента", min: 0, max: 360, step: 1 },
      { path: "colors.accentSpan", label: "Ширина акцента", min: 0, max: 180, step: 1 },
    ],
  },
  {
    title: "Фон",
    fields: [
      { path: "transparent", type: "checkbox", label: "Прозрачный фон", hint: "Тогда фон баннера задаёт CSS, как на сайте" },
      { path: "background", type: "color", label: "Цвет фона" },
    ],
  },
];

/* --------------------------------------------------------------------------
 * Состояние
 * -------------------------------------------------------------------------- */

const clone = (value) => JSON.parse(JSON.stringify(value));
const DEFAULTS = { ...clone(BRANCH_CANVAS_SETTINGS), preview: clone(DEFAULT_PREVIEW) };

function getPath(object, path) {
  return path.split(".").reduce((node, key) => node[key], object);
}

function setPath(object, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  keys.reduce((node, key) => node[key], object)[last] = value;
}

// Сохранённое накладывается на значения по умолчанию: ключи, которых в
// сохранённом нет (добавились позже), берутся из дефолтов, лишние отброшены.
function mergeInto(defaults, saved) {
  const result = clone(defaults);
  if (!saved || typeof saved !== "object") return result;
  for (const key of Object.keys(result)) {
    const base = result[key];
    const value = saved[key];
    if (value === undefined) continue;
    if (base && typeof base === "object" && !Array.isArray(base)) {
      result[key] = mergeInto(base, value);
    } else if (typeof base === typeof value) {
      result[key] = value;
    }
  }
  return result;
}

function loadState() {
  try {
    return mergeInto(DEFAULTS, JSON.parse(localStorage.getItem(STORAGE_KEY)));
  } catch {
    return clone(DEFAULTS);
  }
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Хранилище недоступно — настройки просто не переживут перезагрузку.
  }
}

let state = loadState();
let paused = false;

// Движку достаются настройки без служебного блока превью.
function engineSettings() {
  const copy = clone(state);
  delete copy.preview;
  return copy;
}

/* --------------------------------------------------------------------------
 * Элементы
 * -------------------------------------------------------------------------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const refreshers = [];

function onChange() {
  persistState();
  scheduleRebuild();
  renderOutput();
}

function createNumberField(field) {
  const row = el("div", "lab-field");
  const head = el("div", "lab-field__head");
  const label = el("label", "lab-field__label", field.label);
  const number = el("input", "lab-field__number");
  number.type = "number";
  const range = el("input", "lab-field__range");
  range.type = "range";
  for (const input of [number, range]) {
    input.min = field.min;
    input.max = field.max;
    input.step = field.step;
  }
  range.id = `field-${field.path}`;
  label.htmlFor = range.id;

  function apply(raw) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setPath(state, field.path, value);
    number.value = value;
    range.value = value;
    onChange();
  }
  range.addEventListener("input", () => apply(range.value));
  number.addEventListener("change", () => apply(number.value));
  refreshers.push(() => {
    const value = getPath(state, field.path);
    number.value = value;
    range.value = value;
  });

  head.append(label, number);
  row.append(head, range);
  if (field.hint) row.append(el("p", "lab-field__hint", field.hint));
  return row;
}

function createColorField(field) {
  const row = el("div", "lab-field lab-field--inline");
  const label = el("label", "lab-field__label", field.label);
  const code = el("code", "lab-field__code");
  const input = el("input", "lab-field__color");
  input.type = "color";
  input.id = `field-${field.path}`;
  label.htmlFor = input.id;

  input.addEventListener("input", () => {
    setPath(state, field.path, input.value);
    code.textContent = input.value;
    onChange();
  });
  refreshers.push(() => {
    const value = getPath(state, field.path);
    input.value = value;
    code.textContent = value;
  });

  row.append(label, code, input);
  return row;
}

function createCheckboxField(field) {
  const row = el("div", "lab-field lab-field--inline");
  const label = el("label", "lab-field__label", field.label);
  const input = el("input");
  input.type = "checkbox";
  input.id = `field-${field.path}`;
  label.htmlFor = input.id;

  input.addEventListener("change", () => {
    setPath(state, field.path, input.checked);
    onChange();
  });
  refreshers.push(() => {
    input.checked = getPath(state, field.path);
  });

  row.append(label, input);
  if (field.hint) row.append(el("p", "lab-field__hint", field.hint));
  return row;
}

function createPresetField(field) {
  const row = el("div", "lab-field");
  const label = el("label", "lab-field__label", field.label);
  const select = el("select", "lab-field__select");
  WIND_PRESETS.forEach((wind, index) => {
    const option = el("option", null, wind.label);
    option.value = index;
    select.append(option);
  });
  select.id = `field-${field.path}`;
  label.htmlFor = select.id;

  select.addEventListener("change", () => {
    state.preset = Number(select.value);
    onChange();
  });
  refreshers.push(() => {
    select.value = state.preset;
  });

  row.append(label, select);
  return row;
}

// Сид: строка или число, но подбирать удобнее перебором соседних значений.
function createSeedField() {
  const row = el("div", "lab-field");
  const label = el("label", "lab-field__label", "Сид");
  const input = el("input", "lab-field__text");
  input.type = "text";
  input.id = "field-seed";
  label.htmlFor = input.id;

  const buttons = el("div", "lab-buttons");
  const prev = el("button", "lab-button", "−1");
  const next = el("button", "lab-button", "+1");
  const dice = el("button", "lab-button", "Случайный");

  function setSeed(value) {
    state.seed = value;
    input.value = value;
    onChange();
  }
  function shift(delta) {
    const number = Number(state.seed);
    if (Number.isFinite(number)) setSeed(number + delta);
    else {
      const match = String(state.seed).match(/^(.*?)(\d+)$/);
      setSeed(match ? `${match[1]}${Number(match[2]) + delta}` : `${state.seed}-1`);
    }
  }

  input.addEventListener("change", () => {
    const number = Number(input.value);
    setSeed(input.value !== "" && Number.isFinite(number) ? number : input.value);
  });
  prev.addEventListener("click", () => shift(-1));
  next.addEventListener("click", () => shift(1));
  dice.addEventListener("click", () => setSeed(Math.floor(Math.random() * 100000)));
  refreshers.push(() => {
    input.value = state.seed;
  });

  buttons.append(prev, next, dice);
  row.append(label, input, buttons);
  return row;
}

function createField(field) {
  if (field.type === "preset") return createPresetField(field);
  if (field.type === "color") return createColorField(field);
  if (field.type === "checkbox") return createCheckboxField(field);
  return createNumberField(field);
}

function createGroup(group) {
  const section = el("section", "lab-group");
  section.append(el("h3", "lab-group__title", group.title));
  if (group.hint) section.append(el("p", "lab-field__hint", group.hint));
  group.fields.forEach((field) => section.append(createField(field)));
  return section;
}

/* --------------------------------------------------------------------------
 * Превью
 * -------------------------------------------------------------------------- */

const previews = [];

// Та же разметка баннера, что на главной (src/index.html).
function createPreview(preview) {
  const section = el("section", "lab-preview");
  const head = el("div", "lab-preview__head");
  const info = el("span", "lab-preview__info");
  const sizes = el("div", "lab-preview__sizes");

  const width = el("input", "lab-preview__range");
  width.type = "range";
  width.min = preview.minWidth;
  width.max = preview.maxWidth;
  width.step = 1;
  width.title = "Ширина контейнера страницы";

  const height = el("input", "lab-preview__range");
  height.type = "range";
  height.min = 40;
  height.max = 400;
  height.step = 1;
  height.title = "Высота баннера";

  sizes.append(el("span", "lab-field__hint", "ширина"), width);
  sizes.append(el("span", "lab-field__hint", "высота"), height);
  head.append(el("h2", "lab-preview__title", preview.title), info, sizes);

  const scroller = el("div", "lab-preview__scroller");
  const frame = el("div", "lab-preview__frame");
  frame.innerHTML = `
    <div class="M_ProfileBanner">
      <img class="Q_ProfileImage" src="${avatar}" alt="" />
      <div class="A_CanvasBeautiful">
        <p id="timedate-${preview.key}" class="lab-timedate">
          <span>1:24 PM</span> <span>Москва</span> <span>GMT+3</span>
        </p>
      </div>
    </div>`;
  scroller.append(frame);
  section.append(head, scroller);

  const host = frame.querySelector(".A_CanvasBeautiful");
  const item = { key: preview.key, host, info, banner: null };

  function applySize() {
    const size = state.preview[preview.key];
    frame.style.width = `${size.width}px`;
    // Высоту баннера на сайте задаёт аватарка; тут её подбираем руками,
    // поэтому max-height из A_CanvasBeautiful.css нужно снять.
    host.style.height = `${size.height}px`;
    host.style.maxHeight = "none";
    width.value = size.width;
    height.value = size.height;
    updateInfo(item);
  }

  width.addEventListener("input", () => {
    state.preview[preview.key].width = Number(width.value);
    applySize();
    persistState();
    renderOutput();
  });
  height.addEventListener("input", () => {
    state.preview[preview.key].height = Number(height.value);
    applySize();
    persistState();
    renderOutput();
  });

  refreshers.push(applySize);
  new ResizeObserver(() => updateInfo(item)).observe(host);
  applySize();

  return { section, item };
}

function updateInfo({ host, info }) {
  const width = host.clientWidth;
  const height = host.clientHeight;
  const narrow = layoutFor(state, width) === state.narrow;
  info.textContent = `баннер ${width}×${height} · ${narrow ? "мобильная" : "десктопная"} композиция`;
}

/* --------------------------------------------------------------------------
 * Выгрузка
 * -------------------------------------------------------------------------- */

const output = el("textarea", "lab-output__json");
output.spellcheck = false;
const status = el("p", "lab-output__status");

function renderOutput() {
  // Пока человек правит JSON руками, поле не перезаписываем.
  if (document.activeElement !== output) {
    output.value = JSON.stringify(state, null, 2);
  }
}

function setStatus(text) {
  status.textContent = text;
}

async function copyJson() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(state, null, 2));
    setStatus("JSON скопирован — вставьте его в чат.");
  } catch {
    output.focus();
    output.select();
    setStatus("Буфер обмена недоступен: JSON выделен, скопируйте вручную.");
  }
}

async function saveForClaude() {
  try {
    const response = await fetch(SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setStatus(`Сохранено в ${result.file} — скажите Claude, что файл готов.`);
  } catch (error) {
    setStatus(`Не удалось сохранить: ${error.message}`);
  }
}

function applyJson() {
  try {
    state = mergeInto(DEFAULTS, JSON.parse(output.value));
    refreshAll();
    setStatus("JSON применён.");
  } catch (error) {
    setStatus(`В JSON ошибка: ${error.message}`);
  }
}

function resetAll() {
  state = clone(DEFAULTS);
  refreshAll();
  setStatus("Вернулись к значениям из branchCanvasSettings.js.");
}

function refreshAll() {
  refreshers.forEach((refresh) => refresh());
  output.blur();
  onChange();
}

function createOutput() {
  const section = el("section", "lab-output");
  section.append(
    el("h2", "lab-preview__title", "Данные"),
    el(
      "p",
      "lab-field__hint",
      "«Сохранить для Claude» записывает настройки в .lab/branch-canvas.json. " +
        "JSON можно поправить руками и нажать «Применить».",
    ),
  );
  const buttons = el("div", "lab-buttons");
  const actions = [
    ["Сохранить для Claude", saveForClaude, true],
    ["Скопировать JSON", copyJson],
    ["Применить JSON из поля", applyJson],
    ["Сбросить к значениям сайта", resetAll],
  ];
  for (const [text, handler, primary] of actions) {
    const button = el("button", primary ? "lab-button lab-button--primary" : "lab-button", text);
    button.addEventListener("click", handler);
    buttons.append(button);
  }
  section.append(buttons, status, output);
  return section;
}

/* --------------------------------------------------------------------------
 * Сборка страницы
 * -------------------------------------------------------------------------- */

let rebuildTimer = 0;

// Пересборка по таймеру, а не по кадру: ползунок шлёт input чаще, чем имеет
// смысл строить геометрию, а скрытая вкладка кадров не получает вовсе.
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuild, 40);
}

function rebuild() {
  const settings = engineSettings();
  for (const item of previews) {
    item.banner?.destroy();
    item.banner = createBranchCanvas(item.host, settings);
    item.banner?.setPaused(paused);
    updateInfo(item);
  }
}

function createToolbar() {
  const bar = el("div", "lab-buttons");
  const pause = el("button", "lab-button", "Пауза");
  pause.addEventListener("click", () => {
    paused = !paused;
    pause.textContent = paused ? "Продолжить" : "Пауза";
    previews.forEach((item) => item.banner?.setPaused(paused));
  });
  const again = el("button", "lab-button", "Заново");
  again.addEventListener("click", rebuild);
  bar.append(pause, again);
  return bar;
}

function start() {
  document.title = "Лаборатория — пучок веточек";

  const page = el("main", "lab");
  const header = el("header", "lab-header");
  header.append(
    el("h1", "lab-header__title", "Пучок веточек в баннере"),
    el(
      "p",
      "lab-field__hint",
      "Тестовая страница, есть только на дев-сервере. Правки сохраняются в этом браузере.",
    ),
  );

  const stage = el("div", "lab-stage");
  for (const preview of PREVIEWS) {
    const { section, item } = createPreview(preview);
    stage.append(section);
    previews.push(item);
  }

  const controls = el("div", "lab-controls");
  const seedGroup = el("section", "lab-group");
  seedGroup.append(el("h3", "lab-group__title", "Пучок"));
  seedGroup.append(createSeedField(), createToolbar());
  controls.append(seedGroup);
  GROUPS.forEach((group) => controls.append(createGroup(group)));

  // Слева закреплённые превью, справа прокручиваемые настройки: результат
  // правки видно, не пролистывая страницу.
  const body = el("div", "lab-body");
  const side = el("div", "lab-side");
  side.append(controls, createOutput());
  body.append(stage, side);

  page.append(header, body);
  document.body.append(page);

  refreshers.forEach((refresh) => refresh());
  renderOutput();
  rebuild();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
