/* ==========================================================================
 * branchCanvas — пучок веточек с шариками, качающийся от ветра, на <canvas>.
 *
 *     import { createBranchCanvas } from "./utils/branchCanvas.js";
 *     const scene = createBranchCanvas(host, settings);
 *     scene.destroy(); // убрать холст и остановить цикл
 *
 * Холст вставляется в начало host и занимает его целиком; размер берётся из
 * host. Значения подбираются в лаборатории (npm start → /lab/…).
 *
 * Откуда это: порт скетча на p5. Веточки выходят из одной точки (пучка) за
 * пределами холста, шарики привязаны к веткам и качаются вместе с ними.
 * Геометрия детерминирована от сида, анимация — поворот вокруг пучка, тем
 * сильнее, чем ближе к кончику ветки.
 *
 * Чем отличается от скетча:
 *   - без p5: чистый Canvas 2D, свой генератор случайных чисел с сидом,
 *     свой шум и нормальное распределение;
 *   - веточка рисуется одним путём (при утончении — несколькими по группам
 *     толщины), а не отдельным line() на каждый сегмент;
 *   - точки веток лежат в типизированных массивах, цвета шариков посчитаны
 *     в rgb заранее — в кадре остаётся только повернуть и нарисовать;
 *   - то, что ушло за края холста, не рисуется;
 *   - анимация считается от времени, а не от номера кадра: на 120 Гц ветер
 *     не дует вдвое быстрее;
 *   - цикл крутится, только пока холст на экране и вкладка открыта;
 *   - при prefers-reduced-motion рисуется один неподвижный кадр.
 * ========================================================================== */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

// Эталонный размер холста, к которому привязаны размеры в пикселях
// (толщина линии, разброс шариков) — как REF в скетче.
const REF = 700;

// Сегменты рисуются группами по толщине: при утончении одна пачка — один
// stroke() вместо stroke() на каждый сегмент.
const TAPER_STEPS = 8;

/* --------------------------------------------------------------------------
 * Ветра: один механизм, пять характеров
 * -------------------------------------------------------------------------- */

export const WIND_PRESETS = [
  {
    label: "1 · Бриз",
    rate: 0.5, ampDeg: 2.8, tFreq: 0.75, freqSpread: 0.35, spatial: 1.6,
    phaseMix: 0.25, wave: 0, gust: null, grow: 0,
    baseDeg: 1.2, baseFreq: 0.12,
    dotOrbit: 1.6, dotBreath: 0.03, dotSpeed: 0.7,
  },
  {
    label: "2 · Порывы",
    rate: 1, ampDeg: 6.5, tFreq: 1.6, freqSpread: 0.5, spatial: 2.6,
    phaseMix: 0.6, wave: 0, gust: { period: 6.5, sharp: 6, floor: 0.12 }, grow: 0.05,
    baseDeg: 2.5, baseFreq: 0.22,
    dotOrbit: 3, dotBreath: 0.06, dotSpeed: 1.4,
  },
  {
    label: "3 · Шторм",
    rate: 1.7, ampDeg: 9, tFreq: 2.4, freqSpread: 1, spatial: 3.4,
    phaseMix: 1, wave: 0, gust: { period: 3.2, sharp: 2, floor: 0.45 }, grow: 0.04,
    baseDeg: 4, baseFreq: 0.5,
    dotOrbit: 5, dotBreath: 0.1, dotSpeed: 2.2,
  },
  {
    label: "4 · Волна",
    rate: 0.9, ampDeg: 5, tFreq: 1.1, freqSpread: 0, spatial: 1.2,
    phaseMix: 0, wave: 1.05, gust: null, grow: 0,
    baseDeg: 0, baseFreq: 0,
    dotOrbit: 2, dotBreath: 0.05, dotSpeed: 1,
  },
  {
    label: "5 · Течение",
    rate: 0.22, ampDeg: 7, tFreq: 0.6, freqSpread: 0.25, spatial: 0.9,
    phaseMix: 0.5, wave: 0, gust: null, grow: 0.12,
    baseDeg: 7, baseFreq: 0.45,
    dotOrbit: 2.5, dotBreath: 0.04, dotSpeed: 0.5,
  },
];

