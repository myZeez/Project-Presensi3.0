const config = window.PRESENSI_ADMIN_CONFIG || {};
const apiBase = (config.API_BASE_URL || '').replace(/\/$/, '');

const state = {
  tab: 'employees',
  employees: [],
  attendance: [],
  settings: {},
  admins: [],
  search: '',
  session: sessionStorage.getItem('presensi_admin_session') || '',
  sessionInfo: null,
};

const els = {
  addBtn: document.querySelector('#addBtn'),
  adminDialog: document.querySelector('#adminDialog'),
  adminForm: document.querySelector('#adminForm'),
  adminApp: document.querySelector('#adminApp'),
  attendanceCount: document.querySelector('#attendanceCount'),
  attendanceDialog: document.querySelector('#attendanceDialog'),
  attendanceForm: document.querySelector('#attendanceForm'),
  dashboardInsights: document.querySelector('#dashboardInsights'),
  dataView: document.querySelector('#dataView'),
  employeeCount: document.querySelector('#employeeCount'),
  employeeDialog: document.querySelector('#employeeDialog'),
  employeeForm: document.querySelector('#employeeForm'),
  loginForm: document.querySelector('#loginForm'),
  loginStatus: document.querySelector('#loginStatus'),
  loginView: document.querySelector('#loginView'),
  logoutBtn: document.querySelector('#logoutBtn'),
  mapCoordinate: document.querySelector('#mapCoordinate'),
  mapLink: document.querySelector('#mapLink'),
  mapPreview: document.querySelector('#mapPreview'),
  refreshBtn: document.querySelector('#refreshBtn'),
  searchInput: document.querySelector('#searchInput'),
  settingsForm: document.querySelector('#settingsForm'),
  settingsView: document.querySelector('#settingsView'),
  statusText: document.querySelector('#statusText'),
  tableBody: document.querySelector('#tableBody'),
  tableHead: document.querySelector('#tableHead'),
  tabs: document.querySelectorAll('.tab'),
  todayCount: document.querySelector('#todayCount'),
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  els.refreshBtn.addEventListener('click', loadData);
  els.logoutBtn.addEventListener('click', logout);
  els.addBtn.addEventListener('click', openCreate);
  els.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value.toLowerCase();
    render();
  });
  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab;
      els.tabs.forEach((item) => item.classList.toggle('active', item === tab));
      render();
    });
  });

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog').close());
  });

  els.loginForm.addEventListener('submit', login);
  els.employeeForm.addEventListener('submit', saveEmployee);
  els.attendanceForm.addEventListener('submit', saveAttendance);
  els.settingsForm.addEventListener('submit', saveSettings);
  els.adminForm.addEventListener('submit', saveAdmin);
  els.settingsForm.addEventListener('input', renderMapPreview);

  if (state.session) {
    try {
      const session = await api('/api/session');
      state.sessionInfo = session.data;
      showAdmin();
      await loadData(false);
      return;
    } catch {
      sessionStorage.removeItem('presensi_admin_session');
      state.session = '';
      state.sessionInfo = null;
    }
  }

  showLogin();
}

async function login(event) {
  event.preventDefault();
  const payload = formData(els.loginForm);
  setLoginStatus('Memeriksa login...');

  try {
    const result = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });
    state.session = result.data.token;
    state.sessionInfo = result.data;
    sessionStorage.setItem('presensi_admin_session', state.session);
    els.loginForm.reset();
    setLoginStatus('');
    showAdmin();
    await loadData(false);
  } catch (error) {
    setLoginStatus(error.message, true);
  }
}

async function logout() {
  if (state.session) {
    try {
      await api('/api/logout', { method: 'POST' });
    } catch {
      // Session may already be gone on the server.
    }
  }

  state.session = '';
  state.sessionInfo = null;
  sessionStorage.removeItem('presensi_admin_session');
  showLogin();
}

function showLogin() {
  els.loginView.hidden = false;
  els.adminApp.hidden = true;
  els.refreshBtn.hidden = true;
  els.logoutBtn.hidden = true;
}

