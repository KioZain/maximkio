module.exports = {
  plugins: [
    require("postcss-import-ext-glob"),
    require("postcss-import"),
    require("postcss-nested"),
    require("postcss-preset-env")({ stage: 1 }),
    require("autoprefixer"),
  ],
};
