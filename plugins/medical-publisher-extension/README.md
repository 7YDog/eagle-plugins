# 医疗自媒体发布助手 (Medical Publisher Extension)

> **Chrome 扩展程序 (Manifest V3)** | 当前版本：`v1.2.0`  
> 专为医疗 IP 自媒体矩阵运营打造的多平台自动化发布辅助工具。支持 **Chrome 多个人资料（Profile）物理隔离**，实现不同医生（周辉、徐伟光等）在各自独立的 Chrome 窗口中自动识别、全平台配置同步与专属规则执行。

---

## 📖 目录

- [🌟 核心特性与业务痛点解决](#-核心特性与业务痛点解决)
- [🏗️ Chrome 个人资料物理隔离架构](#️-chrome-个人资料物理隔离架构)
- [👨‍⚕️ 医生矩阵与发布规则](#‍⚕️-医生矩阵与发布规则)
- [💻 各平台自动化矩阵](#-各平台自动化矩阵)
- [🚀 快速安装与配置指南](#-快速安装与配置指南)
- [🛠️ 开发者指南：如何进行后续迭代](#️-开发者指南如何进行后续迭代)
- [📝 版本更新日志 (Changelog)](#-版本更新日志-changelog)

---

## 🌟 核心特性与业务痛点解决

在医疗矩阵号（百家号、抖音、视频号、小红书等）的日常运营中，往往面临以下繁琐而易出错的手工操作：
1. **多医生账号切换容易混淆**：不同医生的病种专长、常用标签、小程序链接各不相同；
2. **标签官方点亮费时且容易被吞**：小红书、百家号等平台需要官方蓝色话题，批量粘贴时未触发联想容易漏选，甚至出现选区错乱吞掉文字；
3. **小程序重复挂载链路长**：每次在抖音发布都要手动下拉选择小程序、复制 Token、点击候选；
4. **视频号合规限制繁多**：院区地址易选错（分院区差异）、短标题超过 16 字报错拦截、原创声明误勾选。

**医疗自媒体发布助手** 通过浏览器底层脚本注入与悬浮工作台，将上述操作全部封装为**毫秒级一键自动化**。

---

## 🏗️ Chrome 个人资料物理隔离架构

为了让多个医生账号（如周辉 Profile 3、徐伟光 Profile 4）在同一台电脑上互不干扰，本扩展采用了 **Chromium 原生本地存储沙箱（`chrome.storage.local`）物理隔离机制**：

```
[Chrome Profile 3 (周辉)]                    [Chrome Profile 4 (徐伟光)]
       │                                            │
       ├─ Local Storage: profile_doctor='zhouhui'   ├─ Local Storage: profile_doctor='xuweiguang'
       │                                            │
       ▼                                            ▼
[ISOLATED Bridge (bridge.js)]                [ISOLATED Bridge (bridge.js)]
       │ (注入 data-medical-doctor)                  │ (注入 data-medical-doctor)
       ▼                                            ▼
[MAIN 页面悬浮面板 (各平台)]                  [MAIN 页面悬浮面板 (各平台)]
       │ (百家号/抖音/视频号/小红书)                 │ (百家号/抖音/视频号/小红书)
  自动加载【周辉】面神经病种与配置              自动加载【徐伟光】脑科病种与配置
```

### 双向同步设计：
- **浏览器扩展栏弹窗 (`popup.html` & `popup.js`)**：点击浏览器右上角拼图栏的插件图标，直观查看并切换当前 Chrome 资料绑定的医生，切换后会广播至所有已打开的标签页即时刷新。
- **页面悬浮面板徽章**：在任一平台页面的右上角悬浮面板中，点击彩色医生名字徽章即可自由切换，修改结果会自动持久化回写至该 Profile 的独立存储中。

---

## 👨‍⚕️ 医生矩阵与发布规则

### 1. 周辉医生（神经外科主任医师）
- **代表色**：紫色 (`#7c3aed`)
- **标题智能病种识别规则**：
  - 若标题/正文包含 **【面肌痉挛】**：
    $\rightarrow$ 匹配标签：`#面肌痉挛 #我要上热门 #眼皮跳 #硬核科普健康行动`
  - 若标题/正文包含 **【面瘫】**（且不含面肌痉挛）：
    $\rightarrow$ 匹配标签：`#面瘫 #面瘫后遗症 #我要上热门 #硬核科普健康行动`
  - 若两者均未包含（兜底默认）：
    $\rightarrow$ 优选面瘫标签组：`#面瘫 #面瘫后遗症 #我要上热门 #硬核科普健康行动`
- **抖音小荷 AI 医生挂载**：
  - 专属 Token 链接：`https://www.iesdouyin.com/share/microapp/?token=QkEwOTcxQ0Q5RjYzNzZqcWppZXN5&share_channel=copy`
- **视频号地理位置**：
  - 目标定位：`广东药科大学附属第一医院(农林院本部)`
  - 详细地址：`广东省广州市越秀区农林下路19号`
  - 自动规则：取消勾选声明原创、短标题超过 16 字自动清空。

---

### 2. 徐伟光医生（神经外科副主任医师）
- **代表色**：蓝色 (`#0284c7`)
- **核心病种与标签**：`#医生日常 #脑积水 #脑脊液 #我要上热门 #硬核科普健康行动`
- **抖音小荷 AI 医生挂载**：
  - 专属 Token 链接：`https://www.iesdouyin.com/share/microapp/?token=QzU2QzE1RDhFNjAyNzZqb21nNmVt&share_channel=copy`
- **视频号地理位置**：
  - 目标定位：`广东药科大学附属第一医院(农林院本部)`

---

## 💻 各平台自动化矩阵

| 平台 | 匹配网址 | 自动化核心实装能力 |
| :--- | :--- | :--- |
| **百度百家号** | `baijiahao.baidu.com/builder/rc/edit*` | 1. 自动光标定位并触发官方联想下拉框；<br>2. 2.5s 智能防抖耐受，100% 点亮蓝标；<br>3. 自动选中【无需声明】；<br>4. 50 字上限动态监控与病种标签感知。 |
| **抖音创作者中心** | `creator.douyin.com/creator-micro/content/post/video*` | 1. 自动定位【添加标签】；<br>2. 下拉切换【位置】为【小程序】；<br>3. 自动填入当前医生的专属 Token；<br>4. 识别并精准点击【小荷 AI 医生】候选卡片。 |
| **微信视频号** | `channels.weixin.qq.com/platform/post/create*` | 1. 自动输入并检索医院本部院区精准地址；<br>2. 短标题超过 16 字限制时自动清空，防止提交失败；<br>3. 自动取消勾选“声明原创”。 |
| **小红书创作者服务** | `creator.xiaohongshu.com/publish/publish*` | 1. Tiptap/ProseMirror 富文本编辑器智能话题点亮；<br>2. **独家防吞引擎**：Tippy 浮层销毁等待 + 关键词强校验 + 零盲选兜底保护 + DOM 状态协调延迟。 |
| **爱贝壳分发助手** | `*.aibeike.com/*` | 自动感知当前所属医生与分发状态，与原版爱贝壳协同工作。 |

---

## 🚀 快速安装与配置指南

### 第一步：在 Chrome 中加载扩展
1. 打开 Chrome 浏览器，在地址栏输入 `chrome://extensions/` 并回车；
2. 开启右上角的 **「开发者模式」** 开关；
3. 点击左上角 **「加载已解压的扩展程序」**；
4. 选择本项目所在目录：`plugins/medical-publisher-extension`；
5. 加载完成后，可在列表中看到 **医疗自媒体发布助手 (v1.2.0)**。

### 第二步：配置多 Chrome 个人资料（Profile）
如果你有多位医生的分发环境（如周辉、徐伟光分别在不同的 Chrome 用户中）：
1. 在 **周辉** 的 Chrome 窗口中：
   - 打开 `chrome://extensions/`，同样加载本扩展；
   - 点击浏览器右上角拼图图标中的本扩展图标；
   - 在弹出的控制卡片中点击选择 **【👨‍⚕️ 周辉】**；
   - 页面提示已永久绑定，后续在周辉窗口中打开各发布页面均会自动以周辉身份运行。
2. 在 **徐伟光** 的 Chrome 窗口中：
   - 点击选择 **【👨‍⚕️ 徐伟光】** 即可。

---

## 🛠️ 开发者指南：如何进行后续迭代

本项目的模块划分清晰、低耦合，便于未来持续增加新平台或新医生。

### 1. 目录结构
```
plugins/medical-publisher-extension/
├── manifest.json              # 扩展配置文件 (MV3, 版本号、权限、注入匹配规则)
├── popup.html                 # 扩展工具栏弹出窗口 UI
├── popup.js                   # 扩展弹出窗口逻辑 (读取与设置 Profile 专属医生)
├── README.md                  # 项目使用与迭代文档
├── content_scripts/           # 页面内容注入脚本目录
│   ├── bridge.js              # ISOLATED 沙箱桥接层 (读取 chrome.storage.local 并挂载至 DOM)
│   ├── baijiahao.js           # 百度百家号自动化发布逻辑
│   ├── douyin.js              # 抖音创作者中心自动化挂载逻辑
│   ├── shipinhao.js           # 微信视频号助手自动化配置
│   ├── xiaohongshu.js         # 小红书话题点亮与防吞引擎
│   └── aibeike.js             # 爱贝壳平台协同脚本
├── icons/                     # 插件图标资源 (16x16, 48x48, 128x128)
└── tools/
    └── eagle_helper.py        # Eagle 媒体库与 Jev AI 分类辅助脚本
```

---

### 2. 常见迭代场景

#### 场景 A：新增一名医生（如「张医生」）
1. **修改各平台 content script**：
   - 打开 `content_scripts/baijiahao.js`、`douyin.js`、`shipinhao.js`、`xiaohongshu.js`；
   - 在 `DOCTOR_CONFIG` 或 `DOCTOR_TAGS` 对象中追加张医生的专属配置：
     ```javascript
     zhangyisheng: {
         name: '张医生',
         title: '主任医师',
         color: '#059669',
         url: 'https://www.iesdouyin.com/share/microapp/?token=...', // 抖音小荷链接
         getTopics: (text) => ({ type: '专科', tags: ['#疾病标签', '#我要上热门'] })
     }
     ```
2. **在 Popup 窗口中增加切换按钮**：
   - 在 `popup.html` 中复制 `<div class="doctor-card" id="card-zhangyisheng">`；
   - 在 `popup.js` 中添加事件绑定。
3. **在悬浮窗切换逻辑中支持新 ID**：
   - 检查 `toggleDoctor()` 中循环切换的医生列表。

#### 场景 B：新增一个支持平台（如「快手」或「微信公众号」）
1. 在 `content_scripts/` 下新建 `<platform>.js`；
2. 参照 `baijiahao.js` 实现通用的可拖拽悬浮窗、Profile 医生监听与一键操作逻辑；
3. 在 `manifest.json` 的 `content_scripts` 中添加对应平台的 `matches` 规则与脚本路径；
4. 在 `README.md` 的支持平台表格中登记。

#### 场景 C：修改版本号与发布更新
1. 修改 `manifest.json` 中的 `"version": "1.3.0"`；
2. 在本文档末尾的 [版本更新日志](#-版本更新日志-changelog) 中记录更新内容；
3. 在 Chrome 访问 `chrome://extensions/`，找到本插件点击 **「刷新 ↻」** 按钮即刻生效，无需重启浏览器。

---

## 📝 版本更新日志 (Changelog)

### `v1.2.0` (2026-09)
- **feat(profile)**: 实装 Chrome 多个人资料（Profile）原生存储沙箱隔离，周辉（Profile 3）与徐伟光（Profile 4）配置完全物理隔离、互不串扰；
- **feat(bridge)**: 新增 `content_scripts/bridge.js` 桥接层与 `popup.html` 工具栏弹窗，支持一键选定 Profile 医生并全局广播；
- **feat(zhouhui)**: 全面实装周辉医生专属发布规则（面神经/面瘫/面肌痉挛智能病种识别、抖音小荷专属 Token、视频号农林院本部院区定位）；
- **feat(ui)**: 规范各平台悬浮窗布局，保证 `340px` 紧凑尺寸、医生彩色徽章与自适应折叠。

### `v1.1.0` (2026-09)
- **feat(xiaohongshu)**: 迁移并实装小红书富文本话题智能点亮；
- **fix(anti-swallow)**: 攻克小红书连续点亮时“标签被吞”缺陷，构建包括 Tippy 浮层完全销毁等待、精准候选匹配与零盲选兜底保护在内的四重防吞引擎；
- **feat(shipinhao)**: 实装视频号短标题 16 字截断与自动取消原创声明；
- **feat(douyin)**: 实装抖音小荷医生小程序一键挂载。

### `v1.0.0` (2026-09)
- **feat(core)**: 独立于原版爱贝壳，全新打造 `医疗自媒体发布助手` 独立 Chrome 扩展；
- **feat(baijiahao)**: 深度破解百度百家号动态富文本输入，实现就地点亮 5 个官方蓝色话题与自动选定无需声明。