function showAdmin() {
  els.loginView.hidden = true;
  els.adminApp.hidden = false;
  els.refreshBtn.hidden = false;
  els.logoutBtn.hidden = false;
}

async function loadData(retryAuth = true) {
  if (!state.session) {
    showLogin();
    return;
  }

  setStatus('Memuat data...');
  try {
    const [employees, attendance, settings, admins] = await Promise.all([
      api('/api/employees'),
      api('/api/attendance'),
      api('/api/settings'),
      api('/api/admins'),
    ]);
    state.employees = employees.data.map(normalizeEmployee);
    state.attendance = attendance.data.map(normalizeAttendance);
    state.settings = settings.data || {};
    state.admins = admins.data || [];
    setStatus('Data terbaru sudah dimuat.');
    render();
  } catch (error) {
    setStatus(error.message, true);
    if (isAuthError(error) && retryAuth) {
      state.session = '';
      state.sessionInfo = null;
      sessionStorage.removeItem('presensi_admin_session');
      showLogin();
    } else if (isAuthError(error)) {
      showLogin();
    }
  }
}

async function api(path, options = {}) {
  const { skipAuth = false, ...fetchOptions } = options;
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...fetchOptions,
      headers: {
        'content-type': 'application/json',
        ...(skipAuth ? {} : { authorization: `Bearer ${state.session}` }),
        ...(fetchOptions.headers || {}),
      },
    });
  } catch {
    throw new Error(
      `Backend belum aktif di ${apiBase || 'server yang sama'}. Jalankan npm start di folder backend.`,
    );
  }
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      'API backend belum terhubung. Jalankan npm start atau cek API_BASE_URL di public/config.js.',
    );
  }

  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || `Request gagal (${response.status})`);
  }
  return data;
}

function isAuthError(error) {
  const message = error.message.toLowerCase();
  return (
    message.includes('sesi login admin') ||
    message.includes('login ulang') ||
    message.includes('sudah habis')
  );
}

function setLoginStatus(message, isError = false) {
  els.loginStatus.textContent = message;
  els.loginStatus.style.color = isError ? '#c62828' : '';
}

function render() {
  renderSummary();
  renderInsights();
  renderMode();

  if (state.tab === 'employees') {
    renderEmployees();
  } else if (state.tab === 'attendance') {
    renderAttendance();
  } else if (state.tab === 'admins') {
    renderAdmins();
  } else {
    renderSettings();
  }
}

function renderMode() {
  const isSettings = state.tab === 'settings';
  els.dataView.hidden = isSettings;
  els.settingsView.hidden = !isSettings;

  if (state.tab === 'employees') {
    els.addBtn.textContent = 'Tambah Karyawan';
    els.searchInput.placeholder = 'Cari nama, username, ID...';
  }
  if (state.tab === 'attendance') {
    els.addBtn.textContent = 'Tambah Presensi';
    els.searchInput.placeholder = 'Cari presensi, nama, tanggal...';
  }
  if (state.tab === 'admins') {
    els.addBtn.textContent = 'Tambah Admin';
    els.searchInput.placeholder = 'Cari username admin...';
  }
}

function renderSummary() {
  const today = localDate(new Date());
  els.employeeCount.textContent = state.employees.length;
  els.attendanceCount.textContent = state.attendance.length;
  els.todayCount.textContent = state.attendance.filter(
    (item) => item.tanggal === today,
  ).length;
}

function renderInsights() {
  const activeEmployees = state.employees.filter((item) => item.status === 'aktif').length;
  const validAttendance = state.attendance.filter((item) => item.status === 'Valid').length;
  const today = localDate(new Date());
  const todayCheckIns = state.attendance.filter(
    (item) => item.tanggal === today && item.tipe === 'Masuk',
  ).length;
  const radius = Number(state.settings.attendance_radius_meters || 10);

  els.dashboardInsights.innerHTML = [
    insight('AK', activeEmployees, 'Karyawan aktif'),
    insight('PV', validAttendance, 'Presensi valid'),
    insight('MH', todayCheckIns, 'Masuk hari ini'),
    insight('RL', `${radius || 0} m`, 'Radius lokasi'),
  ].join('');
}

