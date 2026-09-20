const { merge } = require('webpack-merge')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const common = require('./webpack.common.js')
const path = require('path')
const fs = require('fs')

/* ==========================================================================
 * Лаборатория — тестовые страницы для ручной настройки эффектов.
 *
 * Подключены только здесь, в дев-конфиге: webpack.prod.js берёт
 * webpack.common.js и лабораторию не видит, поэтому в docs/ она не попадает
 * даже случайно. Список страниц сайта (i18n/config.js) она тоже не трогает.
 *
 *     npm start → http://localhost:8080/lab/branch-canvas.html
 *
 * Кнопка «Сохранить для Claude» на странице отправляет настройки сюда, и
 * дев-сервер записывает их в .lab/ (в .gitignore).
 * ========================================================================== */

const LAB_PAGES = [
  { name: 'labBranchCanvas', entry: './src/lab/branchCanvas.js', file: 'branch-canvas' }
]

const LAB_OUTPUT = path.resolve('.', '.lab')
const LAB_SAVE_LIMIT = 1024 * 1024

function saveLabSettings(fileName) {
  return (req, res) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > LAB_SAVE_LIMIT) req.destroy()
    })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        fs.mkdirSync(LAB_OUTPUT, { recursive: true })
        fs.writeFileSync(
          path.join(LAB_OUTPUT, fileName),
          `${JSON.stringify(data, null, 2)}\n`
        )
        res.json({ file: `.lab/${fileName}` })
      } catch (error) {
        res.status(400).json({ error: error.message })
      }
    })
  }
}

module.exports = merge(common, {
  mode: 'development',
  devtool: 'inline-source-map',
  entry: Object.fromEntries(LAB_PAGES.map((page) => [page.name, page.entry])),
  devServer: {
    static: './dev_build',
    setupMiddlewares(middlewares, devServer) {
      LAB_PAGES.forEach((page) => {
        devServer.app.post(`/__lab/${page.file}`, saveLabSettings(`${page.file}.json`))
      })
      return middlewares
    }
  },
  plugins: LAB_PAGES.map(
    (page) =>
      new HtmlWebpackPlugin({
        filename: `lab/${page.file}.html`,
        title: 'Лаборатория',
        chunks: [page.name],
        meta: { robots: 'noindex, nofollow' }
      })
  ),
  output: {
    path: path.resolve('.', 'dev_build'),
    clean: true
  }
})
