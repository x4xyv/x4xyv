// ===================== التكامل مع تليجرام Web App =====================
let tg = null;
let tgUser = null;
let isTelegramWebApp = false;

try {
    if (window.Telegram && window.Telegram.WebApp) {
        tg = window.Telegram.WebApp;
        tg.expand();
        tgUser = tg.initDataUnsafe?.user;
        if (tgUser && tgUser.id) {
            isTelegramWebApp = true;
            console.log('Telegram user:', tgUser);
        }
    }
} catch(e) { console.warn(e); }

// ===================== إعدادات API =====================
const API_BASE = "https://potatox4xyv.onrender.com";   // ⚠️ استبدل برابط API الخاص بك

// ===================== ثوابت =====================
const COLORS = ['#f5c842','#f5904a','#f76e6e','#3ddba8','#5b9cf6','#b07ef8','#f472b6','#3dd6f5','#a3e635','#fb923c'];
const ICONS  = ['🛒','💼','🏠','✈️','🍔','💊','📚','⛽','🎮','💡','🎁','💰','🏋️','🧾','🔧','📱','🎓','🌿','🎵','🚗'];
const STORAGE_THEME = 'hassab_theme_v5';

// ===================== الحالة =====================
let state = {
  theme: 'dark', sidebarOpen: true, sections: [], activeId: null,
  selectedOp: '+', pendingDelete: null, editingSection: null,
  editingRecord: null, searchQuery: '', sectionSearchQuery: '',
  recordSearchOpen: false, authGateMode: 'choose', authMenuOpen: false,
  sectionsSortBy: 'name-asc', recordsSortBy: 'date-desc',
  focusMode: false, _modalColor: null, _modalIcon: null, currentUser: null,
};

let currentTelegramUserId = null;

// ===================== دوال مساعدة =====================
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escRegex(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function formatNumber(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  const rounded = Math.round(num * 1e6) / 1e6;
  const s = String(rounded);
  const [intPart, fracPart] = s.split('.');
  const sign = intPart.startsWith('-') ? '-' : '';
  const digits = sign ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fracPart ? `${sign}${grouped}.${fracPart.replace(/0+$/,'')}`.replace(/\.$/, '') : `${sign}${grouped}`;
}
function fmtDate(ts) {
  const d = new Date(ts || Date.now());
  const h24 = d.getHours(), h12 = h24 % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2,'0');
  const ampm = h24 < 12 ? 'صباحًا' : 'مساءً';
  return `${h12}:${mm} ${ampm} — ${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}
function opClass(op) { return {'+':'op-plus-bg','-':'op-minus-bg','×':'op-times-bg','÷':'op-divide-bg'}[op]||'op-plus-bg'; }
function opPillClass(op) { return {'+':'plus','-':'minus','×':'times','÷':'divide'}[op]||'plus'; }
function highlight(text, query) {
  if (!query || !text) return escHtml(text || '');
  return escHtml(text).replace(new RegExp(`(${escRegex(query)})`,'gi'),'<mark class="highlight">$1</mark>');
}
function round6(v) { return Math.round(v * 1e6) / 1e6; }
function calcRunning(records, upto) {
  if (!records.length || upto < 0) return 0;
  let total = Number(records[0].num) || 0;
  for (let i = 1; i <= upto; i++) {
    const r = records[i], num = Number(r.num) || 0;
    if (r.op==='+') total += num;
    else if (r.op==='-') total -= num;
    else if (r.op==='×') total *= num;
    else if (r.op==='÷') total = num !== 0 ? total / num : total;
  }
  return round6(total);
}
function calcTotal(records) { return records.length ? calcRunning(records, records.length - 1) : 0; }
function buildEquation(records, unit) {
  if (!records.length) return '—';
  const u = unit ? ` ${unit}` : '';
  return records.map((r,i) => {
    const lbl = r.label ? `(${r.label})` : '';
    return i===0 ? `${formatNumber(r.num)}${u} ${lbl}`.trim() : `${r.op} ${formatNumber(r.num)}${u} ${lbl}`.trim();
  }).join(' ');
}
function sectionById(id) { return state.sections.find(s => s.id === id); }
function toast(msg, type='') {
  const el = $('toast'); if (!el) return;
  el.textContent = msg; el.className = `toast show ${type}`;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}
function setSyncStatus(syncing, text) {
  const dot = $('syncDot'), txt = $('syncText');
  if (dot) dot.classList.toggle('syncing', syncing);
  if (txt) txt.textContent = text || (syncing ? 'جارِ المزامنة...' : 'متزامن');
}
function shake(el) {
  if (!el) return;
  el.style.borderColor = 'var(--red)'; el.style.boxShadow = '0 0 0 3px var(--red-dim)';
  setTimeout(() => { el.style.borderColor=''; el.style.boxShadow=''; }, 700);
}

// ===================== دوال API =====================
async function apiRequest(endpoint, options = {}) {
    if (!currentTelegramUserId) throw new Error('No user');
    const headers = {
        'Content-Type': 'application/json',
        'X-Telegram-User-Id': String(currentTelegramUserId),
        ...options.headers
    };
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(error);
    }
    return response.json();
}

async function loadSections() {
    try {
        const sections = await apiRequest('/api/sections');
        state.sections = sections;
        if (state.sections.length && !state.activeId) state.activeId = state.sections[0].id;
        renderSidebar();
        renderMain();
    } catch(e) {
        console.error(e);
        toast('فشل تحميل الأقسام', 'error');
    }
}

async function createSection(name, unit, color, icon) {
    try {
        await apiRequest('/api/sections', {
            method: 'POST',
            body: JSON.stringify({ name, unit, color, icon })
        });
        await loadSections();
        return true;
    } catch(e) {
        toast('فشل إنشاء القسم', 'error');
        return false;
    }
}

async function updateSection(sectionId, name, unit, color, icon) {
    try {
        await apiRequest(`/api/sections/${sectionId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, unit, color, icon })
        });
        await loadSections();
        return true;
    } catch(e) {
        toast('فشل تحديث القسم', 'error');
        return false;
    }
}

