document.addEventListener('DOMContentLoaded', () => {
    // 默认出厂配置
    const DEFAULT_CONFIG = {
        zhouhui: {
            name: '周辉',
            microappUrl: 'https://www.iesdouyin.com/share/microapp/?token=QkEwOTcxQ0Q5RjYzNzZqcWppZXN5&share_channel=copy',
            microappName: '小荷AI医生',
            tags_spasm: '#面肌痉挛 #我要上热门 #眼皮跳 #硬核科普健康行动',
            tags_palsy: '#面瘫 #面瘫后遗症 #我要上热门 #硬核科普健康行动',
            location: '广东药科大学附属第一医院(农林院本部)'
        },
        xuweiguang: {
            name: '徐伟光',
            microappUrl: 'https://www.iesdouyin.com/share/microapp/?token=QzU2QzE1RDhFNjAyNzZqb21nNmVt&share_channel=copy',
            microappName: '小荷AI医生',
            tags_default: '#医生日常 #脑积水 #脑脊液 #我要上热门 #硬核科普健康行动',
            location: '广东药科大学附属第一医院(农林院本部)'
        }
    };

    let activeDoctor = 'zhouhui';
    let currentConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // UI Elements
    const tabBtnProfile = document.getElementById('tab-btn-profile');
    const tabBtnConfig = document.getElementById('tab-btn-config');
    const tabProfile = document.getElementById('tab-profile');
    const tabConfig = document.getElementById('tab-config');

    const cardZhouhui = document.getElementById('card-zhouhui');
    const cardXuweiguang = document.getElementById('card-xuweiguang');

    const subPillZhouhui = document.getElementById('sub-pill-zhouhui');
    const subPillXuweiguang = document.getElementById('sub-pill-xuweiguang');
    const groupZhouhui = document.getElementById('group-zhouhui');
    const groupXuweiguang = document.getElementById('group-xuweiguang');

    const btnSave = document.getElementById('btn-save-config');
    const btnReset = document.getElementById('btn-reset-config');
    const btnOpenOptions = document.getElementById('btn-open-options');
    const statusMsg = document.getElementById('status-msg');

    // Zhou Hui Inputs
    const zhMicroappUrl = document.getElementById('zh-microapp-url');
    const zhTagsSpasm = document.getElementById('zh-tags-spasm');
    const zhTagsPalsy = document.getElementById('zh-tags-palsy');
    const zhLocation = document.getElementById('zh-location');

    // Xu Weiguang Inputs
    const xwgMicroappUrl = document.getElementById('xwg-microapp-url');
    const xwgTagsDefault = document.getElementById('xwg-tags-default');
    const xwgLocation = document.getElementById('xwg-location');

    function showToast(msg, isSuccess = true) {
        statusMsg.innerText = msg;
        statusMsg.style.color = isSuccess ? '#10b981' : '#f87171';
        setTimeout(() => {
            if (statusMsg.innerText === msg) {
                statusMsg.innerText = '';
            }
        }, 3000);
    }

    // 1. Tab Navigation
    function switchTab(target) {
        if (target === 'tab-profile') {
            tabBtnProfile.classList.add('active');
            tabBtnConfig.classList.remove('active');
            tabProfile.classList.add('active');
            tabConfig.classList.remove('active');
        } else {
            tabBtnConfig.classList.add('active');
            tabBtnProfile.classList.remove('active');
            tabConfig.classList.add('active');
            tabProfile.classList.remove('active');
        }
    }
    if (tabBtnProfile) tabBtnProfile.onclick = () => switchTab('tab-profile');
    if (tabBtnConfig) tabBtnConfig.onclick = () => switchTab('tab-config');

    // 2. Doctor Sub-pills Navigation in Config
    function switchSubConfig(doc) {
        if (doc === 'zhouhui') {
            subPillZhouhui.classList.add('active-zhouhui');
            subPillXuweiguang.classList.remove('active-xuweiguang');
            groupZhouhui.style.display = 'block';
            groupXuweiguang.style.display = 'none';
        } else {
            subPillXuweiguang.classList.add('active-xuweiguang');
            subPillZhouhui.classList.remove('active-zhouhui');
            groupXuweiguang.style.display = 'block';
            groupZhouhui.style.display = 'none';
        }
    }
    if (subPillZhouhui) subPillZhouhui.onclick = () => switchSubConfig('zhouhui');
    if (subPillXuweiguang) subPillXuweiguang.onclick = () => switchSubConfig('xuweiguang');

    // 3. Update Doctor Selection UI (Profile Binding)
    function updateProfileDoctorUI(doc) {
        activeDoctor = doc;
        cardZhouhui.classList.remove('active-zhouhui');
        cardXuweiguang.classList.remove('active-xuweiguang');

        if (doc === 'zhouhui') {
            cardZhouhui.classList.add('active-zhouhui');
        } else {
            cardXuweiguang.classList.add('active-xuweiguang');
        }
    }

    function selectProfileDoctor(doc) {
        updateProfileDoctorUI(doc);
        chrome.storage.local.set({ profile_doctor: doc }, () => {
            const name = doc === 'zhouhui' ? '周辉' : '徐伟光';
            showToast(`已永久绑定当前 Chrome 资料为【${name}】！`);

            // 广播通知已打开的标签页
            notifyTabs({
                type: 'PROFILE_DOCTOR_CHANGED',
                doctor: doc
            });
        });
    }

    if (cardZhouhui) cardZhouhui.onclick = () => selectProfileDoctor('zhouhui');
    if (cardXuweiguang) cardXuweiguang.onclick = () => selectProfileDoctor('xuweiguang');

    // 4. Populate Form Inputs from config
    function populateForm(cfg) {
        currentConfig = cfg;
        const zh = cfg.zhouhui || DEFAULT_CONFIG.zhouhui;
        const xwg = cfg.xuweiguang || DEFAULT_CONFIG.xuweiguang;

        if (zhMicroappUrl) zhMicroappUrl.value = zh.microappUrl || '';
        if (zhTagsSpasm) zhTagsSpasm.value = zh.tags_spasm || '';
        if (zhTagsPalsy) zhTagsPalsy.value = zh.tags_palsy || '';
        if (zhLocation) zhLocation.value = zh.location || '';

        if (xwgMicroappUrl) xwgMicroappUrl.value = xwg.microappUrl || '';
        if (xwgTagsDefault) xwgTagsDefault.value = xwg.tags_default || '';
        if (xwgLocation) xwgLocation.value = xwg.location || '';
    }

    // 5. Save Config
    function saveConfig() {
        const newConfig = {
            zhouhui: {
                name: '周辉',
                microappUrl: (zhMicroappUrl.value || '').trim(),
                microappName: '小荷AI医生',
                tags_spasm: (zhTagsSpasm.value || '').trim(),
                tags_palsy: (zhTagsPalsy.value || '').trim(),
                location: (zhLocation.value || '').trim() || DEFAULT_CONFIG.zhouhui.location
            },
            xuweiguang: {
                name: '徐伟光',
                microappUrl: (xwgMicroappUrl.value || '').trim(),
                microappName: '小荷AI医生',
                tags_default: (xwgTagsDefault.value || '').trim(),
                location: (xwgLocation.value || '').trim() || DEFAULT_CONFIG.xuweiguang.location
            }
        };

        chrome.storage.local.set({ medical_publisher_config: newConfig }, () => {
            currentConfig = newConfig;
            showToast('✅ 配置保存成功，全平台已实时同步！');

            // 广播配置更新给所有页面
            notifyTabs({
                type: 'MEDICAL_CONFIG_CHANGED',
                config: newConfig
            });
        });
    }

    if (btnSave) btnSave.onclick = saveConfig;

    // 6. Reset to Default Config
    if (btnReset) {
        btnReset.onclick = () => {
            if (confirm('确认将周辉与徐伟光的标签、链接与定位恢复为系统默认出厂值吗？')) {
                populateForm(DEFAULT_CONFIG);
                chrome.storage.local.set({ medical_publisher_config: DEFAULT_CONFIG }, () => {
                    showToast('🔄 已恢复为初始预设配置！');
                    notifyTabs({
                        type: 'MEDICAL_CONFIG_CHANGED',
                        config: DEFAULT_CONFIG
                    });
                });
            }
        };
    }

    // 7. Open Options Page in new tab
    if (btnOpenOptions) {
        btnOpenOptions.onclick = () => {
            if (chrome.runtime.openOptionsPage) {
                chrome.runtime.openOptionsPage();
            } else {
                window.open(chrome.runtime.getURL('options.html'));
            }
        };
    }

    // Broadcast helper
    function notifyTabs(msg) {
        try {
            chrome.tabs.query({}, (tabs) => {
                if (!tabs) return;
                tabs.forEach(tab => {
                    try {
                        chrome.tabs.sendMessage(tab.id, msg, () => {
                            if (chrome.runtime.lastError) {}
                        });
                    } catch (e) {}
                });
            });
        } catch (e) {}
    }

    // 8. Initialization: Load profile doctor & config
    chrome.storage.local.get(['profile_doctor', 'medical_publisher_config'], (res) => {
        const doc = res.profile_doctor || 'zhouhui';
        updateProfileDoctorUI(doc);

        const savedConfig = res.medical_publisher_config;
        if (savedConfig && savedConfig.zhouhui && savedConfig.xuweiguang) {
            populateForm(savedConfig);
        } else {
            populateForm(DEFAULT_CONFIG);
        }

        // 默认将配置页子标签对应当前选中的医生
        switchSubConfig(doc);
    });
});
