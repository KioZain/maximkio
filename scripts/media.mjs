/* ==========================================================================
 * Ролики: из мастера — mp4, webm и кадр-заглушка.
 *
 *     npm run media
 *
 * Мастера лежат в src/media/**, производные — в src/media/derived/** с тем же
 * относительным путём:
 *
 *     src/media/webposter/drag.gif
 *       → src/media/derived/webposter/drag.mp4
 *       → src/media/derived/webposter/drag.webm
 *       → src/media/derived/webposter/drag-poster.webp
 *
 * Разметка берёт их все три, см. src/partials/case/video.html.
 *
 * --------------------------------------------------------------------------
 * ЗАЧЕМ ГИФКЕ ВИДЕО
 *
 * GIF хранит кадры целиком и знает 256 цветов, поэтому весит в разы больше
 * того же куска видео. Перегнать уже готовую гифку в mp4 — не «улучшить
 * качество», этого никто не обещает, а снять лишний вес: картинка остаётся
 * той же, а килобайт становится на порядок меньше.
 *
 * Поэтому гифку в src/media класть можно и нужно: наружу она всё равно
 * уедет роликом.
 *
 * --------------------------------------------------------------------------
 * ПРОЗРАЧНОСТЬ
 *
 * У h264 альфа-канала нет. Прозрачную гифку браузер поверх страницы показал
 * бы с чёрной подложкой, поэтому прозрачность здесь сводится на белый — тот
 * же цвет, что у страницы (--background-body). Непрозрачные мастера через
 * эту ветку не идут вовсе.
 *
 * --------------------------------------------------------------------------
 * ЗВУК
 *
 * Снимается всегда (-an). Это замена гифке: ролик играется сам, а всё, что
 * играется само, обязано молчать — иначе браузер его просто не запустит.
 * Появится ролик, который смотрят со звуком, — это другой тип блока.
 * ========================================================================== */

import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const run = promisify(execFile);

/* Свой ffmpeg в зависимостях, чтобы сборка не зависела от того, что
   установлено на машине. Системный, если он есть, всё равно предпочтительнее:
   он новее и уже прогрет. */
const FFMPEG = process.env.FFMPEG || require("ffmpeg-static");

const SELF = import.meta.filename;
const ROOT = path.resolve(import.meta.dirname, "..");
const MASTERS = path.join(ROOT, "src/media");
const DERIVED = path.join(MASTERS, "derived");

const SOURCE = /\.(gif|mp4|mov|m4v)$/i;

/* Ширина слота под ролик — та же, что у картинки в кейсе (A_CaseImage.css),
   взятая в двойной плотности. Второго файла под обычный экран нет: у video
   нет srcset, выбирать браузеру не из чего. */
const MAX_WIDTH = 756 * 2;

/* Потолок частоты кадров. Это замены гифкам и записи экрана — движение в них
   либо рукотворное, либо интерфейсное, и выше 30 кадров глаз разницы не
   видит, а битрейт растёт на четверть. Источник с меньшей частотой не
   трогается: fps только снижает. */