async function deleteSection(sectionId) {
    try {
        await apiRequest(`/api/sections/${sectionId}`, { method: 'DELETE' });
        if (state.activeId === sectionId) state.activeId = null;
        await loadSections();
        return true;
    } catch(e) {
        toast('فشل حذف القسم', 'error');
        return false;
    }
}

async function togglePinSection(sectionId) {
    try {
        await apiRequest(`/api/sections/${sectionId}/pin`, { method: 'PATCH' });
        await loadSections();
        return true;
    } catch(e) {
        toast('فشل تحديث التثبيت', 'error');
        return false;
    }
}

async function getRecords(sectionId) {
    try {
        return await apiRequest(`/api/records?section_id=${sectionId}`);
    } catch(e) {
        console.error(e);
        return [];
    }
}

async function addRecord(sectionId, op, num, label, note) {
    try {
        await apiRequest('/api/records', {
            method: 'POST',
            body: JSON.stringify({ section_id: sectionId, op, num, label, note })
        });
        return true;
    } catch(e) {
        toast('فشل إضافة العملية', 'error');
        return false;
    }
}

async function updateRecord(recordId, op, num, label, note) {
    try {
        await apiRequest(`/api/records/${recordId}`, {
            method: 'PUT',
            body: JSON.stringify({ op, num, label, note })
        });
        return true;
    } catch(e) {
        toast('فشل تحديث العملية', 'error');
        return false;
    }
}

async function deleteRecord(recordId) {
    try {
        await apiRequest(`/api/records/${recordId}`, { method: 'DELETE' });
        return true;
    } catch(e) {
        toast('فشل حذف العملية', 'error');
        return false;
    }
}

async function togglePinRecord(recordId) {
    try {
        await apiRequest(`/api/records/${recordId}/pin`, { method: 'PATCH' });
        return true;
    } catch(e) {
        toast('فشل تحديث التثبيت', 'error');
        return false;
    }
}

async function clearAllRecords(sectionId) {
    try {
        await apiRequest(`/api/sections/${sectionId}/clear`, { method: 'DELETE' });
        return true;
    } catch(e) {
        toast('فشل مسح العمليات', 'error');
        return false;
    }
}

// ===================== كود القسم (تشفير/فك) =====================
function encodeSectionCode(sec, records) {
    try {
        const payload = {
            name: sec.name, unit: sec.unit||'', color: sec.color, icon: sec.icon,
            records: records.map(r => ({
                op:r.op, num:r.num, label:r.label||'', note:r.note||'', ts:r.ts, pinned:r.pinned||false
            }))
        };
        return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    } catch { return null; }
}
function decodeSectionCode(code) {
    try {
        const json = decodeURIComponent(escape(atob(code.trim())));
        const p = JSON.parse(json);
        if (!p.name || !Array.isArray(p.records)) return null;
        return p;
    } catch { return null; }
}
async function importSectionFromCode(code) {
    const payload = decodeSectionCode(code);
    if (!payload) { toast('الكود غير صحيح أو تالف ❌', 'error'); return false; }
    // إنشاء القسم أولاً
    const success = await createSection(payload.name, payload.unit, payload.color, payload.icon);
    if (!success) return false;
    // الحصول على القسم الجديد (آخر قسم تم إنشاؤه)
    await loadSections();
    const newSection = state.sections.find(s => s.name === payload.name);
    if (!newSection) return false;
    // إضافة العمليات
    for (const rec of payload.records) {
        await addRecord(newSection.id, rec.op, rec.num, rec.label, rec.note);
    }
    toast(`✅ تم استيراد قسم "${payload.name}"`);
    return true;
}

// ===================== عمليات =====================
async function addRecordUI() {
    const sec = sectionById(state.activeId); if (!sec) return;
    const num = Number(String($('recNum').value||'').replace(/,/g,'').trim());
    if (!Number.isFinite(num)||num===0) return shake($('recNum'));
    const label = $('recLabel').value.trim(), note = $('recNote').value.trim();
    const success = await addRecord(sec.id, state.selectedOp, num, label, note);
    if (success) {
        $('recNum').value=''; $('recLabel').value=''; $('recNote').value=''; $('recNum').focus();
        await loadSections();
        renderMain();
        toast(`${state.selectedOp} ${formatNumber(num)}${label?' ('+label+')':''} ✓`);
    }
}

async function deleteRecordUI(secId, recId) {
    const success = await deleteRecord(recId);
    if (success) {
        await loadSections();
        renderMain();
        toast('🗑 تم حذف العملية');
    }
}

async function togglePinUI(secId, recId) {
    const success = await togglePinRecord(recId);
    if (success) {
        await loadSections();
        renderMain();
        const sec = sectionById(secId);
        const rec = sec?.records.find(r => r.id === recId);
        toast(rec?.pinned ? '📌 تم تثبيت العملية' : '📌 تم إلغاء التثبيت');
    }
}

async function togglePinSectionUI(secId) {
    const success = await togglePinSection(secId);
    if (success) {
        await loadSections();
        renderSidebar();
        const sec = sectionById(secId);
        toast(sec?.pinned ? '📌 تم تثبيت القسم' : '📌 تم إلغاء تثبيت القسم');
    }
}

async function clearAllRecordsUI(secId) {
    const success = await clearAllRecords(secId);
    if (success) {
        await loadSections();
        renderMain();
        toast('🗑 تم مسح جميع العمليات');
    }
}

async function saveEditModalUI() {
    if (!state.editingRecord) return;
    const sec = sectionById(state.editingRecord.sectionId);
    const rec = sec?.records.find(r => r.id === state.editingRecord.recordId);
    if (!rec) return;
    const num = Number(String($('editNum').value||'').replace(/,/g,'').trim());
    if (!Number.isFinite(num)||num===0) return shake($('editNum'));
    const op = $('editOp').value;
    const label = $('editLabel').value.trim();
    const note = $('editNote').value.trim();
    const success = await updateRecord(rec.id, op, num, label, note);
    if (success) {
        $('editModal').classList.add('modal-hidden');
        await loadSections();
        renderMain();
        toast('✅ تم حفظ التعديل');
    }
}

