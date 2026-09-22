import { annotate } from "rough-notation";

// Чанк подключён и на страницах без подчёркивания (pages/articles.html).
const target = document.getElementById("underline");

if (target) {
  const underline = annotate(target, {
    type: "underline",
    color: "pink",
    padding: 3,
    // Фраза на мобиле переносится: по отрезку под каждой строкой.
    multiline: true,
    //   animate: false,
  });

  // Позиция считается один раз, поэтому ждём шрифты: до них раскладка другая.
  document.fonts.ready.then(() => underline.show());
}

// const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

// if (mediaQuery.matches) {
//   underline.animate = false;
//   underline.show();
// }
