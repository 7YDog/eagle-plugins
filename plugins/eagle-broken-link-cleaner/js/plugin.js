(() => {
  "use strict";

  const state = {
    scope: "folder",
    activeScopeName: "当前文件夹",
    records: [],
    scannedCount: 0,
    totalCount: 0,
    busy: false,
    operation: "",
    cancelRequested: false,
  };

  let fsModule = null;

  const els = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindUi();
    loadDependencies();

    if (window.eagle && typeof window.eagle.onPluginCreate === "function") {
      window.eagle.onPluginCreate(() => {
        setStatus("就绪");
        updateSummary();
        renderBrokenList();
      });
    } else {
      setStatus("离线预览", "error");
      addLog("没有检测到 Eagle 插件 API；请从 Eagle 里打开插件。", "warn");
      renderBrokenList();
    }
  });

  function cacheElements() {
    els.summary = document.getElementById("summary");
    els.statusPill = document.getElementById("statusPill");
    els.scanBtn = document.getElementById("scanBtn");
    els.stopBtn = document.getElementById("stopBtn");
    els.trashBtn = document.getElementById("trashBtn");
    els.resultStats = document.getElementById("resultStats");
    els.brokenList = document.getElementById("brokenList");
    els.clearLogBtn = document.getElementById("clearLogBtn");
    els.log = document.getElementById("log");
    els.scopeButtons = Array.from(document.querySelectorAll("[data-scope]"));
  }

  function bindUi() {
    els.scanBtn.addEventListener("click", scanItems);
    els.stopBtn.addEventListener("click", stopScan);
    els.trashBtn.addEventListener("click", moveBrokenItemsToTrash);
    els.clearLogBtn.addEventListener("click", () => els.log.replaceChildren());

    els.scopeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.scope = button.dataset.scope;
        els.scopeButtons.forEach((scopeButton) => {
          scopeButton.classList.toggle("active", scopeButton === button);
        });
        state.activeScopeName = getScopeLabel(state.scope);
        updateSummary();
      });
    });
  }

  function loadDependencies() {
    try {
      fsModule = require("fs");
    } catch (error) {
      fsModule = null;
      setStatus("依赖缺失", "error");
      addLog(`无法加载文件检查模块：${error.message}`, "error");
    }
  }

  async function scanItems() {
    if (state.busy) {
      return;
    }

    if (!window.eagle || !window.eagle.item) {
      setStatus("API 不可用", "error");
      addLog("请从 Eagle 插件面板打开这个插件。", "error");
      return;
    }

    if (!fsModule) {
      loadDependencies();
      if (!fsModule) {
        return;
      }
    }

    state.busy = true;
    state.operation = "scan";
    state.cancelRequested = false;
    state.records = [];
    state.scannedCount = 0;
    state.totalCount = 0;
    setButtonsDisabled(true);
    setStatus("扫描中", "busy");
    updateSummary();
    renderBrokenList();

    try {
      const itemSet = await getItemsForScope();
      const items = itemSet.items;
      state.activeScopeName = itemSet.scopeName;
      state.totalCount = items.length;

      if (itemSet.canceled) {
        setStatus("已取消", "error");
        addLog("已取消扫描。", "warn");
        return;
      }

      addLog(`开始扫描 ${itemSet.scopeName}，共 ${items.length} 个项目。`);

      for (let index = 0; index < items.length; index += 1) {
        if (state.cancelRequested) {
          addLog(`已停止，保留已扫描出的 ${state.records.length} 个坏链项目。`, "warn");
          break;
        }

        const item = items[index];
        const record = inspectItem(item);
        state.scannedCount = index + 1;

        if (record) {
          state.records.push(record);
          addLog(`${record.displayName}: 原文件缺失。`, "warn");
        }

        if (index % 40 === 0) {
          renderScanProgress(index + 1, items.length);
          await idleTick();
        }
      }

      renderBrokenList();
      updateSummary();

      if (state.cancelRequested) {
        setStatus("已停止", "error");
      } else {
        setStatus("扫描完成", "done");
      }

      if (state.records.length > 0) {
        addLog(`找到 ${state.records.length} 个坏链项目。`, "warn");
      } else if (!state.cancelRequested) {
        addLog("没有发现坏链项目。", "ok");
      }
    } catch (error) {
      setStatus("扫描失败", "error");
      addLog(error.message, "error");
    } finally {
      state.busy = false;
      state.operation = "";
      state.cancelRequested = false;
      setButtonsDisabled(false);
      updateTrashButton();
    }
  }

  async function getItemsForScope() {
    if (state.scope === "folder") {
      const folders = await getSelectedFolders();
      if (folders.length > 0) {
        const folderIds = folders.map((folder) => folder.id).filter(Boolean);
        const items = await window.eagle.item.get({ folders: folderIds });
        return {
          items,
          scopeName: folders.length === 1 ? `当前文件夹：${folders[0].name || folders[0].id}` : `当前文件夹：${folders.length} 个`,
        };
      }

      const selectedItems = await window.eagle.item.getSelected();
      if (selectedItems.length > 0) {
        addLog("没有检测到当前文件夹，改为扫描已选项目。", "warn");
        return { items: selectedItems, scopeName: "已选项目" };
      }

      const shouldScanAll = window.confirm("没有检测到当前文件夹或已选项目。是否扫描全部项目？");
      if (!shouldScanAll) {
        return { items: [], scopeName: "全部项目", canceled: true };
      }

      addLog("没有检测到当前文件夹或已选项目，改为扫描全部项目。", "warn");
      return { items: await window.eagle.item.getAll(), scopeName: "全部项目" };
    }

    if (state.scope === "selected") {
      const selectedItems = await window.eagle.item.getSelected();
      if (selectedItems.length === 0) {
        addLog("当前没有选中项目。", "warn");
      }
      return { items: selectedItems, scopeName: "已选项目" };
    }

    const confirmed = window.confirm("将扫描全部项目，项目较多时可能需要一些时间。确定继续？");
    if (!confirmed) {
      return { items: [], scopeName: "全部项目", canceled: true };
    }

    return { items: await window.eagle.item.getAll(), scopeName: "全部项目" };
  }

  async function getSelectedFolders() {
    if (!window.eagle.folder || typeof window.eagle.folder.get !== "function") {
      return [];
    }

    const folders = await window.eagle.folder.get({ isSelected: true });
    return Array.isArray(folders) ? folders : [];
  }

  function stopScan() {
    if (state.busy && state.operation === "scan") {
      state.cancelRequested = true;
      setStatus("停止中", "error");
      addLog("正在停止扫描。", "warn");
      updateStopButton();
    }
  }

  function inspectItem(item) {
    if (!item || item.isDeleted) {
      return null;
    }

    const filePath = String(item.filePath || "");
    if (!filePath) {
      return createRecord(item, "", "缺少路径");
    }

    if (!pathExistsAsFile(filePath)) {
      return createRecord(item, filePath, "原文件缺失");
    }

    return null;
  }

  function createRecord(item, filePath, reason) {
    const name = String(item.name || item.id || "未命名");
    const ext = normalizeExt(item.ext || getExtFromPath(filePath));

    return {
      item,
      id: item.id,
      name,
      ext,
      filePath,
      reason,
      displayName: ext ? `${name}.${ext}` : name,
      moved: false,
      error: "",
    };
  }

  function pathExistsAsFile(filePath) {
    try {
      return fsModule.existsSync(filePath) && fsModule.statSync(filePath).isFile();
    } catch (error) {
      return false;
    }
  }

  function getExtFromPath(filePath) {
    const match = String(filePath || "").match(/\.([^.\\/]+)$/);
    return match ? match[1] : "";
  }

  function normalizeExt(ext) {
    return String(ext || "").replace(/^\./, "").toLowerCase();
  }

  async function moveBrokenItemsToTrash() {
    if (state.busy) {
      return;
    }

    const pending = state.records.filter((record) => !record.moved);
    if (pending.length === 0) {
      updateTrashButton();
      return;
    }

    const confirmed = window.confirm(`将 ${pending.length} 个坏链项目移入 Eagle 回收站？`);
    if (!confirmed) {
      return;
    }

    state.busy = true;
    setButtonsDisabled(true);
    setStatus("清理中", "busy");

    let movedCount = 0;

    try {
      for (let index = 0; index < pending.length; index += 1) {
        const record = pending[index];

        try {
          const item = await getFreshItem(record);
          const moveToTrash = item && item.moveToTrash;

          if (typeof moveToTrash !== "function") {
            throw new Error("当前 Eagle API 没有开放回收站方法。");
          }

          const result = await moveToTrash.call(item);
          if (!result) {
            throw new Error("Eagle 未确认移动结果。");
          }

          record.moved = true;
          movedCount += 1;
          addLog(`${record.displayName}: 已移入回收站。`, "ok");
        } catch (error) {
          record.error = error.message;
          addLog(`${record.displayName}: ${error.message}`, "error");
        }

        if (index % 20 === 0) {
          renderBrokenList();
          await idleTick();
        }
      }

      renderBrokenList();
      updateSummary();
      setStatus(movedCount === pending.length ? "清理完成" : "部分失败", movedCount === pending.length ? "done" : "error");
    } finally {
      state.busy = false;
      setButtonsDisabled(false);
      updateTrashButton();
    }
  }

  async function getFreshItem(record) {
    if (record.item && typeof record.item.moveToTrash === "function") {
      return record.item;
    }

    if (window.eagle.item && typeof window.eagle.item.getById === "function" && record.id) {
      return window.eagle.item.getById(record.id);
    }

    return record.item;
  }

  function renderScanProgress(done, total) {
    els.resultStats.textContent = `${done}/${total}`;
  }

  function renderBrokenList() {
    els.brokenList.replaceChildren();

    if (state.records.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = state.scannedCount > 0 ? "没有坏链项目" : "暂无数据";
      els.brokenList.appendChild(empty);
      els.resultStats.textContent = state.scannedCount > 0 ? `扫描 ${state.scannedCount} 个` : "暂无数据";
      updateTrashButton();
      return;
    }

    for (const record of state.records) {
      const row = document.createElement("article");
      row.className = `broken-item${record.moved ? " moved" : ""}`;

      const name = document.createElement("div");
      name.className = "broken-name";
      name.textContent = record.displayName;
      name.title = record.displayName;

      const ext = document.createElement("div");
      ext.className = "broken-ext";
      ext.textContent = record.moved ? "已清理" : record.reason;

      const filePath = document.createElement("div");
      filePath.className = "broken-path";
      filePath.textContent = record.filePath || "无文件路径";
      filePath.title = record.filePath || "";

      row.append(name, ext, filePath);

      if (record.error) {
        const error = document.createElement("div");
        error.className = "broken-path";
        error.textContent = record.error;
        row.appendChild(error);
      }

      els.brokenList.appendChild(row);
    }

    const pendingCount = state.records.filter((record) => !record.moved).length;
    els.resultStats.textContent = `${pendingCount}/${state.records.length} 待清理`;
    updateTrashButton();
  }

  function updateSummary() {
    const scopeName = state.activeScopeName || getScopeLabel(state.scope);
    const pendingCount = state.records.filter((record) => !record.moved).length;

    if (state.scannedCount === 0) {
      els.summary.textContent = `${scopeName} · 等待扫描`;
      return;
    }

    const scanText = state.totalCount > state.scannedCount ? `${state.scannedCount}/${state.totalCount}` : `${state.scannedCount}`;
    els.summary.textContent = `${scopeName} · 扫描 ${scanText} 个 · 坏链 ${pendingCount} 个`;
  }

  function getScopeLabel(scope) {
    if (scope === "folder") {
      return "当前文件夹";
    }

    if (scope === "selected") {
      return "已选项目";
    }

    return "全部项目";
  }

  function updateTrashButton() {
    if (!els.trashBtn) {
      return;
    }

    const pendingCount = state.records.filter((record) => !record.moved).length;
    els.trashBtn.disabled = state.busy || pendingCount === 0;
  }

  function updateStopButton() {
    els.stopBtn.disabled = !(state.busy && state.operation === "scan" && !state.cancelRequested);
  }

  function setButtonsDisabled(disabled) {
    els.scanBtn.disabled = disabled;
    els.scopeButtons.forEach((button) => {
      button.disabled = disabled;
    });
    updateStopButton();
    updateTrashButton();
  }

  function setStatus(text, tone = "") {
    els.statusPill.textContent = text;
    els.statusPill.className = `status-pill${tone ? ` ${tone}` : ""}`;
  }

  function addLog(message, tone = "") {
    const entry = document.createElement("div");
    entry.className = `log-entry${tone ? ` ${tone}` : ""}`;
    entry.textContent = message;
    els.log.prepend(entry);
  }

  function idleTick() {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }
})();