// ===================== فرز =====================
function sortRecords(records,sortBy) {
    if (!records.length) return records;
    const pinned=records.filter(r=>r.pinned), unpinned=records.filter(r=>!r.pinned);
    const fn=(a,b)=>{
        if(sortBy==='date-asc')   return a.ts-b.ts;
        if(sortBy==='date-desc')  return b.ts-a.ts;
        if(sortBy==='value-asc')  return a.num-b.num;
        if(sortBy==='value-desc') return b.num-a.num;
        return 0;
    };
    return [...pinned,...unpinned.sort(fn)];
}
function setRecordsSort(sortBy) { state.recordsSortBy=sortBy; renderMain(); }
function sortSections(sections,sortBy) {
    const s=[...sections];
    if(sortBy==='name-asc')   s.sort((a,b)=>a.name.localeCompare(b.name));
    else if(sortBy==='name-desc') s.sort((a,b)=>b.name.localeCompare(a.name));
    else if(sortBy==='count-desc') s.sort((a,b)=>(b.records?.length||0)-(a.records?.length||0));
    return s;
}
function toggleFocusMode() { state.focusMode=!state.focusMode; renderMain(); }

// ===================== أقسام =====================
function openSectionModal(sectionId) {
    closeRecordSearch(); state.editingSection=sectionId||null;
    const sec=sectionId?sectionById(sectionId):null;
    $('sectionModalTitle').textContent=sec?'تعديل القسم':'قسم جديد';
    $('sectionNameInput').value=sec?sec.name:'';
    $('sectionUnitInput').value=sec?(sec.unit||''):'';
    state._modalColor=sec?sec.color:COLORS[Math.floor(Math.random()*COLORS.length)];
    state._modalIcon=sec?sec.icon:ICONS[0];
    renderColorGrid(); renderIconGrid();
    $('sectionModal').classList.remove('modal-hidden');
    setTimeout(()=>$('sectionNameInput')?.focus(),100);
}
function renderColorGrid() {
    const grid=$('colorGrid'); if (!grid) return; grid.innerHTML='';
    COLORS.forEach(c=>{
        const d=document.createElement('div');
        d.className='color-dot'+(c===state._modalColor?' selected':''); d.style.background=c;
        d.onclick=()=>{ state._modalColor=c; grid.querySelectorAll('.color-dot').forEach(x=>x.classList.remove('selected')); d.classList.add('selected'); };
        grid.appendChild(d);
    });
}
function renderIconGrid() {
    const grid=$('iconGrid'); if (!grid) return; grid.innerHTML='';
    ICONS.forEach(ic=>{
        const d=document.createElement('div');
        d.className='icon-option'+(ic===state._modalIcon?' selected':''); d.textContent=ic;
        d.onclick=()=>{ state._modalIcon=ic; grid.querySelectorAll('.icon-option').forEach(x=>x.classList.remove('selected')); d.classList.add('selected'); };
        grid.appendChild(d);
    });
}
async function saveSectionModal() {
    const name=$('sectionNameInput').value.trim(); if (!name) return $('sectionNameInput').focus();
    const unit=$('sectionUnitInput').value.trim();
    if (state.editingSection) {
        const sec=sectionById(state.editingSection);
        if (sec) {
            const success = await updateSection(sec.id, name, unit, state._modalColor, state._modalIcon);
            if (success) toast('✅ تم تعديل القسم');
        }
    } else {
        const success = await createSection(name, unit, state._modalColor, state._modalIcon);
        if (success) toast('✅ تم إنشاء القسم');
    }
    $('sectionModal').classList.add('modal-hidden');
    await loadSections();
    renderMain();
}

// ===================== تصدير =====================
function exportTxt(sec) {
    let txt=`حسّاب — ${sec.name}\n${'═'.repeat(28)}\n`;
    sec.records.forEach((r,i)=>{ txt+=`${i+1}. ${i===0?'بداية':r.op} ${formatNumber(r.num)}${sec.unit?' '+sec.unit:''}${r.label?' ('+r.label+')':''}${r.note?' ['+r.note+']':''}\n`; });
    txt+=`\nالإجمالي: ${formatNumber(calcTotal(sec.records))}${sec.unit?' '+sec.unit:''}`;
    downloadFile(`${sec.name}.txt`,txt,'text/plain');
}
function exportCsv(sec) {
    let csv='الترتيب,العملية,الرقم,التسمية,الملاحظة,المجموع التراكمي,الوقت\n';
    sec.records.forEach((r,i)=>{ csv+=`${i+1},${i===0?'بداية':r.op},${r.num},"${(r.label||'').replace(/"/g,'""')}","${(r.note||'').replace(/"/g,'""')}",${calcRunning(sec.records,i)},"${fmtDate(r.ts)}"\n`; });
    downloadFile(`${sec.name}.csv`,'\uFEFF'+csv,'text/csv');
}
function copyToClipboard(sec) {
    const text=`${sec.icon} ${sec.name}\n${'─'.repeat(24)}\n`+
        sec.records.map((r,i)=>`${i===0?' ':r.op} ${formatNumber(r.num)}${sec.unit?' '+sec.unit:''}${r.label?' ('+r.label+')':''}`).join('\n')+
        `\n${'─'.repeat(24)}\n= ${formatNumber(calcTotal(sec.records))}${sec.unit?' '+sec.unit:''}`;
    navigator.clipboard.writeText(text).then(()=>toast('📋 تم النسخ للحافظة')).catch(()=>toast('فشل النسخ','error'));
}
function printSection(sec) {
    const unit=sec.unit||'';
    const rows=sec.records.map((r,i)=>`<tr><td>${i+1}</td><td>${i===0?'—':r.op}</td><td><b>${formatNumber(r.num)}${unit?' '+unit:''}</b></td><td>${escHtml(r.label||'')}</td><td>${escHtml(r.note||'')}</td><td>${formatNumber(calcRunning(sec.records,i))}${unit?' '+unit:''}</td></tr>`).join('');
    const w=window.open('','_blank'); if (!w) return toast('تعذر فتح نافذة الطباعة','error');
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>${escHtml(sec.name)}</title><style>body{font-family:sans-serif;padding:32px;direction:rtl}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:right}</style></head><body><h1>${escHtml(sec.name)}</h1><p>الوحدة: ${escHtml(unit||'—')}</p><table><thead><tr><th>#</th><th>العملية</th><th>الرقم</th><th>التسمية</th><th>ملاحظة</th><th>تراكمي</th></tr></thead><tbody>${rows}</tbody></table><p><b>الإجمالي: ${formatNumber(calcTotal(sec.records))}${unit?' '+unit:''}</b></p></body></html>`);
    w.document.close(); w.print();
}
function downloadFile(filename,content,type) {
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([content],{type})); a.download=filename; a.click();
}

