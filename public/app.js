const config = window.PRESENSI_ADMIN_CONFIG || {};
const apiBase = (config.API_BASE_URL || '').replace(/\/$/, '');

const state = {
  tab: 'employees',
  employees: [],
  attendance: [],
  search: '',
  token: sessionStorage.getItem('presensi_admin_token') || '',
};

const els = {
  addBtn: document.querySelector('#addBtn'),
  attendanceCount: document.querySelector('#attendanceCount'),
  attendanceDialog: document.querySelector('#attendanceDialog'),
  attendanceForm: document.querySelector('#attendanceForm'),
  employeeCount: document.querySelector('#employeeCount'),
  employeeDialog: document.querySelector('#employeeDialog'),
  employeeForm: document.querySelector('#employeeForm'),
  refreshBtn: document.querySelector('#refreshBtn'),
  searchInput: document.querySelector('#searchInput'),
  statusText: document.querySelector('#statusText'),
  tableBody: document.querySelector('#tableBody'),
  tableHead: document.querySelector('#tableHead'),
  tabs: document.querySelectorAll('.tab'),
  todayCount: document.querySelector('#todayCount'),
  tokenBtn: document.querySelector('#tokenBtn'),
  tokenDialog: document.querySelector('#tokenDialog'),
  tokenForm: document.querySelector('#tokenForm'),
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  els.refreshBtn.addEventListener('click', loadData);
  els.tokenBtn.addEventListener('click', openTokenDialog);
  els.addBtn.addEventListener('click', openCreate);
  els.searchInput.addEventListener('input', (event) => {
    state.search = event.target.value.toLowerCase();
    render();
  });

  els.tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab;
      els.tabs.forEach((item) => item.classList.toggle('active', item === tab));
      els.addBtn.textContent =
        state.tab === 'employees' ? 'Tambah Karyawan' : 'Tambah Presensi';
      render();
    });
  });

  document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => button.closest('dialog').close());
  });

  els.tokenForm.addEventListener('submit', saveToken);
  els.employeeForm.addEventListener('submit', saveEmployee);
  els.attendanceForm.addEventListener('submit', saveAttendance);

  if (!state.token) {
    await bootstrapToken();
  }

  if (!state.token) {
    openTokenDialog();
    render();
  } else {
    loadData();
  }
}

async function bootstrapToken() {
  try {
    const data = await api('/api/bootstrap-token', { skipAuth: true });
    state.token = data.token;
    sessionStorage.setItem('presensi_admin_token', state.token);
  } catch {
    setStatus('Token otomatis tidak tersedia. Masukkan token admin manual.', true);
  }
}

function openTokenDialog() {
  els.tokenForm.elements.token.value = state.token;
  els.tokenDialog.showModal();
}

function saveToken(event) {
  event.preventDefault();
  state.token = els.tokenForm.elements.token.value.trim();
  sessionStorage.setItem('presensi_admin_token', state.token);
  els.tokenDialog.close();
  loadData();
}

async function loadData(retryAuth = true) {
  if (!state.token) {
    openTokenDialog();
    return;
  }

  setStatus('Memuat data...');
  try {
    const [employees, attendance] = await Promise.all([
      api('/api/employees'),
      api('/api/attendance'),
    ]);
    state.employees = employees.data;
    state.attendance = attendance.data;
    setStatus('Data terbaru sudah dimuat.');
    render();
  } catch (error) {
    setStatus(error.message, true);
    if (isAuthError(error) && retryAuth) {
      sessionStorage.removeItem('presensi_admin_token');
      state.token = '';
      await bootstrapToken();
      if (state.token) {
        await loadData(false);
        return;
      }
      openTokenDialog();
    } else if (isAuthError(error)) {
      openTokenDialog();
    }
  }
}

async function api(path, options = {}) {
  const { skipAuth = false, ...fetchOptions } = options;
  const response = await fetch(`${apiBase}${path}`, {
    ...fetchOptions,
    headers: {
      'content-type': 'application/json',
      ...(skipAuth ? {} : { authorization: `Bearer ${state.token}` }),
      ...(fetchOptions.headers || {}),
    },
  });
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
  return message.includes('token admin') || message.includes('tidak valid');
}

function render() {
  renderSummary();
  if (state.tab === 'employees') {
    renderEmployees();
  } else {
    renderAttendance();
  }
}

function renderSummary() {
  const today = new Date().toISOString().slice(0, 10);
  els.employeeCount.textContent = state.employees.length;
  els.attendanceCount.textContent = state.attendance.length;
  els.todayCount.textContent = state.attendance.filter(
    (item) => item.tanggal === today,
  ).length;
}

function renderEmployees() {
  els.tableHead.innerHTML = rowHtml(
    ['ID', 'Nama', 'Username', 'Lokasi Toko', 'Status', 'Aksi'],
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
        esc(item.id),
        esc(item.nama),
        esc(item.username),
        `${esc(item.lokasi_toko_lat)}, ${esc(item.lokasi_toko_lng)}`,
        pill(item.status, item.status === 'aktif'),
        actions(item.id),
      ]),
    )
    .join('');
}

function renderAttendance() {
  els.tableHead.innerHTML = rowHtml(
    ['Tanggal', 'Jam', 'Karyawan', 'Tipe', 'Jarak', 'Status', 'Aksi'],
    'th',
  );

  const rows = filterRows(state.attendance, [
    'employee_id',
    'nama',
    'tanggal',
    'jam',
    'tipe',
    'status',
  ]);

  els.tableBody.innerHTML = rows
    .map((item) =>
      rowHtml([
        esc(item.tanggal),
        esc(item.jam),
        `${esc(item.nama)}<br><small>${esc(item.employee_id)}</small>`,
        esc(item.tipe),
        item.jarak ? `${esc(item.jarak)} m` : '-',
        pill(item.status, item.status === 'Valid'),
        actions(item.id),
      ]),
    )
    .join('');
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

function actions(id) {
  return `<td class="actions">
    <button type="button" data-action="edit" data-id="${esc(id)}">Edit</button>
    <button class="danger" type="button" data-action="delete" data-id="${esc(id)}">Hapus</button>
  </td>`;
}

function pill(text, good) {
  return `<span class="pill ${good ? 'ok' : 'bad'}">${esc(text || '-')}</span>`;
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

  document.querySelector('#attendanceDialogTitle').textContent = 'Tambah Presensi';
  els.attendanceForm.reset();
  els.attendanceForm.elements.id.value = '';
  const now = new Date();
  els.attendanceForm.elements.tanggal.value = localDate(now);
  els.attendanceForm.elements.jam.value = localTime(now);
  els.attendanceDialog.showModal();
}

function openEdit(id) {
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
  const label = state.tab === 'employees' ? 'karyawan' : 'presensi';
  if (!confirm(`Hapus data ${label} ini?`)) {
    return;
  }

  try {
    await api(`/api/${state.tab}/${id}`, { method: 'DELETE' });
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

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function localTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
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
