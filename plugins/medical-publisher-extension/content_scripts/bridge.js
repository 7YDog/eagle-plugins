/**
 * Medical Publisher Extension - Profile Bridge (ISOLATED World)
 * 运行在扩展隔离环境（ISOLATED world, document_start），作为 Chrome 个人资料物理隔离存储
 * （chrome.storage.local）与网页主运行环境（MAIN world）之间的安全桥梁。
 */
(function() {
    'use strict';

    // 1. 页面加载初期（document_start）读取当前 Chrome 个人资料专属医生
    function initProfileDoctor() {
        try {
            chrome.storage.local.get(['profile_doctor'], (result) => {
                const doctor = result.profile_doctor || '';
                if (doctor && document.documentElement) {
                    document.documentElement.setAttribute('data-medical-doctor', doctor);
                }
                // 向 MAIN world 发送就绪通知
                window.dispatchEvent(new CustomEvent('__MEDICAL_PROFILE_DOCTOR_READY__', {
                    detail: { doctor }
                }));
            });
        } catch (e) {
            console.warn('[Medical Bridge] 读取 profile_doctor 失败:', e);
        }
    }

    // 2. 监听来自主页面（MAIN world）悬浮窗点击切换医生的持久化请求
    window.addEventListener('__MEDICAL_SET_PROFILE_DOCTOR__', (e) => {
        try {
            const doctor = e.detail && e.detail.doctor;
            if (doctor) {
                chrome.storage.local.set({ profile_doctor: doctor }, () => {
                    if (document.documentElement) {
                        document.documentElement.setAttribute('data-medical-doctor', doctor);
                    }
                    console.log(`[Medical Bridge] 当前 Chrome 个人资料已持久化绑定医生为: ${doctor}`);
                });
            }
        } catch (err) {
            console.warn('[Medical Bridge] 保存 profile_doctor 失败:', err);
        }
    });

    // 3. 监听来自 Popup 快捷弹窗的切换广播
    try {
        chrome.runtime.onMessage.addListener((message) => {
            if (message && message.type === 'PROFILE_DOCTOR_CHANGED') {
                const doctor = message.doctor;
                if (document.documentElement) {
                    document.documentElement.setAttribute('data-medical-doctor', doctor);
                }
                window.dispatchEvent(new CustomEvent('__MEDICAL_PROFILE_DOCTOR_READY__', {
                    detail: { doctor }
                }));
            }
        });
    } catch (e) {}

    // 立即执行并监听 DOM 就绪
    initProfileDoctor();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfileDoctor);
    }
})();
