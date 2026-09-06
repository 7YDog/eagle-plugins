(() => {
  "use strict";

  const NO_DATE_TAG = "无日期";
  const DATE_PREFIX = /^\d{4}-\d{2}(?:-\d{2})?(?:(?:_\d{2}-\d{2}-\d{2})?__|_)/;
  const LOG_FILE_NAME = "debug.log";

  const state = {
    scope: "selected",
    activeScopeName: "已选项目",
    records: [],
    scannedCount: 0,
    totalCount: 0,
    filter: "all",
    busy: false,
    operation: "",
    cancelRequested: false,
  };

  let fsModule = null;
  let pathModule = null;
  let logFilePath = "";

  const els = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindUi();
    loadDependencies();

    if (window.eagle && typeof window.eagle.onPluginCreate === "function") {
      window.eagle.onPluginCreate(() => {
        setStatus("就绪");
        updateSummary();
        renderPreview();
      });
    } else {
      setStatus("离线预览", "error");
      addLog("没有检测到 Eagle 插件 API；请从 Eagle 里打开插件。", "warn");
      renderPreview();
    }
  });

  function cacheElements() {
    els.summary = document.getElementById("summary");
    els.statusPill = document.getElementById("statusPill");
    els.scanBtn = document.getElementById("scanBtn");
    els.stopBtn = document.getElementById("stopBtn");
    els.applyBtn = document.getElementById("applyBtn");
    els.diagnosticsBtn = document.getElementById("diagnosticsBtn");
    els.tagNoDateBtn = document.getElementById("tagNoDateBtn");
    els.resultStats = document.getElementById("resultStats");
    els.previewList = document.getElementById("previewList");
    els.clearLogBtn = document.getElementById("clearLogBtn");
    els.log = document.getElementById("log");
    els.scopeButtons = Array.from(document.querySelectorAll("[data-scope]"));
    els.filterButtons = Array.from(document.querySelectorAll("[data-filter]"));
  }

  function bindUi() {
    els.scanBtn.addEventListener("click", scanItems);
    els.stopBtn.addEventListener("click", stopScan);
    els.applyBtn.addEventListener("click", applyRenames);
    els.diagnosticsBtn.addEventListener("click", writeDiagnostics);
    els.tagNoDateBtn.addEventListener("click", tagNoDateItems);
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

    els.filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.filter = button.dataset.filter;
        els.filterButtons.forEach((filterButton) => {
          filterButton.classList.toggle("active", filterButton === button);
        });
        renderPreview();
      });
    });
  }

  function loadDependencies() {
    try {
      fsModule = require("fs");
      pathModule = require("path");
      logFilePath = pathModule.join(__dirname, "..", LOG_FILE_NAME);
      writeDebugLog("dependencies-ready", { logFilePath });
    } catch (error) {
      fsModule = null;
      pathModule = null;
      setStatus("依赖缺失", "error");
      addLog(`无法加载 Node 模块：${error.message}`, "error");
    }
  }

  async function scanItems() {
    if (state.busy) return;

    if (!window.eagle || !window.eagle.item) {
      setStatus("API 不可用", "error");
      addLog("请从 Eagle 插件面板打开这个插件。", "error");
      return;
    }

    if (!fsModule) {
      loadDependencies();
      if (!fsModule) return;
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
    renderPreview();

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
          addLog(`已停止，保留 ${state.records.length} 条预览结果。`, "warn");
          break;
        }

        const item = items[index];
        const record = await inspectItem(item);
        state.records.push(record);
        state.scannedCount = index + 1;

        if (record.canApply) {
          addLog(`${index + 1}/${items.length} ${item.name}: ${record.dateInfo.sortable}`, "ok");
        } else if (record.dateInfo) {
          addLog(`${index + 1}/${items.length} ${item.name}: ${record.reason}`, "warn");
        } else {
          addLog(`${index + 1}/${items.length} ${item.name}: 没有可用日期。`, "warn");
        }

        if (index % 30 === 0) {
          renderScanProgress(index + 1, items.length);
          renderPreview();
          await idleTick();
        }
      }

      recomputeRecords({ silent: true });
      setStatus(state.cancelRequested ? "已停止" : "扫描完成", state.cancelRequested ? "error" : "done");
    } catch (error) {
      setStatus("扫描失败", "error");
      addLog(error.message, "error");
    } finally {
      state.busy = false;
      state.operation = "";
      state.cancelRequested = false;
      setButtonsDisabled(false);
      updateApplyButton();
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
      if (selectedItems.length === 0) addLog("当前没有选中项目。", "warn");
      return { items: selectedItems, scopeName: "已选项目" };
    }

    const confirmed = window.confirm("将扫描全部项目，项目较多时可能需要一些时间。确定继续？");
    if (!confirmed) {
      return { items: [], scopeName: "全部项目", canceled: true };
    }

    return { items: await window.eagle.item.getAll(), scopeName: "全部项目" };
  }

  async function getSelectedFolders() {
    if (!window.eagle.folder) return [];
    if (typeof window.eagle.folder.get === "function") {
      const folders = await window.eagle.folder.get({ isSelected: true });
      return Array.isArray(folders) ? folders : [];
    }
    if (typeof window.eagle.folder.getSelected === "function") {
      const folders = await window.eagle.folder.getSelected();
      return Array.isArray(folders) ? folders : [];
    }
    return [];
  }

  async function inspectItem(item) {
    const dateInfo = await detectDate(item);
    const record = {
      item,
      originalName: item.name || item.id,
      dateInfo,
      proposedName: "",
      canApply: false,
      reason: "",
      applied: false,
    };
    updateRecordProposal(record);
    return record;
  }

  async function detectDate(item) {
    const fromImage = readImageCreation(item.filePath);
    if (fromImage) return fromImage;

    const fromFilename = readFilenameDate(item);
    if (fromFilename) return fromFilename;

    const fromFileBirth = readFileBirthtime(item.filePath);
    if (fromFileBirth) return fromFileBirth;

    const modified = Number(item.modifiedAt || 0);
    if (modified > 0) return dateFromMs(modified, "eagle-modifiedAt", "low");

    try {
      const stat = fsModule.statSync(item.filePath);
      return dateFromMs(stat.mtimeMs, "file-modified", "low");
    } catch {
      return null;
    }
  }

  function readImageCreation(filePath) {
    if (!filePath || !fsModule) return null;

    const fromExif = readJpegExifDateTimeOriginal(filePath);
    if (fromExif) return fromExif;

    return null;
  }

  function readJpegExifDateTimeOriginal(filePath) {
    try {
      const fd = fsModule.openSync(filePath, "r");
      try {
        const head = Buffer.alloc(65536);
        const bytesRead = fsModule.readSync(fd, head, 0, head.length, 0);
        if (bytesRead < 12 || head[0] !== 0xff || head[1] !== 0xd8) return null;

        let offset = 2;
        while (offset + 4 <= bytesRead) {
          if (head[offset] !== 0xff) break;
          const marker = head[offset + 1];
          if (marker === 0xd9 || marker === 0xda) break;
          if (offset + 4 > bytesRead) break;
          const size = head.readUInt16BE(offset + 2);
          if (size < 2 || offset + 2 + size > bytesRead) break;

          if (marker === 0xe1) {
            const segStart = offset + 4;
            const segEnd = offset + 2 + size;
            if (segEnd <= bytesRead && head.toString("ascii", segStart, segStart + 6) === "Exif\u0000\u0000") {
              const parsed = parseExifDateTimeOriginal(head, segStart + 6, segEnd);
              if (parsed) return parsed;
            }
          }

          offset += 2 + size;
        }
      } finally {
        fsModule.closeSync(fd);
      }
    } catch (error) {
      writeDebugLog("exif-read-failed", { filePath, message: error.message });
    }
    return null;
  }

  function parseExifDateTimeOriginal(buffer, tiffStart, tiffEnd) {
    if (tiffEnd - tiffStart < 8) return null;
    const order = buffer.toString("ascii", tiffStart, tiffStart + 2);
    if (order !== "II" && order !== "MM") return null;
    const le = order === "II";
    const u16 = (pos) => (le ? buffer.readUInt16LE(pos) : buffer.readUInt16BE(pos));
    const u32 = (pos) => (le ? buffer.readUInt32LE(pos) : buffer.readUInt32BE(pos));

    const ifd0Offset = u32(tiffStart + 4);
    const exifOffset = findIfdPointer(buffer, tiffStart, tiffEnd, ifd0Offset, 0x8769, le, u16, u32);
    if (exifOffset == null) return null;

    const dateStr = findIfdAscii(buffer, tiffStart, tiffEnd, exifOffset, 0x9003, le, u16, u32)
      || findIfdAscii(buffer, tiffStart, tiffEnd, exifOffset, 0x9004, le, u16, u32)
      || findIfdAscii(buffer, tiffStart, tiffEnd, ifd0Offset, 0x0132, le, u16, u32);
    if (!dateStr) return null;

    const match = dateStr.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    if (!match) return null;
    const [, year, month, day, hour, minute, second] = match;
    return {
      raw: `${year}:${month}:${day} ${hour}:${minute}:${second}`,
      sortable: `${year}-${month}-${day}_${hour}-${minute}-${second}`,
      dateOnly: `${year}-${month}-${day}`,
      monthOnly: `${year}-${month}`,
      year,
      month,
      source: "image-creation",
      sourceLabel: "图片内创建时间",
      confidence: "high",
    };
  }

  function findIfdPointer(buffer, tiffStart, tiffEnd, ifdRel, tag, le, u16, u32) {
    const entry = findIfdEntry(buffer, tiffStart, tiffEnd, ifdRel, tag, u16);
    if (!entry) return null;
    return u32(entry + 8);
  }

  function findIfdAscii(buffer, tiffStart, tiffEnd, ifdRel, tag, le, u16, u32) {
    const entry = findIfdEntry(buffer, tiffStart, tiffEnd, ifdRel, tag, u16);
    if (!entry) return null;
    const type = u16(entry + 2);
    const count = u32(entry + 4);
    if (type !== 2 || count < 10) return null;
    let valueOffset = entry + 8;
    if (count > 4) {
      valueOffset = tiffStart + u32(entry + 8);
    }
    if (valueOffset < tiffStart || valueOffset + count > tiffEnd) return null;
    return buffer.toString("ascii", valueOffset, valueOffset + count).replace(/\u0000+$/, "").trim();
  }

  function findIfdEntry(buffer, tiffStart, tiffEnd, ifdRel, tag, u16) {
    const ifdAbs = tiffStart + ifdRel;
    if (ifdAbs + 2 > tiffEnd) return null;
    const count = u16(ifdAbs);
    for (let i = 0; i < count; i += 1) {
      const entry = ifdAbs + 2 + i * 12;
      if (entry + 12 > tiffEnd) break;
      if (u16(entry) === tag) return entry;
    }
    return null;
  }

  function readFileBirthtime(filePath) {
    if (!filePath || !fsModule) return null;
    try {
      const stat = fsModule.statSync(filePath);
      if (Number(stat.birthtimeMs) > 0) {
        return dateFromMs(stat.birthtimeMs, "file-birthtime", "medium");
      }
      if (Number(stat.ctimeMs) > 0) {
        return dateFromMs(stat.ctimeMs, "file-ctime", "medium");
      }
    } catch (error) {
      writeDebugLog("stat-birthtime-failed", { filePath, message: error.message });
    }
    return null;
  }

  function readFilenameDate(item) {
    const base = item.name || "";

    const epochMs = base.match(/(?:^|[^0-9])(\d{13})(?:[^0-9]|$)/);
    if (epochMs) return dateFromMs(Number(epochMs[1]), "filename-epoch-ms", "medium");

    const compact = base.match(/(?:^|[^0-9])((?:19|20)\d{2})(\d{2})(\d{2})[-_ ]?(\d{2})(\d{2})(\d{2})(?:[^0-9]|$)/);
    if (compact) {
      const [, year, month, day, hour, minute, second] = compact;
      return dateFromParts([year, month, day, hour, minute, second], "filename-datetime", "medium");
    }

    const separated = base.match(/((?:19|20)\d{2})[-_.](\d{2})[-_.](\d{2})[ T_-](\d{2})[-_.:](\d{2})(?:[-_.:](\d{2}))?/);
    if (separated) {
      const [, year, month, day, hour, minute, second = "00"] = separated;
      return dateFromParts([year, month, day, hour, minute, second], "filename-datetime", "medium");
    }

    const dateOnly = base.match(/(?:^|[^0-9])((?:19|20)\d{2})(\d{2})(\d{2})(?:[^0-9]|$)/);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return dateFromParts([year, month, day], "filename-date", "medium");
    }

    return null;
  }

  function sourceLabelFor(source) {
    if (source === "image-creation") return "图片内创建时间";
    if (String(source || "").startsWith("filename")) return "文件名";
    if (source === "file-birthtime" || source === "file-ctime") return "文件创建时间";
    return "低置信度";
  }

  function dateFromMs(ms, source, confidence) {
    if (!Number.isFinite(ms) || ms <= 0) return null;
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    const year = String(d.getFullYear());
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hour = pad(d.getHours());
    const minute = pad(d.getMinutes());
    const second = pad(d.getSeconds());
    return {
      raw: d.toISOString(),
      sortable: `${year}-${month}-${day}_${hour}-${minute}-${second}`,
      dateOnly: `${year}-${month}-${day}`,
      monthOnly: `${year}-${month}`,
      year,
      month,
      source,
      sourceLabel: sourceLabelFor(source),
      confidence,
    };
  }

  function dateFromParts(parts, source, confidence) {
    const [year, month, day, hour = "00", minute = "00", second = "00"] = parts;
    return {
      raw: `${year}-${month}-${day} ${hour}:${minute}:${second}`,
      sortable: `${year}-${month}-${day}_${hour}-${minute}-${second}`,
      dateOnly: `${year}-${month}-${day}`,
      monthOnly: `${year}-${month}`,
      year,
      month,
      source,
      sourceLabel: "文件名",
      confidence,
    };
  }

  function updateRecordProposal(record) {
    record.proposedName = "";
    record.canApply = false;
    record.reason = "";

    if (!record.dateInfo) {
      record.reason = "待确认：没有可用日期";
      return;
    }

    if (record.dateInfo.confidence === "low") {
      record.reason = "待确认：只有低置信度日期";
      return;
    }

    const baseName = stripExistingPrefixAndId(record.originalName, record.item.id);
    const cleanBase = safeNamePart(baseName || record.item.id);
    record.proposedName = `${record.dateInfo.dateOnly}_${cleanBase}`;
    record.canApply = record.proposedName !== record.originalName;
    record.reason = record.canApply ? "可改名" : "名称未变化";
  }

  function stripExistingPrefixAndId(name, itemId) {
    const withoutDate = String(name || "").replace(DATE_PREFIX, "");
    return withoutDate.replace(new RegExp(`__${escapeRegExp(itemId)}$`), "");
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function safeNamePart(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/[\/\\:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 130);
  }

  function recomputeRecords(options = {}) {
    state.records.forEach(updateRecordProposal);
    renderPreview();
    updateSummary();
    updateApplyButton();
    if (!options.silent) addLog("已刷新命名预览。");
  }

  async function applyRenames() {
    if (state.busy) return;

    const candidates = state.records.filter((record) => record.canApply);
    if (candidates.length === 0) {
      addLog("没有可应用的改名项目。", "warn");
      return;
    }

    const confirmed = window.confirm(`将通过 Eagle API 改名 ${candidates.length} 个项目。确定继续？`);
    if (!confirmed) return;

    state.busy = true;
    state.operation = "apply";
    setButtonsDisabled(true);
    setStatus("写入中", "busy");

    let applied = 0;
    let failed = 0;

    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const record = candidates[index];
        try {
          record.item.name = record.proposedName;
          await record.item.save();
          record.applied = true;
          applied += 1;
          addLog(`${index + 1}/${candidates.length} 已改名：${record.proposedName}`, "ok");
        } catch (error) {
          failed += 1;
          addLog(`${record.originalName}: ${error.message}`, "error");
        }

        if (index % 10 === 0) {
          renderPreview();
          await idleTick();
        }
      }

      setStatus("写入完成", failed ? "error" : "done");
      addLog(`完成：${applied} 个成功，${failed} 个失败。`, failed ? "warn" : "ok");
    } finally {
      state.busy = false;
      state.operation = "";
      setButtonsDisabled(false);
      renderPreview();
      updateSummary();
      updateApplyButton();
    }
  }

  async function tagNoDateItems() {
    if (state.busy) return;

    const reviewRecords = state.records.filter(isReviewRecord);
    if (reviewRecords.length === 0) {
      addLog("没有待确认项目。", "warn");
      return;
    }

    const confirmed = window.confirm(`将给 ${reviewRecords.length} 个待确认项目添加「${NO_DATE_TAG}」标签。确定继续？`);
    if (!confirmed) return;

    state.busy = true;
    state.operation = "tag";
    setButtonsDisabled(true);
    setStatus("标记中", "busy");

    let tagged = 0;
    let failed = 0;

    try {
      for (let index = 0; index < reviewRecords.length; index += 1) {
        const record = reviewRecords[index];
        try {
          record.item.tags = mergeTags(record.item.tags, [NO_DATE_TAG]);
          await record.item.save();
          tagged += 1;
          addLog(`${index + 1}/${reviewRecords.length} 已标记：${record.originalName}`, "ok");
        } catch (error) {
          failed += 1;
          addLog(`${record.originalName}: ${error.message}`, "error");
        }

        if (index % 10 === 0) {
          await idleTick();
        }
      }

      setStatus("标记完成", failed ? "error" : "done");
      addLog(`完成：${tagged} 个已添加「${NO_DATE_TAG}」，${failed} 个失败。`, failed ? "warn" : "ok");
    } finally {
      state.busy = false;
      state.operation = "";
      setButtonsDisabled(false);
      updateApplyButton();
    }
  }

  function mergeTags(existing, additions) {
    const set = new Set(Array.isArray(existing) ? existing : []);
    additions.filter(Boolean).forEach((tag) => set.add(tag));
    return Array.from(set);
  }

  function stopScan() {
    if (!state.busy || state.operation !== "scan") return;
    state.cancelRequested = true;
    setStatus("停止中", "busy");
    addLog("收到停止请求。", "warn");
  }

  function renderPreview() {
    els.previewList.replaceChildren();

    const visibleRecords = getVisibleRecords();

    if (state.records.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无预览";
      els.previewList.appendChild(empty);
      els.resultStats.textContent = "暂无数据";
      return;
    }

    if (visibleRecords.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "当前筛选下没有项目";
      els.previewList.appendChild(empty);
      updateResultStats();
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const record of visibleRecords) {
      const row = document.createElement("article");
      row.className = `preview-item ${record.canApply ? "" : "skip"} ${record.applied ? "applied" : ""}`;

      const thumb = document.createElement("img");
      thumb.className = "thumb";
      thumb.src = record.item.thumbnailURL || record.item.fileURL || "";
      thumb.alt = "";
      row.appendChild(thumb);

      const names = document.createElement("div");
      names.className = "names";

      const oldName = document.createElement("div");
      oldName.className = "old-name";
      oldName.textContent = record.originalName;
      names.appendChild(oldName);

      const newName = document.createElement("div");
      newName.className = "new-name";
      newName.textContent = record.proposedName || record.reason || "未命名";
      names.appendChild(newName);
      row.appendChild(names);

      const badge = document.createElement("div");
      badge.className = `badge ${record.dateInfo?.confidence || "none"}`;
      badge.textContent = confidenceLabel(record);
      row.appendChild(badge);

      const meta = document.createElement("div");
      meta.className = "meta-line";
      meta.textContent = metaText(record);
      row.appendChild(meta);

      fragment.appendChild(row);
    }

    els.previewList.appendChild(fragment);
    updateResultStats();
    updateNoDateTagButton();
  }

  function getVisibleRecords() {
    if (state.filter === "review") return state.records.filter(isReviewRecord);
    if (state.filter === "apply") return state.records.filter((record) => record.canApply);
    return state.records;
  }

  function isReviewRecord(record) {
    return !record.dateInfo || record.dateInfo.confidence === "low";
  }

  function metaText(record) {
    if (!record.dateInfo) return `${record.reason || "日期缺失"} · ${record.item.filePath || ""}`;
    return `${record.dateInfo.raw} · ${record.dateInfo.sourceLabel} · ${record.reason || "可改名"}`;
  }

  function confidenceLabel(record) {
    if (!record.dateInfo) return "缺失";
    if (record.dateInfo.confidence === "high") return "高";
    if (record.dateInfo.confidence === "medium") return "中";
    return "低";
  }

  function renderScanProgress(done, total) {
    els.resultStats.textContent = `${done}/${total}`;
    updateSummary();
  }

  function updateResultStats() {
    const canApply = state.records.filter((record) => record.canApply).length;
    const high = state.records.filter((record) => record.dateInfo?.confidence === "high").length;
    const medium = state.records.filter((record) => record.dateInfo?.confidence === "medium").length;
    const low = state.records.filter((record) => record.dateInfo?.confidence === "low").length;
    const missing = state.records.filter((record) => !record.dateInfo).length;
    const review = state.records.filter(isReviewRecord).length;
    const showing = getVisibleRecords().length;
    els.resultStats.textContent = `显示 ${showing} · 可改名 ${canApply} · 待确认 ${review} · 高 ${high} · 中 ${medium} · 低 ${low} · 缺失 ${missing}`;
  }

  function updateSummary() {
    if (state.busy && state.operation === "scan") {
      els.summary.textContent = `${state.activeScopeName} · ${state.scannedCount}/${state.totalCount}`;
      return;
    }
    const canApply = state.records.filter((record) => record.canApply).length;
    els.summary.textContent = state.records.length ? `${state.activeScopeName} · ${state.records.length} 个项目 · ${canApply} 个可改名` : `${state.activeScopeName} · 等待扫描`;
  }

  function updateApplyButton() {
    els.applyBtn.disabled = state.busy || state.records.filter((record) => record.canApply).length === 0;
    updateNoDateTagButton();
  }

  function updateNoDateTagButton() {
    els.tagNoDateBtn.disabled = state.busy || state.records.filter(isReviewRecord).length === 0;
  }

  function setButtonsDisabled(disabled) {
    els.scanBtn.disabled = disabled;
    els.stopBtn.disabled = !(disabled && state.operation === "scan");
    els.applyBtn.disabled = disabled || state.records.filter((record) => record.canApply).length === 0;
    els.tagNoDateBtn.disabled = disabled || state.records.filter(isReviewRecord).length === 0;
    els.diagnosticsBtn.disabled = disabled && state.operation !== "scan";
    els.scopeButtons.forEach((button) => {
      button.disabled = disabled;
    });
    els.filterButtons.forEach((button) => {
      button.disabled = disabled;
    });
  }

  function setStatus(text, stateName = "") {
    els.statusPill.textContent = text;
    els.statusPill.className = `status-pill ${stateName}`.trim();
  }

  function getScopeLabel(scope) {
    if (scope === "selected") return "已选项目";
    if (scope === "all") return "全部项目";
    return "当前文件夹";
  }

  function addLog(message, level = "") {
    const entry = document.createElement("div");
    entry.className = `log-entry ${level}`.trim();
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    els.log.prepend(entry);
    writeDebugLog("ui-log", { level, message });
  }

  function writeDiagnostics() {
    const payload = {
      scope: state.scope,
      activeScopeName: state.activeScopeName,
      records: state.records.length,
      canApply: state.records.filter((record) => record.canApply).length,
      review: state.records.filter(isReviewRecord).length,
      scannedCount: state.scannedCount,
      totalCount: state.totalCount,
      busy: state.busy,
      operation: state.operation,
      filter: state.filter,
    };
    writeDebugLog("diagnostics", payload);
    addLog(`诊断已写入：${logFilePath || LOG_FILE_NAME}`, "ok");
  }

  function writeDebugLog(event, payload = {}) {
    if (!fsModule || !logFilePath) return;
    try {
      fsModule.appendFileSync(logFilePath, `${new Date().toISOString()} ${event} ${JSON.stringify(payload)}\n`);
    } catch {
      // Ignore logging failures so diagnostics never block the plugin.
    }
  }

  function idleTick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  window.addEventListener("error", (event) => {
    writeDebugLog("window-error", {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
      stack: event.error?.stack,
    });
    if (els.log) addLog(`JS 错误：${event.message}`, "error");
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    writeDebugLog("unhandled-rejection", {
      message: reason?.message || String(reason),
      stack: reason?.stack,
    });
    if (els.log) addLog(`异步错误：${reason?.message || String(reason)}`, "error");
  });
})();
