const ADMIN_SESSION_PREFIX = 'NKJC_ADMIN_SESSION_';
const ADMIN_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_LOGIN_ATTEMPT_TTL_SECONDS = 15 * 60;
const ADMIN_MAX_LOGIN_ATTEMPTS = 10;

function serveAdminPanel_() {
  return HtmlService.createTemplateFromFile('admin')
    .evaluate()
    .setTitle('Admin Transaksi | NK JAYA CELL')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function includeAdminAsset_(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function loginAdmin(username, password) {
  const properties = PropertiesService.getScriptProperties();
  const configuredUsername = properties.getProperty('ADMIN_USERNAME');
  const configuredPassword = properties.getProperty('ADMIN_PASSWORD');
  if (!configuredUsername || !configuredPassword) {
    throw new Error('Kredensial admin belum dikonfigurasi di Script Properties.');
  }

  const normalizedUsername = String(username || '').trim().toLowerCase();
  const attemptCache = CacheService.getScriptCache();
  const attemptKey = `admin_login_${sha256Hex_(normalizedUsername)}`;
  const attempts = Number(attemptCache.get(attemptKey) || 0);
  if (attempts >= ADMIN_MAX_LOGIN_ATTEMPTS) {
    throw new Error('Terlalu banyak percobaan login. Coba lagi setelah 15 menit.');
  }

  if (normalizedUsername !== configuredUsername.trim().toLowerCase() ||
      String(password || '') !== configuredPassword) {
    attemptCache.put(attemptKey, String(attempts + 1), ADMIN_LOGIN_ATTEMPT_TTL_SECONDS);
    throw new Error('Username atau password salah.');
  }

  attemptCache.remove(attemptKey);
  const now = Date.now();
  removeExpiredAdminSessions_(properties, now);
  const token = Utilities.getUuid();
  properties.setProperty(ADMIN_SESSION_PREFIX + token, JSON.stringify({
    username: configuredUsername,
    expiresAt: now + ADMIN_SESSION_TTL_MS
  }));
  return { token, expiresAt: now + ADMIN_SESSION_TTL_MS };
}

function validateAdminSession(token) {
  return Boolean(readAdminSession_(token));
}

function logoutAdmin(token) {
  const sessionToken = String(token || '');
  if (!/^[0-9a-f-]{36}$/i.test(sessionToken)) return false;
  PropertiesService.getScriptProperties().deleteProperty(ADMIN_SESSION_PREFIX + sessionToken);
  return true;
}

function getAdminSheetCsv(token, source) {
  if (!readAdminSession_(token)) throw new Error('Sesi admin tidak valid atau telah kedaluwarsa.');
  const requestedSource = String(source || '').trim().toUpperCase();
  const sheetName = adminSheetName_(requestedSource);
  if (!sheetName) throw new Error('Sumber data admin tidak dikenal.');
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
  return sheet.getDataRange().getDisplayValues().map(row => row.map(csvEscape_).join(',')).join('\r\n');
}

function updateAdminTransactionStatus(token, source, transactionId, status) {
  if (!readAdminSession_(token)) throw new Error('Sesi admin tidak valid atau telah kedaluwarsa.');

  const requestedSource = String(source || '').trim().toUpperCase();
  if (requestedSource !== 'ARSIP' && requestedSource !== 'TRANSFER') {
    throw new Error('Sumber transaksi untuk perubahan status tidak dikenal.');
  }

  const normalizedStatus = String(status || '').trim().toUpperCase();
  if (!['PROSES', 'SUKSES', 'GAGAL'].includes(normalizedStatus)) {
    throw new Error('Status transaksi tidak valid.');
  }

  const normalizedId = normalizeAdminHeader_(transactionId);
  if (!normalizedId) throw new Error('ID transaksi wajib diisi.');

  const sheetName = adminSheetName_(requestedSource);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Sheet sedang diperbarui. Tunggu sebentar lalu coba lagi.');
  try {
    const values = sheet.getDataRange().getDisplayValues();
    if (!values.length) throw new Error(`Sheet "${sheetName}" kosong.`);

    const headers = values[0].map(normalizeAdminHeader_);
    const idColumn = headers.findIndex(header => ['IDTRANSAKSI', 'IDTRX', 'ID'].includes(header));
    const statusColumn = headers.findIndex(header => ['STATUS', 'STATUSTRANSAKSI'].includes(header));
    if (idColumn < 0) throw new Error(`Kolom ID transaksi tidak ditemukan pada sheet "${sheetName}".`);
    if (statusColumn < 0) throw new Error(`Kolom status tidak ditemukan pada sheet "${sheetName}".`);
    const webStatusColumn = requestedSource === 'ARSIP' ? 6 : 9;
    if (statusColumn !== webStatusColumn) {
      throw new Error(`Kolom status sheet "${sheetName}" harus berada di kolom ${requestedSource === 'ARSIP' ? 'G' : 'J'} agar sesuai dengan pembacaan status di web.`);
    }

    const matchingRows = [];
    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      if (normalizeAdminHeader_(values[rowIndex][idColumn]) === normalizedId) matchingRows.push(rowIndex + 1);
    }
    if (!matchingRows.length) throw new Error(`Transaksi ${transactionId} tidak ditemukan di sheet "${sheetName}". Muat ulang data.`);
    if (matchingRows.length > 1) throw new Error(`ID ${transactionId} muncul lebih dari sekali di sheet "${sheetName}"; status tidak diubah untuk menghindari salah transaksi.`);

    sheet.getRange(matchingRows[0], statusColumn + 1).setValue(normalizedStatus);
    SpreadsheetApp.flush();
    return { source: requestedSource, id: String(transactionId), status: normalizedStatus };
  } finally {
    lock.releaseLock();
  }
}

function adminSheetName_(source) {
  const sheetNames = { ARSIP: 'ARSIP', TRANSFER: 'Transfer', PLN: PropertiesService.getScriptProperties().getProperty('ADMIN_SHEET_PLN') || 'NAMA PLN' };
  return sheetNames[source] || '';
}

function normalizeAdminHeader_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function readAdminSession_(token) {
  const sessionToken = String(token || '');
  if (!/^[0-9a-f-]{36}$/i.test(sessionToken)) return null;
  const properties = PropertiesService.getScriptProperties();
  const key = ADMIN_SESSION_PREFIX + sessionToken;
  const serialized = properties.getProperty(key);
  if (!serialized) return null;

  let session;
  try {
    session = JSON.parse(serialized);
  } catch (error) {
    console.error('Sesi admin tersimpan dalam format yang tidak valid:', error);
    properties.deleteProperty(key);
    return null;
  }
  if (!session.expiresAt || Number(session.expiresAt) <= Date.now()) {
    properties.deleteProperty(key);
    return null;
  }

  session.expiresAt = Date.now() + ADMIN_SESSION_TTL_MS;
  properties.setProperty(key, JSON.stringify(session));
  return session;
}

function removeExpiredAdminSessions_(properties, now) {
  const stored = properties.getProperties();
  Object.keys(stored).forEach(key => {
    if (!key.startsWith(ADMIN_SESSION_PREFIX)) return;
    try {
      const session = JSON.parse(stored[key]);
      if (!session.expiresAt || Number(session.expiresAt) <= now) properties.deleteProperty(key);
    } catch (error) {
      console.error('Menghapus sesi admin tersimpan yang tidak valid:', error);
      properties.deleteProperty(key);
    }
  });
}

function csvEscape_(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function sha256Hex_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  ).map(byte => (byte & 0xff).toString(16).padStart(2, '0')).join('');
}