function insight(icon, value, label) {
  return `<article class="insight-card">
    <span class="icon">${icon}</span>
    <div>
      <strong>${esc(value)}</strong>
      <p>${esc(label)}</p>
    </div>
  </article>`;
}

function renderEmployees() {
  els.tableHead.innerHTML = rowHtml(
    ['Karyawan', 'Username', 'Status', 'Aksi'],
    'th',
  );

  const rows = filterRows(state.employees, [
    'id',
    'nama',
    'username',
    'status',
  ]);

  els.tableBody.innerHTML = rows
    .map((item) =>
      rowHtml([
        mainCell(item.nama, `ID ${item.id}`),
        esc(item.username),
        pill(item.status, item.status === 'aktif'),
        actions(item.id),
      ]),
    )
    .join('');
}

function renderAdmins() {
  els.tableHead.innerHTML = rowHtml(
    ['Username', 'Dibuat', 'Sumber', 'Aksi'],
    'th',
  );

  const rows = filterRows(state.admins, ['username', 'created_at', 'source']);

  els.tableBody.innerHTML = rows
    .map((item) =>
      rowHtml([
        mainCell(item.username, item.username === state.sessionInfo?.username ? 'Sedang login' : ''),
        esc(formatDateTime(item.created_at) || '-'),
        pill(item.source === 'env' ? 'Environment' : 'File lokal', item.source !== 'env'),
        adminActions(item.username),
      ]),
    )
    .join('');
}

function renderAttendance() {
  els.tableHead.innerHTML = rowHtml(
    ['Tanggal', 'Karyawan', 'Masuk', 'Pulang', 'Lembur', 'Lainnya', 'Status'],
    'th',
  );

  const rows = filterAttendanceGroups(attendanceGroups());

  els.tableBody.innerHTML = rows
    .map((group) =>
      rowHtml([
        mainCell(group.tanggal, `${group.records.length} catatan`),
        mainCell(group.nama, `ID ${group.employee_id}`),
        attendanceSlot(group.byType.Masuk),
        attendanceSlot(group.byType.Pulang),
        attendanceSlot(group.byType.Lembur),
        otherAttendanceSlot(group.others),
        groupStatus(group),
      ]),
    )
    .join('');
}

