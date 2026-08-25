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
 *
 * Ключа нет в словаре — сборка падает с указанием файла, языка и ключа.
 * Это осознанно: лучше сломанный билд, чем выложенная страница со словом
 * undefined в заголовке.
 * ========================================================================== */

const VALUE_RAW = /\{\{\{\s*([\w.]+)\s*\}\}\}/g;
const VALUE_ESCAPED = /\{\{\s*([\w.]+)\s*\}\}/g;
const BLOCK_TOKEN = /\{\{#each\s+([\w.]+)\s*\}\}|\{\{\/each\s*\}\}/g;

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
  throw new Error(
    `[i18n] ${message}\n  шаблон: ${context.template}\n  язык:   ${context.language}`,
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
   иначе двойные съели бы их внутренние скобки. */
function renderValues(source, scopes, context) {
  return source
    .replace(VALUE_RAW, (_, keyPath) =>
      String(resolveValue(scopes, keyPath, context)),
    )
    .replace(VALUE_ESCAPED, (_, keyPath) =>
      escapeHtml(resolveValue(scopes, keyPath, context)),
    );
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

module.exports = { render, escapeHtml };
