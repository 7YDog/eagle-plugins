# 相册工具 - EXIF 标签

| 项目 | 值 |
|------|-----|
| id | eagle-exif-tagger |
| 版本 | 0.1.1 |
| 平台 | all |

## 安装

必须安装在 Eagle Plugins **顶级目录**：

- macOS: ~/Library/Application Support/Eagle/Plugins/eagle-exif-tagger/
- Windows: Eagle/Plugins/eagle-exif-tagger/

## 用途

读取 Eagle 项目文件路径上的 EXIF / 视频色彩信息，并写回标签（Make / Model / Lens / 视频色彩传输等）。通过官方 item.save()，不直接改 library 元数据文件。

## 依赖

- exifreader（经 npm 安装）
- 可选 ffprobe（经 Eagle extraModule 或 Plugins 下 ffmpeg 包路径）用于视频色彩标签

### 重要：node_modules

- **node_modules 不纳入 git**
- 本地开发需在插件目录执行：npm install
- **对外分发的 zip 必须包含 node_modules**，否则用户端无法运行

## 使用步骤

1. 确保已执行 npm install（或使用含 node_modules 的分发包）
2. 在 Eagle 中选中项目并打开本插件
3. 扫描预览将添加的标签
4. 确认后写入标签

## 注意

- 安装路径必须是 Plugins 顶级目录
- 视频标签依赖 ffprobe 可用；缺失时相关视频字段可能跳过
