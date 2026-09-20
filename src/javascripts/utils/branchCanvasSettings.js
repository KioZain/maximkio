/* ==========================================================================
 * Настройки пучка веточек для баннера.
 *
 * Здесь только значения, движок — в branchCanvas.js. Подбираются они не в
 * коде, а в лаборатории:
 *
 *     npm start → http://localhost:8080/lab/branch-canvas.html
 *
 * Лаборатория выгружает JSON той же формы, что и этот объект; значения
 * ниже — из такой выгрузки.
 * ========================================================================== */

export const BRANCH_CANVAS_SETTINGS = {
  // Сид. Одно и то же значение всегда даёт один и тот же пучок.
  seed: 7,

  // Номер пресета ветра, 0–4, см. WIND_PRESETS в branchCanvas.js.
  // 1 — «Порывы»: затишье, резкий порыв, снова затишье.
  preset: 1,
  // Общий темп и размах качания.
  speed: 0.7,
  amp: 1,

  // Сегментов в веточке. В скетче 170; для баннера высотой в сотню
  // пикселей столько не нужно, а считать их приходится каждый кадр.
  steps: 96,

  // Выше 2 разница не видна, а пикселей вчетверо больше.
  maxPixelRatio: 2,

  // transparent: true — холст не закрашивает фон, его задаёт CSS
  // контейнера (A_CanvasBeautiful). background тогда не используется,
  // но остаётся для быстрой проверки композиции на цветной подложке.
  background: "#00a3e0",
  transparent: true,

  line: {
    color: "#e5d7d7",
    // Толщина при эталонном холсте; на других размерах масштабируется.
    weight: 6.5,
    // Утончение к кончику: 0 — ровная линия.
    taper: 0,
    alpha: 45,
  },

  // Композиция в широком баннере (десктоп). Пучок стоит за краями холста,
  // поэтому originX/originY считаются долями ширины и высоты и спокойно
  // выходят за 0–1.
  layout: {
    contentScale: 1,
    originX: 1.05,
    originY: -0.02,
    baseAngle: 189,
    spread: 83,
    branchCount: 20,
    dotCount: 20,
  },

  // Композиция в узком баннере (мобильный): работает, когда баннер не шире
  // maxWidth. Остальные поля — как в layout.
  narrow: {
    maxWidth: 400,
    contentScale: 1.2,
    originX: 1.22,
    originY: -0.14,
    baseAngle: 165,
    spread: 95,
    branchCount: 18,
    dotCount: 24,
  },

  // Форма веточек — общая для обеих композиций.
  shape: {
    angleJitter: 5.5,
    curvature: 38,
    curveBias: 0.35,
    wobble: 0.45,
    lenMin: 0.45,
    lenMax: 1.3,
    gapMin: 0.02,
    gapMax: 0.55,
  },

  dots: {
    min: 20,
    max: 28,
    spacing: 1.6,
    perpSpread: 64,
    alongPow: 0.3,
    alongMin: 0.15,
    follow: 1.24,
    lag: 0.8,
    margin: 0.02,
  },

  colors: {
    hueStart: 50,
    hueSpan: 185,
    hueSteps: 7,
    sat: 74,
    satJitter: 35,
    bri: 100,
    briJitter: 0,
    alpha: 84,
    // Акцент выключен: доля 0.
    accentAmount: 0,
    accentHue: 325,
    accentSpan: 60,
  },
};

// Размеры баннера, на которых подбиралась композиция. Лаборатория берёт их
// как стартовые размеры превью; на сайте высоту задаёт соседняя аватарка.
export const BRANCH_CANVAS_PREVIEW = {
  desktop: { width: 720, height: 98 },
  mobile: { width: 343, height: 100 },
};
