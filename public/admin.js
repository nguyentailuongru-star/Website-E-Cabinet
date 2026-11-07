/* Bảng điều khiển quản trị: tab, quản lý tài khoản, nhật ký hệ thống.
   Dùng chung $, api, msg, currentUser, loadUsers, ROLE_LABELS từ app.js. */
(() => {
  const $$ = s => [...document.querySelectorAll(s)];
  const STATUS = {
    active: 'Đang hoạt động',
    pending: 'Chưa đổi mật khẩu',
    locked: 'Tạm khóa (sai mật khẩu)',
    inactive: 'Đã vô hiệu hóa'
  };
  const ACTIONS = {
    login: 'Đăng nhập', login_failed: 'Đăng nhập thất bại', logout: 'Đăng xuất', password_changed: 'Đổi mật khẩu',
    user_created: 'Tạo tài khoản', user_updated: 'Cập nhật tài khoản', users_imported: 'Nhập tài khoản CSV', user_password_reset: 'Đặt lại mật khẩu',
    meeting_created: 'Tạo cuộc họp', meeting_started: 'Bắt đầu cuộc họp', meeting_ended: 'Kết thúc cuộc họp', meeting_joined: 'Tham gia cuộc họp',
    attendance_updated: 'Cập nhật điểm danh', document_uploaded: 'Tải lên tài liệu', document_opened: 'Mở tài liệu',
    document_page_viewed: 'Xem trang tài liệu', document_revoked: 'Thu hồi tài liệu', presentation_opened: 'Trình chiếu tài liệu',
    poll_created: 'Tạo biểu quyết', poll_opened: 'Mở biểu quyết', poll_closed: 'Đóng biểu quyết', poll_results_published: 'Công bố kết quả biểu quyết',
    public_vote_cast: 'Bỏ phiếu công khai', secret_vote_cast: 'Bỏ phiếu kín', minutes_updated: 'Cập nhật biên bản', minutes_exported: 'Xuất biên bản'
  };
  const ACTION_TONE = { login_failed: 'danger', user_password_reset: 'warn', user_updated: 'warn', user_created: 'info', users_imported: 'info' };
  const DETAIL_LABELS = { username: 'tài khoản', role: 'vai trò', count: 'số lượng', format: 'định dạng', meetingId: 'cuộc họp', documentId: 'tài liệu', pollId: 'biểu quyết', page: 'trang', status: 'trạng thái', userId: 'người dùng' };

  let users = [], auditRows = [], editing = null, lastCredentials = [];

  /* ---------- Tiện ích ---------- */
  function el(tag, props = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k === 'onclick') n.addEventListener('click', v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const c of children) if (c != null && c !== false) n.append(c);
    return n;
  }
  const parseDate = v => {
    if (!v) return null;
    const str = String(v);
    const d = new Date(/[TZ]/.test(str) ? str : str.replace(' ', 'T') + 'Z');
    return isNaN(d) ? null : d;
  };
  const fmtDate = v => { const d = parseDate(v); return d ? d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—'; };
  const fmtRelative = v => {
    const d = parseDate(v); if (!d) return 'Chưa đăng nhập';
    const sec = Math.round((Date.now() - d) / 1000);
    if (sec < 60) return 'Vừa xong';
    if (sec < 3600) return `${Math.floor(sec / 60)} phút trước`;
    if (sec < 86400) return `${Math.floor(sec / 3600)} giờ trước`;
    if (sec < 86400 * 7) return `${Math.floor(sec / 86400)} ngày trước`;
    return d.toLocaleDateString('vi-VN');
  };
  const normalize = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const csvCell = v => /[",\r\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
  function download(name, text, type = 'text/csv;charset=utf-8') {
    const url = URL.createObjectURL(new Blob(['﻿' + text], { type }));
    const a = el('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copyText(text) {
    try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch {}
    const ta = el('textarea', { value: text, readOnly: true });
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    (document.querySelector('dialog[open]') || document.body).append(ta);
    ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); return ok;
  }
  let toastTimer;
  window.toast = (text, tone = 'ok') => {
    const t = $('#toast');
    t.textContent = text; t.className = `toast-${tone}`; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3500);
  };

  /* ---------- Hộp thoại ---------- */
  for (const d of $$('dialog.modal')) {
    d.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) d.close();
      else if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); }
    });
  }
  function confirmDialog({ title, message, ok = 'Xác nhận', danger = false }) {
    const d = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    const okBtn = $('#confirm-ok');
    okBtn.textContent = ok; okBtn.classList.toggle('btn-danger', danger);
    d.returnValue = '';
    d.showModal();
    return new Promise(resolve => d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true }));
  }

  /* ---------- Tab ---------- */
  function switchTab(name) {
    for (const b of $$('#home-tabs [data-tab]')) {
      const on = b.dataset.tab === name;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    $('#tab-meetings').hidden = name !== 'meetings';
    $('#admin-users').hidden = name !== 'users';
    $('#admin-audit').hidden = name !== 'audit';
    try { localStorage.setItem('admin:tab', name); } catch {}
    if (name === 'users') loadAdminUsers();
    if (name === 'audit') loadAudit();
  }
  $('#home-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) switchTab(b.dataset.tab); });
  $('#home-tabs').addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = $$('#home-tabs [data-tab]'), i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus(); switchTab(next.dataset.tab);
  });
  window.setupHomeTabs = () => {
    const isAdmin = currentUser?.role === 'admin';
    $('#home-tabs').hidden = !isAdmin;
    $('#home-title').textContent = isAdmin ? 'Bảng điều khiển quản trị' : 'Cuộc họp của tôi';
    let tab = 'meetings';
    if (isAdmin) { try { tab = localStorage.getItem('admin:tab') || 'meetings'; } catch {} }
    switchTab(tab);
  };

  /* ---------- Tài khoản ---------- */
  function statusOf(u) {
    if (!u.active) return 'inactive';
    if (u.lockedUntil && Date.parse(u.lockedUntil) > Date.now()) return 'locked';
    if (u.mustChangePassword) return 'pending';
    return 'active';
  }
  async function loadAdminUsers() {
    try { users = await api('/api/admin/users'); renderUsers(); msg($('#admin-user-message'), ''); }
    catch (e) { msg($('#admin-user-message'), e.message); }
  }
  function renderStats() {
    const count = st => users.filter(u => statusOf(u) === st).length;
    const items = [
      ['Tổng tài khoản', users.length, ''],
      ['Đang hoạt động', count('active'), 'ok'],
      ['Chưa đổi mật khẩu', count('pending'), 'warn'],
      ['Bị khóa', count('locked') + count('inactive'), 'danger']
    ];
    $('#user-stats').replaceChildren(...items.map(([label, value, tone]) =>
      el('div', { class: `stat ${tone ? 'stat-' + tone : ''}` }, el('span', { class: 'stat-value', textContent: value }), el('span', { class: 'stat-label', textContent: label }))));
  }
  function renderUsers() {
    renderStats();
    const q = normalize($('#user-search').value.trim()), role = $('#user-role-filter').value, st = $('#user-status-filter').value;
    const rows = users.filter(u =>
      (!role || u.role === role) &&
      (!st || statusOf(u) === st) &&
      (!q || normalize([u.fullName, u.username, u.unit, u.title].join(' ')).includes(q)));
    const body = $('#user-table tbody');
    if (!rows.length) {
      body.replaceChildren(el('tr', {}, el('td', { colSpan: 6, class: 'empty', textContent: users.length ? 'Không có tài khoản phù hợp với bộ lọc.' : 'Chưa có tài khoản nào.' })));
    } else {
      body.replaceChildren(...rows.map(userRow));
    }
    $('#user-count').textContent = `Hiển thị ${rows.length} / ${users.length} tài khoản`;
  }
  function userRow(u) {
    const st = statusOf(u), isSelf = u.id === currentUser.id;
    const initials = String(u.fullName || u.username).trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();
    const name = el('div', { class: 'user-cell' },
      el('span', { class: `avatar role-${u.role}`, textContent: initials, 'aria-hidden': 'true' }),
      el('div', {}, el('strong', { textContent: u.fullName }, isSelf ? el('span', { class: 'tag-self', textContent: 'Bạn' }) : null), el('small', { textContent: '@' + u.username })));
    const unit = el('div', { class: 'stack' }, el('span', { textContent: u.unit || '—' }), u.title ? el('small', { textContent: u.title }) : null);
    const roleBadge = el('span', { class: `badge role-${u.role}`, textContent: ROLE_LABELS[u.role] || u.role });
    const statusBadge = el('span', { class: `status-pill st-${st}`, textContent: STATUS[st] });
    const last = el('span', { title: u.lastLoginAt ? fmtDate(u.lastLoginAt) : '', textContent: fmtRelative(u.lastLoginAt) });
    const actions = el('div', { class: 'row-actions' },
      el('button', { type: 'button', class: 'btn-sm btn-secondary', textContent: 'Sửa', onclick: () => openUserDialog(u) }),
      el('button', { type: 'button', class: 'btn-sm btn-secondary', textContent: 'Đặt lại mật khẩu', onclick: () => resetPassword(u) }),
      isSelf ? null : u.active
        ? el('button', { type: 'button', class: 'btn-sm btn-danger-ghost', textContent: 'Vô hiệu hóa', onclick: () => setActive(u, false) })
        : el('button', { type: 'button', class: 'btn-sm btn-ok-ghost', textContent: 'Kích hoạt', onclick: () => setActive(u, true) }));
    const td = (label, content, cls) => el('td', { class: cls, dataset: { label } }, content);
    return el('tr', { class: u.active ? '' : 'row-muted' },
      td('Họ tên', name), td('Đơn vị', unit), td('Vai trò', roleBadge), td('Trạng thái', statusBadge), td('Đăng nhập', last), td('Thao tác', actions, 'col-actions'));
  }
  for (const id of ['#user-search', '#user-role-filter', '#user-status-filter']) $(id).addEventListener('input', renderUsers);

  function openUserDialog(u = null) {
    editing = u;
    const f = $('#user-form');
    f.reset();
    $('#user-dialog-title').textContent = u ? 'Chỉnh sửa tài khoản' : 'Thêm tài khoản';
    $('#user-form-submit').textContent = u ? 'Lưu thay đổi' : 'Tạo tài khoản';
    f.elements.username.readOnly = !!u;
    $('#username-hint').textContent = u ? 'Không thể thay đổi tên đăng nhập.' : 'Chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.';
    const self = u && u.id === currentUser.id;
    f.elements.role.disabled = !!self;
    $('#role-hint').textContent = self ? 'Không thể tự thay đổi vai trò của chính mình.' : u ? 'Thay đổi vai trò sẽ đăng xuất người dùng khỏi mọi thiết bị.' : '';
    if (u) for (const k of ['fullName', 'username', 'unit', 'title', 'role']) f.elements[k].value = u[k] || '';
    msg($('#user-form-message'), '');
    $('#user-dialog').showModal();
    (u ? f.elements.fullName : f.elements.fullName).focus();
  }
  $('#user-add-open').onclick = () => openUserDialog();
  $('#user-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.currentTarget, v = k => f.elements[k].value.trim();
    if (!v('fullName')) return msg($('#user-form-message'), 'Vui lòng nhập họ và tên.');
    if (!editing && !/^[A-Za-z0-9._-]{3,100}$/.test(v('username'))) return msg($('#user-form-message'), 'Tên đăng nhập cần 3–100 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
    const btn = $('#user-form-submit'); btn.disabled = true;
    try {
      if (editing) {
        const body = { fullName: v('fullName'), unit: v('unit'), title: v('title') };
        if (!f.elements.role.disabled) body.role = f.elements.role.value;
        await api(`/api/admin/users/${editing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        $('#user-dialog').close();
        toast('Đã cập nhật tài khoản ' + editing.username + '.');
      } else {
        const created = await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ fullName: v('fullName'), username: v('username'), unit: v('unit'), title: v('title'), role: f.elements.role.value }) });
        $('#user-dialog').close();
        showCredentials([{ fullName: v('fullName'), username: created.username, password: created.password }], 'Tài khoản đã được tạo');
      }
      await afterUserChange();
    } catch (err) { msg($('#user-form-message'), err.message); }
    finally { btn.disabled = false; }
  });

  async function setActive(u, active) {
    if (!active) {
      const ok = await confirmDialog({ title: 'Vô hiệu hóa tài khoản', message: `Vô hiệu hóa tài khoản “${u.fullName}” (@${u.username})? Người dùng sẽ bị đăng xuất ngay và không thể đăng nhập cho tới khi được kích hoạt lại.`, ok: 'Vô hiệu hóa', danger: true });
      if (!ok) return;
    }
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ active }) });
      toast(active ? `Đã kích hoạt tài khoản ${u.username}.` : `Đã vô hiệu hóa tài khoản ${u.username}.`);
      await afterUserChange();
    } catch (e) { toast(e.message, 'danger'); }
  }
  async function resetPassword(u) {
    const ok = await confirmDialog({ title: 'Đặt lại mật khẩu', message: `Tạo mật khẩu mới cho “${u.fullName}” (@${u.username})? Mật khẩu cũ sẽ không còn hiệu lực${u.id === currentUser.id ? '' : ', người dùng bị đăng xuất'} và phải đổi mật khẩu ở lần đăng nhập tiếp theo.`, ok: 'Đặt lại' });
    if (!ok) return;
    try {
      const r = await api(`/api/admin/users/${u.id}/reset-password`, { method: 'POST', body: '{}' });
      showCredentials([{ fullName: u.fullName, username: r.username, password: r.password }], 'Mật khẩu mới');
      await afterUserChange();
    } catch (e) { toast(e.message, 'danger'); }
  }
  async function afterUserChange() {
    await loadAdminUsers();
    try { await loadUsers(); } catch {}
  }

  /* ---------- Thông tin đăng nhập ---------- */
  function showCredentials(list, title) {
    lastCredentials = list;
    $('#cred-title').textContent = title;
    $('#cred-table tbody').replaceChildren(...list.map(c => el('tr', {},
      el('td', { textContent: c.fullName || '' }),
      el('td', {}, el('code', { textContent: c.username })),
      el('td', {}, el('code', { class: 'secret', textContent: c.password })))));
    $('#cred-dialog').showModal();
  }
  const credText = () => lastCredentials.map(c => `${c.fullName ? c.fullName + ' — ' : ''}Tài khoản: ${c.username} · Mật khẩu: ${c.password}`).join('\n');
  $('#cred-copy').onclick = async () => toast(await copyText(credText()) ? 'Đã sao chép thông tin đăng nhập.' : 'Không sao chép được, vui lòng tải về.', 'ok');
  $('#cred-download').onclick = () => download(`tai-khoan-${new Date().toISOString().slice(0, 10)}.csv`,
    ['full_name,username,password', ...lastCredentials.map(c => [c.fullName, c.username, c.password].map(csvCell).join(','))].join('\r\n'));

  /* ---------- Nhập CSV ---------- */
  $('#user-import-open').onclick = () => {
    $('#csv-form').reset(); $('#csv-preview').textContent = ''; msg($('#csv-message'), '');
    $('#csv-dialog').showModal();
  };
  $('#csv-sample').onclick = () => download('mau-tai-khoan.csv', 'full_name,unit,title,username\r\nNguyễn Văn An,Văn phòng,Chuyên viên,nguyenvanan\r\nTrần Thị Bình,Phòng Tổ chức,Trưởng phòng,tranthibinh\r\n');
  $('#csv-file').addEventListener('change', async e => {
    const file = e.target.files[0]; if (!file) return;
    if (file.size > 2_000_000) { msg($('#csv-message'), 'Tệp vượt quá 2 MB.'); return; }
    $('#csv-text').value = (await file.text()).replace(/^﻿/, '');
    previewCsv();
  });
  function previewCsv() {
    const lines = $('#csv-text').value.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) { $('#csv-preview').textContent = ''; return; }
    const head = lines[0].toLowerCase().split(',').map(x => x.trim().replace(/^"|"$/g, ''));
    const missing = ['full_name', 'unit', 'title', 'username'].filter(k => !head.includes(k));
    $('#csv-preview').textContent = missing.length ? `Thiếu cột: ${missing.join(', ')}` : `Sẵn sàng nhập khoảng ${lines.length - 1} tài khoản.`;
    $('#csv-preview').classList.toggle('hint-error', !!missing.length);
  }
  $('#csv-text').addEventListener('input', previewCsv);
  $('#csv-form').addEventListener('submit', async e => {
    e.preventDefault();
    const csv = $('#csv-text').value.replace(/^﻿/, '').trim();
    if (!csv) return msg($('#csv-message'), 'Vui lòng chọn tệp hoặc dán nội dung CSV.');
    const btn = $('#csv-submit'); btn.disabled = true;
    try {
      const r = await api('/api/admin/users/import-csv', { method: 'POST', body: JSON.stringify({ csv }) });
      $('#csv-dialog').close();
      await afterUserChange();
      if (!r.created.length) { toast('Không có dòng hợp lệ nào để nhập.', 'warn'); return; }
      const byName = new Map(users.map(u => [u.username, u.fullName]));
      showCredentials(r.created.map(c => ({ ...c, fullName: byName.get(c.username) || '' })), `Đã nhập ${r.created.length} tài khoản`);
    } catch (err) { msg($('#csv-message'), err.message); }
    finally { btn.disabled = false; }
  });

  /* ---------- Nhật ký ---------- */
  const actionSelect = $('#audit-action-filter');
  for (const [k, v] of Object.entries(ACTIONS).sort((a, b) => a[1].localeCompare(b[1], 'vi'))) actionSelect.append(el('option', { value: k, textContent: v }));
  function detailText(raw) {
    let d; try { d = JSON.parse(raw || '{}'); } catch { return String(raw || ''); }
    return Object.entries(d).map(([k, v]) => {
      let val = typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (k === 'role') val = ROLE_LABELS[val] || val;
      if (/Id$/.test(k) && val.length > 12) val = val.slice(0, 8) + '…';
      return `${DETAIL_LABELS[k] || k}: ${val}`;
    }).join(' · ');
  }
  async function loadAudit() {
    const btn = $('#audit-refresh'); btn.disabled = true;
    try { auditRows = await api('/api/admin/audit?limit=' + $('#audit-limit').value); renderAudit(); msg($('#audit-message'), ''); }
    catch (e) { msg($('#audit-message'), e.message); }
    finally { btn.disabled = false; }
  }
  function filteredAudit() {
    const q = normalize($('#audit-search').value.trim()), act = actionSelect.value;
    return auditRows.filter(r => (!act || r.action === act) && (!q || normalize([r.username, ACTIONS[r.action], r.action, detailText(r.details), r.ipAddress].join(' ')).includes(q)));
  }
  function renderAudit() {
    const rows = filteredAudit(), body = $('#audit-table tbody');
    if (!rows.length) body.replaceChildren(el('tr', {}, el('td', { colSpan: 5, class: 'empty', textContent: 'Không có bản ghi phù hợp.' })));
    else body.replaceChildren(...rows.map(r => el('tr', {},
      el('td', { dataset: { label: 'Thời gian' }, class: 'nowrap', textContent: fmtDate(r.createdAt) }),
      el('td', { dataset: { label: 'Người thực hiện' }, textContent: r.username || '—' }),
      el('td', { dataset: { label: 'Hành động' } }, el('span', { class: `badge tone-${ACTION_TONE[r.action] || 'neutral'}`, textContent: ACTIONS[r.action] || r.action })),
      el('td', { dataset: { label: 'Chi tiết' }, class: 'detail', textContent: detailText(r.details) || '—' }),
      el('td', { dataset: { label: 'IP' }, class: 'nowrap mono', textContent: (r.ipAddress || '—').replace(/^::ffff:/, '') }))));
    $('#audit-count').textContent = `Hiển thị ${rows.length} / ${auditRows.length} bản ghi`;
  }
  $('#audit-search').addEventListener('input', renderAudit);
  actionSelect.addEventListener('input', renderAudit);
  $('#audit-limit').addEventListener('change', loadAudit);
  $('#audit-refresh').onclick = loadAudit;
  $('#audit-export').onclick = () => download(`nhat-ky-${new Date().toISOString().slice(0, 10)}.csv`,
    ['thoi_gian,nguoi_thuc_hien,hanh_dong,chi_tiet,ip', ...filteredAudit().map(r => [fmtDate(r.createdAt), r.username, ACTIONS[r.action] || r.action, detailText(r.details), r.ipAddress].map(csvCell).join(','))].join('\r\n'));
})();