/* --------------------------------------------------------------------------
 * Случайность с сидом
 * -------------------------------------------------------------------------- */

function hashSeed(value) {
  const str = String(value);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

// mulberry32 вместо random() из p5: тот же сид — то же дерево.
function createRandom(seed) {
  let a = seed >>> 0;
  return (min = 0, max = 1) => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    const unit = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return min + unit * (max - min);
  };
}

// Нормальное распределение (Box–Muller) вместо randomGaussian().
function createGaussian(random) {
  return (mean, deviation) => {
    const u = Math.max(1e-9, random());
    const v = random();
    return mean + Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v) * deviation;
  };
}

// Шум вместо noise(): значение в узлах решётки плюс сглаживание. Рисунок
// дрожания отличается от перлина p5, но характер тот же.
function createNoise(seed) {
  const value = (ix, iy) => {
    let h = (seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);

  return (x, y) => {
    let amplitude = 0.5;
    let total = 0;
    let sum = 0;
    for (let octave = 0; octave < 3; octave++) {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = smooth(x - ix);
      const fy = smooth(y - iy);
      const top = value(ix, iy) + (value(ix + 1, iy) - value(ix, iy)) * fx;
      const bottom =
        value(ix, iy + 1) + (value(ix + 1, iy + 1) - value(ix, iy + 1)) * fx;
      total += (top + (bottom - top) * fy) * amplitude;
      sum += amplitude;
      amplitude *= 0.5;
      x *= 2;
      y *= 2;
    }
    return total / sum;
  };
}

/* --------------------------------------------------------------------------
 * Цвет
 * -------------------------------------------------------------------------- */

// HSB как в скетче (0–360, 0–100, 0–100) → строка rgb() для canvas.
function hsbToCss(h, s, b, alpha) {
  const hue = (((h % 360) + 360) % 360) / 60;
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const bri = Math.min(100, Math.max(0, b)) / 100;
  const c = bri * sat;
  const x = c * (1 - Math.abs((hue % 2) - 1));
  const m = bri - c;
  const table = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x],
  ];
  const [r, g, bl] = table[Math.floor(hue) % 6];
  const channel = (v) => Math.round((v + m) * 255);
  return `rgba(${channel(r)}, ${channel(g)}, ${channel(bl)}, ${alpha / 100})`;
}

/* --------------------------------------------------------------------------
 * Настройки для текущей ширины
 * -------------------------------------------------------------------------- */

// Узкий баннер (мобильный) собирается по своей композиции: там другие
// пропорции, и пучок приходится ставить иначе.
export function layoutFor(settings, width) {
  return width <= settings.narrow.maxWidth ? settings.narrow : settings.layout;
}

/* --------------------------------------------------------------------------
 * Геометрия: считается один раз на размер холста
 * -------------------------------------------------------------------------- */

function buildScene(settings, width, height) {
  const seed = hashSeed(settings.seed);
  const random = createRandom(seed);
  const gaussian = createGaussian(random);
  const noise = createNoise(seed ^ 0x9e3779b9);

  const view = layoutFor(settings, width);
  const shape = settings.shape;
  const steps = Math.max(8, Math.round(settings.steps));

  const sc = (Math.sqrt(width * height) / REF) * view.contentScale;
  const ox = view.originX * width;
  const oy = view.originY * height;
  const diag = Math.hypot(width, height);

  const base = view.baseAngle * DEG;
  const half = (view.spread * DEG) / 2;
  const count = Math.max(1, Math.round(view.branchCount));

  const branches = [];
  for (let i = 0; i < count; i++) {
    const t = count > 1 ? i / (count - 1) : 0.5;
    const start =
      base +
      (-half + (half + half) * t) +
      random(-shape.angleJitter, shape.angleJitter) * DEG;
    const dir = random() < shape.curveBias ? 1 : -1;
    const turn = shape.curvature * DEG * dir * random(0.2, 1);
    const length = diag * random(shape.lenMin, shape.lenMax);
    const gap = diag * random(shape.gapMin, shape.gapMax);
    const nz = random(0, 1000);

    // Точки веточки: пары x, y начиная с пучка.
    const points = new Float32Array((steps + 1) * 2);
    points[0] = ox;
    points[1] = oy;
    let x = ox;
    let y = oy;
    const ds = length / steps;
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      const angle =
        start +
        turn * u ** 1.6 +
        (noise(nz, u * 1.8) - 0.5) * shape.wobble * 55 * DEG;
      x += Math.cos(angle) * ds;
      y += Math.sin(angle) * ds;
      points[s * 2] = x;
      points[s * 2 + 1] = y;
    }

    branches.push({
      points,
      index: i,
      gapU: Math.min(0.95, Math.max(0, gap / length)),
      phase: random(0, TAU),
      freq: random(0.7, 1.4),
      sway: random(0.6, 1.4),
    });
  }

  return {
    branches,
    dots: seedDots(settings, view, branches, { width, height, sc, steps, random, gaussian }),
    steps,
    sc,
    ox,
    oy,
  };
}

