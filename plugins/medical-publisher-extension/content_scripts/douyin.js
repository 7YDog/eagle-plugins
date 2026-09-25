(function() {
    'use strict';

    if (window.__MEDICAL_DOUYIN_LOADED) return;
    window.__MEDICAL_DOUYIN_LOADED = true;

    // Doctor Configuration (默认出厂值)
    const DOCTOR_CONFIG = {
        xuweiguang: {
            name: '徐伟光',
            color: '#0284c7',
            microappUrl: 'https://www.iesdouyin.com/share/microapp/?token=QzU2QzE1RDhFNjAyNzZqb21nNmVt&share_channel=copy',
            microappName: '小荷AI医生'
        },
        zhouhui: {
            name: '周辉',
            color: '#7c3aed',
            microappUrl: 'https://www.iesdouyin.com/share/microapp/?token=QkEwOTcxQ0Q5RjYzNzZqcWppZXN5&share_channel=copy',
            microappName: '小荷AI医生'
        }
    };

    function getDynamicConfig() {
        try {
            const raw = document.documentElement && document.documentElement.getAttribute('data-medical-config');
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return null;
    }

    function getDoctorConfig(doc) {
        const base = DOCTOR_CONFIG[doc] || DOCTOR_CONFIG.xuweiguang;
        const config = getDynamicConfig();
        const custom = config && config[doc];
        return {
            name: base.name,
            color: base.color,
            microappUrl: (custom && custom.microappUrl) ? custom.microappUrl : base.microappUrl,
            microappName: (custom && custom.microappName) ? custom.microappName : base.microappName
        };
    }

    // Remove existing panel if present
    const oldPanel = document.getElementById('medical-douyin-panel');
    if (oldPanel) oldPanel.remove();

    function getProfileDoctor() {
        return (document.documentElement && document.documentElement.getAttribute('data-medical-doctor')) || '';
    }

    let manualDoctor = localStorage.getItem('__MEDICAL_MANUAL_DOCTOR');
    let currentDoctor = getProfileDoctor() || manualDoctor || 'xuweiguang';
    let isMinimized = false;
    let isRunning = false;

    // Auto-detect doctor from Chrome profile binding or editor content
    function autoDetectDoctor() {
        const profileDoc = getProfileDoctor();
        const inputs = Array.from(document.querySelectorAll('[contenteditable=true], textarea, input[type=text]'));
        let combinedText = '';
        inputs.forEach(el => {
            combinedText += ' ' + (el.innerText || el.value || '');
        });

        // 1. Profile binding takes priority
        if (profileDoc) {
            currentDoctor = profileDoc;
        } else if (combinedText.includes('脑积水') || combinedText.includes('脑脊液') || combinedText.includes('徐伟光')) {
            currentDoctor = 'xuweiguang';
        } else if (combinedText.includes('面瘫') || combinedText.includes('面肌痉挛') || combinedText.includes('眼皮跳') || combinedText.includes('周辉')) {
            currentDoctor = 'zhouhui';
        } else if (manualDoctor) {
            currentDoctor = manualDoctor;
        }
        localStorage.setItem('__MEDICAL_CURRENT_DOCTOR', currentDoctor);
        return currentDoctor;
    }

    // Helper: Sleep
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    // Inspect Anchor / Tag Section on Douyin
    function getAnchorInfo() {
        // 1. Check if mounted tag exists
        const mountedTag = document.querySelector('#douyin_creator_pc_anchor_jump .anchor-tag-mOfJIz, #douyin_creator_pc_anchor_jump .anchor-text-dQMgky, .anchor-tag-mOfJIz');
        const isMounted = !!mountedTag;
        const mountedName = mountedTag ? mountedTag.innerText.trim() : '';

        // 2. Check type selector
        const typeSel = document.querySelector('.select-lJTtRL');
        const currentType = typeSel ? typeSel.innerText.trim() : '';

        // 3. Check container existence
        const container = document.getElementById('douyin_creator_pc_anchor_jump') || typeSel;

        return {
            exists: !!container,
            isMounted,
            mountedName,
            currentType,
            hasXiaoxu: mountedName.includes('小荷')
        };
    }

    // Mount Microapp Automation Flow
    async function runMountMicroapp(statusEl, btnEl) {
        if (isRunning) return;
        isRunning = true;

        const docConfig = getDoctorConfig(currentDoctor);
        const targetUrl = docConfig.microappUrl;
        const targetName = docConfig.microappName;

        const updateStatus = (msg, isErr = false) => {
            if (statusEl) {
                statusEl.innerHTML = `<span style="color: ${isErr ? '#f87171' : '#38bdf8'};">${msg}</span>`;
            }
        };

        try {
            updateStatus('⏳ 正在准备挂载环境...');
            if (btnEl) {
                btnEl.disabled = true;
                btnEl.style.background = '#475569';
                btnEl.innerText = '⏳ 挂载进行中...';
            }

            // Step 0: Check if an existing tag needs to be cleared
            const existingDel = document.querySelector('.anchor-icon-jkBcHE');
            if (existingDel) {
                updateStatus('🔄 正在清除旧标签...');
                existingDel.click();
                await sleep(350);
            }

            // Step 1: Ensure type dropdown is set to "小程序"
            const typeSel = document.querySelector('.select-lJTtRL');
            if (!typeSel) {
                throw new Error('未在页面中检测到【添加标签】类型选择框，请确认视频上传是否完成');
            }

            typeSel.scrollIntoView({ behavior: 'smooth', block: 'center' });

            if (!typeSel.innerText.includes('小程序')) {
                updateStatus('🔍 正在选择【小程序】类型...');
                typeSel.click();
                await sleep(350);

                const miniOpt = Array.from(document.querySelectorAll('.select-dropdown-option-video, .semi-select-option'))
                    .find(el => el.innerText && el.innerText.trim() === '小程序');
                if (!miniOpt) {
                    throw new Error('下拉候选项中未找到【小程序】选项');
                }
                miniOpt.click();
                await sleep(400);
            }

            // Step 2: Ensure input inside select-UscaOf is mounted and ready
            updateStatus('📝 正在定位小程序链接输入框...');
            let input = document.querySelector('.select-UscaOf input');
            if (!input) {
                const linkSel = document.querySelector('.select-UscaOf');
                if (!linkSel) {
                    throw new Error('未找到小程序链接输入区域');
                }
                linkSel.click();
                await sleep(300);
                input = document.querySelector('.select-UscaOf input');
            }

            if (!input) {
                throw new Error('未能激活小程序链接输入框，请稍后重试');
            }

            // Step 3: Inject Microapp Token Link via React Prototype Setter
            updateStatus(`🔗 正在填入【${docConfig.name}】小荷医生链接...`);
            input.focus();
            input.select();

            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeSetter.call(input, targetUrl);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));

            // Step 4: Wait for candidate card in semi-portal
            updateStatus(`⚡ 等待抖音解析【${targetName}】卡片...`);
            let candidate = null;
            const startTime = Date.now();
            while (Date.now() - startTime < 8000) {
                await sleep(250);
                const options = Array.from(document.querySelectorAll('.semi-select-option'));
                candidate = options.find(el => el.innerText && (el.innerText.includes('小荷') || el.innerText.includes(targetName)));
                if (candidate) break;
            }

            if (!candidate) {
                throw new Error('等待卡片超时：抖音未返回【小荷AI医生】候选卡片，请检查网络或链接有效性');
            }

            // Step 5: Click candidate card
            updateStatus(`🎯 正在选中【${targetName}】...`);
            candidate.click();
            await sleep(400);

            // Step 6: Verify mount
            const mountedTag = document.querySelector('.anchor-tag-mOfJIz, .anchor-text-dQMgky');
            if (mountedTag && mountedTag.innerText.includes('小荷')) {
                updateStatus(`🎉 <b>挂载成功！</b> 已成功挂载【${mountedTag.innerText}】`);
            } else {
                updateStatus('⚠️ 挂载可能已完成，请检查页面标签栏');
            }

        } catch (err) {
            console.error('❌ [医疗发布助手 · 抖音] 挂载失败:', err);
            updateStatus(`❌ 挂载失败: ${err.message || err}`, true);
        } finally {
            isRunning = false;
            updatePanelUI();
        }
    }

    // Create Floating Panel
    const panel = document.createElement('div');
    panel.id = 'medical-douyin-panel';
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
        width: 320px;
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
            if (e.target.tagName === 'BUTTON' || e.target.id === 'dy-doctor-badge' || e.target.id === 'dy-btn-minimize') return;
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
        const docConfig = getDoctorConfig(currentDoctor);

        panel.innerHTML = `
            <div id="dy-drag-header" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #1e293b; background: #1e293b; border-radius: 12px 12px 0 0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 700; color: #fe2c55; font-size: 13px;">🎵 医疗发布助手 · 抖音</span>
                    <span id="dy-status-badge" style="background: #a855f7; color: white; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">已识别窗口</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="dy-doctor-badge" style="background: ${docConfig.color}; color: white; padding: 2px 8px; border-radius: 9999px; font-size: 11px; cursor: pointer; font-weight: 600;" title="点击切换医生">
                        ${docConfig.name}
                    </span>
                    <button id="dy-btn-minimize" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px; line-height: 1;">
                        ${isMinimized ? '+' : '—'}
                    </button>
                </div>
            </div>
            <div id="dy-body-content" style="padding: 14px 16px; display: ${isMinimized ? 'none' : 'block'};">
                <div id="dy-status-text" style="color: #94a3b8; font-size: 12px; line-height: 1.6; margin-bottom: 12px;">
                    💡 已成功识别【抖音创作者服务平台】窗口！<br>
                    • 所属医生: <b style="color: #38bdf8;">${docConfig.name}</b><br>
                    • 正在检测标签挂载状态...
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="dy-btn-action" style="background: #2563eb; color: white; border: none; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                        ✨ 一键挂载小荷医生小程序
                    </button>
                </div>
            </div>
        `;

        initDrag(document.getElementById('dy-drag-header'));

        document.getElementById('dy-btn-minimize').onclick = () => {
            isMinimized = !isMinimized;
            document.getElementById('dy-body-content').style.display = isMinimized ? 'none' : 'block';
            document.getElementById('dy-btn-minimize').innerText = isMinimized ? '+' : '—';
            document.getElementById('dy-drag-header').style.borderRadius = isMinimized ? '12px' : '12px 12px 0 0';
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
        document.getElementById('dy-doctor-badge').onclick = toggleDoctor;

        const btnAction = document.getElementById('dy-btn-action');
        btnAction.onclick = () => {
            runMountMicroapp(document.getElementById('dy-status-text'), btnAction);
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

    // 监听后台配置修改广播（自定义小荷链接实时更新）
    window.addEventListener('__MEDICAL_CONFIG_READY__', () => {
        renderPanel();
        updatePanelUI();
    });

    // Update UI based on intelligent recognition
    function updatePanelUI() {
        if (isRunning) return;

        autoDetectDoctor();

        const docConfig = getDoctorConfig(currentDoctor);
        const docBadge = document.getElementById('dy-doctor-badge');
        if (docBadge) {
            docBadge.innerText = docConfig.name;
            docBadge.style.background = docConfig.color;
        }

        const anchorInfo = getAnchorInfo();

        const badge = document.getElementById('dy-status-badge');
        const statusText = document.getElementById('dy-status-text');
        const btnAction = document.getElementById('dy-btn-action');

        if (!badge || !statusText || !btnAction) return;

        // 1. If anchor section not yet loaded on page
        if (!anchorInfo.exists) {
            badge.style.background = '#64748b';
            badge.innerText = '等待页面';
            statusText.innerHTML = `⏳ 请进入视频发布页面，等待扩展信息加载...<br>• 当前医生: <b style="color: #38bdf8;">${docConfig.name}</b>`;
            btnAction.disabled = true;
            btnAction.style.background = '#334155';
            btnAction.innerText = '⏳ 等待页面加载...';
            return;
        }

        // 2. Microapp already mounted
        if (anchorInfo.isMounted && anchorInfo.hasXiaoxu) {
            badge.style.background = '#10b981';
            badge.innerText = '已挂载';
            statusText.innerHTML = `
                ✅ <span style="color: #4ade80; font-weight: 600;">已成功挂载小程序</span><br>
                • 挂载标签: <b>${anchorInfo.mountedName}</b><br>
                • 所属医生: <b style="color: #38bdf8;">${docConfig.name}</b><br>
                • 链接解析: <span style="color: #94a3b8;">小荷 AI 医生 (在线)</span>
            `;
            btnAction.disabled = false;
            btnAction.style.background = '#059669';
            btnAction.innerText = '✅ 已挂载 (点击可重新挂载)';
            return;
        }

        // 3. Other tag mounted (not Xiaoxu)
        if (anchorInfo.isMounted && !anchorInfo.hasXiaoxu) {
            badge.style.background = '#f59e0b';
            badge.innerText = '已挂其他';
            statusText.innerHTML = `
                ⚠️ 当前挂载了其他标签: <b>${anchorInfo.mountedName}</b><br>
                • 目标医生: <b style="color: #38bdf8;">${docConfig.name}</b><br>
                • 点击下方按钮将自动替换为【${docConfig.microappName}】。
            `;
            btnAction.disabled = false;
            btnAction.style.background = '#2563eb';
            btnAction.innerText = '🔄 替换为小荷医生小程序';
            return;
        }

        // 4. Need mount
        badge.style.background = '#3b82f6';
        badge.innerText = '待挂载';
        statusText.innerHTML = `
            💡 检测到尚未挂载小程序<br>
            • 所属医生: <b style="color: #38bdf8;">${docConfig.name}</b><br>
            • 目标小程序: <b>${docConfig.microappName}</b><br>
            • 点击一键自动切换【小程序】并填入链接挂载。
        `;
        btnAction.disabled = false;
        btnAction.style.background = '#2563eb';
        btnAction.innerText = '✨ 一键挂载小荷医生小程序';
    }

    document.body.appendChild(panel);
    renderPanel();
    updatePanelUI();

    // Auto update status every 1.2s
    if (window.__DY_TIMER) clearInterval(window.__DY_TIMER);
    window.__DY_TIMER = setInterval(() => {
        if (!isRunning) {
            updatePanelUI();
        }
    }, 1200);

    console.log('🎵 [医疗自媒体发布助手] 抖音窗口已加载自动化挂载模块 (MAIN world)');
})();
