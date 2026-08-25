/* ==========================================================================
 * i18n/loader.js — webpack-загрузчик, который подставляет словарь в шаблон.
 *
 * Стоит в цепочке ПЕРЕД html-loader: сначала мы превращаем шаблон в готовую
 * разметку, и только потом html-loader ищет в ней картинки и шрифты.
 *
 * Какой язык подставлять, загрузчик узнаёт из запроса шаблона:
 *
 *     ./src/index.html?lang=en&page=index
 *
 * Запрос ставит webpack.pages.js. Он же гарантирует, что для каждого языка
 * запрос свой — иначе webpack посчитал бы обе страницы одним модулем и собрал
 * бы английскую версию из русского кэша.
 *
 * Без параметров загрузчик отдаёт файл как есть: непереведённые страницы
 * проходят через сборку нетронутыми.
 * ========================================================================== */

const fs = require("fs");
const path = require("path");

const {
  LANGUAGES,
  DEFAULT_LANGUAGE,
  PAGES,
  outputPath,
  relativeUrl,
  dictionaryPath,
} = require("./config.js");

const { render } = require("./render.js");

// Имена, которые движок подставляет сам. В словаре их быть не должно, иначе
// непонятно, чей {{ site.lang }} выиграл.
const RESERVED_KEYS = ["site", "page"];

/* Всё, что шаблон знает о себе и о соседних языках. Считается из config.js,
   в словарях не хранится: это не текст, а структура сайта. */
function buildSite(page, language) {
  const self = outputPath(page, language);

  const languages = LANGUAGES.map((item) => ({
    code: item.code,
    label: item.label,
    short: item.short,
    url: relativeUrl(self, outputPath(page, item)),
    isCurrent: item.code === language.code,
    // Строкой, а не булевым: значение уходит прямо в атрибут aria-current,
    // по нему же выпадашка подсвечивает текущий язык — без единой строчки JS.
    ariaCurrent: item.code === language.code ? "true" : "false",
  }));

  const current = languages.find((item) => item.isCurrent);

  // Путь от текущей страницы к корню сайта. Нужен внутренним ссылкам: из
  // /en/index.html на непереведённую страницу надо выйти на уровень вверх.
  const toRoot = path.posix.relative(path.posix.dirname(self), ".");

  return {
    lang: language.code,
    root: toRoot ? `${toRoot}/` : "",
    languages,
    current,
    // Удобная ссылка «на другой язык» для случая двух языков. Когда языков
    // станет больше, переключатель всё равно строится по site.languages.
    other: languages.find((item) => !item.isCurrent) || current,
    default: languages.find((item) => item.code === DEFAULT_LANGUAGE.code),
  };
}

function loadDictionary(loaderContext, language, template) {
  const file = dictionaryPath(language);

  // Без этого dev-server не пересоберёт страницу после правки перевода.
  loaderContext.addDependency(file);

  let dictionary;

  try {
    dictionary = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`[i18n] не читается словарь ${file}\n  ${error.message}`);
  }

  const reserved = RESERVED_KEYS.filter((key) => key in dictionary);

  if (reserved.length > 0) {
    throw new Error(
      `[i18n] ключи ${reserved.join(", ")} зарезервированы движком\n  словарь: ${file}\n  шаблон:  ${template}`,
    );
  }

  return dictionary;
}

module.exports = function i18nLoader(source) {
  const query = new URLSearchParams(this.resourceQuery.slice(1));
  const languageCode = query.get("lang");
  const pageId = query.get("page");

  if (!languageCode || !pageId) return source;

  const language = LANGUAGES.find((item) => item.code === languageCode);
  const page = PAGES.find((item) => item.id === pageId);

  if (!language) throw new Error(`[i18n] неизвестный язык "${languageCode}"`);
  if (!page) throw new Error(`[i18n] страница "${pageId}" не описана в config.js`);

  const dictionary = loadDictionary(this, language, page.template);
  const pageMeta = (dictionary.pages && dictionary.pages[page.id]) || {};

  const scope = {
    ...dictionary,
    site: buildSite(page, language),
    page: { id: page.id, ...pageMeta },
  };

  return render(source, [scope], {
    template: page.template,
    language: language.code,
  });
};