// ===================== واجهة المستخدم =====================
function closeAuthMenu() { state.authMenuOpen=false; $('authDropdown')?.classList.add('modal-hidden'); }
function openLogoutConfirm() { closeAuthMenu(); $('logoutConfirmModal')?.classList.remove('modal-hidden'); }
function closeLogoutConfirm() { $('logoutConfirmModal')?.classList.add('modal-hidden'); }
function openDeleteAccountConfirm() { $('deleteAccountConfirmModal')?.classList.remove('modal-hidden'); }

function renderAuthArea() {
    const area=$('authArea'); if (!area) return;
    if (isTelegramWebApp && tgUser) {
        const name = tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : '');
        area.innerHTML = `
            <div class="auth-user-btn" style="cursor:default">
                <div class="auth-avatar-placeholder">${tgUser.first_name?.charAt(0) || '👤'}</div>
                <span class="auth-name">${escHtml(name)}</span>
                <span style="font-size:10px;color:var(--text3)">(تليجرام)</span>
            </div>
        `;
    } else {
        area.innerHTML = `<button class="auth-open-btn" id="openAuthMsg">⚠️ افتح من بوت تليجرام</button>`;
        $('#openAuthMsg')?.addEventListener('click', () => toast('الرجاء فتح هذا الموقع من زر داخل بوت حسّاب على تليجرام', 'error'));
    }
}

function closeAuthGate() { $('authGate')?.classList.add('modal-hidden'); }
function openAuthGate() {}

function renderSidebar() {
    const list=$('sectionsList'); if (!list) return;
    const q=state.sectionSearchQuery.trim().toLowerCase();
    let secs=q?state.sections.filter(s=>(s.name||'').toLowerCase().includes(q)):state.sections;
    const pinned=secs.filter(s=>s.pinned);
    const unpinned=sortSections(secs.filter(s=>!s.pinned),state.sectionsSortBy);
    secs=[...pinned,...unpinned];
    list.innerHTML='';
    if (!secs.length) {
        list.innerHTML=`<div style="padding:24px 16px;text-align:center;color:var(--text3);font-size:13px;">لا توجد أقسام بعد<br>اضغط "جديد" للبدء</div>`;
    } else {
        secs.forEach(s=>{
            const total=calcTotal(s.records||[]);
            const div=document.createElement('div');
            div.className='section-item'+(s.id===state.activeId?' active':'')+(s.pinned?' sec-pinned':'');
            div.style.setProperty('--item-color',s.color);
            div.innerHTML=`
                ${s.pinned?'<span class="sec-pin-indicator">📌</span>':''}
                <div class="sec-icon" style="background:${s.color}22">${s.icon}</div>
                <div class="sec-body">
                    <div class="sec-name">${escHtml(s.name)}</div>
                    <div class="sec-meta">${formatNumber(total)}${s.unit?' '+escHtml(s.unit):''} · ${formatNumber((s.records||[]).length)} عملية</div>
                </div>`;
            let pressTimer;
            div.addEventListener('touchstart',e=>{ pressTimer=setTimeout(()=>openSectionContextMenu(e,s.id),500); },{passive:true});
            div.addEventListener('touchend',()=>clearTimeout(pressTimer));
            div.addEventListener('touchmove',()=>clearTimeout(pressTimer));
            div.addEventListener('contextmenu',e=>openSectionContextMenu(e,s.id));
            div.onclick=()=>{ state.activeId=s.id; closeRecordSearch(); renderSidebar(); renderMain(); };
            list.appendChild(div);
        });
    }
    const totalOps=state.sections.reduce((a,s)=>a+(s.records||[]).length,0);
    $('globalStats').innerHTML=`
        <div class="g-stat"><span>الأقسام</span><strong>${formatNumber(state.sections.length)}</strong></div>
        <div class="g-stat"><span>إجمالي العمليات</span><strong>${formatNumber(totalOps)}</strong></div>`;
    $('sidebar')?.classList.toggle('collapsed',!state.sidebarOpen);
}

function buildOpPills() {
    const pills=$('opPills'); if (!pills) return; pills.innerHTML='';
    ['+','-','×','÷'].forEach(op=>{
        const b=document.createElement('button');
        b.className=`op-pill ${opPillClass(op)}${op===state.selectedOp?' active':''}`;
        b.textContent=op;
        b.onclick=()=>{ state.selectedOp=op; pills.querySelectorAll('.op-pill').forEach(p=>p.classList.remove('active')); b.classList.add('active'); };
        pills.appendChild(b);
    });
}

