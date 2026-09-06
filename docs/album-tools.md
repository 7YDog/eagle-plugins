# 相册工具三件套

本仓库相册相关插件建议按以下顺序使用：

1. **eagle-broken-link-cleaner**（坏链检测）— 先清理缺失原文件的项目
2. **eagle-date-namer**（照片日期命名）— 再按日期规范显示名
3. **eagle-exif-tagger**（EXIF 标签）— 最后补相机/镜头等标签

## 安装规则（重要）

三个插件都必须安装在 Eagle Plugins **顶级目录**，例如：

- macOS: ~/Library/Application Support/Eagle/Plugins/<plugin-id>/
- Windows: Eagle/Plugins/<plugin-id>/

不要嵌套在子文件夹中，否则 Eagle 可能无法正确加载。

## 版本速览

| 插件 | id | 版本 |
|------|-----|------|
| 文件坏链检测 | eagle-broken-link-cleaner | 0.1.0 |
| 照片日期命名 | eagle-date-namer | 0.1.5（已移除 sips） |
| EXIF 标签 | eagle-exif-tagger | 0.1.1 |

详见各插件目录下的 README.md。
