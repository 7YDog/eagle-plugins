/**
 * eagle-clipboard-renamer
 * 读取剪贴板最新文本，一键重命名选中的素材（适合 OCR 提取视频标题后直接贴名）
 */

const RUN_DEBOUNCE_MS = 300;
let lastRunAt = 0;

/**
 * 隐藏插件后台窗口
 */
async function hideWindow() {
    try {
        if (typeof eagle !== 'undefined' && eagle.window && typeof eagle.window.hide === 'function') {
            await eagle.window.hide();
        }
    } catch (_) { /* ignore */ }
}

/**
 * 弹出 Eagle 桌面 Toast 提示
 */
async function notify(title, body, duration = 2500) {
    try {
        if (typeof eagle !== 'undefined' && eagle.notification && typeof eagle.notification.show === 'function') {
            await eagle.notification.show({ title, body, duration });
            return;
        }
    } catch (_) { /* ignore */ }
    try {
        console.log(`[剪贴板一键重命名] ${title}: ${body}`);
    } catch (_) { /* ignore */ }
}

/**
 * 多层兜底读取剪贴板文本
 */
async function readClipboardText() {
    // 1. Eagle 官方 API
    if (typeof eagle !== 'undefined' && eagle.clipboard && typeof eagle.clipboard.readText === 'function') {
        try {
            const text = await eagle.clipboard.readText();
            if (typeof text === 'string') return text;
        } catch (_) {}
    }

    // 2. Electron 原生 clipboard（Node 权限环境）
    try {
        if (typeof require === 'function') {
            const electron = require('electron');
            if (electron && electron.clipboard && typeof electron.clipboard.readText === 'function') {
                const text = electron.clipboard.readText();
                if (typeof text === 'string') return text;
            }
        }
    } catch (_) {}

    // 3. Web 原生 Navigator Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
        try {
            const text = await navigator.clipboard.readText();
            if (typeof text === 'string') return text;
        } catch (_) {}
    }

    return '';
}

/**
 * 清洗单行文本：
 * 1. 过滤操作系统非法文件名字符（\/:*?"<>|）
 * 2. 合并多余空格与换行，去除首尾空白
 * 3. 保持文字本体纯净，不添加任何额外前缀、后缀或格式
 */
function sanitizeTitle(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .trim()
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 解析多行剪贴板（当复制多行且与选中文件数匹配时，可一对一对应）
 */
function parseClipboardLines(text) {
    if (!text || typeof text !== 'string') return [];
    return text
        .split(/\r?\n/)
        .map(line => line.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(line => line.length > 0);
}

/**
 * 保存素材名称，兼容 item.save() 与 eagle.item.save(item)
 */
async function saveItemName(item, newName) {
    item.name = newName;
    if (typeof item.save === 'function') {
        await item.save();
        return;
    }
    if (typeof eagle !== 'undefined' && eagle.item && typeof eagle.item.save === 'function') {
        await eagle.item.save(item);
        return;
    }
    throw new Error('当前 Eagle API 不支持保存素材名称');
}

/**
 * 执行剪贴板重命名主任务
 */
async function runClipboardRename() {
    const now = Date.now();
    if (now - lastRunAt < RUN_DEBOUNCE_MS) {
        return;
    }
    lastRunAt = now;

    try {
        await hideWindow();

        if (typeof eagle === 'undefined' || !eagle.item || typeof eagle.item.getSelected !== 'function') {
            throw new Error('未检测到 Eagle 选中项 API');
        }

        const items = await eagle.item.getSelected();
        if (!items || !items.length) {
            await notify('剪贴板重命名', '请先在 Eagle 中选中需要重命名的文件');
            return;
        }

        const rawText = await readClipboardText();
        if (!rawText || !rawText.trim()) {
            await notify('剪贴板重命名', '剪贴板当前没有文本内容');
            return;
        }

        const lines = parseClipboardLines(rawText);
        const total = items.length;

        if (total === 1) {
            const cleanedTitle = sanitizeTitle(rawText);
            if (!cleanedTitle) {
                await notify('剪贴板重命名', '剪贴板文本包含全是非法字符或为空');
                return;
            }
            await saveItemName(items[0], cleanedTitle);
            await notify('重命名成功', `已重命名为：${cleanedTitle}`);
        } else {
            // 选中了多个素材
            let successCount = 0;
            if (lines.length === total) {
                // 剪贴板行数与选中的文件数恰好一致：按行一对一重命名
                for (let i = 0; i < total; i++) {
                    await saveItemName(items[i], lines[i]);
                    successCount++;
                }
            } else {
                // 剪贴板为单行文本或行数不匹配：第1个贴原名，其余按递增序号重命名避免冲突
                const baseTitle = sanitizeTitle(rawText);
                if (!baseTitle) {
                    await notify('剪贴板重命名', '剪贴板文本包含全是非法字符或为空');
                    return;
                }
                for (let i = 0; i < total; i++) {
                    const targetName = i === 0 ? baseTitle : `${baseTitle} (${i + 1})`;
                    await saveItemName(items[i], targetName);
                    successCount++;
                }
            }
            await notify('重命名完成', `已成功重命名 ${successCount} 个文件`);
        }
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        await notify('重命名失败', message);
        if (typeof eagle !== 'undefined' && eagle.log && typeof eagle.log.error === 'function') {
            eagle.log.error(`[eagle-clipboard-renamer] ${message}`);
        }
    } finally {
        setTimeout(hideWindow, 80);
    }
}

// 启动与事件监听
(function boot() {
    const supportsRunEvent = typeof eagle !== 'undefined' && typeof eagle.onPluginRun === 'function';

    if (typeof eagle !== 'undefined' && typeof eagle.onPluginCreate === 'function') {
        eagle.onPluginCreate(() => {
            hideWindow();
        });
    }

    if (supportsRunEvent) {
        eagle.onPluginRun(() => {
            runClipboardRename();
        });
    }

    if (!supportsRunEvent) {
        console.warn('[剪贴板一键重命名] 无 onPluginRun API，启动时不会自动执行');
    }

    setTimeout(hideWindow, 100);
})();

// 导出供自动化单元测试
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        sanitizeTitle,
        parseClipboardLines,
        saveItemName
    };
}
