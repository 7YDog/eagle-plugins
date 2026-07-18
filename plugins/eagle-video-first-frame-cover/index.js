const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let pluginRef = null;

// --- 日志系统 ---
const consoleBody = document.getElementById('consoleBody');
const clearLogBtn = document.getElementById('clearLogBtn');

function appendLog(level, ...args) {
    const msg = args.map(arg => {
        if (typeof arg === 'object') {
            try {
                return arg instanceof Error ? arg.stack || arg.message : JSON.stringify(arg, null, 2);
            } catch(e) {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');

    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    entry.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-msg"></span>`;
    entry.querySelector('.log-msg').textContent = msg;
    
    consoleBody.appendChild(entry);
    consoleBody.scrollTop = consoleBody.scrollHeight;
}

// 拦截原生 console
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = function(...args) {
    originalConsoleLog.apply(console, args);
    appendLog('info', ...args);
};

console.error = function(...args) {
    originalConsoleError.apply(console, args);
    appendLog('error', ...args);
};

console.warn = function(...args) {
    originalConsoleWarn.apply(console, args);
    appendLog('warn', ...args);
};

clearLogBtn.addEventListener('click', () => {
    consoleBody.innerHTML = '';
});

// --- 界面逻辑 ---

// 关闭窗口
document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
});

// UI元素
const startBtn = document.getElementById('startBtn');
const statusText = document.getElementById('statusText');
const progressBar = document.getElementById('progressBar');

function setStatus(text, progress = null) {
    statusText.innerText = text;
    if (progress !== null) {
        progressBar.style.width = `${progress}%`;
    }
    console.log(`[状态更新] ${text}`);
}

function disableButtons(disable) {
    startBtn.disabled = disable;
}

// 封装 spawn 调用 ffmpeg 提取首帧
function extractFrame(ffmpegPath, inputPath, outputPath) {
    return new Promise((resolve, reject) => {
        const args = [
            '-y', // 覆盖输出文件
            '-i', inputPath, // 输入文件
            '-ss', '00:00:00.000', // 第 0 秒
            '-vframes', '1', // 提取 1 帧
            '-q:v', '2', // 高质量输出
            outputPath // 输出文件
        ];
        
        console.log(`[FFmpeg指令] ${ffmpegPath} ${args.join(' ')}`);
        const proc = spawn(ffmpegPath, args);
        
        let errorOutput = '';
        let stdoutOutput = '';
        proc.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });
        
        proc.stdout.on('data', (data) => {
            stdoutOutput += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                console.error('[FFmpeg Error output]', errorOutput);
                console.error('[FFmpeg stdout]', stdoutOutput);
                reject(new Error(`FFmpeg exited with code ${code}. See console for details.`));
            }
        });
        
        proc.on('error', (err) => {
            reject(err);
        });
    });
}

