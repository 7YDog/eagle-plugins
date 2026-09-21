# eagle-plugins-work（本地草稿）

> **说明：** 本文档为本地工作副本索引，**尚未 push 到远程**。

## 插件一览

| 插件 | 目录 / id | 版本 | 说明 |
|------|-----------|------|------|
| 封面路径助手 | eagle-cover-path-helper | 1.1.1 | 复制封面路径；serviceMode 仅 onPluginRun，无 startup fallback |
| 格式化重命名 | eagle-format-renamer | 1.0.4 | 批量按模板改名 |
| 视频首帧封面 | eagle-video-first-frame-cover | 1.0.6 | 提取首帧设封面 |
| 视频导出 JPG | eagle-video-jpg-export | 1.2.1 | 视频帧导出 JPG |
| 坏链检测 | eagle-broken-link-cleaner | 0.1.0 | 相册三件套 |
| 照片日期命名 | eagle-date-namer | 0.1.5 | 相册三件套 |
| EXIF 标签 | eagle-exif-tagger | 0.1.1 | 相册三件套 |
| PDF 转 JPG | eagle-pdf-to-jpg（安装 id: pdf-to-jpg-converter） | 1.1.0 | pdf.js 统一版 |
| 医疗自媒体发布助手 | medical-publisher-extension | 1.2.0 | Chrome 扩展：多医疗 IP 矩阵发布辅助，支持 Chrome 多资料隔离、百家号/抖音/视频号/小红书自动填充与防吞标签 |

## 浏览器扩展程序

- **[医疗自媒体发布助手 (Medical Publisher Extension)](plugins/medical-publisher-extension/README.md)**: 独立 Chrome 扩展（Manifest V3），专为周辉、徐伟光等医疗自媒体账号矩阵打造，详见完整使用与迭代文档。

## 相册工具

详见 [docs/album-tools.md](docs/album-tools.md)。

## serviceMode 说明

部分插件使用 serviceMode（如封面路径助手）：**仅在 onPluginRun（点击/快捷键）时执行**，**无启动时 startup fallback**，避免 Eagle 启动无选中时弹窗。

## 安装

各插件安装到 Eagle Plugins 顶级目录。相册三件套规则见 album-tools 文档。

## 仓库约定

- node_modules 不入库；exif-tagger 分发 zip 需自带
- archive/ 为归档，不作为现行插件

## 开源许可

本仓库中由 7YDog 创作的代码使用 [MIT License](LICENSE) 开源。Eagle 名称、接口及其他第三方项目的权利归各自所有者所有。