function renderTotalCard(sec) {
    const slot=$('totalCardSlot'); if (!slot) return;
    const total=calcTotal(sec.records||[]), unit=sec.unit||'', eq=buildEquation(sec.records||[],unit);
    let addSum=0,subSum=0,mulCnt=0,divCnt=0;
    (sec.records||[]).forEach((r,i)=>{
        if(i===0)return;
        if(r.op==='+')addSum+=Number(r.num)||0;
        if(r.op==='-')subSum+=Number(r.num)||0;
        if(r.op==='×')mulCnt++;
        if(r.op==='÷')divCnt++;
    });
    slot.innerHTML=`<div class="total-card" style="--s-color:${sec.color}">
        <div>
            <div class="total-label">المجموع الكلي</div>
            <div class="total-number">${formatNumber(total)}${unit?` <span class="total-unit">${escHtml(unit)}</span>`:''}</div>
            <div class="total-equation">${escHtml(eq)}</div>
        </div></div>`;
    const sg=$('statsGrid'); if (!sg) return;
    sg.innerHTML=`
        <div class="stat-chip green"><span class="s-label">إضافات</span><span class="s-val">${formatNumber(addSum)}</span></div>
        <div class="stat-chip red"><span class="s-label">طرح</span><span class="s-val">${formatNumber(subSum)}</span></div>
        <div class="stat-chip blue"><span class="s-label">عمليات</span><span class="s-val">${formatNumber((sec.records||[]).length)}</span></div>
        ${(mulCnt+divCnt)?`<div class="stat-chip orange"><span class="s-label">ضرب/قسمة</span><span class="s-val">${formatNumber(mulCnt+divCnt)}</span></div>`:''}`;
}

function renderRecords(sec) {
    let records=sec.records||[];
    const q=state.searchQuery.trim().toLowerCase();
    if (state.recordSearchOpen&&q) {
        records=records.filter(r=>(r.label||'').toLowerCase().includes(q)||(r.note||'').toLowerCase().includes(q)||String(r.num).includes(q));
    }
    records=sortRecords(records,state.recordsSortBy);
    const list=$('recordsList'), count=$('recCount'); if (!list) return;
    if (count) count.textContent=state.recordSearchOpen&&state.searchQuery?`${records.length} نتيجة من ${sec.records.length}`:`${sec.records.length} عملية`;
    if (!records.length) {
        list.innerHTML=`<div class="empty-records"><div class="e-icon">${state.recordSearchOpen&&state.searchQuery?'🔍':'📋'}</div><p>${state.recordSearchOpen&&state.searchQuery?`لا توجد نتائج لـ "${escHtml(state.searchQuery)}"`:' لا توجد عمليات بعد<br>أضف أول عملية من الحقول أعلاه'}</p></div>`;
        return;
    }
    list.innerHTML=records.map(r=>{
        const trueIdx=sec.records.findIndex(x=>x.id===r.id);
        const running=calcRunning(sec.records,trueIdx);
        const isFirst=trueIdx===0;
        const lbl=state.recordSearchOpen&&state.searchQuery?highlight(r.label||'',state.searchQuery):escHtml(r.label||'');
        return `<div class="record-card${r.pinned?' pinned':''}" data-rec-id="${r.id}" data-rec-index="${trueIdx}">
            ${r.pinned?'<div class="pin-dot"></div>':''}
            <div class="rec-index">${formatNumber(trueIdx+1)}</div>
            <div class="rec-op-badge ${opClass(isFirst?'+':r.op)}">${isFirst?'①':r.op}</div>
            <div class="rec-body">
                <div class="rec-main-line"><span class="rec-num">${formatNumber(r.num)}</span>${r.label?`<span class="rec-label-text">${lbl}</span>`:''}</div>
                ${r.note?`<div class="rec-note">📝 ${escHtml(r.note)}</div>`:''}
                <div class="rec-running">= <span>${formatNumber(running)}${sec.unit?' '+escHtml(sec.unit):''}</span></div>
                <div class="rec-timestamp">${fmtDate(r.ts)}</div>
            </div></div>`;
    }).join('');
    document.querySelectorAll('.record-card').forEach(card=>{
        let timer;
        card.addEventListener('touchstart',e=>{ timer=setTimeout(()=>showContextMenu(e.touches[0],card.dataset.recId),500); },{passive:true});
        card.addEventListener('touchend',()=>clearTimeout(timer));
        card.addEventListener('touchmove',()=>clearTimeout(timer));
        card.addEventListener('mousedown',e=>{ if(e.button!==0)return; timer=setTimeout(()=>showContextMenu(e,card.dataset.recId),500); });
        card.addEventListener('mouseup',()=>clearTimeout(timer));
        card.addEventListener('mouseleave',()=>clearTimeout(timer));
        card.addEventListener('contextmenu',e=>{ e.preventDefault(); showContextMenu(e,card.dataset.recId); });
    });
}

function showContextMenu(event,recId) {
    const sec=sectionById(state.activeId); if (!sec) return;
    const menu=$('recordContextMenu'); if (!menu) return;
    const rec=sec.records.find(r=>r.id===recId);
    const pinBtn=$('ctxPin'); if(pinBtn) pinBtn.textContent=rec?.pinned?'📌 إلغاء التثبيت':'📌 تثبيت';
    const vw=window.innerWidth, vh=window.innerHeight;
    menu.style.top=`${Math.min(event.clientY,vh-150)}px`;
    menu.style.left=`${Math.min(event.clientX,vw-160)}px`;
    menu.classList.remove('modal-hidden');
    const close=()=>menu.classList.add('modal-hidden');
    const onOut=e=>{ if(!menu.contains(e.target)){close();document.removeEventListener('click',onOut);} };
    setTimeout(()=>document.addEventListener('click',onOut),10);
    $('ctxEdit').onclick=()=>{ openEditModal(sec.id,recId); close(); };
    $('ctxPin').onclick=()=>{ togglePinUI(sec.id,recId); close(); };
    $('ctxDelete').onclick=()=>{ deleteRecordUI(sec.id,recId); close(); };
}

function openEditModal(secId,recId) {
    const sec=sectionById(secId), rec=sec?.records.find(r=>r.id===recId); if (!rec) return;
    state.editingRecord={sectionId:secId, recordId:recId};
    $('editOp').value=rec.op; $('editNum').value=rec.num;
    $('editLabel').value=rec.label||''; $('editNote').value=rec.note||'';
    $('editModal')?.classList.remove('modal-hidden');
    setTimeout(()=>$('editNum')?.focus(),100);
}

