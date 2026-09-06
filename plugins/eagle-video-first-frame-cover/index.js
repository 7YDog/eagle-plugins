const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const THUMBNAIL_WRITE_TIMEOUT_MS = 15000;
const THUMBNAIL_VERIFY_INTERVAL_MS = 200;
const RUN_DEBOUNCE_MS = 300;

let lastRunAt = 0;

async function hideWindow() {
    try {
        if (eagle && eagle.window && typeof eagle.window.hide === 'function') {
            await eagle.window.hide();
        }
    } catch (_) { /* ignore */ }
}

async function notify(title, body) {
    try {
        if (eagle && eagle.notification && typeof eagle.notification.show === 'function') {
            await eagle.notification.show({ title, body, duration: 2200 });
            return;
        }
    } catch (_) { /* ignore */ }
    try {
        console.log(`[切换视频首帧封面] ${title}: ${body}`);
    } catch (_) { /* ignore */ }
}

function extractFrame(ffmpegPath, inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-y',
            '-i', inputPath,
            '-ss', '00:00:00.000',
            '-vframes', '1',
            '-q:v', '2',
            outputPath
        ];

        const proc = spawn(ffmpegPath, args, { windowsHide: true });
        let errorOutput = '';

        proc.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`FFmpeg exited with code ${code}. ${errorOutput.slice(-300)}`));
            }
        });

        proc.on('error', (err) => reject(err));
    });
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getExpectedThumbnailPath(item) {
    if (item && item.thumbnailPath) return item.thumbnailPath;
    if (item && item.filePath && item.name) {
        return path.join(path.dirname(item.filePath), `${item.name}_thumbnail.png`);
    }
    return null;
}

function getFileSignature(filePath) {
    if (!filePath) return '';
    try {
        const stat = fs.statSync(filePath);
        return `${stat.size}:${stat.mtimeMs}`;
    } catch (_) {
        return '';
    }
}

async function setCustomThumbnailAndVerify(item, thumbnailPath) {
    if (!item || typeof item.setCustomThumbnail !== 'function') {
        throw new Error('当前 Eagle API 不支持设置自定义封面。');
    }

    const expectedThumbnailPath = getExpectedThumbnailPath(item);
    const previousSignature = getFileSignature(expectedThumbnailPath);
    let apiSettled = false;
    let apiResult;
    let apiError = null;

    // Eagle 4.0 macOS 有时已写入文件却未回传完成事件；接住 Promise 避免未处理拒绝。
    Promise.resolve()
        .then(() => item.setCustomThumbnail(thumbnailPath))
        .then(result => {
            apiResult = result;
            apiSettled = true;
        })
        .catch(error => {
            apiError = error;
            apiSettled = true;
        });

    const deadline = Date.now() + THUMBNAIL_WRITE_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const currentSignature = getFileSignature(expectedThumbnailPath);
        if (currentSignature && currentSignature !== previousSignature) {
            return { apiResult, verifiedByFile: true };
        }

        if (apiSettled) {
            if (apiError) throw apiError;
            if (apiResult === false) throw new Error('Eagle 设置自定义封面失败。');
            return { apiResult, verifiedByFile: false };
        }

        await wait(THUMBNAIL_VERIFY_INTERVAL_MS);
    }

    const finalSignature = getFileSignature(expectedThumbnailPath);
    if (finalSignature && finalSignature !== previousSignature) {
        return { apiResult, verifiedByFile: true };
    }
    if (apiError) throw apiError;
    throw new Error(`设置视频封面超时（${THUMBNAIL_WRITE_TIMEOUT_MS / 1000} 秒）。`);
}

async function prepareFfmpegAndItems() {
    const isFfmpegInstalled = await eagle.extraModule.ffmpeg.isInstalled();
    if (!isFfmpegInstalled) {
        await eagle.extraModule.ffmpeg.install();
    }

    const ffmpegModule = eagle.extraModule.ffmpeg;
    let ffmpegPaths;
    if (typeof ffmpegModule.getPaths === 'function') {
        ffmpegPaths = await ffmpegModule.getPaths();
    } else {
        ffmpegPaths = ffmpegModule.paths || {};
    }
    const ffmpegBinaryPath = ffmpegPaths.ffmpeg;
    if (!ffmpegBinaryPath) {
        throw new Error('无法获取 FFmpeg 路径：' + JSON.stringify(ffmpegPaths));
    }

    const items = await eagle.item.getSelected();
    if (!items || items.length === 0) {
        throw new Error('请先在 Eagle 中选中视频文件。');
    }

    const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v'];
    const videoItems = items.filter(item =>
        item && item.ext && videoExts.includes(String(item.ext).toLowerCase())
    );
    if (videoItems.length === 0) {
        throw new Error('选中的文件里没有支持的视频格式。');
    }

    return { ffmpegBinaryPath, videoItems };
}

async function runExtractAndSetCover(reason) {
    const now = Date.now();
    if (now - lastRunAt < RUN_DEBOUNCE_MS) {
        return;
    }
    lastRunAt = now;

    let currentStep = '初始化';
    try {
        await hideWindow();
        await notify('切换视频首帧封面', '正在处理…');

        const { ffmpegBinaryPath, videoItems } = await prepareFfmpegAndItems();
        const total = videoItems.length;
        let successCount = 0;

        for (let i = 0; i < total; i++) {
            const item = videoItems[i];
            if (!item) continue;

            const itemName = item.name || `视频_${i}`;
            currentStep = `处理: ${itemName}`;

            const tempOutputPath = path.join(os.tmpdir(), `eagle_video_cover_${Date.now()}_${i}.jpg`);

            try {
                await extractFrame(ffmpegBinaryPath, item.filePath, tempOutputPath);
                await setCustomThumbnailAndVerify(item, tempOutputPath);
                successCount++;
            } catch (err) {
                if (eagle.log) {
                    eagle.log.error(`[SwitchVideoCoverPlugin] ${itemName}: ${err.message}`);
                }
            } finally {
                try {
                    if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath);
                } catch (_) { /* ignore */ }
            }
        }

        if (successCount > 0) {
            await notify('提取封面完成', `成功切换了 ${successCount}/${total} 个视频的封面。`);
        } else {
            await notify('提取封面失败', '未能成功提取任何视频封面。');
        }
    } catch (error) {
        await notify(`出错了 [${currentStep}]`, error.message || String(error));
    } finally {
        setTimeout(hideWindow, 80);
    }
}

(function boot() {
    const supportsRunEvent = eagle && typeof eagle.onPluginRun === 'function';

    if (eagle && typeof eagle.onPluginCreate === 'function') {
        eagle.onPluginCreate(() => {
            hideWindow();
        });
    }

    if (supportsRunEvent) {
        eagle.onPluginRun(() => {
            runExtractAndSetCover('plugin-run');
        });
    }

    // 仅 onPluginRun（点击/快捷键）执行；禁止启动 fallback，避免开 Eagle 无选中就通知
    if (!supportsRunEvent) {
        console.warn('[切换视频首帧封面] 无 onPluginRun API，启动时不会自动执行');
    }
    setTimeout(() => { hideWindow(); }, 100);
})();
