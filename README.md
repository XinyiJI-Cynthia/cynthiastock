# 股票每日信息台

这是一个手机优先的静态网页，用来查看自选股票的公开行情、国内外新闻信息，并用规则标注“利好 / 利空 / 中性”。

当前默认关注：

- 三一重工 `SH600031`
- 北方稀土 `SH600111`

## 远程访问方式

不同 Wi-Fi 的手机不能访问电脑上的 `127.0.0.1` 或局域网地址。要远程访问，需要把这些文件部署到公网静态托管服务，得到一个 `https://...` 的地址。

推荐顺序：

1. Cloudflare Pages

   适合长期每天查看，也是本项目最推荐的方案。注册或登录 Cloudflare 后，新建 Pages 项目，上传本文件夹或压缩包，构建命令留空，输出目录填写 `/` 或留空。发布后会得到一个 `https://xxx.pages.dev` 地址。项目里的 `_worker.js` 会处理 `/api/news` 和 `/api/quotes`，用同源 API 代理新闻和行情请求，远程手机访问会更稳。

2. GitHub Pages

   当前项目已部署到：

   <https://xinyiji-cynthia.github.io/cynthiastock/>

   GitHub Actions 每天北京时间 `08:15` 和 `16:15` 自动更新国内外新闻。网页直接读取生成的 `data/news.json`，手机不需要连接运行本项目的电脑。

3. Netlify Drop

   适合最快试用。打开 Netlify 的部署页面，把本文件夹拖进去即可得到公网地址。长期使用建议绑定账号。

4. 临时隧道

   例如 Cloudflare Tunnel 或 ngrok。它能临时给本机网页一个公网地址，但电脑必须一直开机，服务也不能断，不适合稳定每日使用。

## 文件说明

- `index.html`：网页入口。
- `styles.css`：移动端优先样式。
- `app.js`：行情、新闻读取、关注列表和利好利空规则。
- `manifest.webmanifest`：手机添加到主屏幕所需清单。
- `service-worker.js`：缓存网页壳，不缓存外部新闻和行情。
- `site-icon.svg`：手机主屏幕图标。
- `_worker.js`：Cloudflare Pages 同源 API，处理新闻和行情代理。
- `scripts/update_news.py`：从公开中英文新闻 RSS 收集候选信息。
- `.github/workflows/update-news.yml`：定时运行新闻更新任务。
- `data/news.json`：供网页读取的定时新闻数据。

## 信息来源

- 行情：优先读取公开行情脚本接口。
- 新闻：GitHub Actions 定时读取 Google 新闻公开 RSS，使用股票中英文名称分别查询；GDELT 仅作为静态数据不可用时的后备来源。
- 公司公告入口：默认指向交易所公司资料或公告入口。

页面只展示公开来源和规则化标签，不凭空编写新闻内容。利好 / 利空标签来自标题关键词命中，例如“中标、回购、业绩预增、价格上涨”偏利好，“减持、处罚、亏损、价格下跌、制裁”偏利空。没有明确命中的信息标为中性。

## 手机使用

发布到公网后，用手机浏览器打开 HTTPS 地址。iPhone 可在 Safari 里选择“添加到主屏幕”；Android 可在 Chrome 里选择“安装应用”或“添加到主屏幕”。