function initDragAndDrop(sectionId) {
    if ('ontouchstart' in window||navigator.maxTouchPoints>0) return;
    const cards=document.querySelectorAll('.record-card'); let dragSrc=null;
    cards.forEach(card=>{
        card.setAttribute('draggable','true');
        card.addEventListener('dragstart',e=>{ dragSrc=card; e.dataTransfer.effectAllowed='move'; card.classList.add('dragging'); });
        card.addEventListener('dragend',()=>{ card.classList.remove('dragging'); dragSrc=null; });
        card.addEventListener('dragover',e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; });
        card.addEventListener('dragenter',e=>{ if(dragSrc!==card) card.classList.add('drag-over'); });
        card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
        card.addEventListener('drop',async e=>{
            e.preventDefault(); card.classList.remove('drag-over');
            if (!dragSrc||dragSrc===card) return;
            const sec=sectionById(sectionId); if (!sec) return;
            const si=sec.records.findIndex(r=>r.id===dragSrc.dataset.recId);
            const di=sec.records.findIndex(r=>r.id===card.dataset.recId);
            if (si===-1||di===-1) return;
            const [moved]=sec.records.splice(si,1); sec.records.splice(di,0,moved);
            // إعادة ترتيب العمليات على الخادم (حذف وإعادة إضافة بالترتيب)
            // للتبسيط: نعيد حفظ الترتيب عبر تحديث جميع العمليات
            for (let i = 0; i < sec.records.length; i++) {
                await updateRecord(sec.records[i].id, sec.records[i].op, sec.records[i].num, sec.records[i].label, sec.records[i].note);
            }
            await loadSections();
            renderMain();
            toast('تم إعادة ترتيب العمليات');
        });
    });
}

async function renderMain() {
    const main=$('mainContent'); if (!main) return;
    const sec=sectionById(state.activeId);
    if (!sec) {
        closeRecordSearch();
        main.innerHTML=`<div class="welcome">
            <div class="welcome-icon">🧮</div>
            <h2>مرحباً بك في حسّاب</h2>
            <p>دفتر الحساب الذكي الذي يحفظ أسماء كل بند<br>وتاريخ كل عملية — منظم ودقيق.</p>
            <div class="welcome-features">
                <div class="feat-chip">📋 أقسام متعددة</div>
                <div class="feat-chip">🏷 تسميات</div>
                <div class="feat-chip">🔍 بحث</div>
                <div class="feat-chip">🌗 مظهران</div>
            </div>
            <button class="btn-create-first" id="wcBtn">+ أنشئ قسمك الأول</button>
        </div>`;
        $('wcBtn').onclick=()=>openSectionModal(null); return;
    }
    main.innerHTML=`<div class="section-view ${state.focusMode?'focus-mode':''}" style="--s-color:${sec.color}">
        <div class="top-panel">
            <div class="section-title-row">
                <div class="section-title-icon" style="background:${sec.color}22">${sec.icon}</div>
                <h2>${escHtml(sec.name)}</h2>
                ${sec.unit?`<span class="section-unit-badge">${escHtml(sec.unit)}</span>`:''}
                <button class="exit-section-btn" id="exitSectionBtn" title="الخروج من القسم">✕</button>
            </div>
            <div id="totalCardSlot"></div>
            <div class="stats-grid" id="statsGrid" style="margin-top:10px"></div>
        </div>
        <div class="input-area">
            <div class="input-stack">
                <div class="input-row input-row-top">
                    <div class="op-pills" id="opPills"></div>
                    <input type="number" class="inp inp-num" id="recNum" placeholder="0" step="any"/>
                </div>
                <div class="input-row input-row-bottom">
                    <input type="text" class="inp inp-label" id="recLabel" placeholder="التسمية (مثال: خبز، وقود...)" maxlength="40"/>
                    <input type="text" class="inp inp-note"  id="recNote"  placeholder="ملاحظة (اختياري)" maxlength="80"/>
                </div>
                <div class="input-row input-row-add">
                    <button class="btn-add" id="addRecBtn">إضافة ＋</button>
                </div>
            </div>
        </div>
        <div class="records-area">
            <div class="records-toolbar">
                <span class="rec-count" id="recCount"></span>
                <div class="toolbar-actions">
                    <button class="btn-ghost-sm" id="sortBtn">فرز ▼</button>
                    <button class="btn-ghost-sm danger" id="clearAllBtn">مسح الكل</button>
                </div>
            </div>
            <div id="recordsList"></div>
        </div>
    </div>`;
    buildOpPills();
    $('addRecBtn').onclick=addRecordUI;
    $('clearAllBtn').onclick=()=>confirmClearAll(sec.id);
    $('exitSectionBtn').onclick=()=>{ state.activeId=null; renderMain(); renderSidebar(); };
    $('recNum').addEventListener('keydown',e=>{ if(e.key==='Enter') $('recLabel').focus(); });
    $('recLabel').addEventListener('keydown',e=>{ if(e.key==='Enter') $('recNote').focus(); });
    $('recNote').addEventListener('keydown',e=>{ if(e.key==='Enter') addRecordUI(); });
    const sortBtn=$('sortBtn');
    if (sortBtn) {
        sortBtn.onclick=e=>{
            e.stopPropagation();
            const menu=document.createElement('div');
            menu.className='context-menu'; menu.style.position='fixed';
            menu.style.top=`${e.clientY}px`; menu.style.left=`${e.clientX}px`;
            menu.innerHTML=`
                <div class="context-menu-item ${state.recordsSortBy==='date-desc'?'active':''}" data-sort="date-desc">📅 الأحدث أولاً</div>
                <div class="context-menu-item ${state.recordsSortBy==='date-asc'?'active':''}" data-sort="date-asc">📅 الأقدم أولاً</div>
                <div class="context-menu-item ${state.recordsSortBy==='value-desc'?'active':''}" data-sort="value-desc">🔽 الأكبر قيمة</div>
                <div class="context-menu-item ${state.recordsSortBy==='value-asc'?'active':''}" data-sort="value-asc">🔼 الأصغر قيمة</div>`;
            document.body.appendChild(menu);
            const close=()=>{ menu.remove(); document.removeEventListener('click',close); };
            setTimeout(()=>document.addEventListener('click',close),10);
            menu.querySelectorAll('[data-sort]').forEach(el=>el.addEventListener('click',ev=>{ ev.stopPropagation(); setRecordsSort(el.dataset.sort); close(); }));
        };
    }
    renderTotalCard(sec); renderRecords(sec); initDragAndDrop(sec.id);
}

