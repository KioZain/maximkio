import { createMagneticField } from "./utils/magneticField";

/* ==========================================================================
 * TUNABLE PARAMETERS — всё, что имеет смысл крутить, живёт здесь.
 * Точечные переопределения делаются data-атрибутами прямо в разметке
 * (см. блок DATA-ATTRIBUTES ниже).
 * ========================================================================== */

const SETTINGS = {
  // Какие элементы становятся магнитными. Класс — единственный вход в эффект.
  selector: ".E_Magnetic",

  /* --- Сила и радиус ---------------------------------------------------- */

  // Какую долю расстояния до курсора элемент проходит навстречу.
  // 0.2 — едва заметный намёк, 0.35 — «как в референсе», 0.6 уже игрушка.
  strength: 0.35,

  // Радиус поля как множитель половины диагонали элемента. 1 — поле ровно
  // по размеру самого элемента, 1.6 — начинает тянуться заранее, при подлёте
  // курсора. Больше 2.5 соседние элементы начинают ловить курсор одновременно.
  radius: 1.6,

  // Жёсткий потолок смещения в px. Держит крупные блоки в рамках: без него
  // карточка с тем же strength уезжала бы гораздо дальше маленькой кнопки.
  max: 18,

  /* --- Характер движения ------------------------------------------------ */

  // "lerp"   — сухое, точное следование без перелёта (по умолчанию).
  // "spring" — с лёгкой пружиной на возврате, живее и заметнее.
  mode: "lerp",

  // Для mode: "lerp". Доля оставшегося расстояния за кадр.
  // 0.08 — вязко и «дорого», 0.15 — спокойный магнит, выше 0.3 — дёргано.
  ease: 0.15,

  // Для mode: "spring". stiffness — как резко тянет к цели,
  // damping — как быстро гасится перелёт (ниже 0.6 пружина почти не качается,
  // выше 0.85 начинает долго звенеть).
  stiffness: 0.14,
  damping: 0.72,

  // "both" | "x" | "y" — по каким осям разрешено движение.
  // Для элементов в плотной колонке полезно оставить только "x".
  axis: "both",

  /* --- Разное ----------------------------------------------------------- */

  // Следить за появлением новых .E_Magnetic в DOM. Нужно только если разметка
  // рисуется скриптами; иначе лишний MutationObserver на всю страницу.
  // Разовую догрузку дешевле сделать вручную: window.magnetic.scan(container).
  watchDOM: false,
};

/* ==========================================================================
 * DATA-ATTRIBUTES — переопределения на конкретном элементе:
 *
 *   data-magnetic-strength   data-magnetic-radius    data-magnetic-max
 *   data-magnetic-mode       data-magnetic-ease
 *   data-magnetic-stiffness  data-magnetic-damping   data-magnetic-axis
 *
 *   <a class="A_Button E_Magnetic" data-magnetic-strength="0.5"
 *      data-magnetic-mode="spring" href="">Резюме</a>
 * ========================================================================== */

// Эффект существует только для мыши/трекпада. На тач-устройствах курсора нет,
// а при prefers-reduced-motion лишнее движение противопоказано.
const finePointer = window.matchMedia("(pointer: fine)");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let field = null;
let domObserver = null;

function start() {
  if (field) return;

  field = createMagneticField(SETTINGS);
  field.scan();

  if (SETTINGS.watchDOM) {
    domObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches(SETTINGS.selector)) field.add(node);
          field.scan(node);
        });
        record.removedNodes.forEach((node) => {
          if (node.nodeType !== 1) return;
          if (node.matches(SETTINGS.selector)) field.remove(node);
          node.querySelectorAll(SETTINGS.selector).forEach((el) => field.remove(el));
        });
      });
    });

    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  // Ручка для консоли и для динамической разметки: window.magnetic.scan(node).
  window.magnetic = field;
}

function stop() {
  if (!field) return;

  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
  }

  field.destroy();
  field = null;
  delete window.magnetic;
}

// Условия могут измениться на живой странице: пользователь включил
// «уменьшить движение» или подключил мышь к планшету.
function sync() {
  if (finePointer.matches && !reducedMotion.matches) start();
  else stop();
}

finePointer.addEventListener("change", sync);
reducedMotion.addEventListener("change", sync);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", sync);
} else {
  sync();
}
