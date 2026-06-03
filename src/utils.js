const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const localOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);
const loginPath = path.resolve(__dirname, '..', '.admin-login.json');
const adminSessions = new Map();
const sessionLifetimeMs =
  Number(process.env.ADMIN_SESSION_HOURS || 12) * 60 * 60 * 1000;

function json(req, res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...corsHeaders(req),
  });
  res.end(body);
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  const configured = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const allowed = new Set([...localOrigins, ...configured]);
  const headers = {
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
    vary: 'Origin',
  };

  if (!origin || allowed.has(origin) || isLocalOrigin(origin)) {
    headers['access-control-allow-origin'] = origin || 'http://localhost:3000';
  }

  return headers;
}

function requireAdmin(req) {
  const actual = req.headers.authorization || '';
  if (!actual.startsWith('Bearer ')) {
    const error = new Error('Sesi login admin tidak ditemukan.');
    error.statusCode = 401;
    throw error;
  }

  const token = actual.slice('Bearer '.length).trim();
  const session = adminSessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    adminSessions.delete(token);
    const error = new Error('Sesi login admin sudah habis. Silakan login ulang.');
    error.statusCode = 401;
    throw error;
  }

  session.expiresAt = Date.now() + sessionLifetimeMs;
}

function verifyAdminLogin(username, password) {
  const requestedUsername = String(username || '').trim();
  const requestedHash = hashPassword(password);
  const credentials = readAdminLogin();
  const user = credentials.users.find((item) =>
    safeEqual(requestedUsername, item.username),
  );
  return Boolean(user && safeEqual(requestedHash, user.passwordHash));
}