function closeRecordSearch() {
    state.recordSearchOpen=false; state.searchQuery='';
    $('searchBar')?.classList.remove('open');
    const inp=$('searchInput'); if(inp) inp.value='';
}
function openRecordSearch() {
    if (!sectionById(state.activeId)) return toast('اختر قسماً أولاً','error');
    state.recordSearchOpen=true; $('searchBar')?.classList.add('open'); $('searchInput')?.focus();
}

function confirmClearAll(secId) {
    const sec=sectionById(secId); if (!sec) return;
    state.pendingDelete={type:'all',sectionId:secId};
    $('confirmTitle').textContent='مسح جميع العمليات';
    $('confirmText').textContent=`هل تريد مسح جميع العمليات في "${sec.name}"؟ (${sec.records.length} عملية)`;
    $('confirmModal')?.classList.remove('modal-hidden');
}

async function applyDelete() {
    const p=state.pendingDelete; if (!p) return;
    if (p.type==='section') {
        await deleteSection(p.id);
    } else if (p.type==='all') {
        await clearAllRecordsUI(p.sectionId);
    }
    state.pendingDelete=null;
    $('confirmModal')?.classList.add('modal-hidden');
    await loadSections();
    renderMain();
}

function confirmDeleteSection(id) {
    const sec=sectionById(id); if (!sec) return;
    state.pendingDelete={type:'section',id};
    $('confirmTitle').textContent='حذف القسم';
    $('confirmText').textContent=`هل تريد حذف قسم "${sec.name}" وجميع عملياته (${sec.records.length} عملية)؟`;
    $('confirmModal')?.classList.remove('modal-hidden');
}

// ===================== الثيم =====================
function applyTheme() {
    localStorage.setItem(STORAGE_THEME, state.theme);
    document.body.classList.toggle('light', state.theme==='light');
    const icon=$('themeIcon'); if (!icon) return;
    if (state.theme==='light') {
        icon.innerHTML=`<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    } else {
        icon.innerHTML=`<circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
    }
}

// ===================== قائمة سياق الأقسام =====================
function openSectionContextMenu(e, secId) {
    e.preventDefault(); e.stopPropagation();
    const sec = sectionById(secId); if (!sec) return;
    const menu = $('sectionContextMenu'); if (!menu) return;
    const pinBtn = $('sctxPin');
    if (pinBtn) pinBtn.innerHTML = sec.pinned ? '📌 إلغاء التثبيت' : '📌 تثبيت';
    menu.dataset.secId = secId;
    const vw = window.innerWidth, vh = window.innerHeight;
    const x = (e.clientX ?? (e.touches?.[0]?.clientX ?? vw/2));
    const y = (e.clientY ?? (e.touches?.[0]?.clientY ?? vh/2));
    menu.style.left = `${Math.min(x, vw-180)}px`;
    menu.style.top  = `${Math.min(y, vh-200)}px`;
    menu.classList.remove('modal-hidden');
    const close = () => { menu.classList.add('modal-hidden'); document.removeEventListener('click', onOut); };
    const onOut = ev => { if (!menu.contains(ev.target)) close(); };
    setTimeout(() => document.addEventListener('click', onOut), 10);
}