function attendanceGroups() {
  const groups = new Map();
  for (const item of state.attendance) {
    const key = `${item.tanggal}|${item.employee_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        tanggal: item.tanggal,
        employee_id: item.employee_id,
        nama: item.nama,
        records: [],
        byType: {},
        others: [],
      });
    }

    const group = groups.get(key);
    group.records.push(item);
    if (['Masuk', 'Pulang', 'Lembur'].includes(item.tipe)) {
      group.byType[item.tipe] = item;
    } else {
      group.others.push(item);
    }
  }

  return [...groups.values()].sort((a, b) => {
    const byDate = b.tanggal.localeCompare(a.tanggal);
    return byDate || a.nama.localeCompare(b.nama);
  });
}

function filterAttendanceGroups(groups) {
  if (!state.search) {
    return groups;
  }
  return groups.filter((group) => {
    const haystack = [
      group.tanggal,
      group.employee_id,
      group.nama,
      ...group.records.flatMap((item) => [
        item.jam,
        item.tipe,
        item.status,
        item.jarak,
      ]),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(state.search);
  });
}

function attendanceSlot(item) {
  if (!item) {
    return '<span class="empty-slot">-</span>';
  }

  return `<div class="attendance-slot">
    <strong>${esc(item.jam || '-')}</strong>
    <span>${distanceText(item)}</span>
    ${mapAnchor(item.latitude, item.longitude) || ''}
    ${miniActions(item.id)}
  </div>`;
}

function otherAttendanceSlot(items) {
  if (!items.length) {
    return '<span class="empty-slot">-</span>';
  }

  return items
    .map(
      (item) => `<div class="attendance-slot compact">
        <strong>${esc(item.tipe)}</strong>
        <span>${esc(item.jam || '-')}</span>
        ${miniActions(item.id)}
      </div>`,
    )
    .join('');
}

function groupStatus(group) {
  const invalid = group.records.find((item) => item.status !== 'Valid');
  if (invalid) {
    return pill('Ada masalah', false, true);
  }
  const missing = ['Masuk', 'Pulang'].filter((type) => !group.byType[type]);
  if (missing.length) {
    return pill(`Kurang ${missing.join(', ')}`, false);
  }
  return pill('Lengkap', true);
}

function renderSettings() {
  els.settingsForm.elements.store_lat.value = state.settings.store_lat || '';
  els.settingsForm.elements.store_lng.value = state.settings.store_lng || '';
  els.settingsForm.elements.attendance_radius_meters.value =
    state.settings.attendance_radius_meters || '10';
  els.settingsForm.elements.punctual_time.value = state.settings.punctual_time || '08:00';
  els.settingsForm.elements.enforce_radius.value = state.settings.enforce_radius || 'false';
  renderMapPreview();
}

function renderMapPreview() {
  const form = els.settingsForm.elements;
  const radius = Number(
    form.attendance_radius_meters.value ||
      state.settings.attendance_radius_meters ||
      10,
  );
  const lat = parseCoordinate(form.store_lat.value || state.settings.store_lat);
  const lng = parseCoordinate(form.store_lng.value || state.settings.store_lng);
  if (lat == null || lng == null) {
    els.mapCoordinate.textContent = 'Koordinat: belum valid';
    els.mapLink.href = '#';
    els.mapPreview.innerHTML =
      '<p class="map-empty">Isi Latitude dan Longitude toko di form pengaturan.</p>';
    return;
  }

  const query = `${lat},${lng}`;
  els.mapCoordinate.textContent = `Koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)} • Radius ${radius} m`;
  els.mapLink.href = `https://www.google.com/maps/search/?api=1&query=${query}`;
  els.mapPreview.innerHTML = `<iframe
    title="Preview titik toko"
    loading="lazy"
    referrerpolicy="no-referrer-when-downgrade"
    src="https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=17&output=embed">
  </iframe>`;
}

async function saveSettings(event) {
  event.preventDefault();
  const payload = formData(els.settingsForm);

  try {
    const result = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    state.settings = result.data || payload;
    state.employees = state.employees.map((employee) => ({
      ...employee,
      lokasi_toko_lat: formatCoordinate(state.settings.store_lat),
      lokasi_toko_lng: formatCoordinate(state.settings.store_lng),
    }));
    render();
    alert('Pengaturan map dan radius berhasil disimpan.');
  } catch (error) {
    alert(error.message);
  }
}

function filterRows(rows, keys) {
  if (!state.search) {
    return rows;
  }
  return rows.filter((row) =>
    keys.some((key) => String(row[key] || '').toLowerCase().includes(state.search)),
  );
}

function rowHtml(cells, tag = 'td') {
  return `<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join('')}</tr>`;
}

function mainCell(title, subtitle = '') {
  return `<div class="cell-main">
    <strong>${esc(title || '-')}</strong>
    ${subtitle ? `<small>${subtitle}</small>` : ''}
  </div>`;
}

function actions(id) {
  return `<div class="actions">
    <button type="button" data-action="edit" data-id="${esc(id)}">Edit</button>
    <button class="danger" type="button" data-action="delete" data-id="${esc(id)}">Hapus</button>
  </div>`;
}

function adminActions(username) {
  const disabled = username === state.sessionInfo?.username ? 'disabled' : '';
  return `<div class="actions">
    <button class="danger" type="button" data-action="delete" data-id="${esc(username)}" ${disabled}>Hapus</button>
  </div>`;
}

function miniActions(id) {
  return `<div class="mini-actions">
    <button type="button" data-action="edit" data-id="${esc(id)}" title="Edit">Edit</button>
    <button class="danger" type="button" data-action="delete" data-id="${esc(id)}" title="Hapus">Hapus</button>
  </div>`;
}

function pill(text, good, bad = false) {
  const cls = good ? 'ok' : bad ? 'bad' : 'warn';
  return `<span class="pill ${cls}">${esc(text || '-')}</span>`;
}