function createAdminSession(username) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + sessionLifetimeMs;
  adminSessions.set(token, {
    username,
    expiresAt,
    createdAt: Date.now(),
  });

  return {
    token,
    username,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

function destroyAdminSession(req) {
  const actual = req.headers.authorization || '';
  if (actual.startsWith('Bearer ')) {
    adminSessions.delete(actual.slice('Bearer '.length).trim());
  }
}

function adminSessionInfo(req) {
  requireAdmin(req);
  const token = (req.headers.authorization || '').slice('Bearer '.length).trim();
  const session = adminSessions.get(token);
  return {
    username: session.username,
    expiresAt: new Date(session.expiresAt).toISOString(),
  };
}

function listAdminUsers() {
  return readAdminLogin().users.map((user) => ({
    username: user.username,
    created_at: user.created_at || '',
    source: user.source || 'file',
  }));
}

function addAdminUser(payload) {
  const username = normalizeAdminUsername(payload.username);
  const password = String(payload.password || '');
  if (!username) {
    throw new Error('Username admin wajib diisi.');
  }
  if (password.length < 6) {
    throw new Error('Password admin minimal 6 karakter.');
  }

  const credentials = readAdminLogin();
  if (!credentials.writable) {
    throw new Error(
      'Akun admin dari environment variable tidak bisa diubah lewat UI. Tambahkan lewat ADMIN_USERS_JSON di hosting.',
    );
  }
  if (credentials.users.some((user) => user.username === username)) {
    throw new Error('Username admin sudah ada.');
  }

  const users = [
    ...credentials.users,
    {
      username,
      passwordHash: hashPassword(password),
      created_at: new Date().toISOString(),
      source: 'file',
    },
  ];
  writeAdminUsers(users);
  return listAdminUsers();
}

function removeAdminUser(username, currentUsername) {
  const normalized = normalizeAdminUsername(username);
  const credentials = readAdminLogin();
  if (!credentials.writable) {
    throw new Error(
      'Akun admin dari environment variable tidak bisa dihapus lewat UI.',
    );
  }
  if (normalized === currentUsername) {
    throw new Error('Akun admin yang sedang login tidak boleh dihapus.');
  }
  if (credentials.users.length <= 1) {
    throw new Error('Minimal harus ada 1 akun admin.');
  }
  if (!credentials.users.some((user) => user.username === normalized)) {
    throw new Error('Akun admin tidak ditemukan.');
  }

  writeAdminUsers(credentials.users.filter((user) => user.username !== normalized));
  return listAdminUsers();
}

function readAdminLogin() {
  if (process.env.ADMIN_USERS_JSON) {
    const parsed = JSON.parse(process.env.ADMIN_USERS_JSON);
    return {
      users: normalizeAdminUsers(parsed),
      writable: false,
    };
  }

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;

  if (username && (password || passwordHash)) {
    return {
      users: [
        {
          username: normalizeAdminUsername(username),
          passwordHash: passwordHash || hashPassword(password),
          source: 'env',
        },
      ],
      writable: false,
    };
  }

  if (!fs.existsSync(loginPath)) {
    throw new Error(
      'Credential login admin belum tersedia. Buat .admin-login.json atau isi ADMIN_USERNAME dan ADMIN_PASSWORD.',
    );
  }

  const data = JSON.parse(fs.readFileSync(loginPath, 'utf8'));
  const users = normalizeAdminUsers(data);
  if (!users.length) {
    throw new Error('.admin-login.json wajib berisi akun admin yang valid.');
  }

  return {
    users,
    writable: true,
  };
}

function normalizeAdminUsers(data) {
  const rawUsers = Array.isArray(data) ? data : data.admins || [data];
  return rawUsers
    .map((item) => {
      const passwordHash =
        item.password_hash ||
        item.passwordHash ||
        (item.password ? hashPassword(item.password) : '');
      return {
        username: normalizeAdminUsername(item.username),
        passwordHash,
        created_at: item.created_at || item.createdAt || '',
        source: item.source || 'file',
      };
    })
    .filter((item) => item.username && item.passwordHash);
}

function normalizeAdminUsername(username) {
  return String(username || '').trim();
}

function writeAdminUsers(users) {
  const body = JSON.stringify(
    {
      admins: users.map((user) => ({
        username: user.username,
        password_hash: user.passwordHash,
        created_at: user.created_at || '',
      })),
    },
    null,
    2,
  );
  fs.writeFileSync(loginPath, `${body}\n`);
}

function canBootstrapToken(req) {
  const origin = req.headers.origin;
  const host = req.headers.host || '';
  const remoteAddress = req.socket.remoteAddress || '';

  const localHost =
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1:') ||
    host.startsWith('[::1]:');
  const localOrigin = !origin || localOrigins.has(origin) || isLocalOrigin(origin);
  const localSocket =
    remoteAddress === '127.0.0.1' ||
    remoteAddress === '::1' ||
    remoteAddress === '::ffff:127.0.0.1';

  return localHost && localOrigin && localSocket;
}

function isLocalOrigin(origin) {
  if (!origin) {
    return false;
  }

  try {
    const parsed = new URL(origin);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request terlalu besar.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('JSON request tidak valid.'));
      }
    });
    req.on('error', reject);
  });
}

function routeParts(url) {
  return new URL(url, 'http://localhost').pathname.split('/').filter(Boolean);
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => !String(payload[field] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(`Field wajib diisi: ${missing.join(', ')}.`);
  }
}

function readCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return validateCredentials(JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON));
  }

  const defaultPath = path.resolve(
    __dirname,
    '..',
    'backend-app-key.json',
  );
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH || defaultPath;

  if (!fs.existsSync(credentialsPath)) {
    throw new Error(
      'Credential backend-app tidak ditemukan. Taruh key JSON di backend-app-key.json, atau isi GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_CREDENTIALS_PATH.',
    );
  }

  return validateCredentials(JSON.parse(fs.readFileSync(credentialsPath, 'utf8')));
}

function validateCredentials(credentials) {
  const expectedEmail =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    'backend-app@gen-lang-client-0684358981.iam.gserviceaccount.com';

  if (credentials.client_email !== expectedEmail) {
    throw new Error(
      `Credential Google harus memakai ${expectedEmail}, bukan ${credentials.client_email || 'email kosong'}.`,
    );
  }

  return credentials;
}

module.exports = {
  corsHeaders,
  adminSessionInfo,
  addAdminUser,
  canBootstrapToken,
  createAdminSession,
  destroyAdminSession,
  hashPassword,
  id,
  json,
  listAdminUsers,
  readBody,
  readCredentials,
  requireAdmin,
  requireFields,
  removeAdminUser,
  routeParts,
  verifyAdminLogin,
};
