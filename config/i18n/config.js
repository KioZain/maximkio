/* ==========================================================================
 * i18n/config.js — единственный источник правды о языках и страницах.
 *
 * Отсюда берут данные все остальные части перевода:
 *   webpack.pages.js  — сколько HtmlWebpackPlugin создать и куда положить файлы
 *   i18n/loader.js    — какой словарь подставить в шаблон и что положить в site.*
 *
 * Правило: новый язык или новая переводимая страница добавляется ТОЛЬКО здесь.
 * ========================================================================== */

const path = require("path");

/* --------------------------------------------------------------------------
 * ЯЗЫКИ
 *
 * Первый в списке — язык по умолчанию. Его страницы ложатся в корень docs/,
 * остальные — в подпапку dir. Так русская версия остаётся на «/», а английская
 * получает «/en/…» и собственный URL для поисковиков.
 *
 *   code   значение атрибута lang и hreflang
 *   dir    подпапка в docs/ ("" — корень)
 *   label  как язык называется в выпадашке (на самом языке — так принято)
 *   short  подпись на кнопке переключателя
 * -------------------------------------------------------------------------- */

const LANGUAGES = [
  { code: "ru", dir: "", label: "Рус", short: "Рус" },
  { code: "en", dir: "en", label: "Eng", short: "Eng" },
];

const DEFAULT_LANGUAGE = LANGUAGES[0];

/* --------------------------------------------------------------------------
 * СТРАНИЦЫ
 *
 *   id        ключ страницы; по нему же ищется meta в словаре (pages.<id>)
 *             и тексты блоков (content.<id>)
 *   template  исходный шаблон
 *   out       путь внутри docs/ для языка по умолчанию
 *   chunks    какие бандлы подключить
 *   data      файл со структурой страницы (порядок и состав блоков), путь от
 *             корня проекта; нужен только страницам, которые собираются из
 *             блоков — см. {{#blocks}} в i18n/README.md
 *   i18n      true — страница собирается на всех языках,
 *             false/нет — только на языке по умолчанию
 *
 * i18n ставится на страницу ПОСЛЕ того, как её тексты вынесены в словари.
 * Пока флага нет, страница живёт как раньше и в /en/ не попадает — так на
 * сайте не появляется английский URL с русским текстом внутри.
 * -------------------------------------------------------------------------- */

const PAGES = [
  {
    id: "index",
    template: "./src/index.html",
    out: "index.html",
    chunks: [
      "index",
      "rough",
      "marquee",
      "magnetic",
      "langSwitch",
      "homeCanvas",
      "click",
      "reveal",
      "disclose",
    ],
    i18n: true,
  },
  {
    id: "articles",
    template: "./src/pages/articles.html",
    out: "pages/articles.html",
    chunks: ["index", "rough", "click"],
  },
  {
    id: "tests",
    template: "./src/pages/tests.html",
    out: "pages/tests.html",
    chunks: ["index", "click"],
  },
  {
    id: "dictionary",
    template: "./src/pages/dictionary.html",
    out: "pages/dictionary.html",
    chunks: ["index", "click"],
  },
  {
    id: "articles/plants",
    template: "./src/pages/articles/plants.html",
    out: "pages/articles/plants.html",
    chunks: ["index", "click"],
  },
  {
    id: "tests/test1",
    template: "./src/pages/tests/test1.html",
    out: "pages/tests/test1.html",
    chunks: ["index", "click"],
  },
  {
    id: "cases/artovoe",
    template: "./src/pages/cases/artovoe.html",
    out: "pages/cases/artovoe.html",
    data: "src/content/cases/artovoe.json",
    i18n: true,
    chunks: [
      "index",
      "click",
      "magnetic",
      "langSwitch",
      "lightbox",
      "scrollUp",
      "navSpy",
    ],
  },
];

/* --------------------------------------------------------------------------
 * ПУТИ
 * -------------------------------------------------------------------------- */

// Куда страница ложится внутри docs/ на конкретном языке.
function outputPath(page, language) {
  return language.dir ? `${language.dir}/${page.out}` : page.out;
}

// Ссылка со страницы «откуда» на страницу «куда», относительная.
// Относительная, а не корневая: сайт живёт на подпути /maximkio/, и корневой
// путь вида /index.html увёл бы на чужую страницу.
function relativeUrl(fromOutput, toOutput) {
  const url = path.posix.relative(path.posix.dirname(fromOutput), toOutput);
  return url === "" ? "." : url;
}

// На каких языках собирается страница.
function languagesFor(page) {
  return page.i18n ? LANGUAGES : [DEFAULT_LANGUAGE];
}

// Путь к словарю языка.
function dictionaryPath(language) {
  return path.resolve(__dirname, "../../src/locales", `${language.code}.json`);
}

module.exports = {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  PAGES,
  outputPath,
  relativeUrl,
  languagesFor,
  dictionaryPath,
};
