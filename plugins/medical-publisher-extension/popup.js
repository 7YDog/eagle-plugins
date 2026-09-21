document.addEventListener('DOMContentLoaded', () => {
    const cardZhouhui = document.getElementById('card-zhouhui');
    const cardXuweiguang = document.getElementById('card-xuweiguang');
    const statusMsg = document.getElementById('status-msg');

    function updateUI(activeDoctor) {
        cardZhouhui.classList.remove('active-zhouhui');
        cardXuweiguang.classList.remove('active-xuweiguang');

        if (activeDoctor === 'zhouhui') {
            cardZhouhui.classList.add('active-zhouhui');
        } else {
            cardXuweiguang.classList.add('active-xuweiguang');
        }
    }

    function selectDoctor(doctor) {
        updateUI(doctor);
        chrome.storage.local.set({ profile_doctor: doctor }, () => {
            const name = doctor === 'zhouhui' ? '周辉' : '徐伟光';
            statusMsg.innerText = `已绑定医生为【${name}】，全平台实时生效！`;
            
            // 通知所有已打开的页面更新
            chrome.tabs.query({}, (tabs) => {
                tabs.forEach(tab => {
                    try {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'PROFILE_DOCTOR_CHANGED',
                            doctor: doctor
                        }, () => {
                            // 忽略未注入页面的错误
                            if (chrome.runtime.lastError) {}
                        });
                    } catch (e) {}
                });
            });

            setTimeout(() => {
                statusMsg.innerText = '';
            }, 2500);
        });
    }

    // 初始化读取当前个人资料绑定的医生
    chrome.storage.local.get(['profile_doctor'], (res) => {
        const current = res.profile_doctor || 'xuweiguang';
        updateUI(current);
    });

    cardZhouhui.addEventListener('click', () => selectDoctor('zhouhui'));
    cardXuweiguang.addEventListener('click', () => selectDoctor('xuweiguang'));
});
