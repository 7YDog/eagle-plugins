(() => {
  "use strict";

  const fs = require("fs");
  const path = require("path");
  const { fileURLToPath } = require("url");

  // PDF.js renders each PDF page to a browser canvas.
  // DPI maps to pdf.js viewport scale as: scale = DPI / 72.
  // Default 144 DPI (scale 2) balances clarity and canvas limits on Win/Mac.
  const DEFAULT_DPI = 144;
  const JPEG_QUALITY = 1; // 100%
  const OUTPUT_SUFFIX = "jpg";

  function scaleFromDpi(dpi) {
    const n = Number(dpi);
    if (!Number.isFinite(n) || n <= 0) {
      return DEFAULT_DPI / 72;
    }
    return n / 72;
  }

  const state = {
    running: false,
    lastStartAt: 0,
    outputIndex: 0,
    dpi: DEFAULT_DPI,
    jpegQuality: JPEG_QUALITY,
  };

  const titleElement = document.getElementById("title");
  const detailElement = document.getElementById("detail");
  const paramsElement = document.getElementById("params");

  function formatParamsLine() {
    const qualityPct = Math.round(state.jpegQuality * 100);
    return `DPI ${state.dpi}（scale ${(state.dpi / 72).toFixed(2)}）· JPG 品质 ${qualityPct}% · pdf.js`;
  }

  function setStatus(title, detail, kind) {
    if (titleElement) {
      titleElement.textContent = title;
      titleElement.className = `title${kind ? ` ${kind}` : ""}`;
    }
    if (detailElement) {
      detailElement.textContent = detail || "";
      detailElement.className = `detail${kind ? ` ${kind}` : ""}`;
    }
    if (paramsElement) {
      paramsElement.textContent = formatParamsLine();
    }
  }

  function getApi() {
    return window.eagle || null;
  }

  function writeLog(level, message) {
    const api = getApi();
    try {
      if (api && api.log && typeof api.log[level] === "function") {
        api.log[level](message);
        return;
      }
    } catch (_) {
      // Logging must never interrupt conversion.
    }
    if (level === "error") {
      console.error(message);
    } else {
      console.log(message);
    }
  }

  async function notify(title, body, type) {
    const api = getApi();
    if (api && api.notification && typeof api.notification.show === "function") {
      try {
        await api.notification.show({
          title,
          body,
          mute: type === "error",
          duration: type === "error" ? 7000 : 5000,
        });
      } catch (error) {
        writeLog("warn", `通知显示失败：${error.message}`);
      }
    }
  }

  async function hidePluginWindow() {
    const api = getApi();
    if (api && api.window && typeof api.window.hide === "function") {
      try {
        await api.window.hide();
      } catch (error) {
        writeLog("warn", `插件窗口隐藏失败：${error.message}`);
      }
    }
  }

  function getItemExtension(item, filePath) {
    if (item && item.ext) {
      return String(item.ext).replace(/^\./, "").toLowerCase();
    }
    return path.extname(filePath || "").replace(/^\./, "").toLowerCase();
  }

  function isAbsolutePath(filePath) {
    return path.isAbsolute(filePath) || path.win32.isAbsolute(filePath);
  }

  function getAbsolutePath(filePath, item, api) {
    if (isAbsolutePath(filePath)) {
      return filePath;
    }

    // Some Eagle builds expose filePath as a name relative to the resource
    // directory. metadataFilePath is the most precise fallback because its
    // parent is the actual directory containing the item.
    const metadataPath = item && item.metadataFilePath;
    if (typeof metadataPath === "string" && isAbsolutePath(metadataPath)) {
      return path.resolve(path.dirname(metadataPath), filePath);
    }

    const libraryPath = api && api.library && api.library.path;
    if (typeof libraryPath === "string" && isAbsolutePath(libraryPath)) {
      return path.resolve(libraryPath, filePath);
    }

    return path.resolve(filePath);
  }

  function getItemPath(item, api) {
    const candidates = [];
    if (item && item.fileURL) {
      candidates.push(item.fileURL);
    }
    if (item && item.filePath) {
      candidates.push(item.filePath);
    }

    let absoluteFallback = null;
    for (const candidate of candidates) {
      if (typeof candidate !== "string" || !candidate.trim()) {
        continue;
      }

      let filePath = candidate;
      if (filePath.startsWith("file://")) {
        try {
          filePath = fileURLToPath(filePath);
        } catch (_) {
          continue;
        }
      }

      const absolutePath = getAbsolutePath(filePath, item, api);
      if (fs.existsSync(absolutePath)) {
        return absolutePath;
      }
      if (!absoluteFallback && isAbsolutePath(filePath)) {
        absoluteFallback = absolutePath;
      }
    }

    if (absoluteFallback) {
      return absoluteFallback;
    }
    throw new Error("选中的项目没有可访问的本地文件路径。");
  }

  function getPdfEntries(items, api) {
    const unique = new Set();
    const pdfEntries = [];

    for (const item of items || []) {
      let filePath;
      try {
        filePath = getItemPath(item, api);
      } catch (error) {
        writeLog("warn", error.message);
        continue;
      }

      if (getItemExtension(item, filePath) !== "pdf") {
        continue;
      }

      const key = process.platform === "win32" ? filePath.toLowerCase() : filePath;
      if (!unique.has(key)) {
        unique.add(key);
        pdfEntries.push({ item, pdfPath: filePath });
      }
    }

    return pdfEntries;
  }

  function getPdfJs() {
    let pdfjs = window.pdfjsLib || globalThis.pdfjsLib;

    // The UMD build normally exposes window.pdfjsLib.  Keep a CommonJS
    // fallback for Eagle installations that provide module/exports globals in
    // renderer pages.
    if ((!pdfjs || typeof pdfjs.getDocument !== "function") && typeof require === "function") {
      try {
        const required = require("../vendor/pdf.min.js");
        pdfjs = required && (required["pdfjs-dist/build/pdf"] || required);
      } catch (_) {
        // The browser-global path above is the normal path.
      }
    }

    if (!pdfjs || typeof pdfjs.getDocument !== "function") {
      throw new Error("PDF.js 加载失败，请重新安装插件。");
    }

    const workerUrl = new URL("./vendor/pdf.worker.min.js", document.baseURI).href;
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
    return pdfjs;
  }

  function getVendorDirectory(name) {
    return new URL(`./vendor/${name}/`, document.baseURI).href;
  }

  function getOutputPath(pdfPath, pageNumber) {
    const extension = path.extname(pdfPath);
    const baseName = path.basename(pdfPath, extension);
    const pageLabel = String(pageNumber).padStart(3, "0");
    return path.join(path.dirname(pdfPath), `${baseName}-page-${pageLabel}.${OUTPUT_SUFFIX}`);
  }

  async function replaceFile(tempPath, outputPath) {
    // The temporary file is fully written before the destination is replaced.
    // This prevents half-written JPGs if a conversion is interrupted.
    try {
      await fs.promises.rm(outputPath, { force: true });
    } catch (error) {
      throw new Error(`无法覆盖已有文件：${error.message}`);
    }
    await fs.promises.rename(tempPath, outputPath);
  }

  async function writeCanvasAsJpeg(canvas, outputPath) {
    const dataUrl = canvas.toDataURL("image/jpeg", state.jpegQuality);
    const comma = dataUrl.indexOf(",");
    if (comma < 0) {
      throw new Error("JPG 编码失败。");
    }

    const jpegBuffer = Buffer.from(dataUrl.slice(comma + 1), "base64");
    const tempPath = `${outputPath}.tmp-${process.pid}-${Date.now()}-${state.outputIndex++}`;

    try {
      await fs.promises.writeFile(tempPath, jpegBuffer);
      await replaceFile(tempPath, outputPath);
    } finally {
      try {
        await fs.promises.rm(tempPath, { force: true });
      } catch (_) {
        // Nothing else can be done if cleanup itself fails.
      }
    }
  }

  async function convertPdf(pdfPath, pdfIndex, totalPdfs) {
    if (!fs.existsSync(pdfPath)) {
      throw new Error("文件不存在或已无法访问。");
    }

    const stat = await fs.promises.stat(pdfPath);
    if (!stat.isFile()) {
      throw new Error("选中的路径不是文件。");
    }

    const renderScale = scaleFromDpi(state.dpi);
    const pdfjs = getPdfJs();
    const data = new Uint8Array(await fs.promises.readFile(pdfPath));
    const loadingTask = pdfjs.getDocument({
      data,
      cMapUrl: getVendorDirectory("cmaps"),
      cMapPacked: true,
      standardFontDataUrl: getVendorDirectory("standard_fonts"),
      useWorkerFetch: false,
      isOffscreenCanvasSupported: false,
      disableFontFace: false,
    });

    let pdf;
    try {
      loadingTask.onProgress = (progress) => {
        if (progress && progress.total > 0) {
          const percent = Math.round((progress.loaded / progress.total) * 100);
          setStatus(
            `正在转换 ${pdfIndex}/${totalPdfs} 个 PDF`,
            `${path.basename(pdfPath)} · 读取 ${percent}%`,
          );
        }
      };

      pdf = await loadingTask.promise;
      const pageCount = pdf.numPages;
      const outputPaths = [];

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        setStatus(
          `正在转换 ${pdfIndex}/${totalPdfs} 个 PDF`,
          `${path.basename(pdfPath)} · 第 ${pageNumber}/${pageCount} 页`,
        );

        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);

        if (canvas.width <= 0 || canvas.height <= 0 || canvas.width > 32767 || canvas.height > 32767) {
          page.cleanup();
          throw new Error(`第 ${pageNumber} 页尺寸超出浏览器画布限制（可降低 DPI）。`);
        }

        const context = canvas.getContext("2d", { alpha: false });
        if (!context) {
          page.cleanup();
          throw new Error("无法创建画布。");
        }

        context.save();
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.restore();

        try {
          await page.render({
            canvasContext: context,
            viewport,
            background: "#ffffff",
            intent: "print",
          }).promise;
          const outputPath = getOutputPath(pdfPath, pageNumber);
          await writeCanvasAsJpeg(canvas, outputPath);
          outputPaths.push(outputPath);
        } finally {
          page.cleanup();
          canvas.width = 1;
          canvas.height = 1;
        }
      }

      return { pageCount, outputPaths };
    } finally {
      try {
        if (pdf && typeof pdf.cleanup === "function") {
          pdf.cleanup();
        }
      } catch (_) {
        // Best-effort cleanup.
      }
      try {
        await loadingTask.destroy();
      } catch (_) {
        // Best-effort cleanup.
      }
    }
  }

  async function findExistingEagleItem(api, outputPath) {
    if (!api.item || typeof api.item.get !== "function") {
      return null;
    }

    const name = path.basename(outputPath);
    try {
      const candidates = await api.item.get({
        ext: OUTPUT_SUFFIX,
        keywords: [name],
      });
      return (candidates || []).find((item) => {
        if (item && item.name === name) {
          return true;
        }
        return item && typeof item.filePath === "string"
          && path.basename(item.filePath) === name;
      }) || null;
    } catch (_) {
      // Searching is only a duplicate-prevention optimization. If it is not
      // available in an older Eagle build, addFromPath below still works.
      return null;
    }
  }

  async function addJpgsToOriginalEagleFolders(api, sourceItem, outputPaths) {
    if (!api.item || typeof api.item.addFromPath !== "function") {
      throw new Error("当前 Eagle 版本不支持将 JPG 写入 Eagle。");
    }

    const folders = Array.isArray(sourceItem && sourceItem.folders)
      ? sourceItem.folders.slice()
      : [];
    const tags = Array.isArray(sourceItem && sourceItem.tags)
      ? sourceItem.tags.slice()
      : [];

    for (const outputPath of outputPaths) {
      const existing = await findExistingEagleItem(api, outputPath);
      if (existing && typeof existing.save === "function") {
        existing.folders = folders;
        await existing.save();
        continue;
      }

      await api.item.addFromPath(outputPath, {
        name: path.basename(outputPath),
        folders,
        tags,
      });
    }
  }

  function formatError(error) {
    if (!error) {
      return "未知错误";
    }
    const message = error.message || String(error);
    return message.replace(/^Error:\s*/i, "").trim();
  }

  async function runConversion() {
    if (state.running) {
      return;
    }

    state.running = true;
    state.lastStartAt = Date.now();

    try {
      const api = getApi();
      if (!api || !api.item || typeof api.item.getSelected !== "function") {
        throw new Error("未检测到 Eagle 插件 API。");
      }

      setStatus("正在读取选中项目", "请稍候…");
      const items = await api.item.getSelected();
      const pdfEntries = getPdfEntries(items, api);

      if (pdfEntries.length === 0) {
        setStatus("没有可转换的 PDF", "请先在 Eagle 中选中一个或多个 PDF。", "error");
        await notify("PDF 转 JPG", "没有选中的 PDF 文件。", "error");
        return;
      }

      const successes = [];
      const failures = [];

      for (let index = 0; index < pdfEntries.length; index += 1) {
        const entry = pdfEntries[index];
        const pdfPath = entry.pdfPath;
        try {
          const result = await convertPdf(pdfPath, index + 1, pdfEntries.length);
          await addJpgsToOriginalEagleFolders(api, entry.item, result.outputPaths);
          successes.push({ name: path.basename(pdfPath), pageCount: result.pageCount });
          writeLog(
            "info",
            `${path.basename(pdfPath)}：已生成并写入原 Eagle 文件夹 ${result.pageCount} 张 JPG。`,
          );
        } catch (error) {
          const message = formatError(error);
          failures.push({ name: path.basename(pdfPath), message });
          writeLog("error", `${path.basename(pdfPath)}：${message}`);
        }
      }

      const pageTotal = successes.reduce((sum, result) => sum + result.pageCount, 0);
      if (successes.length > 0 && failures.length === 0) {
        setStatus("转换完成", `共生成 ${pageTotal} 张 JPG，已写入 PDF 原目录及 Eagle 原文件夹。`, "done");
        await notify("PDF 转 JPG 完成", `已转换 ${successes.length} 个 PDF，共生成 ${pageTotal} 张 JPG，并写入原 Eagle 文件夹。`, "done");
      } else if (successes.length > 0) {
        setStatus("部分完成", `成功 ${pageTotal} 张，失败 ${failures.length} 个 PDF。`, "error");
        await notify(
          "PDF 转 JPG 部分完成",
          `成功生成 ${pageTotal} 张 JPG；${failures.map((item) => `${item.name}：${item.message}`).join("；")}`,
          "error",
        );
      } else {
        setStatus("转换失败", failures.map((item) => `${item.name}：${item.message}`).join("；"), "error");
        await notify(
          "PDF 转 JPG 失败",
          failures.map((item) => `${item.name}：${item.message}`).join("；"),
          "error",
        );
      }
    } catch (error) {
      const message = formatError(error);
      setStatus("转换失败", message, "error");
      writeLog("error", message);
      await notify("PDF 转 JPG 失败", message, "error");
    } finally {
      // Keep the result notification visible, then close the helper window. No
      // confirmation or settings dialog is shown during the conversion.
      await new Promise((resolve) => setTimeout(resolve, 180));
      await hidePluginWindow();
      state.running = false;
    }
  }

  function startConversion() {
    // Eagle can emit onPluginCreate and onPluginShow for the same opening.
    // Debouncing avoids converting the same selection twice.
    if (Date.now() - state.lastStartAt < 700) {
      return;
    }
    void runConversion();
  }

  function registerPlugin() {
    const api = getApi();
    if (!api || typeof api.onPluginCreate !== "function") {
      setStatus("请在 Eagle 中打开", "此插件需要从 Eagle 插件面板运行。", "error");
      return;
    }

    setStatus("准备转换…", "正在读取 Eagle 中已选的 PDF");

    api.onPluginCreate(() => {
      startConversion();
    });

    if (typeof api.onPluginShow === "function") {
      api.onPluginShow(() => {
        startConversion();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", registerPlugin, { once: true });
  } else {
    registerPlugin();
  }
})();
