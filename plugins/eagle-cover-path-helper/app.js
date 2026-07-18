(function () {
  const LOG_KEY = "codex-cover-path-helper-log-v2";
  const MAX_LOGS = 200;
  const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
  const RUN_DEBOUNCE_MS = 300;

  const state = {
    libraryPath: "",
    lastRunAt: 0
  };

  document.addEventListener("DOMContentLoaded", boot);

  function boot() {
    const supportsRunEvent = window.eagle && typeof window.eagle.onPluginRun === "function";

    if (window.eagle && typeof window.eagle.onPluginCreate === "function") {
      window.eagle.onPluginCreate(() => {
        hideWindow();
      });
    }

    if (supportsRunEvent) {
      window.eagle.onPluginRun(() => executeCopy("plugin-run"));
    }

    setTimeout(() => {
      hideWindow();
      if (!supportsRunEvent) {
        executeCopy("startup-fallback");
      }
    }, 100);
  }

  async function executeCopy(reason) {
    const now = Date.now();
    if (now - state.lastRunAt < RUN_DEBOUNCE_MS) {
      return;
    }
    state.lastRunAt = now;

    try {
      await hideWindow();

      if (!window.eagle || !window.eagle.item || typeof window.eagle.item.getSelected !== "function") {
        throw new Error("未检测到 Eagle 选中项 API");
      }

      await loadLibraryPath();
      const selected = await window.eagle.item.getSelected();
      const items = Array.isArray(selected) ? selected : [];

      if (items.length === 0) {
        await notify("封面路径助手", "请先在 Eagle 里选中素材");
        logEvent("no_selection", { reason });
        return;
      }

      const paths = unique(items.map(getCoverPngPath).filter(Boolean));
      if (paths.length === 0) {
        await notify("封面路径助手", "未找到 PNG 封面路径");
        logEvent("cover_not_found", { reason, count: items.length });
        return;
      }

      const text = paths.join("\n");
      await writeClipboardText(text);
      await notify("封面路径已复制", paths.length === 1 ? paths[0] : `已复制 ${paths.length} 条路径`);
      logEvent("cover_path_copied", { reason, count: paths.length, text });
    } catch (error) {
      const message = readableError(error);
      await notify("封面路径助手", message);
      logEvent("copy_failed", { reason, error: message });
    } finally {
      setTimeout(hideWindow, 80);
    }
  }

  async function loadLibraryPath() {
    if (state.libraryPath) {
      return;
    }
    if (!window.eagle || !window.eagle.library) {
      return;
    }
    if (window.eagle.library.path) {
      state.libraryPath = typeof window.eagle.library.path === "function"
        ? String(await window.eagle.library.path())
        : String(window.eagle.library.path);
      return;
    }
    if (typeof window.eagle.library.info === "function") {
      const info = await window.eagle.library.info();
      state.libraryPath = String(info.path || "");
    }
  }

  function getCoverPngPath(item) {
    const filePath = normalizePath(field(item, "filePath", "filepath", "path"));
    const thumbnailPath = normalizePath(field(item, "thumbnailPath", "thumbnailpath"));
    const infoPath = getInfoPath(item);
    const ext = String(field(item, "ext") || extensionOf(filePath)).toLowerCase();

    if (filePath && ext === "png") {
      return filePath;
    }

    if (thumbnailPath && extensionOf(thumbnailPath) === "png") {
      return thumbnailPath;
    }

    return findCoverPngInsideInfo(infoPath);
  }

  function getInfoPath(item) {
    const metadataPath = normalizePath(field(item, "metadataFilePath", "metadatafilepath"));
    const fromMetadata = dirname(metadataPath);
    if (fromMetadata) {
      return fromMetadata;
    }

    const fromFile = extractInfoPath(field(item, "filePath", "filepath", "path"));
    if (fromFile) {
      return fromFile;
    }

    const fromThumbnail = extractInfoPath(field(item, "thumbnailPath", "thumbnailpath"));
    if (fromThumbnail) {
      return fromThumbnail;
    }

    const id = field(item, "id");
    if (state.libraryPath && id) {
      return joinPath(state.libraryPath, "images", `${id}.info`);
    }

    return "";
  }

  function findCoverPngInsideInfo(infoPath) {
    const fs = getNodeModule("fs");
    const path = getNodeModule("path");
    if (!fs || !path || !infoPath) {
      return "";
    }

    try {
      const files = fs.readdirSync(infoPath, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
      const pngFiles = files.filter((name) => extensionOf(name) === "png");
      const picked = pngFiles.find((name) => /_thumbnail\.png$/i.test(name))
        || pngFiles.find((name) => /thumbnail/i.test(name))
        || pngFiles[0];
      return picked ? path.join(infoPath, picked) : "";
    } catch (error) {
      logEvent("cover_scan_failed", { path: infoPath, error: readableError(error) });
      return "";
    }
  }

  async function writeClipboardText(text) {
    if (window.eagle && window.eagle.clipboard && typeof window.eagle.clipboard.writeText === "function") {
      await window.eagle.clipboard.writeText(text);
      return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }

    const electron = getNodeModule("electron");
    if (electron && electron.clipboard) {
      electron.clipboard.writeText(text);
      return;
    }

    throw new Error("当前环境无法写入剪贴板");
  }

  async function notify(title, body) {
    try {
      if (window.eagle && window.eagle.notification && typeof window.eagle.notification.show === "function") {
        await window.eagle.notification.show({ title, body, duration: 2200 });
        return;
      }
    } catch (error) {
      logEvent("notification_failed", { error: readableError(error) });
    }
    console.log(`[封面路径助手] ${title}: ${body}`);
  }

  async function hideWindow() {
    try {
      if (window.eagle && window.eagle.window && typeof window.eagle.window.hide === "function") {
        await window.eagle.window.hide();
      }
    } catch (error) {
      logEvent("hide_window_failed", { error: readableError(error) });
    }
  }

  function field(item, ...keys) {
    for (const key of keys) {
      if (item && item[key] !== undefined && item[key] !== null && item[key] !== "") {
        return item[key];
      }
    }
    return "";
  }

  function unique(paths) {
    return [...new Set(paths.filter(Boolean))];
  }

  function normalizePath(value) {
    return String(value || "").trim();
  }

  function dirname(value) {
    if (!value) {
      return "";
    }
    const index = Math.max(value.lastIndexOf("\\"), value.lastIndexOf("/"));
    return index > 0 ? value.slice(0, index) : "";
  }

  function extractInfoPath(value) {
    const path = normalizePath(value);
    const match = path.match(/^(.+?\.info)(?:[\\/].*)?$/i);
    return match ? match[1] : "";
  }

  function extensionOf(value) {
    const clean = String(value || "").split(/[\\/]/).pop() || "";
    const index = clean.lastIndexOf(".");
    return index >= 0 ? clean.slice(index + 1).toLowerCase() : "";
  }

  function joinPath(base, first, second) {
    const separator = base.includes("\\") ? "\\" : "/";
    return [base.replace(/[\\/]+$/, ""), first, second].join(separator);
  }

  function getNodeModule(name) {
    try {
      if (typeof require === "function") {
        return require(name);
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function readableError(error) {
    return error && error.message ? error.message : String(error || "未知错误");
  }

  function logEvent(type, detail = {}) {
    const entry = {
      time: new Date().toISOString(),
      type,
      detail
    };
    console.log("[封面路径助手]", entry);
    try {
      const logs = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
      logs.unshift(entry);
      localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
    } catch (error) {
      console.warn("[封面路径助手] 日志写入失败", error);
    }
  }
})();