// Шарики сеются вдоль веточек: выбираем ветку, точку на ней и смещение по
// нормали. Так россыпь читается как «сорванная с веток».
function seedDots(settings, view, branches, ctxData) {
  const { width, height, sc, steps, random, gaussian } = ctxData;
  const cfg = settings.dots;
  const colors = settings.colors;
  const margin = cfg.margin * Math.min(width, height);
  const perp = cfg.perpSpread * sc;
  const dots = [];
  const total = Math.max(0, Math.round(view.dotCount));

  for (let i = 0; i < total; i++) {
    for (let attempt = 0; attempt < 90; attempt++) {
      const branch = branches[Math.floor(random(0, branches.length))];
      if (!branch) break;

      const u = cfg.alongMin + (1 - cfg.alongMin) * random() ** cfg.alongPow;
      const index = Math.min(steps - 1, Math.max(1, Math.round(u * steps)));
      const px = branch.points[index * 2];
      const py = branch.points[index * 2 + 1];

      // Нормаль к ветке в этой точке.
      const tx = branch.points[(index + 1) * 2] - branch.points[(index - 1) * 2];
      const ty =
        branch.points[(index + 1) * 2 + 1] - branch.points[(index - 1) * 2 + 1];
      const tl = Math.max(0.0001, Math.hypot(tx, ty));
      const nx = -ty / tl;
      const ny = tx / tl;

      const off = gaussian(0, 0.5) * perp;
      const r = (random(cfg.min, cfg.max) / 2) * sc;
      const x = px + nx * off;
      const y = py + ny * off;

      if (
        x < margin + r ||
        x > width - margin - r ||
        y < margin + r ||
        y > height - margin - r
      ) {
        continue;
      }

      let free = true;
      for (const dot of dots) {
        if (Math.hypot(x - dot.x, y - dot.y) < (r + dot.r) * cfg.spacing) {
          free = false;
          break;
        }
      }
      if (!free) continue;

      dots.push({
        x, y, r, u,
        branch: branch.index,
        color: pickColor(colors, random),
        phase: random(0, TAU),
        lag: random(),
      });
      break;
    }
  }
  return dots;
}

function pickColor(colors, random) {
  let hue;
  if (random(0, 100) < colors.accentAmount) {
    hue = colors.accentHue + random(-colors.accentSpan / 2, colors.accentSpan / 2);
  } else if (colors.hueSteps > 1) {
    const step = Math.floor(random(0, colors.hueSteps));
    hue = colors.hueStart + (step / (colors.hueSteps - 1)) * colors.hueSpan;
  } else {
    hue = colors.hueStart + random(0, colors.hueSpan);
  }
  const sat = colors.sat + random(-colors.satJitter, colors.satJitter);
  const bri = colors.bri + random(-colors.briJitter, colors.briJitter);
  return hsbToCss(hue, sat, bri, colors.alpha);
}

/* --------------------------------------------------------------------------
 * Анимация
 * -------------------------------------------------------------------------- */

