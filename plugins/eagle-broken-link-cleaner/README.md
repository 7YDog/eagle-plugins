# 相册工具 - 文件坏链检测

| 项目 | 值 |
|------|-----|
| id | eagle-broken-link-cleaner |
| 版本 | 0.1.0 |
| 平台 | all |

## 安装

必须安装在 Eagle Plugins **顶级目录**（不要套多层文件夹）：

- macOS: ~/Library/Application Support/Eagle/Plugins/eagle-broken-link-cleaner/
- Windows: Eagle/Plugins/eagle-broken-link-cleaner/

## 用途

扫描 Eagle 项目中 filePath 指向文件已缺失（坏链）的条目，预览确认后通过 Eagle API 移入回收站（moveToTrash）。不直接改写资源库磁盘文件。

## 功能

- 扫描范围：当前文件夹 / 已选项目 / 全部
- 用 Node fs.existsSync 检测原文件是否存在
- 先预览坏链列表，确认后再执行
- 跳过已标记 isDeleted 的项目
- 确认后调用 Eagle moveToTrash 移入回收站

## 使用步骤

1. 在 Eagle 中打开本插件
2. 选择扫描范围（文件夹 / 选中 / 全部）
3. 点击扫描，查看坏链预览列表
4. 确认后执行，将坏链项移入 Eagle 回收站

## 依赖

- Node 内置 fs (existsSync)
- Eagle 官方 API (扫描, moveToTrash)
- **无需 npm 安装**，无 node_modules

## 注意

- 仅操作坏链项；正常文件不受影响
- 回收站内容可在 Eagle 内恢复（视版本而定）
