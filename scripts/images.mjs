/* ==========================================================================
 * Производные картинок: из одного мастера — avif и webp в двух плотностях.
 *
 *     npm run images
 *
 * Мастера лежат в src/images/**, производные — в src/images/derived/** с тем
 * же относительным путём и суффиксом плотности:
 *
 *     src/images/webposter/filters.png
 *       → src/images/derived/webposter/filters@1x.avif
 *       → src/images/derived/webposter/filters@2x.avif
 *       → src/images/derived/webposter/filters@1x.webp
 *       → src/images/derived/webposter/filters@2x.webp
 *
 * Третьего, «обычного», формата нет, и мастер наружу не отдаётся вовсе.
 *
 * Запасным вариантом работает webp, и этого достаточно: вёрстка держится на
 * aspect-ratio (Safari 15, 2021), а webp появился в Safari 14 — браузера,
 * который верно нарисует страницу, но не покажет webp, не существует. avif
 * моложе (Safari 16.4), поэтому он идёт первым <source>, а не единственным.
 *
 * Отдавать наружу мастер смысла нет: это 1,7 МБ на скриншот, которые никто
 * не скачает.
 *
 * --------------------------------------------------------------------------
 * ПОЧЕМУ ОТДЕЛЬНЫЙ СКРИПТ, А НЕ ПЛАГИН СБОРКИ
 *
 * Картинки меняются редко, а npm run build гоняется постоянно. Плагин
 * пережимал бы всё при каждой сборке; скрипт сравнивает время изменения и
 * пропускает то, что уже сделано, поэтому в prebuild он стоит почти
 * бесплатно — один stat на файл.
 *
 * --------------------------------------------------------------------------
 * КАКОЙ РАЗМЕР СЧИТАЕТСЯ 1x
 *
 * Ширину слота знает вёрстка, а не картинка: в кейсе это 756px (см.
 * A_CaseImage.css и W_CaseLayout.css). Поэтому 1x — не «как отдали», а
 * ширина слота; 2x — вдвое больше. Мастер шириной меньше 2x не растягивается:
 * апскейл не добавляет деталей, только вес.
 *
 * Слот указывается в SLOTS по префиксу пути. Новая папка без правила берёт
 * DEFAULT_SLOT — ширину картинки в кейсе.
 * ========================================================================== */

import { createRequire } from "node:module";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const SELF = import.meta.filename;
const ROOT = path.resolve(import.meta.dirname, "..");
const MASTERS = path.join(ROOT, "src/images");
const DERIVED = path.join(MASTERS, "derived");

/* Какие мастера обрабатываем. svg не растровый, ico — иконка браузера.

   webp здесь тоже мастер — не потому, что это хороший исходник (из уже
   пожатого webp получится avif похуже, чем из png), а потому, что один
   такой файл в проекте уже лежит. Появится png-оригинал — webp-мастер
   можно убрать. */
const RASTER = /\.(png|jpe?g|webp)$/i;

/* Папки, которые мастерами не являются.

   derived — выход самого скрипта.
   icons   — svg, растрить нечего.
   sprites — man.png, спрайт-лист: его режет CSS по координатам, и любое
             изменение размера сдвинет кадры. */
const SKIP = new Set(["derived", "icons", "sprites"]);

/* Ширина слота в вёрстке, 1x. Правила проверяются по порядку, первое
   совпадение по началу пути (относительно src/images) побеждает. */
const SLOTS = [
  // Портрет в цитате: 40px кругом, см. M_Cite.css.
  { match: /(^|\/)(zakhar|anna)\.(png|jpe?g)$/i, width: 40 },
  // me.png стоит в двух местах сразу — в цитате (40px) и в профиле на
  // главной (100px, Q_ProfileImage.css). Берём больший слот: одна картинка,
  // один файл, и лишнего веса тут всё равно пара килобайт.
  { match: /^me\.(png|jpe?g)$/i, width: 100 },
  // Обложки проектов на главной и обложка кейса — те же 756px по ширине.
  { match: /^coverPreview|^veranda|^webposter(_cover)?/i, width: 756 },
  // Фотографии в блоке «о себе»: 684px по макету.
  { match: /^me-about-/i, width: 684 },
];
const DEFAULT_SLOT = 756;

const DENSITIES = [1, 2];

/* Качество подобрано на скриншотах интерфейса — на них артефакты видно
   раньше всего, мелкий текст идёт первым. Для фотографий это с запасом. */
const ENCODERS = {
  avif: (img) => img.avif({ quality: 55, effort: 6 }),
  webp: (img) => img.webp({ quality: 80, effort: 5 }),
};


