(function() {
    'use strict';

    if (window.__MEDICAL_HELPER_LOADED) return;
    window.__MEDICAL_HELPER_LOADED = true;
    window.__BJH_HELPER_LOADED = true;

    // Remove existing panel if present
    const oldPanel = document.getElementById('medical-helper-panel');
    if (oldPanel) oldPanel.remove();

    function getProfileDoctor() {
        return (document.documentElement && document.documentElement.getAttribute('data-medical-doctor')) || '';
    }

    let manualDoctor = localStorage.getItem('__MEDICAL_MANUAL_DOCTOR');
    let currentDoctor = getProfileDoctor() || manualDoctor || 'xuweiguang';

    let isRunning = false;
    let isMinimized = false;

    // 周辉/徐伟光 智能标签规则 (默认出厂值)
    const DOCTOR_TAGS = {
        xuweiguang: ['#医生日常', '#脑积水', '#脑脊液', '#我要上热门', '#硬核科普健康行动'],
        zhouhui_spasm: ['#面肌痉挛', '#我要上热门', '#眼皮跳', '#硬核科普健康行动'],
        zhouhui_palsy: ['#面瘫', '#面瘫后遗症', '#我要上热门', '#硬核科普健康行动']
    };

    function parseTagList(str, defaultTags) {
        if (!str) return defaultTags;
        if (Array.isArray(str)) return str;
        const list = str
            .replace(/，|,/g, ' ')
            .split(/\s+/)
            .map(t => t.trim())
            .filter(t => t.length > 0)
            .map(t => t.startsWith('#') ? t : '#' + t);
        return list.length > 0 ? list : defaultTags;
    }

    function getDynamicConfig() {
        try {
            const raw = document.documentElement && document.documentElement.getAttribute('data-medical-config');
            if (raw) return JSON.parse(raw);
        } catch (e) {}
        return null;
    }

    function getDoctorTargetTags(doc, text = '') {
        const config = getDynamicConfig();
        const zh = config && config.zhouhui;
        const xwg = config && config.xuweiguang;

        if (doc === 'zhouhui') {
            const spasmTags = parseTagList(zh && zh.tags_spasm, DOCTOR_TAGS.zhouhui_spasm);
            const palsyTags = parseTagList(zh && zh.tags_palsy, DOCTOR_TAGS.zhouhui_palsy);

            if (text.includes('面肌痉挛')) {
                return { type: '面肌痉挛', tags: spasmTags };
            } else if (text.includes('面瘫')) {
                return { type: '面瘫', tags: palsyTags };
            } else {
                return { type: '默认(面瘫)', tags: palsyTags };
            }
        }

        const xwgTags = parseTagList(xwg && xwg.tags_default, DOCTOR_TAGS.xuweiguang);
        return { type: '脑科', tags: xwgTags };
    }

    // Detect doctor from Chrome profile binding or editor text/title
    function autoDetectDoctor() {
        const profileDoc = getProfileDoctor();
        const ed = document.querySelector('.FeEditorApp-d482ca4cbff50e1c-contentEditable, [contenteditable=true]');
        const text = ed ? (ed.innerText || '') : '';

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

    // Detect unlit hashtags in Lexical editor
    function getEditorInfo() {
        const ed = document.querySelector('.FeEditorApp-d482ca4cbff50e1c-contentEditable, [contenteditable=true]');
        if (!ed) {
            return { exists: false, unlitTags: [], litCount: 0, text: '' };
        }

        const litTags = Array.from(ed.querySelectorAll('.video-title-tag')).map(t => t.innerText.trim());
        const unlitTags = [];

        const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (node.parentElement && node.parentElement.closest('.video-title-tag-wrapper')) {
                continue;
            }
            const val = (node.nodeValue || '').trim();
            const matches = val.match(/#[^\s#]+/g);
            if (matches) {
                matches.forEach(m => {
                    if (m.length > 1) {
                        unlitTags.push(m);
                    }
                });
            }
        }

        return {
            exists: true,
            unlitTags: unlitTags,
            litCount: litTags.length,
            text: ed.innerText.trim()
        };
    }

    // Detect 创作声明 status
    function getDeclInfo() {
        const input = document.querySelector("input[placeholder*='创作声明']");
        if (!input) {
            return { exists: false, value: '' };
        }
        return {
            exists: true,
            value: (input.value || '').trim()
        };
    }

    // Active polling for topic dropdown items (waiting up to 2.5s patiently per user instruction)
    async function waitForDropdown(maxWait = 2500) {
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            const items = document.querySelectorAll('[class*=topicItem]');
            if (items && items.length > 0) {
                return Array.from(items);
            }
            await new Promise(r => setTimeout(r, 45));
        }
        return [];
    }

    // Core: In-place Lighting up hashtags
    // 逻辑：光标移至标签末尾 -> 重新键入末尾字符触发官方话题联想弹窗 -> 充分等待弹窗 -> 精准匹配点选
    async function lightUpTags(statusEl) {
        const ed = document.querySelector('.FeEditorApp-d482ca4cbff50e1c-contentEditable, [contenteditable=true]');
        if (!ed) {
            if (statusEl) statusEl.innerText = '❌ 未找到百家号内容编辑框';
            return 0;
        }

        let litCount = 0;
        let safetyLoop = 0;

        while (safetyLoop < 12) {
            safetyLoop++;
            ed.focus();

            let targetNode = null;
            let targetTag = null;
            let targetIdx = -1;

            const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
                if (node.parentElement && node.parentElement.closest('.video-title-tag-wrapper')) {
                    continue;
                }
                const val = node.nodeValue || '';
                const match = val.match(/#([^\s#]+)/);
                if (match && match[0].length > 1) {
                    targetNode = node;
                    targetTag = match[0];
                    targetIdx = match.index;
                    break;
                }
            }

            if (!targetNode || !targetTag) {
                break; // No more plain text tags to light up
            }

            const rawTagClean = targetTag.replace(/^#/, '').replace(/#$/, '').trim();
            const btnRun = document.getElementById('med-btn-run');
            const progressMsg = `正在点亮: #${rawTagClean}... (第 ${litCount + 1} 个)`;
            if (statusEl) statusEl.innerText = progressMsg;
            if (btnRun) btnRun.innerText = `⏳ [${litCount + 1}] ${progressMsg}`;

            // Step 1: Place selection at the last character of the tag
            const endPos = targetIdx + targetTag.length;
            const sel = window.getSelection();
            const range = document.createRange();

            try {
                range.setStart(targetNode, endPos - 1);
                range.setEnd(targetNode, endPos);
                sel.removeAllRanges();
                sel.addRange(range);

                // Step 2: Retype the last character to trigger Lexical's topic dropdown
                const lastChar = targetTag.charAt(targetTag.length - 1);
                document.execCommand('insertText', false, lastChar);
            } catch (err) {
                console.warn('[MedicalHelper] Selection error:', err);
                break;
            }

            // Step 3: Wait patiently for the dropdown to appear (up to 2.5s)
            let items = await waitForDropdown(2500);

            // If dropdown didn't appear, try re-triggering from the '#'
            if (items.length === 0) {
                try {
                    range.setStart(targetNode, targetIdx);
                    range.setEnd(targetNode, targetIdx + 1);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    document.execCommand('insertText', false, '#');
                    items = await waitForDropdown(1500);
                } catch (e) {}
            }

            // Step 4: Find and click the best matching item
            let targetItem = null;
            if (items.length > 0) {
                // Exact match (normalizing spaces: "# 脑积水 #" -> "#脑积水#")
                targetItem = items.find(it => {
                    const clean = (it.innerText || '').replace(/\s+/g, '');
                    return clean.startsWith('#' + rawTagClean + '#') || clean.includes('#' + rawTagClean + '#');
                });

                // Fallback: contains keyword
                if (!targetItem) {
                    targetItem = items.find(it => {
                        const clean = (it.innerText || '').replace(/\s+/g, '');
                        return clean.includes(rawTagClean);
                    });
                }

                // Final fallback: top candidate
                if (!targetItem) {
                    targetItem = items[0];
                }
            }

            if (targetItem) {
                targetItem.click();
                litCount++;
                // Delay for Lexical editor DOM to settle
                await new Promise(r => setTimeout(r, 450));
            } else {
                ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
                break;
            }

            // Check if character limit reached
            const countEl = document.querySelector('[class*=count]');
            if (countEl && (countEl.classList.contains('FeEditorApp-_8b4429a9f90b0eee-countError') || (countEl.innerText || '').startsWith('50/50'))) {
                break;
            }
        }

        return litCount;
    }

    // Core: Setting 创作声明 to "无需声明"
    async function setDeclaration(statusEl) {
        const declInput = document.querySelector("input[placeholder*='创作声明']");

        if (declInput && (declInput.value === '无需声明' || declInput.value.includes('无需声明'))) {
            if (statusEl) statusEl.innerText = '创作声明已是【无需声明】(无需重复设置)';
            return true;
        }

        if (statusEl) statusEl.innerText = '正在配置创作声明...';

        if (declInput) {
            declInput.click();
            await new Promise(r => setTimeout(r, 400));
        }

        // Specifically find the 创作声明 modal (avoiding other background modals)
        const modals = Array.from(document.querySelectorAll('.cheetah-modal, [class*=modal-content]'));
        const modal = modals.find(m => {
            const t = (m.innerText || '');
            return t.includes('创作声明') || t.includes('必选声明') || t.includes('无需声明');
        }) || modals[modals.length - 1];

        if (modal) {
            const allElements = Array.from(modal.querySelectorAll('*'));
            const noDeclTarget = allElements.find(e => (e.innerText || '').trim() === '无需声明');
            if (noDeclTarget) {
                const clickable = noDeclTarget.closest('label') || noDeclTarget.closest('.cursor-pointer') || noDeclTarget.parentElement;
                if (clickable) clickable.click();
                await new Promise(r => setTimeout(r, 250));
            }

            const okBtn = Array.from(modal.querySelectorAll('button')).find(b => (b.innerText || '').trim() === '确定');
            if (okBtn) {
                okBtn.click();
                await new Promise(r => setTimeout(r, 300));
            }
        }

        if (statusEl) statusEl.innerText = '创作声明已配置为【无需声明】';
        return true;
    }

    // Combined One-Click Action (Strictly Sequential)
    async function runOneClickAction() {
        if (isRunning) return;
        isRunning = true;
        updatePanelUI();

        const statusEl = document.getElementById('med-status-text');
        const btnRun = document.getElementById('med-btn-run');
        try {
            // Step 1: Light up tags (waiting patiently for popup per user request)
            if (btnRun) btnRun.innerText = '⏳ 阶段 1/2: 正在点亮官方标签...';
            await lightUpTags(statusEl);

            // Settle delay between editor and modal
            await new Promise(r => setTimeout(r, 500));

            // Step 2: Set declaration
            if (btnRun) btnRun.innerText = '⏳ 阶段 2/2: 正在设置创作声明...';
            await setDeclaration(statusEl);

            // Step 3: Success report
            const totalTags = document.querySelectorAll('.video-title-tag').length;
            const countText = (document.querySelector('[class*=count]') || {}).innerText || '';
            if (statusEl) {
                statusEl.innerHTML = `✅ <span style="color: #4ade80; font-weight: 600;">全部配置已完成！</span><br>• 已点亮官方标签: <b>${totalTags}</b> 个<br>• 创作声明: <b>无需声明</b><br>• 当前字数: ${countText}`;
            }
        } catch (e) {
            if (statusEl) statusEl.innerText = '⚠️ 操作遇到异常: ' + e.message;
        } finally {
            isRunning = false;
            updatePanelUI();
        }
    }

    // Create Floating Panel
    const panel = document.createElement('div');
    panel.id = 'medical-helper-panel';
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
            if (e.target.tagName === 'BUTTON' || e.target.id === 'med-doctor-badge' || e.target.id === 'med-btn-minimize') return;
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

    // Render Full Panel
    function renderPanel() {
        const docName = (currentDoctor === 'xuweiguang' ? '徐伟光' : '周辉');

        panel.innerHTML = `
            <div id="med-drag-header" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #1e293b; background: #1e293b; border-radius: 12px 12px 0 0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-weight: 700; color: #38bdf8; font-size: 13px;">🏥 医疗发布助手 · 百家号</span>
                    <span id="med-status-badge" style="background: #10b981; color: white; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;">已就绪</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span id="med-doctor-badge" style="background: ${currentDoctor === 'xuweiguang' ? '#0284c7' : '#7c3aed'}; color: white; padding: 2px 8px; border-radius: 9999px; font-size: 11px; cursor: pointer; font-weight: 600;" title="点击切换医生">
                        ${docName}
                    </span>
                    <button id="med-btn-minimize" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px; line-height: 1;">
                        ${isMinimized ? '+' : '—'}
                    </button>
                </div>
            </div>
            <div id="med-body-content" style="padding: 14px 16px; display: ${isMinimized ? 'none' : 'block'};">
                <div id="med-status-text" style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-bottom: 12px;">
                    正在识别百家号页面元素与标签状态...
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="med-btn-run" style="background: #2563eb; color: white; border: none; padding: 9px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; transition: background 0.2s;">
                        ✨ 一键点亮标签 & 创作声明
                    </button>
                    <div style="display: flex; gap: 6px;">
                        <button id="med-btn-tags" style="flex: 1; background: #334155; color: #e2e8f0; border: none; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 11px;">
                            仅点亮标签
                        </button>
                        <button id="med-btn-decl" style="flex: 1; background: #334155; color: #e2e8f0; border: none; padding: 6px 8px; border-radius: 6px; cursor: pointer; font-size: 11px;">
                            仅选无需声明
                        </button>
                    </div>
                </div>
            </div>
        `;

        initDrag(document.getElementById('med-drag-header'));

        document.getElementById('med-btn-run').onclick = runOneClickAction;
        document.getElementById('med-btn-tags').onclick = () => lightUpTags(document.getElementById('med-status-text'));
        document.getElementById('med-btn-decl').onclick = () => setDeclaration(document.getElementById('med-status-text'));

        document.getElementById('med-btn-minimize').onclick = () => {
            isMinimized = !isMinimized;
            document.getElementById('med-body-content').style.display = isMinimized ? 'none' : 'block';
            document.getElementById('med-btn-minimize').innerText = isMinimized ? '+' : '—';
            document.getElementById('med-drag-header').style.borderRadius = isMinimized ? '12px' : '12px 12px 0 0';
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
        document.getElementById('med-doctor-badge').onclick = toggleDoctor;
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

    // 监听后台配置修改广播（自定义标签实时更新）
    window.addEventListener('__MEDICAL_CONFIG_READY__', () => {
        renderPanel();
        updatePanelUI();
    });

    // Update UI based on intelligent recognition
    function updatePanelUI() {
        if (isRunning) {
            const btnRun = document.getElementById('med-btn-run');
            const badge = document.getElementById('med-status-badge');
            if (btnRun) {
                btnRun.disabled = true;
                btnRun.style.background = '#475569';
                btnRun.innerText = '⏳ 正在执行点亮与设置...';
            }
            if (badge) {
                badge.style.background = '#f59e0b';
                badge.innerText = '执行中';
            }
            return;
        }

        autoDetectDoctor();

        const docBadge = document.getElementById('med-doctor-badge');
        if (docBadge) {
            docBadge.innerText = (currentDoctor === 'xuweiguang' ? '徐伟光' : '周辉');
            docBadge.style.background = (currentDoctor === 'xuweiguang' ? '#0284c7' : '#7c3aed');
        }

        const edInfo = getEditorInfo();
        const declInfo = getDeclInfo();
        const badge = document.getElementById('med-status-badge');
        const statusText = document.getElementById('med-status-text');
        const btnRun = document.getElementById('med-btn-run');

        if (!badge || !statusText || !btnRun) return;

        // 1. If editor not yet loaded
        if (!edInfo.exists) {
            badge.style.background = '#ef4444';
            badge.innerText = '加载中';
            statusText.innerText = '⏳ 正在等待百家号编辑器加载完成...';
            btnRun.disabled = true;
            btnRun.style.background = '#475569';
            btnRun.innerText = '⏳ 等待页面加载...';
            return;
        }

        // 2. Editor loaded: analyze status
        const unlitCount = edInfo.unlitTags.length;
        const litCount = edInfo.litCount;
        const isDeclDone = (declInfo.value === '无需声明');
        const countText = (document.querySelector('[class*=count]') || {}).innerText || '';
        const tagRule = getDoctorTargetTags(currentDoctor, edInfo.text);
        const docTagHint = (currentDoctor === 'zhouhui')
            ? `<br>• 医生: <b style="color: #c084fc;">周辉</b> (病种识别: <b style="color: #38bdf8;">${tagRule.type}</b>)`
            : `<br>• 医生: <b style="color: #38bdf8;">徐伟光</b> (脑积水/脑脊液)`;

        if (unlitCount === 0 && litCount > 0 && isDeclDone) {
            // All completed
            badge.style.background = '#10b981';
            badge.innerText = '已就绪';
            statusText.innerHTML = `✅ <span style="color: #4ade80;">全部配置已完成！</span>${docTagHint}<br>• 已点亮官方标签: <b>${litCount}</b> 个<br>• 创作声明: <b>无需声明</b><br>• 当前字数: ${countText}`;
            btnRun.disabled = false;
            btnRun.style.background = '#059669';
            btnRun.innerText = '✅ 已全部就绪 (可重新点亮)';
        } else if (unlitCount > 0) {
            // Needs tag lighting
            badge.style.background = '#f59e0b';
            badge.innerText = '待点亮';
            statusText.innerHTML = `💡 识别到 <b>${unlitCount}</b> 个待点亮标签 (${edInfo.unlitTags.slice(0, 3).join(' ')}...)${docTagHint}<br>• 创作声明状态: <b>${declInfo.value || '未设置'}</b><br>点击下方按钮一键完成点亮与声明。`;
            btnRun.disabled = false;
            btnRun.style.background = '#2563eb';
            btnRun.innerText = '✨ 一键点亮标签 & 创作声明';
        } else if (!isDeclDone) {
            // Only declaration needed
            badge.style.background = '#3b82f6';
            badge.innerText = '待设声明';
            statusText.innerHTML = `• 标签已点亮: <b>${litCount}</b> 个${docTagHint}<br>• 创作声明未设置，点击下方按钮一键配置。`;
            btnRun.disabled = false;
            btnRun.style.background = '#2563eb';
            btnRun.innerText = '✨ 一键设置【无需声明】';
        } else {
            // Empty or waiting for tags
            badge.style.background = '#64748b';
            badge.innerText = '空闲';
            statusText.innerHTML = `页面已加载。${docTagHint}<br>推荐标签: <span style="color: #94a3b8;">${tagRule.tags.join(' ')}</span><br>从爱贝壳同步或拖入视频后，点击一键点亮。`;
            btnRun.disabled = false;
            btnRun.style.background = '#2563eb';
            btnRun.innerText = '✨ 一键点亮标签 & 创作声明';
        }
    }

    document.body.appendChild(panel);
    renderPanel();
    updatePanelUI();

    // Auto-detect and update every 1.2 seconds
    if (window.__MED_TIMER) clearInterval(window.__MED_TIMER);
    window.__MED_TIMER = setInterval(() => {
        if (!isRunning) {
            updatePanelUI();
        }
    }, 1200);

    console.log('🏥 [医疗自媒体发布助手] 百家号模块已就绪 (MAIN world)');
})();
