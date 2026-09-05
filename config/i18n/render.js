/* ==========================================================================
 * i18n/render.js — подстановка строк из словаря в шаблон страницы.
 *
 * Маленький движок на три конструкции. Больше в нём намеренно ничего нет:
 * шаблон не должен уметь логику — если нужен другой текст, это другой ключ.
 *
 *   {{ hero.status }}      текст из словаря, экранированный (обычный случай)
 *   {{{ hero.note }}}      строка вставляется как есть — только для тех редких
 *                          фраз, внутри которых реально нужна разметка
 *   {{#each site.languages}} … {{/each}}
 *                          повтор куска разметки по массиву; внутри блока
 *                          ключи ищутся сначала в элементе, потом снаружи
 *   {{#blocks data.blocks from case}}
 *                          сборка страницы из блоков: движок идёт по массиву
 *                          и для каждого элемента подставляет кусок разметки
 *                          partials/<папка>/<type>.html. Закрывающего тега
 *                          нет — тело приходит из файла, а не из шаблона
 *
 * Ключа нет в словаре — сборка падает с указанием файла, языка и ключа.
 * Это осознанно: лучше сломанный билд, чем выложенная страница со словом
 * undefined в заголовке.
 * ========================================================================== */

const VALUE_RAW = /\{\{\{\s*([\w.]+)\s*\}\}\}/g;
const VALUE_ESCAPED = /\{\{\s*([\w.]+)\s*\}\}/g;
const BLOCK_TOKEN = /\{\{#each\s+([\w.]+)\s*\}\}|\{\{\/each\s*\}\}/g;

/* {{#blocks data.blocks from case}} — что перебираем и в какой папке лежат
   куски разметки. Папка пишется в шаблоне, а не зашита в движок: у статей
   когда-нибудь будет свой набор блоков, а движок останется тем же. */
const BLOCK_LIST = /\{\{#blocks\s+([\w.]+)\s+from\s+([\w-]+)\s*\}\}/g;

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char]);
}

// Уникальный маркер «ключ не найден»: сам undefined в словаре быть не может,
// а вот пустая строка — вполне законное значение (непереведённый пункт).
const MISSING = Symbol("missing");

/* Поиск ключа по цепочке областей видимости — от самой внутренней наружу.
   Внутри {{#each}} это сначала текущий элемент массива, затем корень словаря. */
function lookup(scopes, keyPath) {
  const parts = keyPath.split(".");

  for (let i = scopes.length - 1; i >= 0; i -= 1) {
    let value = scopes[i];
    let found = true;

    for (const part of parts) {
      if (value !== null && typeof value === "object" && part in value) {
        value = value[part];
      } else {
        found = false;
        break;
      }
    }

    if (found) return value;
  }

  return MISSING;
}

function fail(context, message) {
  // Внутри блока к обычным двум строкам добавляется третья — где в словаре
  // движок искал тексты этого блока. Без неё сообщение «ключ text.title не
  // найден» верно, но бесполезно: ключей text.title на сайте будет много.
  const hint = context.hint ? `\n  тексты: ${context.hint}` : "";

  throw new Error(
    `[i18n] ${message}\n  шаблон: ${context.template}\n  язык:   ${context.language}${hint}`,
  );
}

function resolveValue(scopes, keyPath, context) {
  const value = lookup(scopes, keyPath);

  if (value === MISSING) {
    fail(context, `ключ "${keyPath}" не найден в словаре`);
  }

  if (value === null || typeof value === "object") {
    fail(
      context,
      `ключ "${keyPath}" указывает на ${Array.isArray(value) ? "массив" : "объект"}, а в разметку нужна строка`,
    );
  }

  return value;
}

/* Подстановка одиночных значений. Тройные скобки обрабатываются первыми,
   иначе двойные съели бы их внутренние скобки.

   Список блоков разворачивается последним: подставленная разметка приходит
   из другого файла и уже отрендерена в своей области видимости — второй раз
   её просматривать нельзя. Порядок и обеспечивает, что не будет: replace
   не перечитывает то, что сам же вставил. */
function renderValues(source, scopes, context) {
  const values = source
    .replace(VALUE_RAW, (_, keyPath) =>
      String(resolveValue(scopes, keyPath, context)),
    )
    .replace(VALUE_ESCAPED, (_, keyPath) =>
      escapeHtml(resolveValue(scopes, keyPath, context)),
    );

  return renderBlockList(values, scopes, context);
}

/* --------------------------------------------------------------------------
 * БЛОКИ
 *
 * Страница кейса — это массив блоков в src/content, а не разметка. Движок
 * идёт по массиву и для каждого элемента берёт свой кусок разметки по полю
 * type. Порядок и количество блоков живут в данных, вид блока — в партиале,
 * тексты — в словаре. Ни одно из трёх не знает про два других.
 *
 * Блок обязан иметь два поля:
 *
 *   type   какой кусок разметки подставить (partials/<папка>/<type>.html)
 *   id     под каким ключом лежат его тексты в словаре
 *
 * Внутри куска доступны поля самого блока ({{ image }}, {{ width }}),
 * его тексты ({{ text.caption }}) и всё, что снаружи ({{ site.root }}).
 * -------------------------------------------------------------------------- */

function renderBlockList(source, scopes, context) {
  return source.replace(BLOCK_LIST, (_, keyPath, folder) => {
    const items = lookup(scopes, keyPath);

    if (!Array.isArray(items)) {
      fail(
        context,
        `{{#blocks ${keyPath}}} ожидает массив, а получил ${items === MISSING ? "ничего" : typeof items}`,
      );
    }

    return items
      .map((item, index) =>
        renderBlock(item, `${keyPath}[${index}]`, folder, scopes, context),
      )
      .join("");
  });
}

function renderBlock(item, at, folder, scopes, context) {
  if (item === null || typeof item !== "object" || Array.isArray(item)) {
    fail(context, `${at} — не объект: блок описывается полями type и id`);
  }

  if (!item.type) {
    fail(context, `у блока ${at} нет "type" — нечем выбрать кусок разметки`);
  }

  if (!item.id) {
    fail(context, `у блока ${at} нет "id" — нечем найти тексты в словаре`);
  }

  // Кусок разметки и тексты приносит загрузчик: движок не ходит в файловую
  // систему и не знает, как устроен словарь.
  const markup = context.loadPartial(folder, item.type);
  const text = context.blockText(item.id);

  // Свой контекст ошибок на каждый блок: в сообщении будет видно, какой это
  // был блок и куда в словарь смотреть, а не только имя страницы.
  const blockContext = {
    ...context,
    template: `${context.template} → блок "${item.id}" (${folder}/${item.type}.html)`,
    hint: text.path,
  };

  return render(markup, scopes.concat([{ ...item, text: text.value }]), blockContext);
}

/* Разбор {{#each}} … {{/each}} с учётом вложенности: ищем закрывающий тег,
   считая открывающие по дороге. */
function findBlockEnd(source, searchFrom, context) {
  BLOCK_TOKEN.lastIndex = searchFrom;
  let depth = 1;
  let token;

  while ((token = BLOCK_TOKEN.exec(source)) !== null) {
    const isOpening = token[1] !== undefined;
    depth += isOpening ? 1 : -1;

    if (depth === 0) {
      return { start: token.index, end: token.index + token[0].length };
    }
  }

  return fail(context, "у {{#each}} нет закрывающего {{/each}}");
}

function render(source, scopes, context) {
  BLOCK_TOKEN.lastIndex = 0;
  const opening = BLOCK_TOKEN.exec(source);

  if (opening === null) return renderValues(source, scopes, context);

  if (opening[1] === undefined) {
    return fail(context, "{{/each}} встретился раньше, чем {{#each}}");
  }

  const keyPath = opening[1];
  const bodyStart = opening.index + opening[0].length;
  const closing = findBlockEnd(source, bodyStart, context);

  const head = source.slice(0, opening.index);
  const body = source.slice(bodyStart, closing.start);
  const tail = source.slice(closing.end);

  const items = lookup(scopes, keyPath);

  if (!Array.isArray(items)) {
    fail(
      context,
      `{{#each ${keyPath}}} ожидает массив, а получил ${items === MISSING ? "ничего" : typeof items}`,
    );
  }

  const repeated = items
    .map((item) => render(body, scopes.concat([item]), context))
    .join("");

  return renderValues(head, scopes, context) + repeated + render(tail, scopes, context);
}

module.exports = { render, escapeHtml, fail };
