/**
 * Medical Publisher Extension - Profile Bridge (ISOLATED World)
 * 运行在扩展隔离环境（ISOLATED world, document_start），作为 Chrome 个人资料物理隔离存储
 * （chrome.storage.local）与网页主运行环境（MAIN world）之间的安全桥梁。
 * 负责持久化存储当前 Profile 选定医生与自定义后台配置（标签、小荷链接、定位等）。
 */
(function() {
    'use strict';

    // 1. 页面加载初期（document_start）读取当前 Chrome 个人资料专属医生与后台配置
    function initBridge() {
        try {
            chrome.storage.local.get(['profile_doctor', 'medical_publisher_config'], (result) => {
                const doctor = result.profile_doctor || '';
                const config = result.medical_publisher_config || null;

                if (document.documentElement) {
                    if (doctor) {
                        document.documentElement.setAttribute('data-medical-doctor', doctor);
                    }
                    if (config) {
                        document.documentElement.setAttribute('data-medical-config', JSON.stringify(config));
                    }
                }

                // 向 MAIN world 发送就绪通知
                window.dispatchEvent(new CustomEvent('__MEDICAL_PROFILE_DOCTOR_READY__', {
                    detail: { doctor }
                }));

                if (config) {
                    window.dispatchEvent(new CustomEvent('__MEDICAL_CONFIG_READY__', {
                        detail: { config }
                    }));
                }
            });
        } catch (e) {
            console.warn('[Medical Bridge] 读取 profile_doctor/config 失败:', e);
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

    // 3. 监听来自主页面保存自定义配置的请求
    window.addEventListener('__MEDICAL_SET_CONFIG__', (e) => {
        try {
            const config = e.detail && e.detail.config;
            if (config) {
                chrome.storage.local.set({ medical_publisher_config: config }, () => {
                    if (document.documentElement) {
                        document.documentElement.setAttribute('data-medical-config', JSON.stringify(config));
                    }
                    window.dispatchEvent(new CustomEvent('__MEDICAL_CONFIG_READY__', {
                        detail: { config }
                    }));
                });
            }
        } catch (err) {}
    });

    // 4. 监听来自 Popup 快捷弹窗与后台管理界面的切换与配置广播
    try {
        chrome.runtime.onMessage.addListener((message) => {
            if (!message) return;

            // 医生切换广播
            if (message.type === 'PROFILE_DOCTOR_CHANGED') {
                const doctor = message.doctor;
                if (document.documentElement) {
                    document.documentElement.setAttribute('data-medical-doctor', doctor);
                }
                window.dispatchEvent(new CustomEvent('__MEDICAL_PROFILE_DOCTOR_READY__', {
                    detail: { doctor }
                }));
            }

            // 自定义配置变更广播（后台修改了标签或小荷链接）
            if (message.type === 'MEDICAL_CONFIG_CHANGED') {
                const config = message.config;
                if (document.documentElement && config) {
                    document.documentElement.setAttribute('data-medical-config', JSON.stringify(config));
                }
                window.dispatchEvent(new CustomEvent('__MEDICAL_CONFIG_READY__', {
                    detail: { config }
                }));
            }
        });
    } catch (e) {}

    // 立即执行并监听 DOM 就绪
    initBridge();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initBridge);
    }
})();
