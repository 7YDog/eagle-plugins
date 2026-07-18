(function () {
  const { spawn } = require("child_process");
  const fs = require("fs");
  const os = require("os");
  const path = require("path");

  const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "avi", "mkv", "webm"]);
  const READ_SELECTED_TIMEOUT = 10000;
  const FFMPEG_TIMEOUT = 30 * 60 * 1000;
  const MAX_VISIBLE_LOG_LINES = 160;

  const statusEl = document.getElementById("status");
  const selectionEl = document.getElementById("selection");
  const namingHintEl = document.getElementById("namingHint");
  const logOutputEl = document.getElementById("logOutput");
  const analysisEl = document.getElementById("analysis");
  const startBtn = document.getElementById("startBtn");
  const analyzeBtn = document.getElementById("analyzeBtn");
  const separateFoldersEl = document.getElementById("separateFolders");

  let isRunning = false;
  let logFilePath = "";
  let logReadyPromise = null;
  let visibleLogLines = [];

  function setStatus(message) {
    statusEl.textContent = message;
    writeLog("info", message);
  }

  function setBusy(isBusy) {
    isRunning = isBusy;
    startBtn.disabled = isBusy;
    startBtn.textContent = isBusy ? "正在导出..." : "开始导出";
  }

  function updateNamingHint() {
    namingHintEl.textContent = separateFoldersEl.checked
      ? "视频标题文件夹/000001.jpg"
      : "原标题名_000001.jpg";
  }

  function serialize(value) {
    if (value instanceof Error) {
      return value.stack || value.message;
    }

    if (typeof value === "string") {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  function writeVisibleLog(level, value) {
    const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    visibleLogLines.push(`[${time}] [${level}] ${serialize(value)}`);

    if (visibleLogLines.length > MAX_VISIBLE_LOG_LINES) {
      visibleLogLines = visibleLogLines.slice(-MAX_VISIBLE_LOG_LINES);
    }

    logOutputEl.textContent = visibleLogLines.join("\n");
    logOutputEl.scrollTop = logOutputEl.scrollHeight;
  }

  async function initLog(plugin) {
    if (logReadyPromise) {
      return logReadyPromise;
    }

    logReadyPromise = (async () => {
      try {
        const basePath = eagle.app && eagle.app.getPath
          ? await eagle.app.getPath("userData")
          : (plugin && plugin.path ? plugin.path : __dirname);
        const logFolder = path.join(basePath, "video-jpg-export-logs");

        fs.mkdirSync(logFolder, { recursive: true });
        logFilePath = path.join(logFolder, "latest.log");
        fs.writeFileSync(logFilePath, "", "utf8");
        writeLog("info", "日志初始化完成");
        writeLog("info", {
          eagleVersion: eagle.app && eagle.app.version,
          platform: eagle.app && eagle.app.platform,
          pluginPath: plugin && plugin.path,
          logFilePath
        });
      } catch (error) {
        logFilePath = "";
        writeEagleLog("error", `日志初始化失败：${serialize(error)}`);
        writeVisibleLog("error", `日志初始化失败：${serialize(error)}`);
      }
    })();

    return logReadyPromise;
  }

  function resetRunLog() {
    visibleLogLines = [];
    logOutputEl.textContent = "";
    analysisEl.textContent = "检测结果会显示在这里。";

    if (!logFilePath) {
      return;
    }

    try {
      fs.writeFileSync(logFilePath, "", "utf8");
    } catch (error) {
      writeVisibleLog("error", `清空日志失败：${serialize(error)}`);
    }
  }

  function writeEagleLog(level, message) {
    if (typeof eagle === "undefined" || !eagle.log || !eagle.log[level]) {
      return;
    }

    try {
      eagle.log[level](message);
    } catch (error) {
      // Logging must never block the export flow.
    }
  }

  function writeLog(level, value) {
    const line = `[${new Date().toISOString()}] [${level}] ${serialize(value)}\n`;
    writeEagleLog(level, line.trim());
    writeVisibleLog(level, value);

    if (!logFilePath) {
      return;
    }

    try {
      fs.appendFileSync(logFilePath, line, "utf8");
    } catch (error) {
      writeEagleLog("error", `写入日志文件失败：${serialize(error)}`);
      writeVisibleLog("error", `写入日志文件失败：${serialize(error)}`);
    }
  }

  function withTimeout(promise, ms, label) {
    let timer = null;

    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error(`${label}，已等待 ${Math.round(ms / 1000)} 秒。`));
      }, ms);
    });

    return Promise.race([promise, timeout]).finally(() => {
      if (timer) {
        window.clearTimeout(timer);
      }
    });
  }

  function sanitizeFilename(name) {
    const fallback = "video";
    return String(name || fallback)
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 120) || fallback;
  }

  function getOriginalName(item) {
    if (item.name) {
      const ext = String(item.ext || "").trim();
      if (ext && item.name.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) {
        return item.name.slice(0, -(ext.length + 1));
      }

      return item.name;
    }

    if (item.filePath) {
      return path.basename(item.filePath, path.extname(item.filePath));
    }

    return item.id || "video";
  }

  function getVideoItems(items) {
    return items.filter((item) => {
      const ext = String(item.ext || path.extname(item.filePath || "").slice(1)).toLowerCase();
      return item.filePath && VIDEO_EXTENSIONS.has(ext);
    });
  }

  function getOutputBaseNames(items) {
    const rawNames = items.map((item) => sanitizeFilename(getOriginalName(item)));
    const counts = new Map();

    rawNames.forEach((name) => {
      counts.set(name, (counts.get(name) || 0) + 1);
    });

    return items.map((item, index) => {
      const baseName = rawNames[index];
      if (counts.get(baseName) === 1) {
        return baseName;
      }

      return sanitizeFilename(`${baseName}_${item.id || index + 1}`);
    });
  }

  async function ensureFfmpeg() {
    if (!eagle.extraModule || !eagle.extraModule.ffmpeg) {
      throw new Error("当前 Eagle 环境未提供 FFmpeg 依赖。");
    }

    writeLog("info", "检查 FFmpeg 依赖");
    const isInstalled = await eagle.extraModule.ffmpeg.isInstalled();
    if (!isInstalled) {
      setStatus("正在安装 FFmpeg...");
      writeLog("warn", "FFmpeg 未安装，开始调用安装流程");
      await eagle.extraModule.ffmpeg.install();
      throw new Error("FFmpeg 已安装完成，请重新点击开始导出。");
    }

    const paths = await eagle.extraModule.ffmpeg.getPaths();
    writeLog("info", {
      message: "FFmpeg 路径",
      paths
    });

    return paths.ffmpeg || paths.ffmpegPath || paths.bin || paths.path;
  }

  function runFfmpeg(ffmpegPath, inputPath, outputPattern) {
    return new Promise((resolve, reject) => {
      const args = [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        inputPath,
        "-vf",
        "fps=1",
        "-q:v",
        "2",
        outputPattern
      ];

      writeLog("info", {
        message: "启动 FFmpeg",
        inputPath,
        outputPattern
      });

      const child = spawn(ffmpegPath, args, {
        windowsHide: true
      });

      let errorOutput = "";
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        writeLog("error", {
          message: "FFmpeg 超时，准备结束进程",
          inputPath,
          outputPattern
        });
        child.kill("SIGTERM");
        reject(new Error(`FFmpeg 处理超时，超过 ${Math.round(FFMPEG_TIMEOUT / 60000)} 分钟未完成。`));
      }, FFMPEG_TIMEOUT);

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString().trim();
        if (text) {
          errorOutput += `${text}\n`;
          writeLog("warn", text);
        }
      });

      child.on("error", (error) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timer);
        writeLog("error", error);
        reject(error);
      });

      child.on("close", (code) => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timer);

        if (code === 0) {
          writeLog("info", "FFmpeg 完成");
          resolve();
          return;
        }

        const error = new Error(errorOutput.trim() || `FFmpeg 退出码：${code}`);
        writeLog("error", error);
        reject(error);
      });
    });
  }

  function ensureWritableOutputFolder(outputFolder) {
    if (!fs.existsSync(outputFolder)) {
      writeLog("warn", `保存文件夹不存在，正在创建：${outputFolder}`);
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    const testFile = path.join(outputFolder, `.video_jpg_export_write_test_${Date.now()}.tmp`);

    try {
      fs.writeFileSync(testFile, "ok", "utf8");
      fs.unlinkSync(testFile);
      writeLog("info", {
        message: "保存文件夹写入测试通过",
        outputFolder
      });
    } catch (error) {
      throw new Error(`保存文件夹无法写入：${outputFolder}\n${error.message}`);
    }
  }

  function createStagingFolder(item, index) {
    const safeId = String(item.id || index + 1).replace(/[^a-zA-Z0-9_-]/g, "_");
    const stagingFolder = path.join(os.tmpdir(), `eagle_video_jpg_${Date.now()}_${safeId}`);

    fs.mkdirSync(stagingFolder, { recursive: true });
    writeLog("info", {
      message: "创建临时导出目录",
      stagingFolder
    });

    return stagingFolder;
  }

  function getStagingFrameFiles(stagingFolder) {
    return fs.readdirSync(stagingFolder)
      .filter((file) => /^frame_\d{6}\.jpg$/i.test(file))
      .sort();
  }

  function prepareVideoOutputFolder(rootFolder, baseName, useSeparateFolders) {
    if (!useSeparateFolders) {
      return rootFolder;
    }

    const folderPath = path.join(rootFolder, baseName);
    ensureWritableOutputFolder(folderPath);
    writeLog("info", {
      message: "已准备视频子文件夹",
      folderPath
    });

    return folderPath;
  }

  function moveFramesToOutput(stagingFolder, targetFolder, baseName, useSeparateFolders) {
    const files = getStagingFrameFiles(stagingFolder);

    files.forEach((file, index) => {
      const sourcePath = path.join(stagingFolder, file);
      const number = String(index + 1).padStart(6, "0");
      const finalName = useSeparateFolders ? `${number}.jpg` : `${baseName}_${number}.jpg`;
      const finalPath = path.join(targetFolder, finalName);

      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }

      fs.copyFileSync(sourcePath, finalPath);
      fs.unlinkSync(sourcePath);
    });

    try {
      fs.rmdirSync(stagingFolder);
    } catch (error) {
      writeLog("warn", `临时目录清理失败：${serialize(error)}`);
    }

    writeLog("info", {
      message: "临时帧已移动到保存文件夹",
      targetFolder,
      baseName,
      useSeparateFolders,
      frameCount: files.length
    });

    return files.length;
  }

  function cleanupStagingFolder(stagingFolder) {
    if (!stagingFolder || !fs.existsSync(stagingFolder)) {
      return;
    }

    try {
      getStagingFrameFiles(stagingFolder).forEach((file) => {
        fs.unlinkSync(path.join(stagingFolder, file));
      });
      fs.rmdirSync(stagingFolder);
    } catch (error) {
      writeLog("warn", `失败后清理临时目录失败：${serialize(error)}`);
    }
  }

  async function chooseOutputFolder() {
    writeLog("info", "打开保存文件夹选择框");
    const result = await eagle.dialog.showOpenDialog({
      title: "选择文件夹",
      buttonLabel: "选择文件夹",
      properties: ["openDirectory", "createDirectory"]
    });

    writeLog("info", {
      message: "保存文件夹选择结果",
      result
    });

    if (!result || result.canceled) {
      return null;
    }

    return Array.isArray(result.filePaths) ? result.filePaths[0] : result.filePath;
  }

  async function getSelectedItemsWithLog() {
    setStatus("正在读取当前选择...");
    writeLog("info", "开始调用 eagle.item.getSelected()");

    const selectedItems = await withTimeout(
      eagle.item.getSelected(),
      READ_SELECTED_TIMEOUT,
      "读取 Eagle 当前选择超时"
    );

    writeLog("info", {
      message: "读取当前选择完成",
      count: Array.isArray(selectedItems) ? selectedItems.length : 0,
      items: (selectedItems || []).map((item) => ({
        id: item.id,
        name: item.name,
        ext: item.ext,
        filePath: item.filePath
      }))
    });

    return selectedItems || [];
  }

  function analyzeLogText(text) {
    const lowerText = text.toLowerCase();

    if (!text.trim()) {
      return "还没有日志。先点开始导出，插件会把读取、保存位置、FFmpeg 输出都写到这里。";
    }

    if (text.includes("读取 Eagle 当前选择超时")) {
      return "卡在读取当前选择：请先确认 Eagle 主窗口里已经选中视频。如果仍然超时，关闭这个插件窗口后重新打开 Eagle 再试。";
    }

    if (text.includes("没有可导出的视频")) {
      return "没有读到视频：请确认你选中的是 mp4、mov、m4v、avi、mkv 或 webm。";
    }

    if (text.includes("保存文件夹无法写入")) {
      return "保存目录不能写入：换到桌面、下载、普通空文件夹，或确认这个目录没有被权限/同步软件锁住。";
    }

    if (text.includes("保存文件夹不存在")) {
      return "选择到的保存目录原本不存在，插件会自动创建它；如果仍失败，请在选择窗口里选择已有文件夹。";
    }

    if (lowerText.includes("could not open file") || lowerText.includes("i/o error") || lowerText.includes("error muxing")) {
      return "FFmpeg 写文件失败：插件会先写入系统临时目录，再搬到你的保存目录。若仍失败，请换一个普通英文路径文件夹测试。";
    }

    if (lowerText.includes("enoent") || lowerText.includes("no such file")) {
      return "文件路径不可用：Eagle 记录的视频原文件可能被移动、删除，或所在磁盘未连接。";
    }

    if (lowerText.includes("permission") || lowerText.includes("eacces") || lowerText.includes("access is denied")) {
      return "权限问题：保存目录可能没有写入权限。换到桌面或其他普通文件夹再导出。";
    }

    if (lowerText.includes("invalid data found") || lowerText.includes("moov atom not found")) {
      return "视频文件可能损坏，或 FFmpeg 无法识别这个视频。建议先在 Eagle 或播放器里确认能正常播放。";
    }

    if (text.includes("FFmpeg 已安装完成")) {
      return "FFmpeg 刚安装完成：重新点击开始导出即可。";
    }

    if (text.includes("FFmpeg 处理超时")) {
      return "FFmpeg 处理超时：视频可能太长、文件在慢速磁盘上，或输出目录响应很慢。建议先用短视频测试。";
    }

    if (lowerText.includes("[error]")) {
      return "检测到错误，但没有命中常见原因。把日志里最后几行错误发给我，我可以继续定位。";
    }

    if (text.includes("导出任务结束")) {
      return "没有检测到错误，最近一次导出流程已经结束。";
    }

    return "暂未检测到明确错误。若界面停住，请看日志最后一行卡在哪一步。";
  }

  function analyzeCurrentLog() {
    let text = visibleLogLines.join("\n");

    if (logFilePath && fs.existsSync(logFilePath)) {
      try {
        text = fs.readFileSync(logFilePath, "utf8");
      } catch (error) {
        writeLog("error", `读取日志文件失败：${serialize(error)}`);
      }
    }

    const result = analyzeLogText(text);
    analysisEl.textContent = result;
    writeLog("info", `日志检测结果：${result}`);
  }

  async function runExport() {
    if (isRunning) {
      return;
    }

    setBusy(true);
    await initLog();
    resetRunLog();
    updateNamingHint();
    writeLog("info", "导出任务启动");

    try {
      const useSeparateFolders = separateFoldersEl.checked;
      writeLog("info", {
        message: "导出选项",
        useSeparateFolders
      });

      const selectedItems = await getSelectedItemsWithLog();
      const videoItems = getVideoItems(selectedItems);
      selectionEl.textContent = `${videoItems.length} 个视频`;
      writeLog("info", {
        message: "视频过滤完成",
        videoCount: videoItems.length
      });

      if (!videoItems.length) {
        throw new Error("没有可导出的视频。请先在 Eagle 中选择 1 个或多个视频文件。");
      }

      const outputFolder = await chooseOutputFolder();
      if (!outputFolder) {
        setStatus("已取消");
        writeLog("info", "用户取消选择保存文件夹");
        return;
      }

      ensureWritableOutputFolder(outputFolder);

      const ffmpegPath = await ensureFfmpeg();
      if (!ffmpegPath) {
        throw new Error("未获得 FFmpeg 路径。");
      }

      const outputBaseNames = getOutputBaseNames(videoItems);
      let generatedCount = 0;
      const failures = [];

      for (let index = 0; index < videoItems.length; index += 1) {
        const item = videoItems[index];
        const baseName = outputBaseNames[index];
        const targetFolder = prepareVideoOutputFolder(outputFolder, baseName, useSeparateFolders);
        const stagingFolder = createStagingFolder(item, index);
        const outputPattern = path.join(stagingFolder, "frame_%06d.jpg");

        setStatus(`正在处理 ${index + 1}/${videoItems.length}：${getOriginalName(item)}`);

        try {
          await runFfmpeg(ffmpegPath, item.filePath, outputPattern);
          const frameCount = moveFramesToOutput(stagingFolder, targetFolder, baseName, useSeparateFolders);
          generatedCount += frameCount;
          writeLog("info", {
            message: "单个视频导出完成",
            name: getOriginalName(item),
            targetFolder,
            frameCount
          });
        } catch (error) {
          cleanupStagingFolder(stagingFolder);
          const failure = `${getOriginalName(item)}：${error.message}`;
          failures.push(failure);
          writeLog("error", failure);
        }
      }

      const successCount = videoItems.length - failures.length;
      writeLog("info", {
        message: "导出任务结束",
        successCount,
        failureCount: failures.length,
        generatedCount,
        outputFolder,
        useSeparateFolders,
        logFilePath
      });

      if (failures.length) {
        setStatus(`完成 ${successCount}/${videoItems.length} 个视频，生成 ${generatedCount} 张 JPG，有失败项`);
        analysisEl.textContent = analyzeLogText(visibleLogLines.join("\n"));
      } else {
        setStatus(`完成：${generatedCount} 张 JPG`);
        analysisEl.textContent = useSeparateFolders
          ? `导出完成。每个视频已单独保存到子文件夹：${outputFolder}`
          : `导出完成，保存位置：${outputFolder}`;
      }
    } catch (error) {
      setStatus("导出失败");
      writeLog("error", error);
      analysisEl.textContent = analyzeLogText(visibleLogLines.join("\n"));
    } finally {
      setBusy(false);
    }
  }

  separateFoldersEl.addEventListener("change", updateNamingHint);
  startBtn.addEventListener("click", runExport);
  analyzeBtn.addEventListener("click", analyzeCurrentLog);

  updateNamingHint();

  if (typeof eagle !== "undefined") {
    eagle.onPluginCreate(async (plugin) => {
      await initLog(plugin);
      setStatus("已准备好");
    });
    eagle.onPluginShow(() => {
      setStatus("选择视频后点击开始导出");
    });
  } else {
    setStatus("请在 Eagle 插件环境中运行。");
    startBtn.disabled = true;
  }
}());
