(function() {
    'use strict';

    if (window.__MEDICAL_SHIPINHAO_LOADED) return;
    window.__MEDICAL_SHIPINHAO_LOADED = true;

    // Doctor Configuration
    const DOCTOR_CONFIG = {
        xuweiguang: {
            name: '徐伟光',
            color: '#0284c7',
            locationKeyword: '广东药科大学附属第一医院(农林院本部)',
            locationTargetName: '广东药科大学附属第一医院(农林院本部)',
            locationMatchFn: (txt) => {
                return txt.includes('农林院本部') && txt.includes('农林下路19号') &&
                    !txt.includes('停车场') && !txt.includes('神经外科') && !txt.includes('门诊');
            }
        },
        zhouhui: {
            name: '周辉',
            color: '#7c3aed',
            locationKeyword: localStorage.getItem('__MEDICAL_ZHOUHUI_SPH_LOC') || '广东药科大学附属第一医院(农林院本部)',
            locationTargetName: '广东药科大学附属第一医院(农林院本部)',
            locationMatchFn: (txt) => {
                return txt.includes('农林院本部') && txt.includes('农林下路19号') &&
                    !txt.includes('停车场') && !txt.includes('神经外科') && !txt.includes('门诊');
            }
        }
    };

    // Remove existing panel if present
    const oldPanel = document.getElementById('medical-shipinhao-panel');
    if (oldPanel) oldPanel.remove();

    function getProfileDoctor() {
        return (document.documentElement && document.documentElement.getAttribute('data-medical-doctor')) || '';
    }

    let manualDoctor = localStorage.getItem('__MEDICAL_MANUAL_DOCTOR');
    let currentDoctor = getProfileDoctor() || manualDoctor || 'xuweiguang';
    let isMinimized = false;
    let isRunning = false;

    // Helper: Sleep
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Get Wujie ShadowRoot safely
    function getShadowRoot() {
        const wujie = document.querySelector('wujie-app');
        return wujie ? wujie.shadowRoot : null;
    }

    // Auto-detect doctor from Chrome profile binding or page content
    function autoDetectDoctor() {
        const profileDoc = getProfileDoctor();
        const sr = getShadowRoot();
        const root = sr || document;
        const text = root.body ? root.body.innerText : (root.textContent || '');

        // 1. Profile binding takes priority
        if (profileDoc) {
            currentDoctor = profileDoc;
        } else if (text.includes('脑积水') || text.includes('脑脊液') || text.includes('徐伟光')) {
            currentDoctor = 'xuweiguang';
        } else if (text.includes('面瘫') || text.includes('面肌痉挛') || text.includes('眼皮跳') || text.includes('周辉')) {
            currentDoctor = 'zhouhui';
        } else if (manualDoctor) {
            currentDoctor = manualDoctor;
        }
        localStorage.setItem('__MEDICAL_CURRENT_DOCTOR', currentDoctor);
        return currentDoctor;
    }

    // Inspect Form State on Channels (短标题, 位置, 声明原创)
    function getPageFormInfo() {
        const sr = getShadowRoot();
        if (!sr) {
            return { exists: false };
        }

        // 1. 短标题
        const shortInput = sr.querySelector("input[placeholder*='短标题']");
        const shortError = sr.querySelector('.error-title') || (shortInput && shortInput.value && shortInput.value.length > 16);
        const shortVal = shortInput ? shortInput.value : '';
        const shortNeedsFix = !!shortError || (shortVal.length > 16);

        // 2. 位置
        const locNameEl = sr.querySelector('.location-name');
        const currentLoc = locNameEl ? locNameEl.innerText.trim() : '';
        const docConfig = DOCTOR_CONFIG[currentDoctor] || DOCTOR_CONFIG.xuweiguang;
        const isLocReady = currentLoc.includes('农林院本部') || currentLoc === docConfig.locationTargetName;

        // 3. 声明原创
        const origBox = sr.querySelector('.declare-original-checkbox input');
        const origWrapper = origBox ? origBox.closest('.ant-checkbox-wrapper') : null;
        const isOrigChecked = (origBox && origBox.checked) || (origWrapper && origWrapper.classList.contains('ant-checkbox-wrapper-checked'));

        return {
            exists: !!shortInput || !!locNameEl,
            shortInput,
            shortVal,
            shortNeedsFix,
            locNameEl,
            currentLoc,
            isLocReady,
            origBox,
            isOrigChecked
        };
    }

    // One-click Auto Optimization Engine
    async function runAutoOptimize(statusEl, btnEl) {
        if (isRunning) return;
        isRunning = true;

        const docConfig = DOCTOR_CONFIG[currentDoctor] || DOCTOR_CONFIG.xuweiguang;
        const sr = getShadowRoot();

        const updateStatus = (msg, isErr = false) => {
            if (statusEl) {
                statusEl.innerHTML = `<span style="color: ${isErr ? '#f87171' : '#38bdf8'};">${msg}</span>`;
            }
        };

        try {
            if (!sr) throw new Error('未找到视频号助手微前端容器 (wujie-app)');

            if (btnEl) {
                btnEl.disabled = true;
                btnEl.style.background = '#475569';
                btnEl.innerText = '⏳ 正在智能配置中...';
            }

            // -------------------------------------------------------------
            // Task 1: 短标题 16 字超限处理 (如果超限则清空)
            // -------------------------------------------------------------
            updateStatus('🔍 [1/3] 正在检查短标题字数...');
            const shortInput = sr.querySelector("input[placeholder*='短标题']");
            if (shortInput) {
                const isOverLimit = (shortInput.value && shortInput.value.length > 16) || !!sr.querySelector('.error-title');
                if (isOverLimit) {
                    updateStatus(`✂️ [1/3] 短标题超限 (${shortInput.value.length}字)，正在删掉短标题...`);
                    shortInput.focus();
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    setter.call(shortInput, '');
                    shortInput.dispatchEvent(new Event('input', { bubbles: true }));
                    shortInput.dispatchEvent(new Event('change', { bubbles: true }));
                    shortInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    await sleep(300);
                } else {
                    updateStatus('✅ [1/3] 短标题字数符合规范，保留现状');
                    await sleep(200);
                }
            }

            // -------------------------------------------------------------
            // Task 2: 位置选择 (切换为广东药科大学附属第一医院(农林院本部) 越秀区农林下路19号)
            // -------------------------------------------------------------
            updateStatus('📍 [2/3] 正在定位并选择医院位置...');
            const locNameEl = sr.querySelector('.location-name');
            const currentLoc = locNameEl ? locNameEl.innerText.trim() : '';

            if (!currentLoc.includes('农林院本部')) {
                // 1. 打开位置搜索面板
                const filterWrap = sr.querySelector('.location-filter-wrap');
                if (!filterWrap || filterWrap.style.display === 'none') {
                    const posDisplay = sr.querySelector('.position-display-wrap') || sr.querySelector('.position-display');
                    if (posDisplay) {
                        posDisplay.click();
                        await sleep(350);
                    }
                }

                // 2. 输入搜索关键词
                const searchInput = sr.querySelector("input[placeholder*='搜索附近位置']");
                if (searchInput) {
                    searchInput.focus();
                    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                    setter.call(searchInput, docConfig.locationKeyword);
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.dispatchEvent(new Event('change', { bubbles: true }));

                    const searchBtn = sr.querySelector('.weui-desktop-search__btn');
                    if (searchBtn) searchBtn.click();
                    await sleep(500);

                    // 3. 轮询等待精准目标项
                    let targetOption = null;
                    const startLocTime = Date.now();
                    while (Date.now() - startLocTime < 6000) {
                        await sleep(300);
                        const items = Array.from(sr.querySelectorAll('.option-item'));
                        targetOption = items.find(it => docConfig.locationMatchFn(it.innerText));
                        if (targetOption) break;
                    }

                    if (targetOption) {
                        targetOption.click();
                        await sleep(400);
                        updateStatus('✅ [2/3] 已成功选择【广药大附一院(农林院本部)】');
                    } else {
                        console.warn('未在下拉中找到完全匹配的农林院本部具体项');
                    }
                }
            } else {
                updateStatus('✅ [2/3] 位置已是【农林院本部】，无需修改');
                await sleep(200);
            }

            // -------------------------------------------------------------
            // Task 3: 点掉声明原创 (如果勾选则取消)
            // -------------------------------------------------------------
            updateStatus('✍️ [3/3] 正在检查并点掉声明原创...');
            const origBox = sr.querySelector('.declare-original-checkbox input');
            const origWrapper = origBox ? origBox.closest('.ant-checkbox-wrapper') : null;
            const isChecked = (origBox && origBox.checked) || (origWrapper && origWrapper.classList.contains('ant-checkbox-wrapper-checked'));

            if (isChecked && origBox) {
                origBox.click();
                await sleep(300);
                updateStatus('✅ [3/3] 已成功取消【声明原创】');
            } else {
                updateStatus('✅ [3/3] 原创声明未勾选，符合要求');
                await sleep(200);
            }

            // 全部完成
            updateStatus('🎉 <b>配置完成！</b> 短标题、医院位置、原创声明均已就绪');

        } catch (err) {
            console.error('❌ [视频号助手] 配置失败:', err);
            updateStatus(`❌ 配置异常: ${err.message || err}`, true);
        } finally {
            isRunning = false;
            updatePanelUI();
        }
    }

    // Create Floating Panel
    const panel = document.createElement('div');
    panel.id = 'medical-shipinhao-panel';
    panel.style.cssText = `
        position: fixed;
        top: 70px;
        right: 24px;
        z-index: 999999;
        background: #0f172a;
        color: #f8fafc;
        border-radius: 12px;
        box-shadow: 0 10px 30px -5px rgba(0,0,0,0.6), 0 0 0 1px #334155;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        width: 340px;
        box-sizing: border-box;
        transition: all 0.2s ease;
        user-select: none;
    `;

    // Make Draggable
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let initialPanelX = 0, initialPanelY = 0;

    function initDrag(headerEl) {
        headerEl.style.cursor = 'move';
        headerEl.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.id === 'wx-doctor-badge' || e.target.id === 'wx-btn-minimize') return;
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            const rect = panel.getBoundingClientRect();
            initialPanelX = rect.left;
            initialPanelY = rect.top;
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            panel.style.left = `${initialPanelX + dx}px`;
            panel.style.top = `${initialPanelY + dy}px`;
            panel.style.right = 'auto';
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });
    }

    function renderPanel() {
        const docConfig = DOCTOR_CONFIG[currentDoctor] || DOCTOR_CONFIG.xuweiguang;

        panel.innerHTML = `
            <div id="wx-drag-header" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #1e293b; background: #1e293b; border-radius: 12px 12px 0 0; white-space: nowrap; box-sizing: border-box;">
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <span style="font-weight: 700; color: #07c160; font-size: 13px; white-space: nowrap;">📺 视频号发布助手</span>
                    <span id="wx-status-badge" style="background: #059669; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; white-space: nowrap;">已识别</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <span id="wx-doctor-badge" style="background: ${docConfig.color}; color: white; padding: 2px 8px; border-radius: 9999px; font-size: 11px; cursor: pointer; font-weight: 600; white-space: nowrap;" title="点击切换医生">
                        ${docConfig.name}
                    </span>
                    <button id="wx-btn-minimize" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px; line-height: 1; flex-shrink: 0;">
                        ${isMinimized ? '+' : '—'}
                    </button>
                </div>
            </div>
            <div id="wx-body-content" style="padding: 14px 16px; display: ${isMinimized ? 'none' : 'block'};">
                <div id="wx-status-text" style="color: #94a3b8; font-size: 12px; line-height: 1.7; margin-bottom: 12px;">
                    ⏳ 正在检测视频号发布状态...
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="wx-btn-action" style="background: #07c160; color: white; border: none; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        ✨ 一键智能配置视频号
                    </button>
                </div>
            </div>
        `;

        initDrag(document.getElementById('wx-drag-header'));

        document.getElementById('wx-btn-minimize').onclick = () => {
            isMinimized = !isMinimized;
            document.getElementById('wx-body-content').style.display = isMinimized ? 'none' : 'block';
            document.getElementById('wx-btn-minimize').innerText = isMinimized ? '+' : '—';
            document.getElementById('wx-drag-header').style.borderRadius = isMinimized ? '12px' : '12px 12px 0 0';
        };

        function toggleDoctor() {
            const next = (currentDoctor === 'xuweiguang' ? 'zhouhui' : 'xuweiguang');
            currentDoctor = next;
            manualDoctor = next;
            if (document.documentElement) {
                document.documentElement.setAttribute('data-medical-doctor', next);
            }
            localStorage.setItem('__MEDICAL_CURRENT_DOCTOR', next);
            localStorage.removeItem('__MEDICAL_MANUAL_DOCTOR');
            window.dispatchEvent(new CustomEvent('__MEDICAL_SET_PROFILE_DOCTOR__', {
                detail: { doctor: next }
            }));
            renderPanel();
            updatePanelUI();
        }
        document.getElementById('wx-doctor-badge').onclick = toggleDoctor;

        const btnAction = document.getElementById('wx-btn-action');
        btnAction.onclick = () => {
            runAutoOptimize(document.getElementById('wx-status-text'), btnAction);
        };
    }

    // 监听来自 Chrome Profile Bridge 或 Popup 的医生同步广播
    window.addEventListener('__MEDICAL_PROFILE_DOCTOR_READY__', (e) => {
        if (e.detail && e.detail.doctor) {
            currentDoctor = e.detail.doctor;
            manualDoctor = e.detail.doctor;
            renderPanel();
            updatePanelUI();
        }
    });

    // Update UI based on real-time state
    function updatePanelUI() {
        if (isRunning) return;

        autoDetectDoctor();

        const docConfig = DOCTOR_CONFIG[currentDoctor] || DOCTOR_CONFIG.xuweiguang;
        const docBadge = document.getElementById('wx-doctor-badge');
        if (docBadge) {
            docBadge.innerText = docConfig.name;
            docBadge.style.background = docConfig.color;
        }

        const formInfo = getPageFormInfo();

        const badge = document.getElementById('wx-status-badge');
        const statusText = document.getElementById('wx-status-text');
        const btnAction = document.getElementById('wx-btn-action');

        if (!badge || !statusText || !btnAction) return;

        // If form not yet loaded
        if (!formInfo.exists) {
            badge.style.background = '#64748b';
            badge.innerText = '等待发表页';
            statusText.innerHTML = `⏳ 请进入【发表视频】页面，等待表单加载...<br>• 当前医生: <b style="color: #38bdf8;">${docConfig.name}</b>`;
            btnAction.disabled = true;
            btnAction.style.background = '#334155';
            btnAction.innerText = '⏳ 等待表单就绪...';
            return;
        }

        // Evaluate conditions
        const isShortOk = !formInfo.shortNeedsFix;
        const isLocOk = formInfo.isLocReady;
        const isOrigOk = !formInfo.isOrigChecked;
        const isAllReady = isShortOk && isLocOk && isOrigOk;

        // Compose item status lines
        const shortLine = isShortOk ?
            `• 短标题: <b style="color: #4ade80;">符合规范</b>${formInfo.shortVal ? ` (${formInfo.shortVal.length}字)` : ' (已清空)'}` :
            `• 短标题: <b style="color: #f87171;">超过16字限制</b> (${formInfo.shortVal.length}字，待删除)`;

        const locLine = isLocOk ?
            `• 医院位置: <b style="color: #4ade80;">农林院本部 (已定位)</b>` :
            `• 医院位置: <b style="color: #f59e0b;">${formInfo.currentLoc || '未设置'}</b> (待选具体医院)`;

        const origLine = isOrigOk ?
            `• 声明原创: <b style="color: #4ade80;">未勾选 (符合要求)</b>` :
            `• 声明原创: <b style="color: #f87171;">已勾选</b> (待点掉)`;

        statusText.innerHTML = `
            ${shortLine}<br>
            ${locLine}<br>
            ${origLine}
        `;

        if (isAllReady) {
            badge.style.background = '#10b981';
            badge.innerText = '全部就绪';
            btnAction.disabled = false;
            btnAction.style.background = '#059669';
            btnAction.innerText = '✅ 全部已配置就绪 (可再次执行)';
        } else {
            badge.style.background = '#f59e0b';
            badge.innerText = '待配置';
            btnAction.disabled = false;
            btnAction.style.background = '#07c160';
            btnAction.innerText = '✨ 一键智能配置视频号';
        }
    }

    document.body.appendChild(panel);
    renderPanel();
    updatePanelUI();

    // Auto update status every 1.2s
    if (window.__WX_TIMER) clearInterval(window.__WX_TIMER);
    window.__WX_TIMER = setInterval(() => {
        if (!isRunning) {
            updatePanelUI();
        }
    }, 1200);

    console.log('📺 [医疗自媒体发布助手] 视频号助手已实装自动化模块 (MAIN world)');
})();