function branchState(branch, t, wind, amp) {
  const gust = wind.gust;
  const env = gust
    ? gust.floor +
      (1 - gust.floor) *
        (0.5 + 0.5 * Math.sin((TAU * t) / gust.period + branch.phase * 0.15)) **
          gust.sharp
    : 1;

  const grow = wind.grow
    ? 1 - wind.grow + wind.grow * (0.5 + 0.5 * Math.sin(t * 0.5 + branch.phase))
    : 1;

  return {
    from: branch.gapU,
    to: branch.gapU + (1 - branch.gapU) * grow,
    rotA: wind.ampDeg * DEG * branch.sway * env * amp,
    rotP:
      t * wind.tFreq * (1 + (branch.freq - 1) * wind.freqSpread) +
      branch.phase * wind.phaseMix +
      branch.index * wind.wave,
    rotF: wind.spatial,
    rotBase:
      wind.baseDeg * DEG * Math.sin(t * wind.baseFreq + branch.phase * 0.1) * amp,
  };
}

// Поворот точки вокруг пучка: у кончика сильнее, чем у основания.
function warpAngle(state, u) {
  return (
    state.rotBase * (0.4 + 0.6 * u) +
    state.rotA * Math.sin(state.rotP + u * state.rotF) * u ** 1.2
  );
}

/* --------------------------------------------------------------------------
 * Отрисовка
 * -------------------------------------------------------------------------- */

