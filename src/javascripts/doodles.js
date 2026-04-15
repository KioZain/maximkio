import { annotate } from "rough-notation";

const underline = annotate(document.getElementById("underline"), {
  type: "underline",
  color: "pink",
  padding: 3,
  //   animate: false,
});

underline.show();

// const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

// if (mediaQuery.matches) {
//   underline.animate = false;
//   underline.show();
// }
