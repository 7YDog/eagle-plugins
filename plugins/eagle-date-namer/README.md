# 相册工具 - 照片日期命名

| 项目 | 值 |
|------|-----|
| id | eagle-date-namer |
| 版本 | 0.1.5 |
| 平台 | all |

> **重要（自 0.1.5 起）：已移除 macOS sips 依赖。** 日期检测改为跨平台实现，不再调用系统 sips。

## 安装

必须安装在 Eagle Plugins **顶级目录**：

- macOS: ~/Library/Application Support/Eagle/Plugins/eagle-date-namer/
- Windows: Eagle/Plugins/eagle-date-namer/

## 用途

根据照片日期批量重命名 Eagle 显示名称，格式固定为 YYYY-MM-DD_原名。先预览，确认后再写入。

## 日期来源（优先级）

1. JPEG EXIF 轻量解析（DateTimeOriginal / creation）
2. 文件名中的日期/时间戳
3. 文件系统创建时间（birthtime / birthtimeMs / ctime）
4. Eagle modifiedAt、mtime 低置信度回退（默认不自动改名）

## 功能要点

- 默认扫描已选项目；先扫描预览，不自动写入
- 只自动改高/中置信度日期；低置信度仅展示
- 写入仅通过 item.name + item.save()，不直接改 library 文件
- 可筛选「待确认」、添加「无日期」标签
- **自 0.1.5：不再使用 macOS sips**

## Windows 注意

Windows 上部分文件系统 / birthtime 行为与 macOS 不同，创建时间可能回退为其他时间戳；请以预览结果为准。

## 使用步骤

1. 在 Eagle 中选中要处理的项目
2. 打开本插件并扫描预览
3. 核对日期与新名称
4. 确认后执行重命名

## 依赖

- Node fs + 内置 JPEG EXIF 轻量解析
- Eagle API
- 无 sips；无额外第三方包依赖