function slotWidth(relative) {
  const rule = SLOTS.find((s) => s.match.test(relative));
  return rule ? rule.width : DEFAULT_SLOT;
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      out.push(...(await walk(path.join(dir, entry.name))));
    } else if (RASTER.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/* Производная устарела, если её нет, если мастер новее — или если новее сам
   скрипт.
 *
   Последнее важнее, чем кажется. Размер слота, качество и набор форматов
   заданы здесь, в коде, а не в мастере. Поменяв слот, мастер мы не трогаем —
   и без этой проверки старая производная живёт дальше как актуальная.
   Именно так портрет на главной остался 80px после того, как его слот
   подняли со 40 до 100: файл был «не устаревшим», потому что me.png не
   менялся с весны. */
async function isStale(master, derivative) {
  try {
    const [m, d] = await Promise.all([stat(master), stat(derivative)]);
    return Math.max(m.mtimeMs, await selfMtime()) > d.mtimeMs;
  } catch {
    return true;
  }
}

let selfMtimeCache = null;
async function selfMtime() {
  if (selfMtimeCache === null) {
    selfMtimeCache = (await stat(SELF)).mtimeMs;
  }
  return selfMtimeCache;
}

/* Удалить из derived всё, чему больше не соответствует мастер.
 *
   Без этого переименованный или удалённый мастер оставляет за собой
   производные навсегда. Хуже того, разметка продолжала бы находить их по
   старому пути, и опечатка в имени не всплыла бы до чистой сборки. */
async function removeOrphans(expected) {
  const keep = new Set(expected);
  let removed = 0;

  async function sweep(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await sweep(full);
        continue;
      }
      // README лежит здесь намеренно — он часть выдачи, а не сирота.
      if (entry.name === "README.md") continue;
      if (keep.has(full)) continue;
      await rm(full, { force: true });
      removed += 1;
    }
  }

  await sweep(DERIVED);
  if (removed > 0) console.log(`Удалено производных без мастера: ${removed}\n`);
}

async function main() {
  const masters = await walk(MASTERS);
  const report = [];
  const expected = [];
  let made = 0;
  let skipped = 0;

  for (const master of masters) {
    const relative = path.relative(MASTERS, master);
    const base = relative.replace(RASTER, "");
    const slot = slotWidth(relative);
    const source = sharp(master);
    const { width: naturalWidth } = await source.metadata();
    const masterBytes = (await stat(master)).size;
    let derivedBytes = 0;
    let variants = 0;

    for (const density of DENSITIES) {
      // Апскейла нет: если мастер уже меньше нужного, берём как есть.
      const target = Math.min(slot * density, naturalWidth);

      for (const [format, encode] of Object.entries(ENCODERS)) {
        const out = path.join(DERIVED, `${base}@${density}x.${format}`);
        expected.push(out);

        if (!(await isStale(master, out))) {
          derivedBytes += (await stat(out)).size;
          variants += 1;
          skipped += 1;
          continue;
        }

        await mkdir(path.dirname(out), { recursive: true });
        const info = await encode(
          sharp(master).resize({ width: target, withoutEnlargement: true }),
        ).toFile(out);
        derivedBytes += info.size;
        variants += 1;
        made += 1;
      }
    }

    report.push({ relative, slot, naturalWidth, masterBytes, derivedBytes, variants });
  }

  await removeOrphans(expected);

  // Памятка рядом с производными: папка собирается скриптом, править в ней
  // нечего. Без этого первый, кто её откроет, решит, что это исходники.
  await mkdir(DERIVED, { recursive: true });
  await writeFile(
    path.join(DERIVED, "README.md"),
    [
      "# Не редактировать",
      "",
      "Папка собирается скриптом `npm run images` из мастеров в `src/images/**`.",
      "Любая правка здесь потеряется при следующем прогоне — менять нужно мастер.",
      "",
      "Как это работает и откуда берутся размеры — в `scripts/images.mjs`.",
      "",
    ].join("\n"),
  );

  const kb = (n) => `${Math.round(n / 1024)} КБ`;
  const totalMaster = report.reduce((s, r) => s + r.masterBytes, 0);
  const totalDerived = report.reduce((s, r) => s + r.derivedBytes, 0);

  console.log(`Мастеров: ${report.length}, сделано: ${made}, пропущено: ${skipped}\n`);
  for (const r of report.sort((a, b) => b.masterBytes - a.masterBytes)) {
    const perVariant = Math.round(r.derivedBytes / r.variants);
    console.log(
      `  ${r.relative.padEnd(34)} ${String(r.naturalWidth).padStart(5)}px  ` +
        `мастер ${kb(r.masterBytes).padStart(8)}  →  ~${kb(perVariant)} на вариант (слот ${r.slot}px)`,
    );
  }
  console.log(
    `\nМастера: ${kb(totalMaster)}. Все производные вместе: ${kb(totalDerived)}.`,
  );
}

main().catch((error) => {
  console.error(`[images] ${error.message}`);
  process.exit(1);
});
