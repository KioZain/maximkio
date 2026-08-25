/* ==========================================================================
 * Список HtmlWebpackPlugin: страница × язык.
 *
 * Сами страницы и языки описаны в i18n/config.js — здесь только сборка
 * плагинов по этому списку.
 *
 * Запрос "?lang=…&page=…" в пути шаблона делает две вещи сразу: сообщает
 * i18n-загрузчику, какой словарь подставить, и разводит русскую и английскую
 * версию по разным модулям webpack (иначе вторая пришла бы из кэша первой).
 * ========================================================================== */

const HtmlWebpackPlugin = require("html-webpack-plugin");

const { PAGES, languagesFor, outputPath } = require("./i18n/config.js");

const htmlPages = PAGES.flatMap((page) =>
  languagesFor(page).map(
    (language) =>
      new HtmlWebpackPlugin({
        template: `${page.template}?lang=${language.code}&page=${page.id}`,
        filename: outputPath(page, language),
        chunks: page.chunks,
      }),
  ),
);

module.exports = htmlPages;
