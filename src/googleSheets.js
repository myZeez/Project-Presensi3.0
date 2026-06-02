const crypto = require('crypto');

const { readCredentials } = require('./utils');

const scope = 'https://www.googleapis.com/auth/spreadsheets';
const apiBase = 'https://sheets.googleapis.com/v4/spreadsheets';

let cachedToken = null;
const ensuredSheets = new Set();

function spreadsheetId() {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) {
    throw new Error('GOOGLE_SPREADSHEET_ID belum diisi.');
  }
  return id;
}

async function request(path, options = {}) {
  const token = await accessToken();
  const response = await fetch(`${apiBase}/${spreadsheetId()}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.error?.message || `Google Sheets error ${response.status}`);
  }
  return data;
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const credentials = readCredentials();
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt(
    {
      iss: credentials.client_email,
      scope,
      aud: credentials.token_uri,
      exp: now + 3600,
      iat: now,
    },
    credentials.private_key,
  );

  const response = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.error_description || data.error || 'Gagal mengambil token Google.',
    );
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

function jwt(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey);
  return `${input}.${base64Url(signature)}`;
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function rowToObject(row, columns, rowNumber) {
  const item = { _rowNumber: rowNumber };
  columns.forEach((column, index) => {
    item[column] = row[index] ?? '';
  });
  return item;
}

function objectToRow(item, columns) {
  return columns.map((column) => item[column] ?? '');
}

async function list(sheet) {
  await ensureSheet(sheet);
  const data = await request(`/values/${encodeURIComponent(sheet.range)}`);
  const rows = data.values || [];
  return rows
    .map((row, index) => rowToObject(row, sheet.columns, index + 2))
    .filter((row) => String(row.id || '').trim());
}

async function append(sheet, item) {
  await ensureSheet(sheet);
  await request(
    `/values/${encodeURIComponent(`${sheet.title}!A:${columnName(sheet.columns.length)}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({ values: [objectToRow(item, sheet.columns)] }),
    },
  );
  return item;
}

async function update(sheet, rowNumber, item) {
  await ensureSheet(sheet);
  const range = `${sheet.title}!A${rowNumber}:${columnName(sheet.columns.length)}${rowNumber}`;
  await request(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: 'PUT',
    body: JSON.stringify({ values: [objectToRow(item, sheet.columns)] }),
  });
  return item;
}

async function remove(sheet, rowNumber) {
  await ensureSheet(sheet);
  const sheetId = await sheetNumericId(sheet.title);
  await request(':batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    }),
  });
}

async function ensureSheet(sheet) {
  if (ensuredSheets.has(sheet.title)) {
    return;
  }

  const metadata = await request('?fields=sheets.properties');
  const exists = metadata.sheets
    ?.map((item) => item.properties)
    .some((properties) => properties.title === sheet.title);

  if (!exists) {
    await request(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: sheet.title,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: sheet.columns.length,
                  frozenRowCount: 1,
                },
              },
            },
          },
        ],
      }),
    });
  }

  const headerRange = `${sheet.title}!A1:${columnName(sheet.columns.length)}1`;
  await request(`/values/${encodeURIComponent(headerRange)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [sheet.columns] }),
  });

  ensuredSheets.add(sheet.title);
}

async function sheetNumericId(title) {
  const data = await request('?fields=sheets.properties');
  const found = data.sheets
    ?.map((item) => item.properties)
    .find((properties) => properties.title === title);
  if (!found) {
    throw new Error(`Sheet "${title}" tidak ditemukan.`);
  }
  return found.sheetId;
}

function columnName(number) {
  let name = '';
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

module.exports = {
  append,
  ensureSheet,
  list,
  remove,
  update,
};
