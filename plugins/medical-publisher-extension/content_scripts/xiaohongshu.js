(function() {
    'use strict';

    if (window.__MEDICAL_XIAOHONGSHU_LOADED) return;
    window.__MEDICAL_XIAOHONGSHU_LOADED = true;

    // Doctor Configuration
    const DOCTOR_CONFIG = {
        xuweiguang: {
            name: '徐伟光',
            title: '神经外科副主任医师',
            color: '#0284c7',
            topics: ['#医生日常', '#脑积水', '#脑脊液', '#我要上热门', '#硬核科普健康行动']
        },
        zhouhui: {
            name: '周辉',
            title: '神经外科主任医师',
            color: '#7c3aed',
            getTopics: (text = '') => {
                if (text.includes('面肌痉挛')) {
                    return { type: '面肌痉挛', tags: ['#面肌痉挛', '#我要上热门', '#眼皮跳', '#硬核科普健康行动'] };
                } else if (text.includes('面瘫')) {
                    return { type: '面瘫', tags: ['#面瘫', '#面瘫后遗症', '#我要上热门', '#硬核科普健康行动'] };
                } else {
                    return { type: '默认(面瘫)', tags: ['#面瘫', '#面瘫后遗症', '#我要上热门', '#硬核科普健康行动'] };
                }
            }
        }
    };

    // Remove existing panel if present
    const oldPanel = document.getElementById('medical-xiaohongshu-panel');
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

    // Check if Tippy candidate dropdown is currently open and visible
    function isTippyOpen() {
        const tippy = document.querySelector('.tippy-content');
        return !!(tippy && tippy.offsetParent !== null);
    }

    // Wait for Tippy dropdown to completely close/fade out
    async function waitTippyClosed(maxWait = 1500) {
        const start = Date.now();
        while (Date.now() - start < maxWait) {
            if (!isTippyOpen()) return true;
            await sleep(40);
        }
        return false;
    }

    // Detect doctor from Chrome profile binding, title or editor content
    function autoDetectDoctor() {
        const profileDoc = getProfileDoctor();
        const ed = document.querySelector('.tiptap.ProseMirror');
        const titleInput = document.querySelector('.c-input_inner input') || document.querySelector('input[placeholder*="标题"]');
        
        const fullText = ((titleInput ? titleInput.value : '') + ' ' + (ed ? ed.innerText : '')).trim();

        // 1. Profile binding takes priority
        if (profileDoc) {
            currentDoctor = profileDoc;
        } else if (fullText.includes('脑积水') || fullText.includes('脑脊液') || fullText.includes('徐伟光')) {
            currentDoctor = 'xuweiguang';
        } else if (fullText.includes('面瘫') || fullText.includes('面肌痉挛') || fullText.includes('眼皮跳') || fullText.includes('周辉')) {
            currentDoctor = 'zhouhui';
        } else if (manualDoctor) {
            currentDoctor = manualDoctor;
        }
        localStorage.setItem('__MEDICAL_CURRENT_DOCTOR', currentDoctor);
        return currentDoctor;
    }

    // Inspect Xiaohongshu Editor & Topic State
    function getEditorInfo() {
        const ed = document.querySelector('.tiptap.ProseMirror');
        const titleInput = document.querySelector('.c-input_inner input') || document.querySelector('input[placeholder*="标题"]');

        if (!ed) {
            return { exists: false, litTags: [], unlitTags: [], text: '', title: '' };
        }

        // Lit tags (already converted to .tiptap-topic chips)
        const litTagElements = Array.from(ed.querySelectorAll('.tiptap-topic'));
        const litTags = litTagElements.map(t => {
            const topicAttr = t.getAttribute('data-topic');
            if (topicAttr) {
                try {
                    const parsed = JSON.parse(topicAttr);
                    if (parsed && parsed.name) return '#' + parsed.name;
                } catch (e) {}
            }
            return t.innerText.replace(/\[话题\]#?/, '').trim();
        });

        // Plain text unlit tags (match #tag that are NOT inside .tiptap-topic)
        const unlitTags = [];
        const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while (node = walker.nextNode()) {
            if (node.parentElement && node.parentElement.closest('.tiptap-topic')) {
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
            ed,
            title: titleInput ? (titleInput.value || '').trim() : '',
            text: (ed.innerText || '').trim(),
            litTags,
            litCount: litTags.length,
            unlitTags,
            unlitCount: unlitTags.length
        };
    }

    // Core: In-place Lighting up Xiaohongshu hashtags (Anti-Swallow Protected)
    async function lightUpTags(statusEl, btnEl) {
        if (isRunning) return;
        isRunning = true;

        const updateStatus = (msg, isErr = false) => {
            if (statusEl) {
                statusEl.innerHTML = `<span style="color: ${isErr ? '#f87171' : '#38bdf8'};">${msg}</span>`;
            }
        };

        const ed = document.querySelector('.tiptap.ProseMirror');
        if (!ed) {
            updateStatus('❌ 未找到小红书正文编辑器 (.tiptap.ProseMirror)', true);
            isRunning = false;
            return 0;
        }

        if (btnEl) {
            btnEl.disabled = true;
            btnEl.style.background = '#475569';
            btnEl.innerText = '⏳ 正在点亮话题中...';
        }

        let litSuccessCount = 0;
        let safetyLoop = 0;
        const maxLoops = 20;
        const processedTags = new Set();

        try {
            while (safetyLoop < maxLoops) {
                safetyLoop++;
                // 1. Ensure previous dropdown is completely closed before starting next tag
                await waitTippyClosed(1500);

                ed.focus();

                // 2. Find the next unlit plain-text tag
                let targetNode = null;
                let targetTag = null;
                let targetIdx = -1;

                const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = walker.nextNode()) {
                    if (node.parentElement && node.parentElement.closest('.tiptap-topic')) {
                        continue;
                    }
                    const val = node.nodeValue || '';
                    const matches = Array.from(val.matchAll(/#([^\s#]+)/g));
                    for (let m of matches) {
                        const tag = m[0];
                        if (tag.length > 1 && !processedTags.has(tag)) {
                            targetNode = node;
                            targetTag = tag;
                            targetIdx = m.index;
                            break;
                        }
                    }
                    if (targetNode) break;
                }

                if (!targetNode || !targetTag) {
                    // All unlit tags have been processed
                    break;
                }

                const rawTagClean = targetTag.replace(/^#/, '').replace(/#$/, '').trim();
                processedTags.add(targetTag);
                updateStatus(`🔍 正在点亮: <b>#${rawTagClean}</b>... (已点亮 ${litSuccessCount} 个)`);

                // 3. Place selection at the last character of the tag
                const endPos = targetIdx + targetTag.length;
                const sel = window.getSelection();
                const range = document.createRange();

                try {
                    range.setStart(targetNode, endPos - 1);
                    range.setEnd(targetNode, endPos);
                    sel.removeAllRanges();
                    sel.addRange(range);

                    // Retype the last character to trigger Xiaohongshu's suggestion dropdown
                    const lastChar = targetTag.charAt(targetTag.length - 1);
                    document.execCommand('insertText', false, lastChar);
                } catch (selErr) {
                    console.warn('[小红书助手] 光标选区异常:', selErr);
                    continue;
                }

                // 4. Wait specifically for dropdown items that match rawTagClean (Timeout 3.0s)
                const start = Date.now();
                let matchedItem = null;
                while (Date.now() - start < 3000) {
                    const items = document.querySelectorAll('.tippy-content .item');
                    for (let it of items) {
                        const nameEl = it.querySelector('.name');
                        const name = (nameEl ? nameEl.innerText : it.innerText).trim().replace(/^#/, '').replace(/#$/, '');
                        if (name === rawTagClean || name.startsWith(rawTagClean)) {
                            matchedItem = it;
                            break;
                        }
                    }
                    if (matchedItem) break;
                    await sleep(40);
                }

                // 5. Anti-Swallow Guarantee: If no matching item found, NEVER click arbitrary items!
                if (!matchedItem) {
                    console.warn(`[小红书助手] 话题 #${rawTagClean} 未匹配到官方词条，跳过并保留普通文本，防止被吞`);
                    updateStatus(`⚠️ 话题 <b>#${rawTagClean}</b> 无官方词条，已安全保留为普通标签`);
                    await sleep(250);
                    continue;
                }

                // 6. Click the matching candidate
                const clickedName = matchedItem.querySelector('.name') ? matchedItem.querySelector('.name').innerText : matchedItem.innerText;
                matchedItem.click();
                litSuccessCount++;
                console.log(`[小红书助手] 成功转换话题: ${clickedName}`);

                // 7. Wait for dropdown to close and DOM reconciliation
                await waitTippyClosed(1500);
                await sleep(250);
            }

            if (litSuccessCount > 0) {
                updateStatus(`🎉 <b>点亮完成！</b> 成功转换 ${litSuccessCount} 个官方话题标签`);
            } else {
                updateStatus(`✅ 编辑框内标签均已就绪`);
            }

        } catch (err) {
            console.error('❌ [小红书助手] 点亮标签发生错误:', err);
            updateStatus(`❌ 点亮异常: ${err.message || err}`, true);
        } finally {
            isRunning = false;
            updatePanelUI();
        }
    }

    // Create Floating Panel
    const panel = document.createElement('div');
    panel.id = 'medical-xiaohongshu-panel';
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
            if (e.target.tagName === 'BUTTON' || e.target.id === 'xhs-doctor-badge' || e.target.id === 'xhs-btn-minimize') return;
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
            <div id="xhs-drag-header" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid #1e293b; background: #1e293b; border-radius: 12px 12px 0 0; white-space: nowrap; box-sizing: border-box;">
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    <span style="font-weight: 700; color: #fe2442; font-size: 13px; white-space: nowrap;">📕 小红书发布助手</span>
                    <span id="xhs-status-badge" style="background: #059669; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; white-space: nowrap;">已识别</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                    <span id="xhs-doctor-badge" style="background: ${docConfig.color}; color: white; padding: 2px 8px; border-radius: 9999px; font-size: 11px; cursor: pointer; font-weight: 600; white-space: nowrap;" title="点击切换医生">
                        ${docConfig.name}
                    </span>
                    <button id="xhs-btn-minimize" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px; line-height: 1; flex-shrink: 0;">
                        ${isMinimized ? '+' : '—'}
                    </button>
                </div>
            </div>
            <div id="xhs-body-content" style="padding: 14px 16px; display: ${isMinimized ? 'none' : 'block'};">
                <div id="xhs-status-text" style="color: #94a3b8; font-size: 12px; line-height: 1.7; margin-bottom: 12px;">
                    ⏳ 正在检测小红书发布状态...
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <button id="xhs-btn-action" style="background: #fe2442; color: white; border: none; padding: 10px 12px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 4px rgba(254,36,66,0.25);">
                        ✨ 一键点亮小红书话题
                    </button>
                </div>
            </div>
        `;

        initDrag(document.getElementById('xhs-drag-header'));

        document.getElementById('xhs-btn-minimize').onclick = () => {
            isMinimized = !isMinimized;
            document.getElementById('xhs-body-content').style.display = isMinimized ? 'none' : 'block';
            document.getElementById('xhs-btn-minimize').innerText = isMinimized ? '+' : '—';
            document.getElementById('xhs-drag-header').style.borderRadius = isMinimized ? '12px' : '12px 12px 0 0';
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
        document.getElementById('xhs-doctor-badge').onclick = toggleDoctor;

        const btnAction = document.getElementById('xhs-btn-action');
        btnAction.onclick = () => {
            lightUpTags(document.getElementById('xhs-status-text'), btnAction);
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
        const edInfo = getEditorInfo();

        const badge = document.getElementById('xhs-status-badge');
        const statusText = document.getElementById('xhs-status-text');
        const btnAction = document.getElementById('xhs-btn-action');

        if (!badge || !statusText || !btnAction) return;

        // Update Doctor Badge
        const docBadge = document.getElementById('xhs-doctor-badge');
        if (docBadge) {
            docBadge.innerText = docConfig.name;
            docBadge.style.background = docConfig.color;
        }

        if (!edInfo.exists) {
            badge.style.background = '#64748b';
            badge.innerText = '等待编辑器';
            statusText.innerHTML = `
                <div style="color: #cbd5e1; margin-bottom: 6px;">👨‍⚕️ 目标医生: <b>${docConfig.name}</b> (${docConfig.title})</div>
                <div style="color: #94a3b8;">⏳ 尚未检测到正文编辑器，请进入小红书发布页面...</div>
            `;
            btnAction.disabled = true;
            btnAction.style.background = '#475569';
            btnAction.innerText = '等待编辑器就绪';
            return;
        }

        badge.style.background = '#059669';
        badge.innerText = '已识别';

        const unlitCount = edInfo.unlitCount;
        const litCount = edInfo.litCount;

        const fullText = (edInfo.title + ' ' + edInfo.text).trim();
        const diseaseBadge = (currentDoctor === 'zhouhui')
            ? `<span style="font-size: 10px; background: #8b5cf6; color: #fff; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">${DOCTOR_CONFIG.zhouhui.getTopics(fullText).type}</span>`
            : `<span style="font-size: 10px; background: #0284c7; color: #fff; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">脑积水/脑脊液</span>`;

        let statusHtml = `
            <div style="color: #cbd5e1; margin-bottom: 6px;">👨‍⚕️ 目标医生: <b style="color: #38bdf8;">${docConfig.name}</b> (${docConfig.title})${diseaseBadge}</div>
            <div style="color: #e2e8f0; font-size: 11px; margin-bottom: 4px;">📝 标题: ${edInfo.title ? `<span style="color: #a7f3d0;">${edInfo.title.substring(0, 16)}</span>` : '<span style="color: #f87171;">未填写</span>'}</div>
            <div style="color: #e2e8f0; font-size: 11px; margin-bottom: 4px;">
                💡 话题状态: 
                <span style="color: #38bdf8; font-weight: 600;">${litCount} 个已点亮</span>
                ${unlitCount > 0 ? `, <span style="color: #fbbf24; font-weight: 600;">${unlitCount} 个待点亮</span>` : ', <span style="color: #34d399;">全部已点亮</span>'}
            </div>
        `;

        if (unlitCount > 0) {
            statusHtml += `
                <div style="background: rgba(251,191,36,0.1); border: 1px dashed rgba(251,191,36,0.3); border-radius: 6px; padding: 6px 8px; margin-top: 6px; font-size: 11px; color: #fde68a;">
                    ⚠️ 检测到未点亮标签: <b>${edInfo.unlitTags.join(' ')}</b>
                </div>
            `;
            btnAction.disabled = false;
            btnAction.style.background = '#fe2442';
            btnAction.innerText = `✨ 一键点亮话题 (${unlitCount}个待点亮)`;
        } else {
            statusHtml += `
                <div style="background: rgba(52,211,153,0.1); border: 1px dashed rgba(52,211,153,0.3); border-radius: 6px; padding: 6px 8px; margin-top: 6px; font-size: 11px; color: #a7f3d0;">
                    ✅ 所有标签均已成功点亮为官方话题！
                </div>
            `;
            btnAction.disabled = false;
            btnAction.style.background = '#059669';
            btnAction.innerText = '✅ 标签已全部点亮 (可点击复检)';
        }

        statusText.innerHTML = statusHtml;
    }

    // Mount floating panel
    function init() {
        document.body.appendChild(panel);
        renderPanel();
        updatePanelUI();

        // Periodic check to track user typing or paste actions
        setInterval(() => {
            updatePanelUI();
        }, 1500);

        console.log('🚀 [小红书助手] 医疗自媒体发布助手 (小红书防吞版) 已就绪');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
