# 开发与本地预览

纯静态页面，无需后端、数据库或构建步骤。

运行 `node tools/serve.mjs`，或直接打开 `index.html`。网址加 `?lab` 可打开星图码试验台。

运行 `node tools/check-export-fit.mjs` 检查导出星图的完整性（四个地区、横竖屏、缩放与拖动后的星点/星名边界及页面视角恢复；与截图脚本共用 Playwright 配置）。

运行 `node tools/test-match.js` 检查四个地区的星座匹配；`node tools/check-poster.mjs` 检查明信片界面（需要 Playwright，见脚本说明）。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.html` / `css/observatory.css` | 页面和全部样式 |
| `js/sky.js` | 天文计算：时区（含夏令时）→ 恒星时 → 每颗星的高度和方位 |
| `js/matcher.js` | 模板匹配：平移、缩放、旋转，吸附到最近的亮星 |
| `js/marker.js` | 星图码解析，Node 里也能 `require` |
| `js/chart.js` | 星图渲染（天体制图风格） |
| `js/card.js` | 故事卡和发光星星按钮 |
| `js/poster.js` | 生成纪念图（保存图片） |
| `js/names-zh.js` | 约 150 颗亮星的中文传统星名 |
| `data/stars.js` | 精简星表，5070 颗星，亮到 6 等，约 180 KB |
| `tools/build-stars.mjs` | 从 `tools/stars.json.gz` 重新生成 `data/stars.js` |
| `tools/test-match.js` | 命令行检查四座城市的匹配结果 |
| `tools/check-poster.mjs` | 保存预览检查：五种屏幕尺寸、切换、下载、滑动和重新打开；运行 `node tools/check-poster.mjs` |
| `tools/shot.mjs` | Playwright 截图（借用 CarrotHomeSystem 里装好的 Playwright） |
| `tools/serve.mjs` / `手机预览.cmd` | 局域网预览服务器，零依赖，端口 8848 |

## 实现说明

- 计算链路：`Sky.localToUtc` → `Sky.buildSky`（候选星 = 高度 ≥ 12° 的星里，按消光后亮度取前 120 颗）→ `Matcher.matchTemplate`。四座城市各跑一次 3～10 ms。
- 匹配在「抬头看天」的平面里做（以天顶为中心的球极投影，保角）。打分 = 吸附误差 + 图形歪头惩罚（允许偏离天顶方向 40°）+ 位置太低惩罚 + 偏好亮星。不做镜像。同样的输入永远得到同样的结果。
- 精度：没算岁差（约 0.37°）和大气折射，做肉眼星图够用。
- 渲染只依赖 `match.stars`（每颗有 `v`、`name`、`magApp`、`alt`、`az`、`ra`、`dec`），后端换实现时保持这个结构就能直接接上。
- 点数规则：少于 3 个点报错，超过 10 个提醒，超过 12 个报错。首尾相同算闭合，重复点不计数。
- **字体**：IM Fell English 走 Google Fonts，国内可能加载慢或加载不到（会退回系统衬线体，不影响功能）。想稳的话把字体文件下载下来放进仓库自托管。
- **许可**：星表是 CC BY-SA 4.0。页面底部和纪念图底部的署名（Celeris / HYG v4.1 · CC BY-SA 4.0）必须保留；`data/stars.js` 或任何由它再加工的数据也要按 CC BY-SA 4.0 发布。

## 素材与许可

星表来自 [Celeris](https://celeris-app.com/star-catalog.html)，改编自 HYG Database v4.1（Astronexus），许可证 CC BY-SA 4.0。`data/stars.js` 是它的再加工版本，同样按 CC BY-SA 4.0 发布，页面底部保留了署名。字体 IM Fell English 来自 Google Fonts（OFL）。
