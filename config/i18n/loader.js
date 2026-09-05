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
 *
 * Здесь же вклеиваются куски разметки:
 *
 *     {{> headerbar }}   вместо тега подставляется src/partials/headerbar.html
 *
 * Вклейка идёт ДО подстановки словаря — иначе {{ header.cv }} внутри куска
 * никто бы не перевёл (именно так ломался header, когда куски вставлял
 * html-webpack-partials-plugin: он работает после загрузчиков).
 *
 * Если у страницы в config.js указан файл data, он читается сюда же и кладётся
 * в шаблон под именем data. Так собираются кейсы: порядок блоков лежит в
 * src/content, а шаблон разворачивает его одной строкой
 *
 *     {{#blocks data.blocks from case}}
 *
 * Тексты блоков движок берёт из словаря по ключу content["<id страницы>"],
 * см. blockTextReader ниже.
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

const { render, fail } = require("./render.js");

// Имена, которые движок подставляет сам. В словаре их быть не должно, иначе
// непонятно, чей {{ site.lang }} выиграл.
const RESERVED_KEYS = ["site", "page", "data"];

// А это, наоборот, ключ, который движок ищет в словаре: под ним лежат тексты
// блоков всех страниц, разложенные по id страницы (см. blockTextReader).
const CONTENT_KEY = "content";

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

// Куски разметки лежат в одной папке и зовутся по имени файла без расширения.
const PARTIALS_DIR = path.resolve(__dirname, "../../src/partials");
const PARTIAL = /\{\{>\s*([\w./-]+)\s*\}\}/g;

/* Рекурсивная вклейка кусков: кусок сам может звать другой кусок.
   stack — путь вызовов, по нему ловится кольцо (a → b → a). */
function inlinePartials(source, loaderContext, context, stack = []) {
  return source.replace(PARTIAL, (_, name) => {
    const file = path.join(PARTIALS_DIR, `${name}.html`);

    if (stack.includes(file)) {
      fail(context, `кусок "${name}" вставляет сам себя: ${stack.concat([file]).map((item) => path.basename(item)).join(" → ")}`);
    }

    // Без этого dev-server не пересоберёт страницу после правки куска.
    loaderContext.addDependency(file);

    let content;

    try {
      content = fs.readFileSync(file, "utf8");
    } catch (error) {
      fail(context, `не читается кусок ${file}\n  ${error.message}`);
    }

    return inlinePartials(content, loaderContext, context, stack.concat([file]));
  });
}

/* Кусок разметки для блока: partials/<папка>/<type>.html. Внутри куска
   работают обычные {{> }}, поэтому вставленное сразу прогоняется через
   inlinePartials — блок может собираться из более мелких кусков. */
function partialReader(loaderContext, context) {
  return (folder, name) => {
    const file = path.join(PARTIALS_DIR, folder, `${name}.html`);

    loaderContext.addDependency(file);

    let content;

    try {
      content = fs.readFileSync(file, "utf8");
    } catch (error) {
      fail(
        context,
        `нет куска разметки ${folder}/${name}.html — блоку с type "${name}" нечем рисоваться\n  ${error.message}`,
      );
    }

    return inlinePartials(content, loaderContext, context);
  };
}

/* Тексты одного блока. Лежат в словаре под content["<id страницы>"].<id блока>,
   то есть по тому же принципу, что и meta страницы в pages.<id>.

   Отсутствующая ветка — не ошибка сама по себе: блок может быть и без единой
   строки текста. Ошибка вылезет там, где текст реально понадобился, — на
   конкретном {{ text.caption }}, и вместе с путём, куда его класть. */
function blockTextReader(dictionary, page, language) {
  const all = dictionary[CONTENT_KEY] || {};
  const own = all[page.id] || {};

  return (id) => ({
    value: own[id] || {},
    path: `content["${page.id}"].${id} в src/locales/${language.code}.json`,
  });
}

/* Пункты навигации по кейсу. Собираются на сборке, а не в браузере: иначе
   меню появлялось бы рывком после загрузки чанка, а до него страница стояла
   бы без него. Здесь же оно попадает прямо в исходник страницы.

   В навигацию идут блоки, у которых в словаре есть title — то есть ровно те,
   что рисуют <h3>. Цитаты и картинки заголовка не имеют и не попадают сюда
   сами собой, без списка исключений. Заводя новый тип блока, помните: назвал
   заголовок title — блок появится в меню.

   Первый пункт помечен активным прямо в разметке. Так меню осмысленно и без
   JS, и в те миллисекунды, пока чанк ещё не выполнился. */
function collectHeadings(data, blockText) {
  if (!data || !Array.isArray(data.blocks)) return [];

  return data.blocks
    .map((block) => ({ id: block.id, title: blockText(block.id).value.title }))
    .filter((item) => item.title)
    .map((item, index) => ({
      ...item,
      // Строками, а не булевым: значения уходят прямо в атрибуты.
      className: index === 0 ? "active" : "",
      ariaCurrent: index === 0 ? "true" : "false",
    }));
}

/* Данные страницы: порядок и состав блоков. Путь к файлу указан в config.js
   и считается от корня проекта. */
function loadData(loaderContext, page, context) {
  if (!page.data) return null;

  const file = path.resolve(__dirname, "../..", page.data);

  loaderContext.addDependency(file);

  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fail(context, `не читаются данные страницы ${file}\n  ${error.message}`);
  }
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

  const context = { template: page.template, language: language.code };
  const template = inlinePartials(source, this, context);

  const dictionary = loadDictionary(this, language, page.template);
  const pageMeta = (dictionary.pages && dictionary.pages[page.id]) || {};

  // Два крючка для движка: где брать куски разметки блоков и где их тексты.
  // Сам render.js в файловую систему не ходит и устройства словаря не знает.
  context.loadPartial = partialReader(this, context);
  context.blockText = blockTextReader(dictionary, page, language);

  const data = loadData(this, page, context);

  const scope = {
    ...dictionary,
    site: buildSite(page, language),
    page: {
      id: page.id,
      ...pageMeta,
      headings: collectHeadings(data, context.blockText),
    },
    data,
  };

  return render(template, [scope], context);
};
