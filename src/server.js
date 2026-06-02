const fs = require('fs');
const http = require('http');
const path = require('path');

const sheetsApi = require('./googleSheets');
const { sheets } = require('./db');
const {
  adminToken,
  canBootstrapToken,
  corsHeaders,
  hashPassword,
  id,
  json,
  readBody,
  requireAdmin,
  requireFields,
  routeParts,
} = require('./utils');

const publicDir = path.resolve(__dirname, '..', 'public');
const port = Number(process.env.PORT || 3000);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }

    const parts = routeParts(req.url);
    if (parts[0] === 'api') {
      await handleApi(req, res, parts.slice(1));
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    json(req, res, error.statusCode || 500, {
      ok: false,
      message: error.message || String(error),
    });
  }
});

server.listen(port, () => {
  console.log(`Admin Presensi running at http://localhost:${port}`);
});

async function handleApi(req, res, parts) {
  if (parts[0] === 'health') {
    json(req, res, 200, { ok: true, time: new Date().toISOString() });
    return;
  }

  if (parts[0] === 'bootstrap-token') {
    if (!canBootstrapToken(req)) {
      json(req, res, 403, { ok: false, message: 'Auto token hanya untuk localhost.' });
      return;
    }

    json(req, res, 200, { ok: true, token: adminToken() });
    return;
  }

  requireAdmin(req);

  if (parts[0] === 'employees') {
    await employeesApi(req, res, parts[1]);
    return;
  }

  if (parts[0] === 'attendance') {
    await attendanceApi(req, res, parts[1]);
    return;
  }

  json(req, res, 404, { ok: false, message: 'Endpoint tidak ditemukan.' });
}

async function employeesApi(req, res, employeeId) {
  if (req.method === 'GET') {
    await repairEmployeeIds();
    json(req, res, 200, {
      ok: true,
      data: await sheetsApi.list(sheets.employees),
    });
    return;
  }

  const existing = await sheetsApi.list(sheets.employees);

  if (req.method === 'POST') {
    const payload = await readBody(req);
    requireFields(payload, ['nama', 'username', 'password']);
    const item = normalizeEmployee(payload, {
      id: nextEmployeeId(existing),
      password_hash: hashPassword(payload.password),
    });
    await sheetsApi.append(sheets.employees, item);
    json(req, res, 201, { ok: true, data: item });
    return;
  }

  const current = existing.find((item) => item.id === employeeId);
  if (!current) {
    json(req, res, 404, { ok: false, message: 'Karyawan tidak ditemukan.' });
    return;
  }

  if (req.method === 'PUT') {
    const payload = await readBody(req);
    const item = normalizeEmployee(payload, {
      ...current,
      password_hash: payload.password
        ? hashPassword(payload.password)
        : current.password_hash,
    });
    await sheetsApi.update(sheets.employees, current._rowNumber, item);
    json(req, res, 200, { ok: true, data: item });
    return;
  }

  if (req.method === 'DELETE') {
    await sheetsApi.remove(sheets.employees, current._rowNumber);
    json(req, res, 200, { ok: true });
    return;
  }

  json(req, res, 405, { ok: false, message: 'Method tidak didukung.' });
}

async function attendanceApi(req, res, attendanceId) {
  if (req.method === 'GET') {
    json(req, res, 200, {
      ok: true,
      data: await sheetsApi.list(sheets.attendance),
    });
    return;
  }

  const existing = await sheetsApi.list(sheets.attendance);

  if (req.method === 'POST') {
    const payload = await readBody(req);
    requireFields(payload, ['employee_id', 'nama', 'tipe']);
    const now = jakartaNowParts();
    const item = normalizeAttendance(payload, {
      id: payload.id || id('att'),
      tanggal: now.date,
      jam: now.time,
    });
    await sheetsApi.append(sheets.attendance, item);
    json(req, res, 201, { ok: true, data: item });
    return;
  }

  const current = existing.find((item) => item.id === attendanceId);
  if (!current) {
    json(req, res, 404, { ok: false, message: 'Presensi tidak ditemukan.' });
    return;
  }

  if (req.method === 'PUT') {
    const payload = await readBody(req);
    const item = normalizeAttendance(payload, current);
    await sheetsApi.update(sheets.attendance, current._rowNumber, item);
    json(req, res, 200, { ok: true, data: item });
    return;
  }

  if (req.method === 'DELETE') {
    await sheetsApi.remove(sheets.attendance, current._rowNumber);
    json(req, res, 200, { ok: true });
    return;
  }

  json(req, res, 405, { ok: false, message: 'Method tidak didukung.' });
}

