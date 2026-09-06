(() => {
  "use strict";

  const CATEGORY_CONFIG = {
    make: {
      label: "厂商",
      enabledId: "makeEnabled",
      fields: ["Make", "Image Make", "Camera Make"],
    },
    model: {
      label: "型号",
      enabledId: "modelEnabled",
      fields: ["Model", "Image Model", "Camera Model"],
    },
    lens: {
      label: "镜头型号",
      enabledId: "lensEnabled",
      fields: [
        "LensModel",
        "Lens Model",
        "Lens",
        "LensID",
        "Lens ID",
        "LensInfo",
        "Lens Info",
        "LensSpecification",
        "Lens Specification",
      ],
    },
    color: {
      label: "色彩曲线",
      enabledId: "colorEnabled",
      fields: [],
    },
  };

  const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v"]);
  const CONTAINER_BOX_TYPES = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "udta"]);
  const VIDEO_SAMPLE_ENTRY_TYPES = new Set(["avc1", "avc2", "avc3", "avc4", "hvc1", "hev1", "dvhe", "dvh1", "mp4v"]);

  const state = {
    scope: "selected",
    records: [],
    values: createEmptyValueMaps(),
    busy: false,
  };

  let fsModule = null;
  let exifReader = null;
  let childProcessModule = null;
  let ffprobePathCache;

  const els = {};

  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    bindUi();
    loadDependencies();

    if (window.eagle && typeof window.eagle.onPluginCreate === "function") {
      window.eagle.onPluginCreate(() => {
        setStatus("就绪");
        scanItems();
      });
    } else {
      setStatus("离线预览", "error");
      addLog("没有检测到 Eagle 插件 API；在 Eagle 里打开插件后才能扫描和写入。", "warn");
      renderDataPreview();
    }
  });

  function cacheElements() {
    els.summary = document.getElementById("summary");
    els.statusPill = document.getElementById("statusPill");
    els.scanBtn = document.getElementById("scanBtn");
    els.applyBtn = document.getElementById("applyBtn");
    els.valuesList = document.getElementById("valuesList");
    els.dataStats = document.getElementById("dataStats");
    els.clearLogBtn = document.getElementById("clearLogBtn");
    els.log = document.getElementById("log");
    els.scopeButtons = Array.from(document.querySelectorAll("[data-scope]"));

    for (const config of Object.values(CATEGORY_CONFIG)) {
      els[config.enabledId] = document.getElementById(config.enabledId);
      els[config.enabledId].addEventListener("change", updateApplyState);
    }
  }

  function bindUi() {
    els.scanBtn.addEventListener("click", scanItems);
    els.applyBtn.addEventListener("click", applyTags);
    els.clearLogBtn.addEventListener("click", () => {
      els.log.replaceChildren();
    });

    els.scopeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.scope = button.dataset.scope;
        els.scopeButtons.forEach((scopeButton) => {
          scopeButton.classList.toggle("active", scopeButton === button);
        });
        updateSummary();
      });
    });
  }

  function loadDependencies() {
    try {
      fsModule = require("fs");
      exifReader = require("exifreader");
      childProcessModule = require("child_process");
    } catch (error) {
      addLog(`EXIF 依赖未就绪：${error.message}`, "error");
      setStatus("依赖缺失", "error");
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

    if (!fsModule || !exifReader) {
      loadDependencies();
      if (!fsModule || !exifReader) {
        return;
      }
    }

    state.busy = true;
    setButtonsDisabled(true);
    setStatus("扫描中", "busy");
    resetScanState();
    renderDataPreview();
    updateSummary();

    try {
      const items = await getItemsForScope();
      addLog(`开始扫描 ${items.length} 个项目。`);

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const progress = `${index + 1}/${items.length}`;

        try {
          const exif = readMetadataFromItem(item);
          state.records.push({ item, exif });
          addValuesFromExif(exif);

          if (hasAnyExifValue(exif)) {
            addLog(`${progress} ${item.name || item.id}: 已读取。`, "ok");
          } else {
            addLog(`${progress} ${item.name || item.id}: 没有找到目标字段。`, "warn");
          }
        } catch (error) {
          state.records.push({ item, exif: {}, error });
          addLog(`${progress} ${item.name || item.id}: ${error.message}`, "warn");
        }

        if (index % 12 === 0) {
          await idleTick();
        }
      }

      renderDataPreview();
      updateSummary();
      updateApplyState();
      setStatus("扫描完成", "done");
    } catch (error) {
      setStatus("扫描失败", "error");
      addLog(error.message, "error");
    } finally {
      state.busy = false;
      setButtonsDisabled(false);
      updateApplyState();
    }
  }

  async function getItemsForScope() {
    if (state.scope === "all") {
      return window.eagle.item.getAll();
    }
    return window.eagle.item.getSelected();
  }

  function readMetadataFromItem(item) {
    if (!item.filePath) {
      throw new Error("缺少原文件路径。");
    }

    if (VIDEO_EXTENSIONS.has(getItemExtension(item))) {
      return {
        make: "",
        model: "",
        lens: "",
        color: readVideoColorCurve(item.filePath),
      };
    }

    const buffer = fsModule.readFileSync(item.filePath);
    const tags = exifReader.load(buffer);

    return {
      make: pickTagValue(tags, CATEGORY_CONFIG.make.fields),
      model: pickTagValue(tags, CATEGORY_CONFIG.model.fields),
      lens: pickTagValue(tags, CATEGORY_CONFIG.lens.fields),
      color: "",
    };
  }

  function getItemExtension(item) {
    if (item.ext) {
      return String(item.ext).toLowerCase().replace(/^\./, "");
    }

    const match = String(item.filePath || "").match(/\.([^.\\/]+)$/);
    return match ? match[1].toLowerCase() : "";
  }

  function pickTagValue(tags, fieldNames) {
    if (!tags) {
      return "";
    }

    const normalizedTags = new Map();
    for (const [key, tag] of Object.entries(tags)) {
      normalizedTags.set(normalizeKey(key), tag);
    }

    for (const fieldName of fieldNames) {
      const tag = tags[fieldName] || normalizedTags.get(normalizeKey(fieldName));
      const value = cleanExifValue(tagToText(tag));
      if (value) {
        return value;
      }
    }

    return "";
  }

  function tagToText(tag) {
    if (!tag) {
      return "";
    }

    const raw = tag.description ?? tag.value;
    if (Array.isArray(raw)) {
      return raw.map((part) => primitiveToText(part)).filter(Boolean).join(" ");
    }

    return primitiveToText(raw);
  }

  function primitiveToText(value) {
    if (value === null || value === undefined) {
      return "";
    }

    if (typeof value === "object") {
      if ("description" in value) {
        return primitiveToText(value.description);
      }
      if ("value" in value) {
        return primitiveToText(value.value);
      }
      if ("numerator" in value && "denominator" in value && value.denominator) {
        return String(value.numerator / value.denominator);
      }
    }

    return String(value);
  }

  function cleanExifValue(value) {
    const cleaned = String(value || "")
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned || cleaned === "undefined" || cleaned === "null") {
      return "";
    }

    return cleaned;
  }

  function addValuesFromExif(exif) {
    for (const category of Object.keys(CATEGORY_CONFIG)) {
      const value = exif[category];
      if (!value) {
        continue;
      }

      const current = state.values[category].get(value) || 0;
      state.values[category].set(value, current + 1);
    }
  }

  function readVideoColorCurve(filePath) {
    const ffprobeCurve = readFfprobeColorCurve(filePath);
    if (ffprobeCurve) {
      return ffprobeCurve;
    }

    const hintedCurve = findVideoColorHint(filePath);
    if (hintedCurve) {
      return hintedCurve;
    }

    const colorInfo = findMp4ColorInfo(filePath);
    return colorInfo ? transferToCurveLabel(colorInfo.transfer) : "";
  }

  function findVideoColorHint(filePath) {
    const text = readMetadataTextSample(filePath);
    return detectColorHint(text);
  }

  function detectColorHint(text) {
    if (!text) {
      return "";
    }

    const hints = [
      [/s[\s_-]*log\s*3/i, "S-Log3"],
      [/s[\s_-]*log\s*2/i, "S-Log2"],
      [/s[\s_-]*log/i, "S-Log"],
      [/canon\s+log\s*3/i, "C-Log3"],
      [/c[\s_-]*log\s*3/i, "C-Log3"],
      [/canon\s+log\s*2/i, "C-Log2"],
      [/c[\s_-]*log\s*2/i, "C-Log2"],
      [/canon\s+log/i, "C-Log"],
      [/c[\s_-]*log/i, "C-Log"],
      [/v[\s_-]*log/i, "V-Log"],
      [/f[\s_-]*log/i, "F-Log"],
      [/n[\s_-]*log/i, "N-Log"],
      [/d[\s_-]*log/i, "D-Log"],
      [/\bhlg\b/i, "HLG"],
      [/\b(?:rec\.?\s*709|r709|bt\.?\s*709)\b/i, "Rec.709"],
    ];

    const match = hints.find(([pattern]) => pattern.test(text));
    return match ? match[1] : "";
  }

  function readFfprobeColorCurve(filePath) {
    const ffprobePath = getFfprobePath();
    if (!ffprobePath) {
      return "";
    }

    try {
      const output = childProcessModule.execFileSync(
        ffprobePath,
        ["-v", "error", "-show_streams", "-show_format", "-of", "json", filePath],
        {
          encoding: "utf8",
          maxBuffer: 2 * 1024 * 1024,
          windowsHide: true,
        },
      );
      const hintedCurve = detectColorHint(output);
      if (hintedCurve) {
        return hintedCurve;
      }

      const data = JSON.parse(output);
      const stream = Array.isArray(data.streams) ? data.streams.find((item) => item.codec_type === "video") : null;
      return stream ? ffprobeTransferToCurveLabel(stream.color_transfer) : "";
    } catch {
      return "";
    }
  }

  function getFfprobePath() {
    if (ffprobePathCache !== undefined) {
      return ffprobePathCache;
    }

    if (!childProcessModule) {
      ffprobePathCache = "";
      return ffprobePathCache;
    }

    let pathMod = null;
    let osMod = null;
    try {
      pathMod = require("path");
      osMod = require("os");
    } catch {
      pathMod = null;
      osMod = null;
    }

    const platform = getProcessPlatform();
    const home = osMod ? osMod.homedir() : "";
    const pluginCandidates = [];

    if (pathMod && home) {
      pluginCandidates.push(
        pathMod.join(home, "Library/Application Support/Eagle/Plugins/ffmpeg-mac-arm64/ffprobe"),
        pathMod.join(home, "AppData/Roaming/Eagle/Plugins/ffmpeg-win-x64/ffprobe.exe"),
      );
    }

    const candidates = [
      getEnvValue("FFPROBE_PATH"),
      getExtraModuleFfprobePathSync(),
      ...pluginCandidates,
      platform === "win32" ? "ffprobe.exe" : "",
      // Homebrew / system paths are Mac fallbacks, not the only options.
      "/opt/homebrew/bin/ffprobe",
      "/usr/local/bin/ffprobe",
      "/usr/bin/ffprobe",
      "ffprobe",
    ].filter(Boolean);

    ffprobePathCache = "";

    for (const candidate of candidates) {
      try {
        if (pathMod && candidate.includes(pathMod.sep) && fsModule && !fsModule.existsSync(candidate)) {
          continue;
        }
        childProcessModule.execFileSync(candidate, ["-version"], {
          encoding: "utf8",
          maxBuffer: 256 * 1024,
          windowsHide: true,
        });
        ffprobePathCache = candidate;
        break;
      } catch {
        // Try the next common install location.
      }
    }

    return ffprobePathCache;
  }

  function getProcessPlatform() {
    try {
      if (typeof process !== "undefined" && process.platform) {
        return process.platform;
      }
      if (window.process?.platform) {
        return window.process.platform;
      }
    } catch {
      // Ignore.
    }
    return "";
  }

  function getExtraModuleFfprobePathSync() {
    try {
      const ffmpegMod = window.eagle?.extraModule?.ffmpeg;
      if (!ffmpegMod) {
        return "";
      }

      const paths = ffmpegMod.paths || ffmpegMod._paths || ffmpegMod.cachedPaths || null;
      if (paths) {
        const candidate = paths.ffprobe || paths.ffprobePath || paths.ffprobeBin || "";
        if (candidate) {
          return candidate;
        }
      }

      // Some Eagle builds may expose a sync getter; ignore async-only APIs here.
      if (typeof ffmpegMod.getPathsSync === "function") {
        const syncPaths = ffmpegMod.getPathsSync();
        return syncPaths?.ffprobe || syncPaths?.ffprobePath || "";
      }
    } catch {
      // Ignore extraModule probe failures.
    }
    return "";
  }

  function getEnvValue(name) {
    try {
      if (window.process?.env?.[name]) {
        return window.process.env[name];
      }
      if (typeof process !== "undefined" && process.env?.[name]) {
        return process.env[name];
      }
      return "";
    } catch {
      return "";
    }
  }

  function ffprobeTransferToCurveLabel(transfer) {
    const normalized = String(transfer || "").toLowerCase();
    const labels = {
      bt709: "Rec.709",
      smpte2084: "PQ",
      "arib-std-b67": "HLG",
      log: "Log",
      log_sqrt: "Log",
      iec61966_2_1: "sRGB",
      "iec61966-2-1": "sRGB",
      linear: "Linear",
      "bt2020-10": "BT.2020",
      "bt2020-12": "BT.2020",
    };

    return labels[normalized] || "";
  }

  function readMetadataTextSample(filePath) {
    const stats = fsModule.statSync(filePath);
    const sampleSize = Math.min(stats.size, 4 * 1024 * 1024);
    const chunks = [];
    const fd = fsModule.openSync(filePath, "r");

    try {
      const head = Buffer.alloc(sampleSize);
      fsModule.readSync(fd, head, 0, sampleSize, 0);
      chunks.push(head);

      if (stats.size > sampleSize) {
        const tail = Buffer.alloc(sampleSize);
        fsModule.readSync(fd, tail, 0, sampleSize, stats.size - sampleSize);
        chunks.push(tail);
      }
    } finally {
      fsModule.closeSync(fd);
    }

    return chunks.map((chunk) => chunk.toString("latin1")).join("\n");
  }

  function findMp4ColorInfo(filePath) {
    const stats = fsModule.statSync(filePath);
    const fd = fsModule.openSync(filePath, "r");

    try {
      return walkMp4Boxes(fd, 0, stats.size, 0);
    } finally {
      fsModule.closeSync(fd);
    }
  }

  function walkMp4Boxes(fd, start, end, depth) {
    if (depth > 8 || end - start < 8) {
      return null;
    }

    let offset = start;
    let boxesRead = 0;

    while (offset + 8 <= end && boxesRead < 2000) {
      const box = readMp4BoxHeader(fd, offset, end);
      if (!box || box.size < box.headerSize || box.end <= offset) {
        return null;
      }

      if (box.type === "colr") {
        const colorInfo = readColorBox(fd, box);
        if (colorInfo) {
          return colorInfo;
        }
      }

      const childStart = getMp4ChildStart(box);
      if (childStart && childStart + 8 <= box.end) {
        const nestedColor = walkMp4Boxes(fd, childStart, box.end, depth + 1);
        if (nestedColor) {
          return nestedColor;
        }
      }

      offset = box.end;
      boxesRead += 1;
    }

    return null;
  }

  function readMp4BoxHeader(fd, offset, parentEnd) {
    const header = Buffer.alloc(16);
    const bytesRead = fsModule.readSync(fd, header, 0, 16, offset);
    if (bytesRead < 8) {
      return null;
    }

    let size = header.readUInt32BE(0);
    const type = header.toString("ascii", 4, 8);
    let headerSize = 8;

    if (size === 1) {
      if (bytesRead < 16) {
        return null;
      }
      size = Number(header.readBigUInt64BE(8));
      headerSize = 16;
    } else if (size === 0) {
      size = parentEnd - offset;
    }

    return {
      type,
      size,
      offset,
      headerSize,
      payloadOffset: offset + headerSize,
      end: Math.min(offset + size, parentEnd),
    };
  }

  function getMp4ChildStart(box) {
    if (CONTAINER_BOX_TYPES.has(box.type)) {
      return box.payloadOffset;
    }

    if (box.type === "meta" || box.type === "stsd") {
      return box.payloadOffset + 8;
    }

    if (VIDEO_SAMPLE_ENTRY_TYPES.has(box.type)) {
      return box.payloadOffset + 78;
    }

    return 0;
  }

  function readColorBox(fd, box) {
    const buffer = Buffer.alloc(Math.min(16, box.end - box.payloadOffset));
    const bytesRead = fsModule.readSync(fd, buffer, 0, buffer.length, box.payloadOffset);
    if (bytesRead < 10) {
      return null;
    }

    const colorType = buffer.toString("ascii", 0, 4);
    if (colorType !== "nclx" && colorType !== "nclc") {
      return null;
    }

    return {
      colorType,
      primaries: buffer.readUInt16BE(4),
      transfer: buffer.readUInt16BE(6),
      matrix: buffer.readUInt16BE(8),
      fullRange: colorType === "nclx" && bytesRead > 10 ? Boolean(buffer[10] & 0x80) : false,
    };
  }

  function transferToCurveLabel(transfer) {
    const labels = {
      1: "Rec.709",
      4: "Gamma 2.2",
      5: "Gamma 2.8",
      8: "Linear",
      9: "Log",
      10: "Log",
      13: "sRGB",
      14: "BT.2020",
      15: "BT.2020",
      16: "PQ",
      18: "HLG",
    };

    return labels[transfer] || "";
  }

  function renderDataPreview() {
    const totalValues = Object.keys(CATEGORY_CONFIG).reduce((sum, category) => sum + state.values[category].size, 0);
    els.valuesList.replaceChildren();
    els.dataStats.textContent = totalValues ? `${totalValues} 个值` : "暂无数据";

    if (!totalValues) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "暂无数据";
      els.valuesList.append(empty);
      return;
    }

    for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
      const entries = getSortedEntries(category);
      if (!entries.length) {
        continue;
      }

      const group = document.createElement("div");
      group.className = "data-group";

      const label = document.createElement("div");
      label.className = "data-label";
      label.textContent = config.label;

      const values = document.createElement("div");
      values.className = "data-values";

      for (const [value, count] of entries) {
        const chip = document.createElement("span");
        chip.className = "data-chip";
        chip.title = value;
        chip.textContent = value;

        if (count > 1) {
          const countEl = document.createElement("span");
          countEl.className = "data-count";
          countEl.textContent = `x${count}`;
          chip.append(countEl);
        }

        values.append(chip);
      }

      group.append(label, values);
      els.valuesList.append(group);
    }
  }

  async function applyTags() {
    if (state.busy || !state.records.length) {
      return;
    }

    const enabledCategories = getEnabledCategories();
    if (!enabledCategories.length || !hasWritableValues(enabledCategories)) {
      addLog("没有可写入的标签。", "warn");
      return;
    }

    state.busy = true;
    setButtonsDisabled(true);
    setStatus("写入中", "busy");

    let changed = 0;
    let skipped = 0;
    let failed = 0;

    try {
      for (let index = 0; index < state.records.length; index += 1) {
        const record = state.records[index];
        const tagsToAdd = buildTagsForRecord(record, enabledCategories);

        if (!tagsToAdd.length) {
          skipped += 1;
          continue;
        }

        const existingTags = Array.isArray(record.item.tags) ? record.item.tags : [];
        const mergedTags = mergeTags(existingTags, tagsToAdd);

        if (mergedTags.length === existingTags.length) {
          skipped += 1;
          continue;
        }

        record.item.tags = mergedTags;
        const result = await record.item.save();

        if (result === false) {
          failed += 1;
          addLog(`${record.item.name || record.item.id}: 保存失败。`, "error");
        } else {
          changed += 1;
          addLog(`${record.item.name || record.item.id}: +${mergedTags.length - existingTags.length} 个。`, "ok");
        }

        if (index % 8 === 0) {
          await idleTick();
        }
      }

      setStatus(failed ? "部分完成" : "写入完成", failed ? "error" : "done");
      addLog(`完成：写入 ${changed} 个，跳过 ${skipped} 个，失败 ${failed} 个。`, failed ? "warn" : "ok");
    } catch (error) {
      setStatus("写入失败", "error");
      addLog(error.message, "error");
    } finally {
      state.busy = false;
      setButtonsDisabled(false);
      updateApplyState();
    }
  }

  function buildTagsForRecord(record, enabledCategories) {
    const tags = [];

    for (const category of enabledCategories) {
      const value = record.exif?.[category];
      if (!value) {
        continue;
      }

      tags.push(cleanTagValue(value));
    }

    return tags;
  }

  function mergeTags(existingTags, tagsToAdd) {
    const merged = existingTags.slice();
    const seen = new Set(existingTags);

    for (const tag of tagsToAdd) {
      if (!tag || seen.has(tag)) {
        continue;
      }
      seen.add(tag);
      merged.push(tag);
    }

    return merged;
  }

  function cleanTagValue(value) {
    return String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/]+/g, "／")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function getEnabledCategories() {
    return Object.entries(CATEGORY_CONFIG)
      .filter(([, config]) => els[config.enabledId].checked)
      .map(([category]) => category);
  }

  function hasWritableValues(categories) {
    return state.records.some((record) => categories.some((category) => record.exif?.[category]));
  }

  function updateApplyState() {
    if (state.busy) {
      els.applyBtn.disabled = true;
      return;
    }

    const enabledCategories = getEnabledCategories();
    els.applyBtn.disabled = !state.records.length || !hasWritableValues(enabledCategories);
  }

  function updateSummary() {
    const scopeText = state.scope === "all" ? "全部项目" : "已选项目";
    const exifCount = state.records.filter((record) => hasAnyExifValue(record.exif)).length;
    const makeCount = state.values.make.size;
    const modelCount = state.values.model.size;
    const lensCount = state.values.lens.size;
    const colorCount = state.values.color.size;

    els.summary.textContent = `${scopeText} · ${state.records.length} 个项目 · ${exifCount} 个含目标字段 · 厂商/型号/镜头/曲线 ${makeCount}/${modelCount}/${lensCount}/${colorCount}`;
  }

  function setButtonsDisabled(disabled) {
    els.scanBtn.disabled = disabled;
    els.scopeButtons.forEach((button) => {
      button.disabled = disabled;
    });
    updateApplyState();
  }

  function setStatus(text, tone = "") {
    els.statusPill.textContent = text;
    els.statusPill.className = `status-pill ${tone}`.trim();
  }

  function addLog(message, tone = "") {
    const line = document.createElement("div");
    line.className = `log-line ${tone}`.trim();
    line.textContent = message;
    els.log.append(line);
    while (els.log.children.length > 450) {
      els.log.removeChild(els.log.firstChild);
    }
    els.log.scrollTop = els.log.scrollHeight;
  }

  function resetScanState() {
    state.records = [];
    state.values = createEmptyValueMaps();
  }

  function hasAnyExifValue(exif) {
    return Boolean(exif?.make || exif?.model || exif?.lens || exif?.color);
  }

  function createEmptyValueMaps() {
    return {
      make: new Map(),
      model: new Map(),
      lens: new Map(),
      color: new Map(),
    };
  }

  function getSortedEntries(category) {
    return Array.from(state.values[category].entries()).sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0], "zh-Hans-CN");
    });
  }

  function normalizeKey(key) {
    return String(key || "").toLowerCase().replace(/[\s_-]+/g, "");
  }

  function idleTick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
})();
