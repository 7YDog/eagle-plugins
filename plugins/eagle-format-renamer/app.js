(function () {
  const STORAGE_KEY = "codex-format-renamer-history-v1";
  const LOG_KEY = "codex-format-renamer-log-v1";
  const AUTO_REFRESH_MS = 700;
  const MAX_LOGS = 200;
  const DEFAULT_HISTORY = [
    { pattern: "%F-发布%N", start: 1, step: 1, padding: 0, dateSource: "today", dateFormat: "M月D日", sanitize: true, uses: 0 },
    { pattern: "%F-%N", start: 1, step: 1, padding: 0, dateSource: "today", dateFormat: "M月D日", sanitize: true, uses: 0 },
    { pattern: "%D-%N", start: 1, step: 1, padding: 0, dateSource: "today", dateFormat: "M月D日", sanitize: true, uses: 0 }
  ];

  const state = {
    items: [],
    folders: new Map(),
    history: [],
    running: false,
    refreshInFlight: false,
    lastSelectionKey: "",
    autoRefreshTimer: null
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheDom();
    bindEvents();
    restoreSettings();
    loadHistory();
    renderHistory();
    bootEagle();
  });

  function cacheDom() {
    dom.selectionSummary = document.getElementById("selectionSummary");
    dom.refreshButton = document.getElementById("refreshButton");
    dom.renameButton = document.getElementById("renameButton");
    dom.patternInput = document.getElementById("patternInput");
    dom.startInput = document.getElementById("startInput");
    dom.stepInput = document.getElementById("stepInput");
    dom.paddingInput = document.getElementById("paddingInput");
    dom.dateSourceInput = document.getElementById("dateSourceInput");
    dom.dateFormatInput = document.getElementById("dateFormatInput");
    dom.sanitizeInput = document.getElementById("sanitizeInput");
    dom.historyList = document.getElementById("historyList");
    dom.saveRuleButton = document.getElementById("saveRuleButton");
    dom.clearHistoryButton = document.getElementById("clearHistoryButton");
    dom.previewBody = document.getElementById("previewBody");
    dom.statusText = document.getElementById("statusText");
    dom.emptyState = document.getElementById("emptyState");
  }

  function bindEvents() {
    dom.refreshButton.addEventListener("click", refreshSelectedItems);
    dom.renameButton.addEventListener("click", renameItems);
    dom.saveRuleButton.addEventListener("click", () => {
      saveCurrentRule();
      renderHistory();
    });
    dom.clearHistoryButton.addEventListener("click", () => {
      state.history = [];
      persistHistory();
      renderHistory();
    });

    const inputs = [
      dom.patternInput,
      dom.startInput,
      dom.stepInput,
      dom.paddingInput,
      dom.dateSourceInput,
      dom.dateFormatInput,
      dom.sanitizeInput
    ];

    inputs.forEach((input) => {
      input.addEventListener("input", () => {
        persistSettings();
        renderPreview();
      });
      input.addEventListener("change", () => {
        persistSettings();
        renderPreview();
      });
    });

    document.querySelectorAll("[data-token]").forEach((button) => {
      button.addEventListener("click", () => insertToken(button.dataset.token));
    });

    window.addEventListener("focus", () => checkSelectionChange("focus"));
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        checkSelectionChange("visible");
      }
    });
  }

  function bootEagle() {
    let started = false;
    const start = () => {
      if (started) {
        return;
      }
      started = true;
      refreshSelectedItems({ reason: "startup" });
      startAutoRefresh();
    };

    if (window.eagle && typeof window.eagle.onPluginCreate === "function") {
      window.eagle.onPluginCreate(start);
      setTimeout(start, 60);
      return;
    }

    start();
  }

  async function refreshSelectedItems(options = {}) {
    const silent = options.silent === true;
    if (state.refreshInFlight) {
      return false;
    }

    state.refreshInFlight = true;
    if (!silent) {
      setBusy(true, "正在读取选中项");
    }

    try {
      if (!window.eagle || !window.eagle.item || typeof window.eagle.item.getSelected !== "function") {
        state.items = [];
        state.lastSelectionKey = "";
        dom.selectionSummary.textContent = "请在 Eagle 插件窗口中使用";
        if (!silent) {
          dom.statusText.textContent = "未检测到 Eagle 插件 API";
        }
        renderPreview();
        logEvent("api_missing", { reason: options.reason || "refresh" });
        return false;
      }

      const selected = options.selected || await window.eagle.item.getSelected();
      state.items = Array.isArray(selected) ? selected : [];
      state.lastSelectionKey = selectionKey(state.items);
      await loadFolders();

      const count = state.items.length;
      dom.selectionSummary.textContent = count > 0 ? `已选中 ${count} 个项目` : "未选中项目";
      if (!silent) {
        dom.statusText.textContent = count > 0 ? "预览已更新" : "";
      } else if (options.reason === "selection-change") {
        dom.statusText.textContent = count > 0 ? "选中项已同步" : "";
      }
      renderPreview();
      logEvent("selection_refreshed", { reason: options.reason || "manual", count });
      return true;
    } catch (error) {
      dom.selectionSummary.textContent = "读取失败";
      if (!silent) {
        dom.statusText.textContent = readableError(error);
      }
      state.items = [];
      renderPreview();
      logEvent("selection_refresh_failed", { reason: options.reason || "manual", error: readableError(error) });
      return false;
    } finally {
      state.refreshInFlight = false;
      if (!silent) {
        setBusy(false);
      } else {
        updateRenameAvailability();
      }
    }
  }

  function startAutoRefresh() {
    if (state.autoRefreshTimer) {
      clearInterval(state.autoRefreshTimer);
    }
    state.autoRefreshTimer = setInterval(() => checkSelectionChange("poll"), AUTO_REFRESH_MS);
  }

  async function checkSelectionChange(reason) {
    if (state.running || state.refreshInFlight || !window.eagle || !window.eagle.item || typeof window.eagle.item.getSelected !== "function") {
      return;
    }

    try {
      const selected = await window.eagle.item.getSelected();
      const nextItems = Array.isArray(selected) ? selected : [];
      const nextKey = selectionKey(nextItems);
      if (nextKey !== state.lastSelectionKey) {
        await refreshSelectedItems({ silent: true, reason: "selection-change", selected: nextItems });
        logEvent("selection_changed", { trigger: reason, count: nextItems.length });
      }
    } catch (error) {
      logEvent("selection_poll_failed", { trigger: reason, error: readableError(error) });
    }
  }

  async function loadFolders() {
    state.folders = new Map();
    const folderIds = [...new Set(state.items.flatMap((item) => normalizeFolderIds(item)))];
    if (folderIds.length === 0 || !window.eagle || !window.eagle.folder) {
      return;
    }

    try {
      let folders = [];
      if (typeof window.eagle.folder.getByIds === "function") {
        folders = await window.eagle.folder.getByIds(folderIds);
      } else if (typeof window.eagle.folder.getById === "function") {
        folders = await Promise.all(folderIds.map((id) => window.eagle.folder.getById(id)));
      } else if (typeof window.eagle.folder.get === "function") {
        folders = await window.eagle.folder.get({ ids: folderIds });
      }

      normalizeArray(folders).forEach((folder) => {
        if (folder && folder.id && folder.name) {
          state.folders.set(folder.id, folder.name);
        }
      });
    } catch (error) {
      console.warn("Folder lookup failed", error);
    }
  }

  function renderPreview() {
    const plan = buildRenamePlan();
    const hasItems = state.items.length > 0;
    const wrap = document.querySelector(".preview-table-wrap");
    wrap.classList.toggle("is-empty", !hasItems);
    dom.previewBody.innerHTML = "";

    if (!hasItems) {
      dom.renameButton.disabled = true;
      dom.statusText.textContent = "";
      return;
    }

    const fragment = document.createDocumentFragment();
    plan.rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.append(
        createCell(row.oldName, "name-cell"),
        createCell(row.newName || "空名称", "name-cell"),
        createCell(row.folderName, "folder-cell"),
        createStatusCell(row)
      );
      fragment.appendChild(tr);
    });
    dom.previewBody.appendChild(fragment);

    const errors = plan.rows.filter((row) => row.status === "error").length;
    const warnings = plan.rows.filter((row) => row.status === "warn").length;
    dom.renameButton.disabled = state.running || errors > 0 || plan.rows.length === 0;
    dom.statusText.textContent = errors > 0 ? `${errors} 个项目需要处理` : warnings > 0 ? `${warnings} 个项目无变化` : "可以执行";
  }

  function buildRenamePlan() {
    const settings = readSettings();
    const rows = state.items.map((item, index) => {
      const folderName = getPrimaryFolderName(item);
      const oldName = String(item.name || item.filename || "未命名");
      let newName = expandPattern(settings.pattern, item, index, folderName, settings);
      if (settings.sanitize) {
        newName = sanitizeName(newName);
      }
      newName = newName.trim();

      return {
        item,
        oldName,
        newName,
        folderName,
        status: "ready",
        message: "待重命名"
      };
    });

    const nameCounts = rows.reduce((map, row) => {
      const key = row.newName.toLocaleLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map());

    rows.forEach((row) => {
      if (!row.newName) {
        row.status = "error";
        row.message = "空名称";
      } else if (hasIllegalChars(row.newName)) {
        row.status = "error";
        row.message = "非法字符";
      } else if (nameCounts.get(row.newName.toLocaleLowerCase()) > 1) {
        row.status = "error";
        row.message = "名称重复";
      } else if (row.oldName === row.newName) {
        row.status = "warn";
        row.message = "无变化";
      }
    });

    return { settings, rows };
  }

  async function renameItems() {
    const plan = buildRenamePlan();
    const invalid = plan.rows.filter((row) => row.status === "error");
    if (invalid.length > 0 || state.running) {
      renderPreview();
      return;
    }

    setBusy(true, "正在重命名");
    let renamed = 0;
    logEvent("rename_started", { count: plan.rows.length, pattern: plan.settings.pattern });
    try {
      for (const row of plan.rows) {
        if (row.oldName === row.newName) {
          continue;
        }
        await saveItemName(row.item, row.newName);
        renamed += 1;
        dom.statusText.textContent = `已完成 ${renamed}/${plan.rows.length}`;
        logEvent("item_renamed", { id: row.item.id || "", from: row.oldName, to: row.newName });
      }

      saveCurrentRule();
      await refreshSelectedItems({ silent: true, reason: "rename-complete" });
      dom.statusText.textContent = renamed > 0 ? `已重命名 ${renamed} 个项目` : "没有需要更改的项目";
      logEvent("rename_completed", { renamed, total: plan.rows.length });
    } catch (error) {
      dom.statusText.textContent = readableError(error);
      renderPreview();
      logEvent("rename_failed", { error: readableError(error), renamed });
    } finally {
      setBusy(false);
      renderHistory();
    }
  }

  async function saveItemName(item, name) {
    item.name = name;
    if (typeof item.save === "function") {
      await item.save();
      return;
    }
    if (window.eagle && window.eagle.item && typeof window.eagle.item.save === "function") {
      await window.eagle.item.save(item);
      return;
    }
    throw new Error("当前 Eagle API 不支持保存项目名称");
  }

  function expandPattern(pattern, item, index, folderName, settings) {
    const sequence = Number(settings.start) + index * Number(settings.step);
    const numberText = String(sequence).padStart(Number(settings.padding) || 0, "0");
    const date = getDateForItem(item, settings.dateSource);
    return String(pattern || "")
      .replaceAll("%F", folderName)
      .replaceAll("%D", formatDate(date, settings.dateFormat))
      .replaceAll("%N", numberText);
  }

  function getDateForItem(item, source) {
    if (source === "createdAt") {
      return toDate(item.createdAt || item.btime || item.createdTime) || new Date();
    }
    if (source === "modifiedAt") {
      return toDate(item.modifiedAt || item.mtime || item.updatedAt || item.modifiedTime) || new Date();
    }
    return new Date();
  }

  function toDate(value) {
    if (!value) {
      return null;
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(date, format) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    return String(format || "YYYY-MM-DD")
      .replaceAll("YYYY", String(year))
      .replaceAll("YY", String(year).slice(-2))
      .replaceAll("MM", String(month).padStart(2, "0"))
      .replaceAll("M", String(month))
      .replaceAll("DD", String(day).padStart(2, "0"))
      .replaceAll("D", String(day));
  }

  function getPrimaryFolderName(item) {
    const folders = Array.isArray(item.folders) ? item.folders : [];
    for (const folder of folders) {
      if (folder && typeof folder === "object" && folder.name) {
        return String(folder.name);
      }
      if (typeof folder === "string" && state.folders.has(folder)) {
        return state.folders.get(folder);
      }
    }
    return "未分类";
  }

  function normalizeFolderIds(item) {
    const folders = Array.isArray(item.folders) ? item.folders : [];
    return folders
      .map((folder) => {
        if (typeof folder === "string") {
          return folder;
        }
        if (folder && typeof folder === "object") {
          return folder.id;
        }
        return "";
      })
      .filter(Boolean);
  }

  function normalizeArray(value) {
    if (Array.isArray(value)) {
      return value;
    }
    if (value && Array.isArray(value.data)) {
      return value.data;
    }
    if (value && Array.isArray(value.items)) {
      return value.items;
    }
    return value ? [value] : [];
  }

  function selectionKey(items) {
    return items
      .map((item) => String(item.id || item.filePath || item.path || item.name || ""))
      .join("|");
  }

  function sanitizeName(name) {
    return String(name)
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/-+/g, "-")
      .trim();
  }

  function hasIllegalChars(name) {
    return /[\\/:*?"<>|]/.test(name);
  }

  function readSettings() {
    return {
      pattern: dom.patternInput.value || "",
      start: Math.max(0, parseInt(dom.startInput.value || "1", 10)),
      step: Math.max(1, parseInt(dom.stepInput.value || "1", 10)),
      padding: Math.max(0, parseInt(dom.paddingInput.value || "0", 10)),
      dateSource: dom.dateSourceInput.value,
      dateFormat: dom.dateFormatInput.value,
      sanitize: dom.sanitizeInput.checked
    };
  }

  function applySettings(settings, options = {}) {
    dom.patternInput.value = settings.pattern || "%F-发布%N";
    dom.startInput.value = settings.start ?? 1;
    dom.stepInput.value = settings.step ?? 1;
    dom.paddingInput.value = settings.padding ?? 0;
    dom.dateSourceInput.value = settings.dateSource || "today";
    dom.dateFormatInput.value = settings.dateFormat || "M月D日";
    dom.sanitizeInput.checked = settings.sanitize !== false;
    persistSettings();
    renderPreview();
    if (options.fromHistory) {
      renderHistory();
      logEvent("history_rule_selected", { pattern: settings.pattern || "" });
      refreshSelectedItems({ silent: true, reason: "history-selected" });
    }
  }

  function insertToken(token) {
    const input = dom.patternInput;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = `${input.value.slice(0, start)}${token}${input.value.slice(end)}`;
    input.focus();
    input.selectionStart = input.selectionEnd = start + token.length;
    persistSettings();
    renderPreview();
  }

  function loadHistory() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      state.history = mergeHistory(saved, DEFAULT_HISTORY);
    } catch (error) {
      state.history = DEFAULT_HISTORY;
    }
  }

  function saveCurrentRule() {
    const settings = readSettings();
    if (!settings.pattern.trim()) {
      return;
    }
    const current = {
      ...settings,
      lastUsedAt: Date.now(),
      uses: 1
    };
    state.history = mergeHistory([current], state.history).slice(0, 16);
    persistHistory();
    logEvent("history_rule_saved", { pattern: current.pattern });
  }

  function mergeHistory(primary, secondary) {
    const result = [];
    [...primary, ...secondary].forEach((record) => {
      if (!record || !record.pattern) {
        return;
      }
      const key = historyKey(record);
      const existing = result.find((item) => historyKey(item) === key);
      if (existing) {
        existing.uses = Math.max(existing.uses || 0, record.uses || 0) + 1;
        existing.lastUsedAt = Math.max(existing.lastUsedAt || 0, record.lastUsedAt || 0);
      } else {
        result.push({ ...record });
      }
    });
    return result.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  }

  function historyKey(record) {
    return [
      record.pattern,
      record.start ?? 1,
      record.step ?? 1,
      record.padding ?? 0,
      record.dateSource || "today",
      record.dateFormat || "M月D日",
      record.sanitize !== false
    ].join("|");
  }

  function renderHistory() {
    dom.historyList.innerHTML = "";
    const history = (state.history.length > 0 ? state.history : DEFAULT_HISTORY).slice(0, 5);
    history.forEach((record) => {
      const item = document.createElement("button");
      item.className = "history-item";
      item.type = "button";
      if (historyKey(record) === historyKey(readSettings())) {
        item.classList.add("is-active");
      }
      item.innerHTML = `
        <div>
          <div class="history-rule"></div>
          <div class="history-meta"></div>
        </div>
      `;
      item.querySelector(".history-rule").textContent = record.pattern;
      item.querySelector(".history-meta").textContent = metaForHistory(record);
      item.addEventListener("click", () => applySettings(record, { fromHistory: true }));
      dom.historyList.appendChild(item);
    });
  }

  function metaForHistory(record) {
    const number = Number(record.padding) > 0 ? `序号 ${"1".padStart(Number(record.padding), "0")}` : "序号 1";
    return `${number} · ${record.dateFormat || "M月D日"}`;
  }

  function persistHistory() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
  }

  function persistSettings() {
    localStorage.setItem(`${STORAGE_KEY}-settings`, JSON.stringify(readSettings()));
  }

  function restoreSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(`${STORAGE_KEY}-settings`) || "{}");
      applySettings({
        pattern: saved.pattern || "%F-发布%N",
        start: saved.start ?? 1,
        step: saved.step ?? 1,
        padding: saved.padding ?? 0,
        dateSource: saved.dateSource || "today",
        dateFormat: saved.dateFormat || "M月D日",
        sanitize: saved.sanitize !== false
      });
    } catch (error) {
      applySettings(DEFAULT_HISTORY[0]);
    }
  }

  function createCell(text, className) {
    const td = document.createElement("td");
    td.className = className || "";
    td.textContent = text;
    return td;
  }

  function createStatusCell(row) {
    const td = document.createElement("td");
    const pill = document.createElement("span");
    pill.className = `status-pill ${row.status === "error" ? "status-error" : row.status === "warn" ? "status-warn" : "status-ready"}`;
    pill.textContent = row.message;
    td.appendChild(pill);
    return td;
  }

  function setBusy(isBusy, message) {
    state.running = isBusy;
    dom.refreshButton.disabled = isBusy;
    if (isBusy) {
      dom.renameButton.disabled = true;
    } else {
      updateRenameAvailability();
    }
    if (message) {
      dom.statusText.textContent = message;
    }
  }

  function updateRenameAvailability() {
    const plan = buildRenamePlan();
    const hasErrors = plan.rows.some((row) => row.status === "error");
    dom.renameButton.disabled = state.running || hasErrors || plan.rows.length === 0;
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
    console.log("[格式重命名]", entry);
    try {
      const logs = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
      logs.unshift(entry);
      localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, MAX_LOGS)));
    } catch (error) {
      console.warn("[格式重命名] 日志写入失败", error);
    }
  }
})();