// ===================== مستمعات الأحداث =====================
function initEventListeners() {
    $('themeToggleBtn')?.addEventListener('click',()=>{
        state.theme=state.theme==='dark'?'light':'dark'; applyTheme();
        toast(state.theme==='light'?'☀️ المظهر الفاتح':'🌙 المظهر الداكن');
    });
    $('sidebarToggle')?.addEventListener('click',()=>{
        state.sidebarOpen=!state.sidebarOpen; $('sidebar')?.classList.toggle('collapsed',!state.sidebarOpen);
    });
    $('searchToggleBtn')?.addEventListener('click',()=>{
        if (!sectionById(state.activeId)) return toast('اختر قسماً أولاً','error');
        state.recordSearchOpen?closeRecordSearch():openRecordSearch(); renderMain();
    });
    $('searchInput')?.addEventListener('input',e=>{ state.searchQuery=e.target.value.trim().toLowerCase(); renderMain(); });
    $('clearSearch')?.addEventListener('click',()=>{ closeRecordSearch(); renderMain(); });
    $('sectionSearchInput')?.addEventListener('input',e=>{ state.sectionSearchQuery=e.target.value.trim().toLowerCase(); renderSidebar(); });
    $('newSectionBtn')?.addEventListener('click',()=>openSectionModal(null));
    $('importSectionBtn')?.addEventListener('click',()=>{
        $('importCodeInput').value=''; $('importSectionModal')?.classList.remove('modal-hidden');
        setTimeout(()=>$('importCodeInput')?.focus(),100);
    });
    $('confirmImportBtn')?.addEventListener('click',async()=>{
        const code=$('importCodeInput')?.value.trim();
        if (!code) return toast('أدخل الكود أولاً','error');
        if (await importSectionFromCode(code)) $('importSectionModal')?.classList.add('modal-hidden');
    });
    $('copySectionCodeBtn')?.addEventListener('click',()=>{
        const code=$('sectionCodeText')?.value; if (!code) return;
        navigator.clipboard.writeText(code).then(()=>toast('📋 تم نسخ الكود')).catch(()=>{ $('sectionCodeText').select(); document.execCommand('copy'); toast('📋 تم نسخ الكود'); });
    });
    // قائمة سياق الأقسام
    $('sctxPin')?.addEventListener('click',async()=>{ const id=$('sectionContextMenu')?.dataset.secId; if(id) await togglePinSectionUI(id); $('sectionContextMenu')?.classList.add('modal-hidden'); });
    $('sctxEdit')?.addEventListener('click',()=>{ const id=$('sectionContextMenu')?.dataset.secId; if(id) openSectionModal(id); $('sectionContextMenu')?.classList.add('modal-hidden'); });
    $('sctxCode')?.addEventListener('click',()=>{ const id=$('sectionContextMenu')?.dataset.secId; if(id) showSectionCode(id); $('sectionContextMenu')?.classList.add('modal-hidden'); });
    $('sctxDelete')?.addEventListener('click',()=>{ const id=$('sectionContextMenu')?.dataset.secId; if(id) confirmDeleteSection(id); $('sectionContextMenu')?.classList.add('modal-hidden'); });
    $('saveSectionBtn')?.addEventListener('click',saveSectionModal);
    $('sectionNameInput')?.addEventListener('keydown',e=>{ if(e.key==='Enter') saveSectionModal(); });
    $('saveEditBtn')?.addEventListener('click',saveEditModalUI);
    $('confirmOkBtn')?.addEventListener('click',applyDelete);
    $('confirmLogoutBtn')?.addEventListener('click',()=>{ closeLogoutConfirm(); });
    $('cancelLogoutBtn')?.addEventListener('click',closeLogoutConfirm);
    $('settingsBtn')?.addEventListener('click',()=>$('settingsModal')?.classList.remove('modal-hidden'));
    $('editAccountBtn')?.addEventListener('click',()=>{ $('settingsModal')?.classList.add('modal-hidden'); toast('حساب تليجرام لا يحتاج تعديل', 'error'); });
    $('logoutSettingsBtn')?.addEventListener('click',()=>{ $('settingsModal')?.classList.add('modal-hidden'); toast('استخدم زر الخروج من تليجرام', 'error'); });
    $('deleteAccountBtn')?.addEventListener('click',()=>{ $('settingsModal')?.classList.add('modal-hidden'); openDeleteAccountConfirm(); });
    $('confirmDeleteAccountBtn')?.addEventListener('click',async()=>{
        $('deleteAccountConfirmModal')?.classList.add('modal-hidden');
        if (confirm('هل أنت متأكد من حذف جميع بياناتك المحلية؟ لا يمكن التراجع.')) {
            // حذف البيانات من API (يجب إضافة نقطة نهاية للحذف)
            toast('حذف الحساب متوفر في البوت فقط', 'error');
        }
    });
    $('focusModeBtn')?.addEventListener('click',toggleFocusMode);
    $('saveAccountChangesBtn')?.addEventListener('click',()=>toast('حساب تليجرام لا يحتاج تعديل', 'error'));
    $('cancelEditAccountBtn')?.addEventListener('click',()=>$('editAccountModal')?.classList.add('modal-hidden'));
    $('exportBtn')?.addEventListener('click',()=>{
        const sec=sectionById(state.activeId); if (!sec) return toast('اختر قسماً أولاً','error');
        const opts=$('exportOptions'); if (!opts) return; opts.innerHTML='';
        [{icon:'📄',title:'نص عادي (.txt)',desc:'ملف نصي بسيط',fn:()=>exportTxt(sec)},
         {icon:'📊',title:'CSV للجدول',desc:'مناسب لـ Excel',fn:()=>exportCsv(sec)},
         {icon:'📋',title:'نسخ للحافظة',desc:'انسخ الملخص',fn:()=>copyToClipboard(sec)},
         {icon:'🖨️',title:'طباعة / PDF',desc:'اطبع أو احفظ PDF',fn:()=>printSection(sec)},
        ].forEach(o=>{
            const d=document.createElement('div'); d.className='export-opt';
            d.innerHTML=`<div class="e-icon">${o.icon}</div><div><h4>${o.title}</h4><p>${o.desc}</p></div>`;
            d.onclick=()=>{ o.fn(); $('exportModal')?.classList.add('modal-hidden'); };
            opts.appendChild(d);
        });
        $('exportModal')?.classList.remove('modal-hidden');
    });
    document.addEventListener('keydown',e=>{
        if (e.key==='Escape') {
            ['sectionModal','editModal','confirmModal','exportModal','logoutConfirmModal','settingsModal',
             'editAccountModal','deleteAccountConfirmModal','importSectionModal','sectionCodeModal','sectionContextMenu'
            ].forEach(id=>$(id)?.classList.add('modal-hidden'));
            closeAuthMenu(); closeRecordSearch();
        }
        if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); if(sectionById(state.activeId)){state.recordSearchOpen?closeRecordSearch():openRecordSearch();} }
        if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='n'){ e.preventDefault(); openSectionModal(null); }
    });
    document.querySelectorAll('.overlay').forEach(ov=>ov.addEventListener('click',e=>{ if(e.target===ov) ov.classList.add('modal-hidden'); }));
    document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>$(btn.dataset.close)?.classList.add('modal-hidden')));
}

function showSectionCode(secId) {
    const sec = sectionById(secId); if (!sec) return;
    const code = encodeSectionCode(sec, sec.records);
    if (!code) return toast('فشل توليد الكود', 'error');
    const nameEl = $('sectionCodeName'), textEl = $('sectionCodeText');
    if (nameEl) nameEl.textContent = sec.name;
    if (textEl) textEl.value = code;
    $('sectionCodeModal')?.classList.remove('modal-hidden');
}

// ===================== بدء التطبيق =====================
async function init() {
    if (!isTelegramWebApp || !tgUser) {
        document.body.innerHTML = '<div style="text-align:center;padding:50px;"><h2>⚠️ هذا التطبيق يعمل فقط داخل بوت تليجرام</h2><p>الرجاء فتحه من زر "تطبيق الويب" في بوت حسّاب.</p></div>';
        return;
    }
    currentTelegramUserId = tgUser.id;
    const th=localStorage.getItem(STORAGE_THEME); if (th) state.theme=th;
    if (window.innerWidth<700) state.sidebarOpen=false;
    applyTheme();
    $('sidebar')?.classList.toggle('collapsed',!state.sidebarOpen);
    initEventListeners();
    await loadSections();
    renderAuthArea();
    setTimeout(()=>{ $('splash')?.classList.add('done'); $('app')?.classList.remove('app-hidden'); },1200);
}

init();