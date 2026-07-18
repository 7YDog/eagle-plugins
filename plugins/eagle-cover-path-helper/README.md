# 封面路径助手

Eagle 后台插件，用于点击插件按钮后直接复制当前选中素材的 PNG 封面路径。

## 默认行为

- 点击插件按钮后不打开窗口，直接复制当前选中素材的 PNG 封面路径。
- 如果选中的素材本身是 PNG，复制原文件路径。
- 如果选中的是视频或其他格式，优先复制 Eagle 记录的 PNG 缩略图路径，再从 `.info` 目录中查找 `*_thumbnail.png`。
- 多选时复制多条路径，每行一条。

## 路径类型

复制结果形如：

`E:\素材库.library\images\ITEM_ID.info\示例素材_thumbnail.png`

后台日志会写入控制台和本地存储 `codex-cover-path-helper-log-v2`。
