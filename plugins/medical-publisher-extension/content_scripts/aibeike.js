(function() {
    'use strict';

    if (window.__MEDICAL_AIBEIKE_LOADED) return;
    window.__MEDICAL_AIBEIKE_LOADED = true;

    // Remove existing panel if present
    const oldPanel = document.getElementById('medical-aibeike-panel');
    if (oldPanel) oldPanel.remove();

    let currentDoctor = 'xuweiguang';
    let isMinimized = false;

    // Read profile doctor from chrome.storage.local
    try {
        chrome.storage.local.get(['profile_doctor'], (res) => {
            if (res && res.profile_doctor) {
                currentDoctor = res.profile_doctor;
                renderPanel();
            }
        });
    } catch (e) {}

    // Create Floating Panel
    const panel = document.createElement('div');
    panel.id = 'medical-aibeike-panel';
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
            if (e.target.tagName === 'BUTTON' || e.target.id === 'abk-doctor-badge' || e.target.id === 'abk-btn-minimize') return;
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
        const docName = (currentDoctor === 'xuweiguang' ? '徐伟光' : '周辉');

        panel.innerHTML = `
            <div id="abk-drag-header" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #1e293b; background: #1e293b; border-radius: 12px 12px 0 0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 700; color: #38bdf8; font-size: 13px;">⚡ 医疗发布助手 · 爱贝壳</span>
                    <span id="abk-status-badge" style="background: #10b981; color: white; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">已识别窗口</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="abk-doctor-badge" style="background: ${currentDoctor === 'xuweiguang' ? '#0284c7' : '#7c3aed'}; color: white; padding: 2px 8px; border-radius: 9999px; font-size: 11px; cursor: pointer; font-weight: 600;" title="点击切换医生">
                        ${docName}
                    </span>
                    <button id="abk-btn-minimize" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px; line-height: 1;">
                        ${isMinimized ? '+' : '—'}
                    </button>
                </div>
            </div>
            <div id="abk-body-content" style="padding: 14px 16px; display: ${isMinimized ? 'none' : 'block'};">
                <div id="abk-status-text" style="color: #94a3b8; font-size: 12px; line-height: 1.6; margin-bottom: 12px;">
                    💡 已成功识别【爱贝壳分发助手】窗口！<br>
                    • 当前所属医生: <b style="color: #38bdf8;">${docName}</b><br>
                    • 拖入视频后将自动关联素材库标题并配置标签。
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="abk-btn-action" style="background: #2563eb; color: white; border: none; padding: 9px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">
                        ✨ 刷新同步状态
                    </button>
                </div>
            </div>
        `;

        initDrag(document.getElementById('abk-drag-header'));

        document.getElementById('abk-btn-minimize').onclick = () => {
            isMinimized = !isMinimized;
            document.getElementById('abk-body-content').style.display = isMinimized ? 'none' : 'block';
            document.getElementById('abk-btn-minimize').innerText = isMinimized ? '+' : '—';
            document.getElementById('abk-drag-header').style.borderRadius = isMinimized ? '12px' : '12px 12px 0 0';
        };

        function toggleDoctor() {
            currentDoctor = (currentDoctor === 'xuweiguang' ? 'zhouhui' : 'xuweiguang');
            try {
                chrome.storage.local.set({ profile_doctor: currentDoctor });
            } catch (e) {}
            renderPanel();
        }
        document.getElementById('abk-doctor-badge').onclick = toggleDoctor;
    }

    try {
        chrome.runtime.onMessage.addListener((message) => {
            if (message && message.type === 'PROFILE_DOCTOR_CHANGED') {
                currentDoctor = message.doctor;
                renderPanel();
            }
        });
    } catch (e) {}

    document.body.appendChild(panel);
    renderPanel();

    console.log('⚡ [医疗自媒体发布助手] 爱贝壳窗口已识别并挂载悬浮窗');
})();
