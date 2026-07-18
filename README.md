# Eagle Plugins

由 7YDog 维护的开源 Eagle 插件集合。仓库集中保存可维护的源码，安装包通过 GitHub Releases 发布。

## 插件索引

| 插件 | 当前版本 | 用途 | 源码 |
| --- | --- | --- | --- |
| 封面路径助手 | 1.1.0 | 在后台复制当前选中素材的 PNG 封面路径 | [`plugins/eagle-cover-path-helper`](plugins/eagle-cover-path-helper) |
| 格式重命名 | 1.0.1 | 按文件夹、日期和序号规则批量重命名选中项目 | [`plugins/eagle-format-renamer`](plugins/eagle-format-renamer) |
| 切换视频首帧封面 | 1.0.1 | 提取所选视频的首帧并设为 Eagle 自定义封面 | [`plugins/eagle-video-first-frame-cover`](plugins/eagle-video-first-frame-cover) |
| 视频每秒导出 JPG | 1.2.0 | 将所选视频按每秒一张导出为 JPG 图片 | [`plugins/eagle-video-jpg-exporter`](plugins/eagle-video-jpg-exporter) |

## 仓库结构

```text
plugins/
  eagle-cover-path-helper/  # 封面路径助手源码
  eagle-format-renamer/     # 格式重命名源码
  eagle-video-first-frame-cover/ # 切换视频首帧封面源码
  eagle-video-jpg-exporter/      # 视频每秒导出 JPG 源码
packages/                   # 本地安装包，仅用于发布 Release
```

## 安装包

在仓库的 Releases 页面下载对应版本 ZIP。源码说明和使用方式请查看各插件目录中的 `README.md`。

## 已安装插件清单

本机 Eagle 中还安装了若干官方或第三方插件。为避免未经许可重新分发，这些插件只记录名称与版本，不复制源码和二进制文件。详见 [`docs/installed-plugins.md`](docs/installed-plugins.md)。

## 维护约定

- 插件源码以 `plugins/` 中的内容为准。
- 修改功能时同步更新插件自己的 `manifest.json` 版本和 `README.md`。
- 发布标签使用 `<plugin-name>-v<version>` 格式。
- `packages/` 中的 ZIP 是本地发布产物，不提交到 Git 历史。

## 开源许可

本仓库中由 7YDog 创作的代码使用 [MIT License](LICENSE) 开源。Eagle 名称、接口及其他第三方项目的权利归各自所有者所有。