function normalizeEmployee(payload, fallback = {}) {
  return {
    id: valueOr(payload.id, fallback.id),
    nama: valueOr(payload.nama, fallback.nama),
    username: valueOr(payload.username, fallback.username),
    password_hash: valueOr(payload.password_hash, fallback.password_hash),
    lokasi_toko_lat: valueOr(payload.lokasi_toko_lat, fallback.lokasi_toko_lat),
    lokasi_toko_lng: valueOr(payload.lokasi_toko_lng, fallback.lokasi_toko_lng),
    status: valueOr(payload.status, fallback.status, 'aktif'),
  };
}

function normalizeAttendance(payload, fallback = {}) {
  return {
    id: valueOr(payload.id, fallback.id),
    employee_id: valueOr(payload.employee_id, fallback.employee_id),
    nama: valueOr(payload.nama, fallback.nama),
    tanggal: valueOr(payload.tanggal, fallback.tanggal),
    jam: valueOr(payload.jam, fallback.jam),
    tipe: valueOr(payload.tipe, fallback.tipe, 'Masuk'),
    latitude: valueOr(payload.latitude, fallback.latitude),
    longitude: valueOr(payload.longitude, fallback.longitude),
    jarak: valueOr(payload.jarak, fallback.jarak),
    status: valueOr(payload.status, fallback.status, 'Valid'),
  };
}

function valueOr(value, fallback, defaultValue = '') {
  const normalized = String(value ?? '').trim();
  if (normalized) {
    return normalized;
  }
  return String(fallback ?? defaultValue ?? '').trim();
}

function jakartaNowParts() {
  const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return {
    date: now.toISOString().slice(0, 10),
    time: now.toISOString().slice(11, 19),
  };
}

function nextEmployeeId(existing) {
  const next =
    existing
      .map((item) => Number.parseInt(item.id, 10))
      .filter(Number.isFinite)
      .reduce((max, value) => Math.max(max, value), 0) + 1;
  return String(next).padStart(3, '0');
}

async function repairEmployeeIds() {
  const employees = await sheetsApi.list(sheets.employees, {
    includeBlankId: true,
  });
  let next =
    employees
      .map((item) => Number.parseInt(item.id, 10))
      .filter(Number.isFinite)
      .reduce((max, value) => Math.max(max, value), 0) + 1;

  for (const employee of employees) {
    const hasData = Boolean(
      employee.nama ||
        employee.username ||
        employee.password_hash ||
        employee.lokasi_toko_lat ||
        employee.lokasi_toko_lng ||
        employee.status,
    );
    const idText = String(employee.id || '').trim();
    const numericId = Number.parseInt(idText, 10);
    const needsPaddedId =
      /^\d+$/.test(idText) && idText.length < 3;
    if ((!needsPaddedId && idText) || !hasData) {
      continue;
    }

    const repairedId = needsPaddedId
      ? String(numericId).padStart(3, '0')
      : String(next).padStart(3, '0');
    const repaired = normalizeEmployee({
      ...employee,
      id: repairedId,
      status: 'aktif',
    });
    if (!needsPaddedId) {
      next += 1;
    }
    await sheetsApi.update(sheets.employees, employee._rowNumber, repaired);
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(publicDir, requested));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'content-type': contentType(filePath),
      ...corsHeaders(req),
    });
    res.end(content);
  });
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  return (
    {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.svg': 'image/svg+xml',
    }[ext] || 'application/octet-stream'
  );
}