els.tableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const { action, id } = button.dataset;
  if (action === 'edit') {
    openEdit(id);
  }
  if (action === 'delete') {
    await deleteRow(id);
  }
});

function openCreate() {
  if (state.tab === 'employees') {
    document.querySelector('#employeeDialogTitle').textContent = 'Tambah Karyawan';
    els.employeeForm.reset();
    els.employeeForm.elements.id.value = '';
    els.employeeDialog.showModal();
    return;
  }

  if (state.tab === 'admins') {
    els.adminForm.reset();
    els.adminDialog.showModal();
    return;
  }

  document.querySelector('#attendanceDialogTitle').textContent = 'Tambah Presensi';
  els.attendanceForm.reset();
  els.attendanceForm.elements.id.value = '';
  const now = new Date();
  els.attendanceForm.elements.tanggal.value = localDate(now);
  els.attendanceForm.elements.jam.value = localTime(now);
  els.attendanceDialog.showModal();
}

function openEdit(id) {
  if (state.tab === 'admins') {
    return;
  }

  if (state.tab === 'employees') {
    const item = state.employees.find((row) => row.id === id);
    fillForm(els.employeeForm, item);
    els.employeeForm.elements.password.value = '';
    document.querySelector('#employeeDialogTitle').textContent = 'Edit Karyawan';
    els.employeeDialog.showModal();
    return;
  }

  const item = state.attendance.find((row) => row.id === id);
  fillForm(els.attendanceForm, item);
  document.querySelector('#attendanceDialogTitle').textContent = 'Edit Presensi';
  els.attendanceDialog.showModal();
}

