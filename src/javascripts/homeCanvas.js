/* ==========================================================================
 * homeCanvas — пучок веточек в баннере на главной.
 *
 * Как пользоваться: в разметке достаточно контейнера,
 *
 *     <div class="A_CanvasBeautiful" id="home-canvas">…</div>
 *
 * чанк сам вставит в его начало <canvas>. Размер холста берётся из
 * контейнера, его вид (скругление, фон, max-height) — из
 * A_CanvasBeautiful.css. Контейнеру нужен position: relative — холст
 * растягивается по нему абсолютно и на размер блока не влияет.
 *
 * Сам эффект — utils/branchCanvas.js, значения — utils/branchCanvasSettings.js
 * (подобраны в лаборатории, см. комментарий там).
 * Без JS остаётся фон контейнера — пустая плашка, ничего не ломается.
 * ========================================================================== */

import { createBranchCanvas } from "./utils/branchCanvas.js";
import { BRANCH_CANVAS_SETTINGS } from "./utils/branchCanvasSettings.js";

const SELECTOR = "#home-canvas";

function init() {
  const host = document.querySelector(SELECTOR);
  if (host) createBranchCanvas(host, BRANCH_CANVAS_SETTINGS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
