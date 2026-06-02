const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const localOrigins = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);
const tokenPath = path.resolve(__dirname, '..', '.admin-token');

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
  const token = adminToken();
  if (!token || token.length < 16) {
    const error = new Error(
      'Token admin belum tersedia atau terlalu pendek. Minimal 16 karakter.',
    );
    error.statusCode = 503;
    throw error;
  }

  const expected = `Bearer ${token}`;
  const actual = req.headers.authorization || '';
  if (!safeEqual(actual, expected)) {
    const error = new Error('Token admin tidak valid.');
    error.statusCode = 401;
    throw error;
  }
}

function adminToken() {
  if (process.env.ADMIN_API_TOKEN) {
    return process.env.ADMIN_API_TOKEN;
  }

  if (fs.existsSync(tokenPath)) {
    return fs.readFileSync(tokenPath, 'utf8').trim();
  }

  const token = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokenPath, `${token}\n`, { flag: 'wx' });
  return token;
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
  adminToken,
  canBootstrapToken,
  hashPassword,
  id,
  json,
  readBody,
  readCredentials,
  requireAdmin,
  requireFields,
  routeParts,
};
