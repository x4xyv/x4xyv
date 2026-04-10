/* ============================================
   script.js - المنطق الكامل للوحة التحكم
   يعتمد على API مطور مع تخزين مؤقت
   ============================================ */

(function(){
    "use strict";

    // ---------- الإعدادات ----------
    const API_BASE = 'https://your-api.onrender.com/api';  // ⚠️ استبدل برابط API الفعلي
    let currentUserId = null;
    let currentSection = null;              // القسم المفتوح حاليًا
    let sectionsData = [];                  // تخزين مؤقت للأقسام
    let autoRefreshTimer = null;
    let isOnline = true;

    // ---------- عناصر DOM ----------
    const sectionsView = document.getElementById('sectionsView');
    const detailsView = document.getElementById('detailsView');
    const sectionsGrid = document.getElementById('sectionsGridContainer');
    const userIdDisplay = document.getElementById('userIdDisplay');
    const sectionTotalDisplay = document.getElementById('sectionTotalDisplay');
    const sectionCountDisplay = document.getElementById('sectionCountDisplay');
    const recordsContainer = document.getElementById('recordsListContainer');
    const currentSectionTitle = document.getElementById('currentSectionTitle');
    const modalOverlay = document.getElementById('sectionModal');
    const modalTitle = document.getElementById('modalTitle');
    const sectionNameInput = document.getElementById('sectionNameInput');
    const sectionUnitInput = document.getElementById('sectionUnitInput');
    const sectionColorInput = document.getElementById('sectionColorInput');
    const sectionIconInput = document.getElementById('sectionIconInput');
    const saveSectionBtn = document.getElementById('saveSectionBtn');
    const cancelModalBtn = document.getElementById('cancelModalBtn');
    const showAddSectionModalBtn = document.getElementById('showAddSectionModalBtn');
    const backToSectionsBtn = document.getElementById('backToSectionsBtn');
    const globalRefreshBtn = document.getElementById('globalRefreshBtn');
    const refreshCurrentSectionBtn = document.getElementById('refreshCurrentSectionBtn');
    const deleteSectionBtn = document.getElementById('deleteSectionBtn');
    const clearSectionRecordsBtn = document.getElementById('clearSectionRecordsBtn');
    const addRecordBtn = document.getElementById('addRecordBtn');
    const recordNumInput = document.getElementById('recordNumInput');
    const recordOpSelect = document.getElementById('recordOpSelect');
    const recordLabelInput = document.getElementById('recordLabelInput');
    const recordNoteInput = document.getElementById('recordNoteInput');

    // ---------- دوال مساعدة ----------
    function formatNumber(num) {
        if (num === null || num === undefined || isNaN(num)) return '0';
        return Number(num).toLocaleString('ar-EG', { maximumFractionDigits: 2 });
    }

    function showError(message, container) {
        container.innerHTML = `<div class="error-message"><i class="fas fa-exclamation-triangle"></i> ${message}</div>`;
    }

    function setLoading(container) {
        container.innerHTML = `<div class="loading-placeholder"><i class="fas fa-spinner fa-pulse"></i> جاري التحميل...</div>`;
    }

    // إدارة user_id
    function initUserId() {
        let userId = localStorage.getItem('telegram_user_id');
        if (!userId) {
            const params = new URLSearchParams(window.location.search);
            userId = params.get('user_id');
            if (userId) localStorage.setItem('telegram_user_id', userId);
            else {
                userId = prompt('👤 الرجاء إدخال معرف المستخدم (user_id) للمتابعة:');
                if (userId) localStorage.setItem('telegram_user_id', userId);
            }
        }
        if (!userId) {
            alert('لا يمكن المتابعة بدون معرف مستخدم.');
            return null;
        }
        currentUserId = userId;
        userIdDisplay.textContent = userId;
        return userId;
    }

    // ---------- التواصل مع API (مع محاولة إعادة المحاولة) ----------
    async function apiCall(endpoint, method = 'GET', body = null, retries = 2) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Telegram-User-Id': currentUserId
        };
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        let lastError;
        for (let i = 0; i <= retries; i++) {
            try {
                const res = await fetch(`${API_BASE}${endpoint}`, options);
                if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error(errData.error || `خطأ ${res.status}`);
                }
                isOnline = true;
                return await res.json();
            } catch (error) {
                lastError = error;
                if (i < retries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
                }
            }
        }
        isOnline = false;
        throw lastError;
    }

    // ---------- عمليات الأقسام ----------
    async function fetchSections() {
        const sections = await apiCall('/sections?include_summary=true');
        sectionsData = sections;
        return sections;
    }

    async function createSection(sectionData) {
        return apiCall('/sections', 'POST', sectionData);
    }

    async function deleteSectionRequest(sectionId) {
        return apiCall(`/sections/${sectionId}`, 'DELETE');
    }

    async function pinSectionRequest(sectionId) {
        return apiCall(`/sections/${sectionId}/pin`, 'PATCH');
    }

    async function clearSectionRecordsRequest(sectionId) {
        return apiCall(`/sections/${sectionId}/clear`, 'DELETE');
    }

    // ---------- عمليات السجلات ----------
    async function fetchSectionSummary(sectionId) {
        return apiCall(`/sections/${sectionId}/summary`);
    }

    async function fetchRecords(sectionId) {
        return apiCall(`/records?section_id=${sectionId}`);
    }

    async function addRecordRequest(recordData) {
        return apiCall('/records', 'POST', recordData);
    }

    async function deleteRecordRequest(recordId) {
        return apiCall(`/records/${recordId}`, 'DELETE');
    }

    async function pinRecordRequest(recordId) {
        return apiCall(`/records/${recordId}/pin`, 'PATCH');
    }

    // ---------- عرض الأقسام ----------
    async function loadAndRenderSections() {
        try {
            setLoading(sectionsGrid);
            const sections = await fetchSections();
            renderSections(sections);
        } catch (error) {
            showError(`فشل تحميل الأقسام: ${error.message}`, sectionsGrid);
        }
    }

    function renderSections(sections) {
        if (!sections.length) {
            sectionsGrid.innerHTML = `<div class="loading-placeholder"><i class="fas fa-folder-open"></i> لا توجد أقسام. أنشئ قسمًا جديدًا.</div>`;
            return;
        }

        let html = '';
        sections.forEach(sec => {
            const total = sec.total || 0;
            const count = sec.record_count || 0;
            html += `
                <div class="section-card" data-section-id="${sec.id}" style="border-top: 6px solid ${sec.color || '#4f46e5'};">
                    <div class="card-header">
                        <span class="section-icon">${sec.icon || '📁'}</span>
                        <span class="section-name">${escapeHtml(sec.name)}</span>
                        ${sec.pinned ? '<i class="fas fa-thumbtack pinned-badge"></i>' : ''}
                    </div>
                    <div class="section-total">${formatNumber(total)} ${escapeHtml(sec.unit || '')}</div>
                    <div class="record-count"><i class="far fa-list-alt"></i> ${count} عملية</div>
                    <div class="card-actions">
                        <button class="icon-btn pin-section-btn" data-id="${sec.id}" title="تثبيت/إلغاء التثبيت"><i class="fas fa-thumbtack"></i></button>
                    </div>
                </div>
            `;
        });
        sectionsGrid.innerHTML = html;

        // أحداث البطاقات
        document.querySelectorAll('.section-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const id = card.dataset.sectionId;
                const section = sections.find(s => s.id === id);
                if (section) openSectionDetails(section);
            });
        });

        document.querySelectorAll('.pin-section-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                try {
                    await pinSectionRequest(id);
                    await loadAndRenderSections();
                } catch (err) {
                    alert('فشل تغيير التثبيت: ' + err.message);
                }
            });
        });
    }

    // هروب HTML بسيط
    function escapeHtml(text) {
        if (!text) return text;
        return String(text).replace(/[&<>"]/g, function(c) {
            if (c === '&') return '&amp;';
            if (c === '<') return '&lt;';
            if (c === '>') return '&gt;';
            if (c === '"') return '&quot;';
            return c;
        });
    }

    // ---------- تفاصيل القسم ----------
    async function openSectionDetails(section) {
        currentSection = section;
        currentSectionTitle.innerHTML = `${section.icon || '📁'} ${escapeHtml(section.name)}`;
        sectionsView.classList.add('hidden');
        detailsView.classList.remove('hidden');
        await refreshSectionDetails();
    }

    async function refreshSectionDetails() {
        if (!currentSection) return;
        try {
            setLoading(recordsContainer);
            const [summary, records] = await Promise.all([
                fetchSectionSummary(currentSection.id),
                fetchRecords(currentSection.id)
            ]);
            sectionTotalDisplay.textContent = formatNumber(summary.total);
            sectionCountDisplay.textContent = summary.count;
            renderRecords(records);
        } catch (error) {
            showError(`فشل تحميل التفاصيل: ${error.message}`, recordsContainer);
        }
    }

    function renderRecords(records) {
        if (!records.length) {
            recordsContainer.innerHTML = `<div class="loading-placeholder"><i class="fas fa-inbox"></i> لا توجد عمليات حالياً.</div>`;
            return;
        }

        let html = '';
        records.forEach(rec => {
            html += `
                <div class="record-row" data-record-id="${rec.id}">
                    <span class="record-op">${rec.op}</span>
                    <span class="record-num">${formatNumber(rec.num)}</span>
                    ${rec.label ? `<span class="record-label">${escapeHtml(rec.label)}</span>` : ''}
                    ${rec.note ? `<span class="record-note">${escapeHtml(rec.note)}</span>` : ''}
                    <div class="record-actions">
                        <button class="icon-btn pin-record-btn" data-id="${rec.id}" title="تثبيت"><i class="fas fa-thumbtack"></i></button>
                        <button class="icon-btn delete-record-btn" data-id="${rec.id}" title="حذف"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `;
        });
        recordsContainer.innerHTML = html;

        // أحداث الأزرار
        document.querySelectorAll('.pin-record-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                try {
                    await pinRecordRequest(id);
                    await refreshSectionDetails();
                    await loadAndRenderSections();
                } catch (err) {
                    alert('فشل تثبيت العملية: ' + err.message);
                }
            });
        });

        document.querySelectorAll('.delete-record-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('هل أنت متأكد من حذف هذه العملية؟')) return;
                const id = btn.dataset.id;
                try {
                    await deleteRecordRequest(id);
                    await refreshSectionDetails();
                    await loadAndRenderSections();
                } catch (err) {
                    alert('فشل حذف العملية: ' + err.message);
                }
            });
        });
    }

    // ---------- معالجات الأحداث العامة ----------
    function bindEvents() {
        // العودة للأقسام
        backToSectionsBtn.addEventListener('click', () => {
            detailsView.classList.add('hidden');
            sectionsView.classList.remove('hidden');
            currentSection = null;
            loadAndRenderSections();
        });

        // تحديث شامل
        globalRefreshBtn.addEventListener('click', async () => {
            await loadAndRenderSections();
            if (currentSection) await refreshSectionDetails();
        });

        // تحديث القسم الحالي
        refreshCurrentSectionBtn.addEventListener('click', async () => {
            if (currentSection) await refreshSectionDetails();
        });

        // حذف القسم
        deleteSectionBtn.addEventListener('click', async () => {
            if (!currentSection) return;
            if (!confirm(`حذف قسم "${currentSection.name}" وجميع عملياته نهائياً؟`)) return;
            try {
                await deleteSectionRequest(currentSection.id);
                detailsView.classList.add('hidden');
                sectionsView.classList.remove('hidden');
                currentSection = null;
                await loadAndRenderSections();
            } catch (err) {
                alert('فشل حذف القسم: ' + err.message);
            }
        });

        // مسح جميع عمليات القسم
        clearSectionRecordsBtn.addEventListener('click', async () => {
            if (!currentSection) return;
            if (!confirm(`مسح جميع عمليات "${currentSection.name}"؟`)) return;
            try {
                await clearSectionRecordsRequest(currentSection.id);
                await refreshSectionDetails();
                await loadAndRenderSections();
            } catch (err) {
                alert('فشل مسح العمليات: ' + err.message);
            }
        });

        // إضافة عملية جديدة
        addRecordBtn.addEventListener('click', async () => {
            if (!currentSection) return;
            const num = parseFloat(recordNumInput.value);
            if (isNaN(num)) {
                alert('الرجاء إدخال رقم صحيح');
                return;
            }
            const op = recordOpSelect.value;
            const label = recordLabelInput.value.trim();
            const note = recordNoteInput.value.trim();

            try {
                await addRecordRequest({
                    section_id: currentSection.id,
                    op, num, label, note
                });
                // تنظيف الحقول
                recordNumInput.value = '';
                recordLabelInput.value = '';
                recordNoteInput.value = '';
                await refreshSectionDetails();
                await loadAndRenderSections();
            } catch (err) {
                alert('فشل إضافة العملية: ' + err.message);
            }
        });

        // مودال إضافة قسم
        showAddSectionModalBtn.addEventListener('click', () => {
            modalTitle.textContent = 'قسم جديد';
            sectionNameInput.value = '';
            sectionUnitInput.value = '';
            sectionColorInput.value = '#4f46e5';
            sectionIconInput.value = '📁';
            modalOverlay.classList.add('active');
        });

        cancelModalBtn.addEventListener('click', () => {
            modalOverlay.classList.remove('active');
        });

        saveSectionBtn.addEventListener('click', async () => {
            const name = sectionNameInput.value.trim();
            if (!name) {
                alert('اسم القسم مطلوب');
                return;
            }
            const data = {
                name,
                unit: sectionUnitInput.value.trim(),
                color: sectionColorInput.value,
                icon: sectionIconInput.value.trim() || '📁'
            };
            try {
                await createSection(data);
                modalOverlay.classList.remove('active');
                await loadAndRenderSections();
            } catch (err) {
                alert('فشل إنشاء القسم: ' + err.message);
            }
        });

        // إغلاق المودال بالنقر خارج المحتوى
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.classList.remove('active');
        });

        // اختصارات لوحة المفاتيح (ESC لإغلاق المودال)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
                modalOverlay.classList.remove('active');
            }
        });
    }

    // ---------- التحديث التلقائي (مع احترام التركيز) ----------
    function startAutoRefresh() {
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        autoRefreshTimer = setInterval(async () => {
            if (!document.hidden) {
                if (currentSection) {
                    await refreshSectionDetails();
                }
                await loadAndRenderSections();
            }
        }, 10000); // كل 10 ثواني
    }

    // إيقاف التحديث عند مغادرة الصفحة لتوفير الموارد
    window.addEventListener('beforeunload', () => {
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    });

    // ---------- بدء التطبيق ----------
    async function init() {
        if (!initUserId()) return;
        bindEvents();
        await loadAndRenderSections();
        startAutoRefresh();
    }

    init();
})();