eagle.onPluginCreate(async (plugin) => {
    pluginRef = plugin;
    console.log("=== 插件已加载 ===");
    console.log("环境: Node.js", process.version, ", 平台:", process.platform);
    
    // 提取公共的准备逻辑
    async function prepareFfmpegAndItems() {
        let currentStep = "检查 FFmpeg 依赖";
        setStatus("正在检查 FFmpeg 依赖...", 5);
        
        const isFfmpegInstalled = await eagle.extraModule.ffmpeg.isInstalled();
        console.log("FFmpeg是否已安装:", isFfmpegInstalled);
        if (!isFfmpegInstalled) {
            currentStep = "安装 FFmpeg 依赖";
            setStatus("正在安装 FFmpeg 依赖，请稍候...", 10);
            await eagle.extraModule.ffmpeg.install();
            console.log("FFmpeg 安装完毕。");
        }
        
        currentStep = "获取 FFmpeg 路径";
        setStatus("获取 FFmpeg 路径...", 15);
        const ffmpegModule = eagle.extraModule.ffmpeg;
        let ffmpegPaths;
        if (typeof ffmpegModule.getPaths === 'function') {
            ffmpegPaths = await ffmpegModule.getPaths();
        } else {
            ffmpegPaths = ffmpegModule.paths || {};
        }
        console.log("FFmpeg路径信息:", ffmpegPaths);
        const ffmpegBinaryPath = ffmpegPaths.ffmpeg;
        
        if (!ffmpegBinaryPath) {
            throw new Error("无法获取 FFmpeg 路径！返回的路径为: " + JSON.stringify(ffmpegPaths));
        }
        
        currentStep = "获取选中文件";
        setStatus("获取选中文件...", 20);
        let items;
        try {
            items = await eagle.item.getSelected();
        } catch(e) {
            console.error("eagle.item.getSelected() 报错", e);
            throw new Error("获取选中文件API报错: " + e.message);
        }
        
        console.log("获取到资源项数量: ", items ? items.length : 0);
        if (!items || items.length === 0) {
            throw new Error("请先在 Eagle 中选中视频文件！");
        }
        
        currentStep = "过滤视频文件";
        const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'm4v'];
        const videoItems = items.filter((item, index) => {
            if (!item) return false;
            if (!item.ext) return false;
            return videoExts.includes(item.ext.toLowerCase());
        });
        
        console.log("过滤后的视频文件数量: ", videoItems.length);
        if (videoItems.length === 0) {
            throw new Error("选中的文件里没有支持的视频格式。");
        }
        
        return { ffmpegBinaryPath, videoItems, currentStep };
    }

    // 绑定按钮事件: 一键设为封面
    startBtn.addEventListener('click', async () => {
        disableButtons(true);
        let currentStep = "初始化";
        console.log("--- 开始执行: 提取并设为封面 ---");
        
        try {
            const data = await prepareFfmpegAndItems();
            const ffmpegBinaryPath = data.ffmpegBinaryPath;
            const videoItems = data.videoItems;
            currentStep = data.currentStep;
            
            currentStep = "准备处理视频";
            setStatus(`发现 ${videoItems.length} 个视频文件，准备处理...`, 25);
            
            const total = videoItems.length;
            let successCount = 0;
            
            // 遍历视频处理
            for (let i = 0; i < total; i++) {
                const item = videoItems[i];
                if (!item) continue;
                
                const itemName = item.name || `视频_${i}`;
                currentStep = `处理视频: ${itemName}`;
                setStatus(`[${i+1}/${total}] 正在处理: ${itemName}...`, 25 + Math.floor((i / total) * 70));
                
                const tempOutputPath = path.join(os.tmpdir(), `eagle_video_cover_${Date.now()}_${i}.jpg`);
                
                try {
                    currentStep = `抽取视频首帧: ${itemName}`;
                    // 调用 ffmpeg 抽帧
                    await extractFrame(ffmpegBinaryPath, item.filePath, tempOutputPath);
                    
                    currentStep = `设置视频封面: ${itemName}`;
                    console.log(`给视频 ${itemName} 设置封面: ${tempOutputPath}`);
                    // 设置封面
                    await item.setCustomThumbnail(tempOutputPath);
                    
                    currentStep = `保存视频更改: ${itemName}`;
                    await item.save();
                    console.log(`视频 ${itemName} 封面修改成功!`);
                    
                    successCount++;
                } catch (err) {
                    console.error(`处理 ${itemName} 失败:`, err);
                    if (eagle.log) {
                        eagle.log.error(`[SwitchVideoCoverPlugin] Error processing ${itemName}: ${err.message}`);
                    }
                }
            }
            
            currentStep = "完成处理";
            setStatus(`处理完成！成功更新 ${successCount}/${total} 个封面。`, 100);
            
            if (successCount > 0) {
                eagle.notification.show({
                    title: "提取封面完成",
                    body: `成功切换了 ${successCount} 个视频的封面。`
                });
            } else {
                eagle.notification.show({
                    title: "提取封面失败",
                    body: "未能成功提取任何视频封面，请查看面板上的日志。"
                });
            }
            
            setTimeout(() => {
                setStatus("等待操作...", 0);
                disableButtons(false);
            }, 3000);
            
        } catch (error) {
            console.error(error);
            setStatus(`出错: ${error.message}`, 0);
            eagle.notification.show({
                title: `出错了 [${currentStep}]`,
                body: error.stack ? error.stack.split('\n')[0] : error.message
            });
            disableButtons(false);
        }
    });


});
