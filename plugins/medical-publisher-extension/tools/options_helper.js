(function() {
    window.__AIBEIKE_HELPER_LOADED = true;

    const CONFIG = {
        xuweiguang: {
            name: "徐伟光",
            tags: "医生日常 脑积水 脑脊液 我要上热门 硬核科普健康行动"
        },
        zhouhui: {
            name: "周辉",
            tagsMap: {
                mianjijingluan: "面肌痉挛 我要上热门 眼皮跳 硬核科普健康行动",
                miantan: "面瘫 面瘫后遗症 我要上热门 硬核科普健康行动"
            }
        }
    };

    const MIANJI_KEYWORDS = ["面肌痉挛", "眼皮跳", "眼跳", "抽搐", "面抽", "痉挛", "抽动", "肉跳", "眼部抽", "嘴角跳", "跳动"];
    const MIANTAN_KEYWORDS = ["面瘫", "嘴歪", "歪嘴", "口角歪", "闭不上眼", "闭眼不全", "面神经炎", "面神经麻痹", "后遗症", "面神经"];

    function detectDoctorFromPage() {
        const oldPanel = document.getElementById("jev-helper-panel");
        let pageText = "";
        if (oldPanel) {
            oldPanel.style.display = "none";
            pageText = document.body.innerText;
            oldPanel.style.display = "";
        } else {
            pageText = document.body.innerText;
        }

        if (pageText.includes("徐伟光")) return "xuweiguang";
        if (pageText.includes("周辉")) return "zhouhui";
        return "xuweiguang";
    }

    let currentDoctor = localStorage.getItem("__JEV_CURRENT_DOCTOR");
    if (!currentDoctor) {
        currentDoctor = detectDoctorFromPage();
        localStorage.setItem("__JEV_CURRENT_DOCTOR", currentDoctor);
    }
    // Sync to chrome.storage
    if (chrome && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ currentDoctor: currentDoctor });
    }

    let isMinimized = false;

    function setReactInputValue(el, val) {
        if (!el) return false;
        try {
            const setter = (el instanceof HTMLTextAreaElement)
                ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set
                : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            setter.call(el, val);
        } catch(e) {
            el.value = val;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    function cleanFileName(raw) {
        if (!raw) return "";
        return raw
            .replace(/_thumbnail\.[a-zA-Z0-9]+$/i, "")
            .replace(/_cover\.[a-zA-Z0-9]+$/i, "")
            .replace(/\.[a-zA-Z0-9]+$/i, "")
            .trim();
    }

    // 100% Offline Local Classification
    function classifyLocally(title) {
        const clean = cleanFileName(title);
        const hasMianji = MIANJI_KEYWORDS.some(k => clean.includes(k));
        const hasMiantan = MIANTAN_KEYWORDS.some(k => clean.includes(k));

        if (hasMianji && !hasMiantan) {
            return { choice: "mianjijingluan", name: "面肌痉挛", reason: "匹配关键词" };
        }
        if (hasMiantan && !hasMianji) {
            return { choice: "miantan", name: "面瘫", reason: "匹配关键词" };
        }
        if (hasMianji && hasMiantan) {
            return { choice: "mianjijingluan", name: "面肌痉挛", reason: "复合词(预设面肌痉挛)" };
        }
        return { choice: "miantan", name: "面瘫", reason: "默认预选(标题未含特征词)" };
    }

    function applyTags(diseaseKey) {
        const tagsInput = document.querySelector("input[placeholder*='视频标签']");
        const statusEl = document.getElementById("jev-status-text");
        let tags = "";
        if (currentDoctor === "xuweiguang") {
            tags = CONFIG.xuweiguang.tags;
            setReactInputValue(tagsInput, tags);
            if (statusEl) statusEl.innerText = "已填入【徐伟光】脑积水固定标签";
        } else {
            tags = CONFIG.zhouhui.tagsMap[diseaseKey] || CONFIG.zhouhui.tagsMap.miantan;
            setReactInputValue(tagsInput, tags);
            const name = diseaseKey === "mianjijingluan" ? "面肌痉挛" : "面瘫";
            if (statusEl) statusEl.innerText = `已切换为【${name}】专属标签！`;
        }

        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({ currentTags: tags, currentDoctor: currentDoctor });
        }
    }

    // force=true: 用户主动点击按钮时强制覆盖标签；
    // force=false: 自动触发(拖入/页面加载/切换医生)时仅在标签为空时预填，不覆盖用户手动修改。
    function processAndFill(fileNameOverride, force) {
        const statusEl = document.getElementById("jev-status-text");

        let fileName = fileNameOverride || window.__LAST_DROPPED_FILE_NAME;
        if (!fileName) {
            const fileInputs = Array.from(document.querySelectorAll("input[type=file]"));
            for (let fi of fileInputs) {
                if (fi.files && fi.files.length > 0) {
                    fileName = fi.files[0].name;
                    break;
                }
            }
        }

        const titleInput = document.querySelector("input[placeholder*='视频标题']");
        const tagsInput = document.querySelector("input[placeholder*='视频标签']");

        let titleText = titleInput ? titleInput.value : "";
        if (fileName) {
            titleText = cleanFileName(fileName);
            if (titleInput && (!titleInput.value || titleInput.value !== titleText)) {
                setReactInputValue(titleInput, titleText);
            }
        }

        if (!titleText) {
            if (statusEl) statusEl.innerText = "已就绪(原生插件模式)：从 Finder 拖入视频后将自动关联标题与配置标签";
            return;
        }

        // 检查用户是否已手动填写了标签
        const currentTagsVal = tagsInput ? (tagsInput.value || "").trim() : "";
        const shouldFillTags = force || !currentTagsVal;

        let tags = "";
        if (currentDoctor === "xuweiguang") {
            tags = CONFIG.xuweiguang.tags;
            if (shouldFillTags) {
                setReactInputValue(tagsInput, tags);
            }
            const tagMsg = shouldFillTags ? "标签已填入" : "标签保留用户自定义";
            if (statusEl) statusEl.innerText = `【徐伟光】脑积水模式 · ${tagMsg}！标题: ${titleText}`;
        } else {
            const res = classifyLocally(titleText);
            tags = CONFIG.zhouhui.tagsMap[res.choice];
            if (shouldFillTags) {
                setReactInputValue(tagsInput, tags);
            }
            const tagMsg = shouldFillTags ? "标签已填入" : "标签保留用户自定义";
            if (statusEl) statusEl.innerText = `本地判定为【${res.name}】(${res.reason})，${tagMsg}！`;
        }

        if (chrome && chrome.storage && chrome.storage.local) {
            chrome.storage.local.set({
                currentDoctor: currentDoctor,
                currentTitle: titleText,
                currentTags: shouldFillTags ? tags : currentTagsVal
            });
        }
    }

    // Attach drag & drop listeners
    if (!window.__AIBEIKE_EVENTS_ATTACHED) {
        window.__AIBEIKE_EVENTS_ATTACHED = true;

        window.addEventListener("drop", (e) => {
            try {
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    const f = e.dataTransfer.files[0];
                    window.__LAST_DROPPED_FILE_NAME = f.name;
                    setTimeout(() => processAndFill(f.name), 300);
                }
            } catch (err) {}
        }, true);

        window.addEventListener("change", (e) => {
            try {
                if (e.target && e.target.type === "file" && e.target.files && e.target.files.length > 0) {
                    const f = e.target.files[0];
                    window.__LAST_DROPPED_FILE_NAME = f.name;
                    setTimeout(() => processAndFill(f.name), 300);
                }
            } catch (err) {}
        }, true);
    }

    // Remove existing panel
    const oldPanel = document.getElementById("jev-helper-panel");
    if (oldPanel) oldPanel.remove();

    // Create Floating Panel
    const panel = document.createElement("div");
    panel.id = "jev-helper-panel";
    panel.style.cssText = `
        position: fixed;
        top: 20px;
        right: 24px;
        z-index: 999999;
        background: #0f172a;
        color: #f8fafc;
        border-radius: 12px;
        box-shadow: 0 10px 30px -5px rgba(0,0,0,0.6), 0 0 0 1px #334155;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        width: 320px;
        transition: all 0.2s ease;
        user-select: none;
    `;

    // Draggable
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let initialPanelX = 0, initialPanelY = 0;

    function initDrag(headerEl) {
        headerEl.style.cursor = "move";
        headerEl.addEventListener("mousedown", (e) => {
            if (e.target.tagName === "BUTTON" || e.target.id === "jev-doctor-badge" || e.target.id === "jev-btn-minimize") return;
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            const rect = panel.getBoundingClientRect();
            initialPanelX = rect.left;
            initialPanelY = rect.top;
            e.preventDefault();
        });

        window.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            panel.style.left = `${initialPanelX + dx}px`;
            panel.style.top = `${initialPanelY + dy}px`;
            panel.style.right = "auto";
        });

        window.addEventListener("mouseup", () => {
            isDragging = false;
        });
    }

    function renderPanel() {
        const docInfo = CONFIG[currentDoctor];
        const isZhou = (currentDoctor === "zhouhui");

        panel.innerHTML = `
            <div id="jev-drag-header" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #1e293b; background: #1e293b; border-radius: 12px 12px 0 0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 700; color: #38bdf8; font-size: 13px;">⚡ 爱贝壳发布助手</span>
                    <span style="background: #10b981; color: white; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">原生插件</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="jev-doctor-badge" style="background: ${currentDoctor === 'xuweiguang' ? '#0284c7' : '#7c3aed'}; color: white; padding: 2px 8px; border-radius: 9999px; font-size: 11px; cursor: pointer; font-weight: 600;" title="点击切换医生">
                        ${docInfo.name}
                    </span>
                    <button id="jev-btn-minimize" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px; line-height: 1;">
                        ${isMinimized ? "+" : "—"}
                    </button>
                </div>
            </div>
            <div id="jev-body-content" style="padding: 14px 16px; display: ${isMinimized ? 'none' : 'block'};">
                <div id="jev-status-text" style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-bottom: 12px;">
                    当前：${docInfo.name}。拖入视频后将全自动关联标题与配置专属标签。
                </div>
                ${isZhou ? `
                <div style="display: flex; gap: 6px; margin-bottom: 10px;">
                    <button id="jev-btn-miantan" style="flex: 1; background: #1e3a8a; color: #93c5fd; border: 1px solid #3b82f6; padding: 5px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 600;">
                        点选：面瘫
                    </button>
                    <button id="jev-btn-mianji" style="flex: 1; background: #4c1d95; color: #c4b5fd; border: 1px solid #8b5cf6; padding: 5px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: 600;">
                        点选：面肌痉挛
                    </button>
                </div>
                ` : ''}
                <div style="display: flex; gap: 8px;">
                    <button id="jev-btn-run" style="flex: 1; background: #2563eb; color: white; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">
                        ✨ 重新识别填充
                    </button>
                    <button id="jev-btn-switch" style="background: #334155; color: #e2e8f0; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-size: 12px;">
                        切换为${currentDoctor === 'xuweiguang' ? '周辉' : '徐伟光'}
                    </button>
                </div>
            </div>
        `;

        initDrag(document.getElementById("jev-drag-header"));

        if (isZhou) {
            document.getElementById("jev-btn-miantan").onclick = () => applyTags("miantan");
            document.getElementById("jev-btn-mianji").onclick = () => applyTags("mianjijingluan");
        }

        document.getElementById("jev-btn-run").onclick = () => processAndFill(null, true);

        document.getElementById("jev-btn-minimize").onclick = () => {
            isMinimized = !isMinimized;
            document.getElementById("jev-body-content").style.display = isMinimized ? "none" : "block";
            document.getElementById("jev-btn-minimize").innerText = isMinimized ? "+" : "—";
            document.getElementById("jev-drag-header").style.borderRadius = isMinimized ? "12px" : "12px 12px 0 0";
        };

        function toggleDoctor() {
            currentDoctor = currentDoctor === "xuweiguang" ? "zhouhui" : "xuweiguang";
            localStorage.setItem("__JEV_CURRENT_DOCTOR", currentDoctor);
            if (chrome && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ currentDoctor: currentDoctor });
            }
            renderPanel();
            // 切换医生是用户主动操作，应当强制刷新标签
            processAndFill(null, true);
        }

        document.getElementById("jev-btn-switch").onclick = toggleDoctor;
        document.getElementById("jev-doctor-badge").onclick = toggleDoctor;
    }

    document.body.appendChild(panel);
    renderPanel();

    // Auto-check on initial load after short delay
    setTimeout(() => {
        processAndFill();
    }, 500);
})();
