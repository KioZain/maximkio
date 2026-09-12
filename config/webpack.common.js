const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const htmlPages = require("./webpack.pages.js");

const webpack = require("webpack");
const path = require("path");

module.exports = {
  entry: {
    index: "./src/javascripts/index.js",
    rough: "./src/javascripts/doodles.js",
    marquee: "./src/javascripts/marquee.js",
    magnetic: "./src/javascripts/magnetic.js",
    click: "./src/javascripts/click.js",
    langSwitch: "./src/javascripts/langSwitch.js",
    homeCanvas: "./src/javascripts/homeCanvas.js",
    reveal: "./src/javascripts/reveal.js",
    disclose: "./src/javascripts/disclose.js",
    lightbox: "./src/javascripts/lightbox.js",
    scrollUp: "./src/javascripts/scrollUp.js",
    navSpy: "./src/javascripts/navSpy.js",
    clock: "./src/javascripts/clock.js",
  },
  output: {
    filename: "[name].js",
    path: path.resolve(".", "docs"),
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/i,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: ["@babel/preset-env", "@babel/preset-react"],
          },
        },
      },
      {
        test: /\.css$/,
        exclude: /node_modules/,
        use: [MiniCssExtractPlugin.loader, "css-loader", "postcss-loader"],
      },
      {
        test: /\.html$/i,
        // Порядок важен: загрузчики отрабатывают справа налево, поэтому
        // i18n подставляет тексты в шаблон, а html-loader уже разбирает
        // готовую разметку и подхватывает картинки.
        use: ["html-loader", path.resolve(__dirname, "i18n/loader.js")],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/i,
        type: "asset/resource",
        generator: {
          filename: "images/[hash][ext][query]",
        },
      },
      {
        test: /\.(ttf|otf|woff|woff2)$/i,
        type: "asset/resource",
        generator: {
          filename: "fonts/[hash][ext][query]",
        },
      },
    ],
  },
  plugins: [
    new MiniCssExtractPlugin(),

    ...htmlPages,
  ],

  optimization: {
    minimizer: ["...", new CssMinimizerPlugin()],
  },

  ignoreWarnings: [/No file found for @import-glob/],
  resolve: {
    fallback: {
      stream: require.resolve("stream-browserify"),
    },
  },
};
