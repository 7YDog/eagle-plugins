# PDF 转 JPG（Eagle 插件）

统一版 PDF→JPG 插件（v1.1.0）。基于 **PDF.js**（`pdfjs-dist` 本地 vendor），无需 Python / PyMuPDF，Win/Mac 路径处理一致。

在 Eagle 中选中一个或多个 PDF，点击插件后自动转换：

- 每个 PDF 页面生成一张 JPG；
- 默认 **144 DPI**（pdf.js `scale = DPI/72 = 2`）· JPEG 品质 **100%**；
- 输出到 PDF 所在的原目录；
- 自动写入 PDF 在 Eagle 中所属的原文件夹（保留原标签）；
- 文件名格式：`原文件名-page-001.jpg`、`原文件名-page-002.jpg`……；
- 不修改、不删除原 PDF；转换仅在本机完成。

## 使用

1. 安装目录：`~/Library/Application Support/Eagle/Plugins/pdf-to-jpg-converter/`
2. 在 Eagle 中选中 PDF 文件。
3. 打开 **PDF 转 JPG** 插件即可自动转换（一键，无需确认）。

## 与旧版关系

- **本插件 id**：`pdf-to-jpg-converter`（稳定，与原 pdf.js 版一致）
- **旧 Python 版** `codex-pdf-to-jpg-converter`（PyMuPDF）已停用：Plugins 目录重命名为 `codex-pdf-to-jpg-converter.__disabled__`；工作副本仍保留在 `eagle-plugins-work/plugins/codex-pdf-to-jpg-converter/`。

## 尚未迁入的旧 UI（有意延后）

Python 版的文件列表 / 拖拽添加 / 外部导出目录 / 可调 DPI 控件等完整面板 UI 未迁入；当前优先保证跨平台一键转换。如需更高 DPI，可在源码中改 `DEFAULT_DPI`（注意大页可能触达 canvas 尺寸上限）。

## 依赖与许可

`vendor/pdf.min.js`、`vendor/pdf.worker.min.js`、`vendor/cmaps` 和 `vendor/standard_fonts` 来自 `pdfjs-dist@3.11.174`，遵循 Apache License 2.0；对应许可文本见 `vendor/LICENSE.pdfjs.txt`。