function drawScene(ctx, scene, settings, t, wind, size) {
  const { width, height } = size;
  const { ox, oy, steps, sc } = scene;
  const amp = settings.amp;
  const margin = 60;

  if (settings.transparent) {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.fillStyle = settings.background;
    ctx.fillRect(0, 0, width, height);
  }

  const states = scene.branches.map((branch) =>
    branchState(branch, t, wind, amp),
  );

  // --- веточки ---
  const line = settings.line;
  const baseWidth = line.weight * sc;
  ctx.globalAlpha = line.alpha / 100;
  ctx.strokeStyle = line.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let b = 0; b < scene.branches.length; b++) {
    const branch = scene.branches[b];
    const state = states[b];
    const first = Math.max(1, Math.floor(Math.min(1, Math.max(0, state.from)) * steps));
    const last = Math.min(steps, Math.ceil(Math.min(1, Math.max(0, state.to)) * steps));
    if (last <= first) continue;

    // Без утончения вся веточка — один путь и один stroke(). С утончением
    // сегменты разложены по TAPER_STEPS пачкам толщины.
    const groups = line.taper > 0 ? TAPER_STEPS : 1;
    for (let g = 0; g < groups; g++) {
      const gFrom = first + Math.floor(((last - first) * g) / groups);
      const gTo = first + Math.ceil(((last - first) * (g + 1)) / groups);
      if (gTo <= gFrom) continue;

      const u = ((gFrom + gTo) / 2 / steps) * 1;
      ctx.lineWidth = Math.max(0.15, baseWidth * (1 - line.taper * u));
      ctx.beginPath();

      // pending — начат ли подпуть, drew — есть ли вообще что штриховать.
      // Разные флаги: веточка может уйти за край и вернуться, а закончиться
      // снова за краем — штриховать её всё равно нужно.
      let pending = false;
      let drew = false;
      let prevX = 0;
      let prevY = 0;
      let prevInside = false;
      for (let i = gFrom - 1; i <= gTo; i++) {
        const iu = i / steps;
        const angle = warpAngle(state, iu);
        const ca = Math.cos(angle);
        const sa = Math.sin(angle);
        const dx = branch.points[i * 2] - ox;
        const dy = branch.points[i * 2 + 1] - oy;
        const x = ox + dx * ca - dy * sa;
        const y = oy + dx * sa + dy * ca;
        const inside =
          x > -margin && x < width + margin && y > -margin && y < height + margin;

        if (i > gFrom - 1) {
          if (inside || prevInside) {
            if (!pending) {
              ctx.moveTo(prevX, prevY);
              pending = true;
            }
            ctx.lineTo(x, y);
            drew = true;
          } else {
            pending = false;
          }
        }
        prevX = x;
        prevY = y;
        prevInside = inside;
      }
      if (drew) ctx.stroke();
    }
  }

  // --- шарики ---
  ctx.globalAlpha = 1;
  const cfg = settings.dots;
  for (const dot of scene.dots) {
    const state = states[dot.branch];
    if (!state) continue;

    // То же качание, что и у ветки, но со своим весом и отставанием.
    const angle = warpAngle(
      {
        rotBase: state.rotBase * cfg.follow,
        rotA: state.rotA * cfg.follow,
        rotP: state.rotP - dot.lag * cfg.lag,
        rotF: state.rotF,
      },
      dot.u,
    );
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const dx = dot.x - ox;
    const dy = dot.y - oy;

    const breath = 1 + wind.dotBreath * Math.sin(t * wind.dotSpeed * 0.8 + dot.phase);
    const orbit = wind.dotOrbit * sc * amp;
    const x =
      ox + dx * ca - dy * sa + Math.cos(t * wind.dotSpeed + dot.phase) * orbit;
    const y =
      oy + dx * sa + dy * ca +
      Math.sin(t * wind.dotSpeed * 1.27 + dot.phase * 1.6) * orbit;

    const r = dot.r * breath;
    if (x < -r || x > width + r || y < -r || y > height + r) continue;

    ctx.fillStyle = dot.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* --------------------------------------------------------------------------
 * Холст в контейнере
 * -------------------------------------------------------------------------- */

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

export function createBranchCanvas(host, settings) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  // Размеры задаются здесь, а не в CSS компонента: холст растягивается по
  // контейнеру (у того должен быть position: relative) и не влияет на его
  // размер. В пикселях холст крупнее — по devicePixelRatio.
  canvas.style.cssText =
    "position:absolute;inset:0;display:block;width:100%;height:100%";
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // В начало контейнера: остальное содержимое (время, город) идёт в разметке
  // позже и поэтому лежит поверх рисунка.
  host.prepend(canvas);

  const wind = WIND_PRESETS[settings.preset] || WIND_PRESETS[0];

  let scene = null;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;

  let visible = false;
  let paused = false;
  let frameId = 0;
  let elapsed = 0;
  let lastTime = 0;

  function layout() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return false;

    pixelRatio = Math.min(window.devicePixelRatio || 1, settings.maxPixelRatio);
    canvas.width = Math.round(w * pixelRatio);
    canvas.height = Math.round(h * pixelRatio);
    width = w;
    height = h;
    scene = buildScene(settings, w, h);
    return true;
  }

  function render() {
    if (!scene) return;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    const t = elapsed * settings.speed * wind.rate;
    drawScene(ctx, scene, settings, t, wind, { width, height });
  }

  function frame(now) {
    frameId = requestAnimationFrame(frame);
    // Потолок на случай долгой паузы: не проматывать анимацию рывком.
    elapsed += Math.min(now - lastTime, 100) / 1000;
    lastTime = now;
    render();
  }

  function update() {
    const shouldRun =
      visible && !paused && !document.hidden && !reducedMotion.matches;
    if (shouldRun && !frameId) {
      lastTime = performance.now();
      frameId = requestAnimationFrame(frame);
    } else if (!shouldRun && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  // Первый кадр — сразу, не дожидаясь цикла: баннер не должен мелькать пустым.
  if (layout()) render();

  let intersection = null;
  if ("IntersectionObserver" in window) {
    intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    intersection.observe(host);
  } else {
    visible = true;
    update();
  }

  let resize = null;
  if ("ResizeObserver" in window) {
    resize = new ResizeObserver(() => {
      if (layout()) render();
    });
    resize.observe(host);
  }

  document.addEventListener("visibilitychange", update);
  reducedMotion.addEventListener("change", update);

  return {
    // Пауза нужна лаборатории, чтобы разглядеть композицию.
    setPaused(value) {
      paused = value;
      update();
    },
    destroy() {
      visible = false;
      update();
      intersection?.disconnect();
      resize?.disconnect();
      document.removeEventListener("visibilitychange", update);
      reducedMotion.removeEventListener("change", update);
      canvas.remove();
    },
  };
}