const MAX_FPS = 30;

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name === "derived") continue;
      out.push(...(await walk(path.join(dir, entry.name))));
    } else if (SOURCE.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/* Что за мастер пришёл.
 *
   Гифку разбирает sharp — он читает её целиком и сразу говорит про
   прозрачность. Видео он не открывает вовсе, поэтому mp4 и mov разбираются
   ffmpeg: запуск без выходного файла заканчивается ошибкой, но нужные
   строки о потоке он к этому моменту уже напечатал.

   Альфа-канала у mp4 и mov в реальности не бывает — h264 его не хранит, —
   поэтому для них ветка с белой подложкой даже не проверяется. */
async function probe(master) {
  if (/\.gif$/i.test(master)) {
    const { width, height, hasAlpha, pages } = await sharp(master).metadata();
    return { width, height, hasAlpha, pages };
  }

  let output = "";
  try {
    await run(FFMPEG, ["-hide_banner", "-i", master]);
  } catch (error) {
    output = error.stderr || "";
  }
  // Сначала нужная строка, потом размер в ней. Одной регуляркой по всему
  // выводу делать нельзя: «.*?» перед размером уводит движок в перебор на
  // каждой строке, и на длинном выводе это кончается переполнением стека.
  const stream = output
    .split("\n")
    .find((line) => /Stream #\d+:\d+/.test(line) && /Video:/.test(line));
  const size = stream ? stream.match(/\b(\d{2,5})x(\d{2,5})\b/) : null;

  return {
    width: size ? Number(size[1]) : null,
    height: size ? Number(size[2]) : null,
    hasAlpha: false,
    pages: null,
  };
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

/* Цепочка фильтров. Ширина ограничивается сверху, но не растягивается, а
   высота считается с -2: h264 требует чётных сторон, и -2 как раз округляет
   до чётного, сохраняя пропорцию. */
function filters({ width, height, hasAlpha }) {
  const chain = `fps='min(${MAX_FPS},source_fps)',scale='min(${MAX_WIDTH},iw)':-2:flags=lanczos`;
  if (!hasAlpha) return ["-vf", `${chain},format=yuv420p`];

  return [
    "-filter_complex",
    `color=white:s=${width}x${height}[bg];` +
      `[bg][0:v]overlay=shortest=1,${chain},format=yuv420p[out]`,
    "-map",
    "[out]",
  ];
}

// crf 26, а не 23: у h264 на том же качестве файл выходил крупнее webm, а
// mp4 здесь — запасной путь для старых Safari, ему хватает.
const MP4 = ["-c:v", "libx264", "-crf", "26", "-preset", "slow", "-movflags", "+faststart"];
/* VP9 с crf и -b:v 0 — режим постоянного качества; без нуля битрейт
   ограничивает crf сверху и ролик выходит мылом.

   36 подобрано на скринкасте каталога: на 34 файл тяжелее на 14%, а разницы
   в кадре при покадровом сравнении не видно. Ниже 34 смысла нет, выше 38 на
   мелком тексте появляется замыливание. */
const WEBM = ["-c:v", "libvpx-vp9", "-crf", "36", "-b:v", "0", "-row-mt", "1"];

async function encode(master, out, codec, info) {
  await mkdir(path.dirname(out), { recursive: true });
  await run(FFMPEG, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", master,
    ...filters(info),
    ...codec,
    "-an",
    out,
  ]);
  return (await stat(out)).size;
}

/* Кадр-заглушка: его видно, пока ролик не начался, и он же остаётся
   единственным изображением, если автозапуск не сработал. Берётся первый
   кадр — не «красивый», а тот, с которого начнётся движение, иначе подмена
   кадра на старте читается как рывок. */
async function poster(master, out) {
  await mkdir(path.dirname(out), { recursive: true });

  // Кадр вынимается во временную папку системы, а не рядом с производными:
  // упади скрипт на середине — в выдаче не останется мусора, который потом
  // поедет в сборку.
  const scratch = await mkdtemp(path.join(tmpdir(), "media-poster-"));
  try {
    const raw = path.join(scratch, "frame.png");
    await run(FFMPEG, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", master, "-frames:v", "1", raw,
    ]);
    const info = await sharp(raw)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 80, effort: 5 })
      .toFile(out);
    return info.size;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/* Удалить из derived всё, чему больше не соответствует мастер — та же
   причина, что и в scripts/images.mjs: иначе удалённый ролик оставляет за
   собой mp4, webm и постер навсегда. */
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
  const expected = [];

  if (masters.length === 0) {
    console.log("В src/media нет роликов — нечего собирать.");
    return;
  }

  const kb = (n) => `${Math.round(n / 1024)} КБ`;
  let totalMaster = 0;
  let totalDerived = 0;

  for (const master of masters) {
    const relative = path.relative(MASTERS, master);
    const base = relative.replace(SOURCE, "");
    const { width, height, hasAlpha, pages } = await probe(master);
    const masterBytes = (await stat(master)).size;
    totalMaster += masterBytes;

    const targets = [
      [path.join(DERIVED, `${base}.mp4`), MP4],
      [path.join(DERIVED, `${base}.webm`), WEBM],
    ];

    const sizes = {};
    expected.push(...targets.map(([out]) => out));
    for (const [out, codec] of targets) {
      sizes[path.extname(out)] = (await isStale(master, out))
        ? await encode(master, out, codec, { width, height, hasAlpha })
        : (await stat(out)).size;
    }

    const posterOut = path.join(DERIVED, `${base}-poster.webp`);
    expected.push(posterOut);
    sizes.poster = (await isStale(master, posterOut))
      ? await poster(master, posterOut)
      : (await stat(posterOut)).size;

    /* Считаем не сумму файлов, а то, что скачает один человек: один ролик и
       кадр-заглушку. Берётся webm, а не меньший из двух: в разметке он стоит
       первым, и браузер останавливается на первом, который умеет. Если mp4
       вдруг окажется легче — это повод крутить crf, а не радоваться цифре. */
    const delivered = sizes[".webm"] + sizes.poster;
    totalDerived += delivered;

    const frames = pages ? `, ${pages} кадров` : "";
    const size = width ? `${width}x${height}` : "размер не определён";
    console.log(
      `  ${relative.padEnd(30)} ${size}${frames}\n` +
        `  ${"".padEnd(30)} мастер ${kb(masterBytes)} → ` +
        `${kb(delivered)} на посетителя ` +
        `(webm ${kb(sizes[".webm"])}, mp4 ${kb(sizes[".mp4"])}, постер ${kb(sizes.poster)})` +
        (hasAlpha ? "\n" + "".padEnd(32) + "прозрачность сведена на белый" : ""),
    );
  }

  await removeOrphans(expected);

  console.log(`\nМастера: ${kb(totalMaster)}. К загрузке: ${kb(totalDerived)}.`);
}

main().catch((error) => {
  console.error(`[media] ${error.stderr || error.message}`);
  process.exit(1);
});