async function saveAdmin(event) {
  event.preventDefault();
  const payload = formData(els.adminForm);

  try {
    await api('/api/admins', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    els.adminDialog.close();
    await loadData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function saveEmployee(event) {
  event.preventDefault();
  const payload = formData(els.employeeForm);
  const isEdit = Boolean(payload.id);
  if (!isEdit && !payload.password) {
    setStatus('Password wajib diisi untuk karyawan baru.', true);
    return;
  }

  try {
    await api(isEdit ? `/api/employees/${payload.id}` : '/api/employees', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    els.employeeDialog.close();
    await loadData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function saveAttendance(event) {
  event.preventDefault();
  const payload = formData(els.attendanceForm);
  const isEdit = Boolean(payload.id);

  try {
    await api(isEdit ? `/api/attendance/${payload.id}` : '/api/attendance', {
      method: isEdit ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    els.attendanceDialog.close();
    await loadData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function deleteRow(id) {
  const label =
    state.tab === 'employees' ? 'karyawan' : state.tab === 'admins' ? 'admin' : 'presensi';
  if (!confirm(`Hapus data ${label} ini?`)) {
    return;
  }

  try {
    const resource = state.tab === 'admins' ? 'admins' : state.tab;
    await api(`/api/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadData();
  } catch (error) {
    setStatus(error.message, true);
  }
}

function fillForm(form, item) {
  form.reset();
  Object.entries(item || {}).forEach(([key, value]) => {
    if (form.elements[key]) {
      form.elements[key].value = value;
    }
  });
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function normalizeEmployee(item) {
  return {
    ...item,
    id: normalizeEmployeeId(item.id),
    lokasi_toko_lat: formatCoordinate(item.lokasi_toko_lat),
    lokasi_toko_lng: formatCoordinate(item.lokasi_toko_lng),
  };
}

function normalizeAttendance(item) {
  return {
    ...item,
    employee_id: normalizeEmployeeId(item.employee_id),
    tanggal: normalizeDate(item.tanggal),
    jam: normalizeTime(item.jam),
    latitude: formatCoordinate(item.latitude),
    longitude: formatCoordinate(item.longitude),
  };
}

function normalizeEmployeeId(value) {
  const text = String(value || '').trim();
  const number = Number(text.replace(',', '.'));
  if (text && Number.isInteger(number)) {
    return String(number).padStart(3, '0');
  }
  return text;
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const serial = Number(text.replace(',', '.'));
  if (!Number.isFinite(serial)) {
    return text;
  }
  const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(serial)));
  return date.toISOString().slice(0, 10);
}

function normalizeTime(value) {
  const text = String(value || '').trim();
  if (text.includes(':')) {
    const [hour = '00', minute = '00', second = '00'] = text.split(':');
    return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
  }
  const serial = Number(text.replace(',', '.'));
  if (!Number.isFinite(serial)) {
    return text;
  }
  const total = Math.round(serial * 24 * 60 * 60) % (24 * 60 * 60);
  const hour = Math.floor(total / 3600);
  const minute = Math.floor((total % 3600) / 60);
  const second = total % 60;
  return `${two(hour)}:${two(minute)}:${two(second)}`;
}

function formatCoordinate(value) {
  const parsed = parseCoordinate(value);
  return parsed == null ? String(value || '').trim() : parsed.toFixed(6);
}

function parseCoordinate(value) {
  const text = String(value || '').trim().replace(',', '.');
  const parsed = Number(text);
  if (Number.isFinite(parsed)) {
    if (Math.abs(parsed) > 180 && Number.isInteger(parsed)) {
      const scaled = parsed / 10 ** Math.max(0, String(Math.abs(parsed)).length - 1);
      if (Math.abs(scaled) <= 180) {
        return scaled;
      }
    }
    return parsed;
  }

  const parts = text.split('.');
  if (parts.length > 2) {
    const rebuilt = `${parts[0]}.${parts.slice(1).join('')}`;
    const rebuiltParsed = Number(rebuilt);
    return Number.isFinite(rebuiltParsed) ? rebuiltParsed : null;
  }
  return null;
}

function coordinateText(lat, lng) {
  const parsedLat = parseCoordinate(lat);
  const parsedLng = parseCoordinate(lng);
  if (parsedLat == null || parsedLng == null) {
    return '-';
  }
  return `${parsedLat.toFixed(6)}, ${parsedLng.toFixed(6)}`;
}

function mapAnchor(lat, lng) {
  const parsedLat = parseCoordinate(lat);
  const parsedLng = parseCoordinate(lng);
  if (parsedLat == null || parsedLng == null) {
    return '';
  }
  const query = `${parsedLat},${parsedLng}`;
  return `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query,
  )}" target="_blank" rel="noreferrer">Lihat map</a>`;
}

function formatMeters(value) {
  const number = Number(String(value || '').replace(',', '.'));
  if (!Number.isFinite(number)) {
    return '-';
  }
  return `${number.toLocaleString('id-ID', { maximumFractionDigits: 2 })} m`;
}

function distanceText(item) {
  const recorded = Number(String(item.jarak || '').replace(',', '.'));
  if (Number.isFinite(recorded) && recorded < 100000) {
    return formatMeters(recorded);
  }

  const employee = state.employees.find((row) => row.id === item.employee_id);
  const lat = parseCoordinate(item.latitude);
  const lng = parseCoordinate(item.longitude);
  const storeLat = parseCoordinate(state.settings.store_lat || employee?.lokasi_toko_lat);
  const storeLng = parseCoordinate(state.settings.store_lng || employee?.lokasi_toko_lng);
  if ([lat, lng, storeLat, storeLng].some((value) => value == null)) {
    return formatMeters(recorded);
  }

  return `${haversineMeters(lat, lng, storeLat, storeLng).toLocaleString('id-ID', {
    maximumFractionDigits: 2,
  })} m`;
}

function haversineMeters(fromLat, fromLng, toLat, toLng) {
  const earthRadius = 6371000;
  const dLat = radians(toLat - fromLat);
  const dLng = radians(toLng - fromLng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(fromLat)) *
      Math.cos(radians(toLat)) *
      Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function radians(value) {
  return (value * Math.PI) / 180;
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTime(date) {
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${localDate(date)} ${localTime(date)}`;
}

function two(value) {
  return String(value).padStart(2, '0');
}

function setStatus(message, isError = false) {
  els.statusText.textContent = message;
  els.statusText.style.color = isError ? '#c62828' : '';
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
