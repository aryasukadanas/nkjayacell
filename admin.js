const ADMIN_STORAGE_KEY = 'nkjc_admin_local_edits_v1';
const ADMIN_PASSKEY_KEY = 'nkjc_admin_passkey_v1';
const statusNormalize = value => String(value || '').trim().toUpperCase();
const normalizeHeader = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const elements = {
    authGate: document.getElementById('auth-gate'),
    authTitle: document.getElementById('auth-title'),
    authDescription: document.getElementById('auth-description'),
    authButton: document.getElementById('auth-button'),
    authButtonLabel: document.getElementById('auth-button-label'),
    authMessage: document.getElementById('auth-message'),
    app: document.getElementById('admin-app'),
    rows: document.getElementById('transaction-rows'),
    dataState: document.getElementById('data-state'),
    emptyState: document.getElementById('empty-state'),
    reportRangeLabel: document.getElementById('report-range-label'),
    dialog: document.getElementById('edit-dialog'),
    editForm: document.getElementById('edit-form'),
    editFields: document.getElementById('edit-fields')
};

let transactions = [];
let activeEdit = null;
let reportRange = { from: startOfDay(new Date()), to: endOfDay(new Date()) };
let bluetoothPrinter = null;

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === '"') {
            if (quoted && text[index + 1] === '"') {
                field += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            row.push(field.trim());
            field = '';
        } else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && text[index + 1] === '\n') index += 1;
            row.push(field.trim());
            if (row.some(value => value !== '')) rows.push(row);
            row = [];
            field = '';
        } else {
            field += character;
        }
    }
    row.push(field.trim());
    if (row.some(value => value !== '')) rows.push(row);
    return rows;
}

function uniqueFields(headers, values) {
    const used = new Set();
    return headers.map((header, index) => {
        const label = header.trim() || `Kolom ${index + 1}`;
        let key = normalizeHeader(label) || `FIELD${index}`;
        if (used.has(key)) key = `${key}_${index}`;
        used.add(key);
        return { label, key, value: String(values[index] ?? '') };
    });
}

function readOverrides() {
    try { return JSON.parse(localStorage.getItem(ADMIN_STORAGE_KEY) || '{}'); }
    catch { return {}; }
}

function applyOverrides(fields, override) {
    if (!override || typeof override !== 'object') return fields;
    return fields.map(field => Object.prototype.hasOwnProperty.call(override, field.key)
        ? { ...field, value: String(override[field.key]) }
        : field);
}

function getField(record, aliases) {
    for (const alias of aliases) {
        const name = normalizeHeader(alias);
        const field = record.fields.find(item => normalizeHeader(item.label) === name);
        if (field) return field.value;
    }
    return '';
}

function makeTransaction(source, index, fields, originalId) {
    const stableId = normalizeHeader(originalId) || `ROW${index}`;
    const key = `${source}:${stableId}`;
    const editedFields = applyOverrides(fields, readOverrides()[key]);
    const record = { source, key, fields: editedFields };
    record.id = getField(record, ['ID TRANSAKSI', 'ID TRX', 'ID']);
    record.dateText = getField(record, ['TANGGAL', 'WAKTU', 'DATE']);
    record.date = parseSheetDate(record.dateText);
    record.status = getField(record, ['STATUS', 'STATUS TRANSAKSI']);
    if (source === 'ARSIP') {
        record.contact = getField(record, ['NOMOR', 'NOMOR HP', 'TARGET', 'ID PLN', 'IDPEL']);
        record.product = getField(record, ['PRODUK', 'NAMA PRODUK', 'KETERANGAN']);
        record.customer = '';
        record.amount = parseAmount(getField(record, ['TOTAL TRANSFER', 'TOTAL BAYAR', 'TRANSFER', 'JUMLAH', 'HARGA', 'HARGA ASLI']));
        record.profit = parseAmount(getField(record, ['TOTAL TRANSFER'])) - parseAmount(getField(record, ['HARGA ASLI']));
    } else {
        record.contact = getField(record, ['NOMOR REKENING', 'NO REKENING', 'REKENING']);
        record.product = getField(record, ['PRODUK/BANK', 'BANK', 'BANK TUJUAN', 'KATEGORI']);
        record.customer = getField(record, ['NAMA', 'NAMA PEMILIK', 'PELANGGAN']);
        record.amount = parseAmount(getField(record, ['JUMLAH'])) || parseAmount(getField(record, ['TRANSFER', 'NOMINAL', 'NOMINAL TRANSFER'])) + parseAmount(getField(record, ['BIAYA', 'BIAYA ADMIN', 'ADMIN']));
        record.profit = parseAmount(getField(record, ['BIAYA', 'BIAYA ADMIN', 'ADMIN']));
    }
    return record;
}

function parseAmount(value) {
    const text = String(value ?? '').trim();
    const negative = /^\s*-/.test(text);
    const digits = text.replace(/[^0-9]/g, '');
    const amount = Number(digits) || 0;
    return negative ? -amount : amount;
}

function parseSheetDate(value) {
    const text = String(value || '').replace(/^'+/, '').trim();
    if (!text) return null;
    const localDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ ,T]+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?)?/);
    if (localDate) {
        const [, day, month, year, hour = '0', minute = '0', second = '0'] = localDate;
        const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
        return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(text.replace(/\s+WITA$/i, ''));
    return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatMoney(value) {
    return `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;
}

function formatDate(value) {
    const date = value instanceof Date ? value : parseSheetDate(value);
    return date ? date.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : (value || '-');
}

function localDateKey(date) {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

async function fetchSheet(url, source) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${source}: HTTP ${response.status}`);
    const data = parseCsv(await response.text());
    if (!data.length) return [];
    const headers = data[0];
    return data.slice(1).map((values, index) => {
        const fields = uniqueFields(headers, values);
        const originalId = fields.find(field => ['IDTRANSAKSI', 'IDTRX', 'ID'].includes(normalizeHeader(field.label)))?.value || '';
        return makeTransaction(source, index, fields, originalId);
    });
}

async function loadTransactions() {
    const state = document.getElementById('data-state');
    state.hidden = false;
    state.classList.remove('is-error');
    state.textContent = 'Menghubungkan ke Google Sheets...';
    try {
        const [arsip, transfer] = await Promise.all([
            fetchSheet(SHEET_ARSIP_URL, 'ARSIP'),
            fetchSheet(SHEET_TRANSFER_URL, 'TRANSFER')
        ]);
        transactions = [...arsip, ...transfer].sort((first, second) => (second.date?.getTime() || 0) - (first.date?.getTime() || 0));
        document.getElementById('last-sync').textContent = `Diperbarui ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · ${transactions.length} baris dimuat`;
        state.hidden = true;
        renderAll();
    } catch (error) {
        console.error('Gagal memuat data admin:', error);
        state.textContent = `Data gagal dimuat. Periksa koneksi atau URL CSV: ${error.message}`;
        state.classList.add('is-error');
    }
}

function isBetween(date, from, to) {
    if (!date) return false;
    return date >= from && date <= to;
}

function getFilteredTransactions() {
    const idSearch = document.getElementById('filter-id').value.trim().toLowerCase();
    const contactSearch = document.getElementById('filter-contact').value.replace(/\s/g, '').toLowerCase();
    const source = document.getElementById('filter-source').value;
    const exact = document.getElementById('filter-date').value;
    const fromValue = document.getElementById('filter-from').value;
    const toValue = document.getElementById('filter-to').value;
    const from = fromValue ? startOfDay(new Date(`${fromValue}T00:00:00`)) : null;
    const to = toValue ? endOfDay(new Date(`${toValue}T00:00:00`)) : null;
    return transactions.filter(record => {
        if (source !== 'all' && record.source !== source) return false;
        if (idSearch && !String(record.id).toLowerCase().includes(idSearch)) return false;
        if (contactSearch && !String(record.contact).replace(/\s/g, '').toLowerCase().includes(contactSearch)) return false;
        if (exact && (!record.date || localDateKey(record.date) !== exact)) return false;
        if (from && (!record.date || record.date < from)) return false;
        if (to && (!record.date || record.date > to)) return false;
        return true;
    });
}

function statusClass(status) {
    const normalized = statusNormalize(status);
    if (normalized.includes('SUKSES') || normalized.includes('LUNAS') || normalized.includes('BERHASIL')) return 'success';
    if (normalized.includes('GAGAL') || normalized.includes('FAILED')) return 'failed';
    return 'pending';
}

function renderRows() {
    const filtered = getFilteredTransactions();
    document.getElementById('result-count').textContent = `${filtered.length.toLocaleString('id-ID')} transaksi`;
    elements.rows.innerHTML = filtered.map(record => {
        const edited = Boolean(readOverrides()[record.key]);
        const detail = record.customer ? `${record.product || '-'} · ${record.customer}` : (record.product || '-');
        return `<tr>
            <td>${escapeHtml(formatDate(record.date || record.dateText))}</td>
            <td class="mono">${escapeHtml(record.id || '-')}</td>
            <td><span class="source-badge ${record.source === 'TRANSFER' ? 'transfer' : ''}">${record.source}</span>${edited ? '<span class="local-badge">LOKAL</span>' : ''}</td>
            <td><div class="cell-title" title="${escapeHtml(detail)}">${escapeHtml(detail)}</div></td>
            <td class="mono">${escapeHtml(record.contact || '-')}</td>
            <td class="mono">${escapeHtml(formatMoney(record.amount))}</td>
            <td class="mono">${escapeHtml(formatMoney(record.profit))}</td>
            <td><span class="status-badge ${statusClass(record.status)}">${escapeHtml(record.status || 'PROSES')}</span></td>
            <td><div class="row-actions"><button class="icon-button" type="button" data-action="edit" data-key="${escapeHtml(record.key)}" title="Edit lokal" aria-label="Edit lokal"><i class="fas fa-pen"></i></button><button class="icon-button print-button" type="button" data-action="print" data-key="${escapeHtml(record.key)}" title="Cetak struk 58 mm" aria-label="Cetak struk"><i class="fas fa-print"></i></button></div></td>
        </tr>`;
    }).join('');
    elements.emptyState.hidden = filtered.length > 0;
}

function renderReport() {
    const reportRows = transactions.filter(record => isBetween(record.date, reportRange.from, reportRange.to));
    const profit = reportRows.reduce((sum, record) => sum + record.profit, 0);
    const volume = reportRows.reduce((sum, record) => sum + record.amount, 0);
    document.getElementById('metric-profit').textContent = formatMoney(profit);
    document.getElementById('metric-count').textContent = reportRows.length.toLocaleString('id-ID');
    document.getElementById('metric-volume').textContent = formatMoney(volume);
    const options = { day: '2-digit', month: 'short', year: 'numeric' };
    elements.reportRangeLabel.textContent = `${reportRange.from.toLocaleDateString('id-ID', options)} – ${reportRange.to.toLocaleDateString('id-ID', options)}`;
}

function renderAll() {
    renderRows();
    renderReport();
}

function selectPeriod(period) {
    document.querySelectorAll('.period-button').forEach(button => button.classList.toggle('is-active', button.dataset.period === period));
    const custom = document.getElementById('report-custom-range');
    custom.hidden = period !== 'custom';
    const today = startOfDay(new Date());
    if (period === 'today') reportRange = { from: today, to: endOfDay(today) };
    if (period === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        reportRange = { from: yesterday, to: endOfDay(yesterday) };
    }
    if (period === 'week') {
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - 6);
        reportRange = { from: weekStart, to: endOfDay(today) };
    }
    if (period === 'month') reportRange = { from: new Date(today.getFullYear(), today.getMonth(), 1), to: endOfDay(today) };
    if (period !== 'custom') renderReport();
}

function applyCustomReportRange() {
    const fromValue = document.getElementById('report-from').value;
    const toValue = document.getElementById('report-to').value;
    if (!fromValue || !toValue || fromValue > toValue) {
        window.alert('Pilih rentang tanggal yang valid.');
        return;
    }
    reportRange = { from: startOfDay(new Date(`${fromValue}T00:00:00`)), to: endOfDay(new Date(`${toValue}T00:00:00`)) };
    renderReport();
}

function openEdit(record) {
    activeEdit = record;
    elements.editFields.replaceChildren();
    record.fields.forEach(field => {
        const label = document.createElement('label');
        label.className = 'edit-field';
        const caption = document.createElement('span');
        caption.textContent = field.label;
        const input = document.createElement('input');
        input.type = 'text';
        input.name = field.key;
        input.value = field.value;
        input.autocomplete = 'off';
        label.append(caption, input);
        elements.editFields.append(label);
    });
    elements.dialog.showModal();
}

function saveLocalEdit(event) {
    event.preventDefault();
    if (!activeEdit) return;
    const overrides = readOverrides();
    const edited = {};
    elements.editForm.querySelectorAll('input[name]').forEach(input => { edited[input.name] = input.value; });
    const unchanged = activeEdit.fields.every(field => edited[field.key] === field.value);
    if (unchanged) delete overrides[activeEdit.key];
    else overrides[activeEdit.key] = edited;
    try {
        localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(overrides));
        elements.dialog.close();
        loadTransactions();
    } catch (error) {
        window.alert(`Edit lokal tidak dapat disimpan: ${error.message}`);
    }
}

function clearLocalEdits() {
    if (!Object.keys(readOverrides()).length) {
        window.alert('Belum ada edit lokal untuk dihapus.');
        return;
    }
    if (!window.confirm('Hapus semua edit lokal dan tampilkan kembali data asli dari sheet?')) return;
    localStorage.removeItem(ADMIN_STORAGE_KEY);
    loadTransactions();
}

function receiptText(record) {
    const rows = [
        'NK JAYA CELL',
        record.source === 'TRANSFER' ? 'STRUK BUKTI TRANSFER' : 'STRUK TRANSAKSI',
        statusNormalize(record.status) || 'DIPROSES',
        formatDate(record.date || record.dateText),
        '--------------------------------'
    ];
    const field = (label, value) => {
        const prefix = `${label}: `;
        const lines = [];
        let line = prefix;
        String(value || '-').split(/\s+/).forEach(word => {
            if (line.length > prefix.length && `${line} ${word}`.length > 32) {
                lines.push(line);
                line = `${' '.repeat(prefix.length)}${word}`;
            } else {
                line += `${line.endsWith(' ') ? '' : ' '}${word}`;
            }
        });
        lines.push(line);
        return lines;
    };
    rows.push(...field('ID TRX', record.id));
    if (record.source === 'TRANSFER') {
        rows.push(
            ...field('Bank Tujuan', record.product),
            ...field('No. Rekening', record.contact),
            ...field('Nama Penerima', record.customer),
            '--------------------------------',
            ...field('Nominal Transfer', formatMoney(parseAmount(getField(record, ['TRANSFER', 'NOMINAL', 'NOMINAL TRANSFER'])))),
            ...field('Biaya Admin', formatMoney(parseAmount(getField(record, ['BIAYA', 'BIAYA ADMIN', 'ADMIN'])))),
            '--------------------------------',
            ...field('TOTAL BAYAR', formatMoney(record.amount))
        );
    } else {
        const isToken = /TOKEN|PLN/i.test(`${record.product} ${getField(record, ['KATEGORI'])}`);
        rows.push(...field('Produk', record.product));
        rows.push(...field(isToken ? 'ID PLN' : 'ID/No. Target', getField(record, ['ID PLN', 'IDPEL', 'NOMOR METER', 'NOMOR', 'TARGET']) || record.contact));
        const customerName = getField(record, ['NAMA PELANGGAN', 'NAMA', 'PELANGGAN']);
        if (customerName) rows.push(...field('Nama', customerName));
        if (isToken) {
            const power = getField(record, ['TARIF/DAYA', 'TARIF DAYA', 'JUMLAH DAYA', 'DAYA']);
            const serial = getField(record, ['SERIAL NUMBER', 'NOMOR TOKEN', 'ANGKA TOKEN', 'TOKEN', 'SN']);
            if (power) rows.push(...field('Tarif/Daya', power));
            if (serial) rows.push(...field('Serial Token', serial));
        }
        rows.push('--------------------------------', ...field('TOTAL BAYAR', formatMoney(record.amount)));
    }
    rows.push('--------------------------------', 'Terima kasih');
    return rows.join('\n');
}

async function printRecord(record) {
    const text = receiptText(record);
    if ('bluetooth' in navigator) {
        try {
            if (!bluetoothPrinter) {
                const device = await navigator.bluetooth.requestDevice({
                    acceptAllDevices: true,
                    optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb', '000018f0-0000-1000-8000-00805f9b34fb']
                });
                const server = await device.gatt.connect();
                for (const service of await server.getPrimaryServices()) {
                    const characteristics = await service.getCharacteristics();
                    bluetoothPrinter = characteristics.find(item => item.properties.write || item.properties.writeWithoutResponse);
                    if (bluetoothPrinter) break;
                }
            }
            if (!bluetoothPrinter) throw new Error('Printer tidak menyediakan kanal tulis.');
            const receiptLines = text.split('\n');
            const escpos = `\x1B@\x1Ba\x01\x1BE\x01${receiptLines[0]}\x1BE\x00\n${receiptLines.slice(1).join('\n')}\n\n\n`;
            const bytes = new TextEncoder().encode(escpos);
            for (let offset = 0; offset < bytes.length; offset += 180) {
                const chunk = bytes.slice(offset, offset + 180);
                if (bluetoothPrinter.properties.writeWithoutResponse) await bluetoothPrinter.writeValueWithoutResponse(chunk);
                else await bluetoothPrinter.writeValue(chunk);
            }
            return;
        } catch (error) {
            bluetoothPrinter = null;
            console.warn('Cetak Bluetooth gagal, membuka dialog cetak:', error);
        }
    }
    const printWindow = window.open('', '_blank', 'width=420,height=720');
    if (!printWindow) {
        window.alert('Pop-up cetak diblokir. Izinkan pop-up, lalu coba lagi.');
        return;
    }
    const safeText = escapeHtml(text);
    printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Struk NK JAYA CELL</title><style>@page{size:58mm auto;margin:0}*{box-sizing:border-box}body{width:58mm;margin:0;padding:3mm;color:#111;background:#fff;font:11px/1.45 Arial,sans-serif}pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}pre:first-line{font-weight:bold;text-align:center}</style></head><body><pre>${safeText}</pre><script>window.onload=()=>{window.focus();window.print();window.close()}<\/script></body></html>`);
    printWindow.document.close();
}

function toBase64Url(bytes) {
    let binary = '';
    new Uint8Array(bytes).forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    return Uint8Array.from(atob(base64), character => character.charCodeAt(0));
}

function randomChallenge() {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    return challenge;
}

function passkeyConfig() {
    try { return JSON.parse(localStorage.getItem(ADMIN_PASSKEY_KEY) || 'null'); }
    catch { return null; }
}

function setAuthMessage(message) {
    elements.authMessage.textContent = message;
}

function showAuthMode() {
    const registered = Boolean(passkeyConfig());
    elements.authTitle.textContent = registered ? 'Buka panel transaksi' : 'Daftarkan biometrik admin';
    elements.authDescription.textContent = registered
        ? 'Gunakan biometrik atau passkey yang terdaftar pada perangkat ini.'
        : 'Daftarkan passkey perangkat ini. Autentikasi dilakukan dengan verifikasi tanda tangan passkey.';
    elements.authButtonLabel.textContent = registered ? 'Masuk dengan biometrik' : 'Daftarkan passkey perangkat';
}

function toDerRaw(signature) {
    const bytes = new Uint8Array(signature);
    let offset = 2;
    if (bytes[1] & 0x80) offset += (bytes[1] & 0x7f);
    if (bytes[offset] !== 0x02) throw new Error('Format tanda tangan passkey tidak dikenali.');
    const rLength = bytes[offset + 1];
    let r = bytes.slice(offset + 2, offset + 2 + rLength);
    offset += 2 + rLength;
    if (bytes[offset] !== 0x02) throw new Error('Format tanda tangan passkey tidak dikenali.');
    const sLength = bytes[offset + 1];
    let s = bytes.slice(offset + 2, offset + 2 + sLength);
    while (r.length > 32 && r[0] === 0) r = r.slice(1);
    while (s.length > 32 && s[0] === 0) s = s.slice(1);
    const raw = new Uint8Array(64);
    raw.set(r, 32 - r.length);
    raw.set(s, 64 - s.length);
    return raw;
}

async function registerPasskey() {
    if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
        throw new Error('Passkey perlu HTTPS/localhost dan browser yang mendukung WebAuthn.');
    }
    const challenge = randomChallenge();
    const userId = randomChallenge().slice(0, 16);
    const credential = await navigator.credentials.create({ publicKey: {
        challenge,
        rp: { name: 'NK JAYA CELL Admin', id: location.hostname },
        user: { id: userId, name: 'admin@nkjayacell.local', displayName: 'Admin NK JAYA CELL' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
        timeout: 60000,
        attestation: 'none'
    } });
    const publicKey = credential.response.getPublicKey?.();
    if (!publicKey) throw new Error('Browser tidak dapat membaca kunci publik passkey. Coba browser terbaru.');
    const config = { id: toBase64Url(credential.rawId), publicKey: toBase64Url(publicKey), createdAt: new Date().toISOString() };
    localStorage.setItem(ADMIN_PASSKEY_KEY, JSON.stringify(config));
    setAuthMessage('Passkey terdaftar pada perangkat ini.');
    unlockAdmin();
}

async function authenticatePasskey() {
    const config = passkeyConfig();
    if (!config) return registerPasskey();
    if (!window.isSecureContext || !navigator.credentials || !window.PublicKeyCredential) {
        throw new Error('Passkey perlu HTTPS/localhost dan browser yang mendukung WebAuthn.');
    }
    const challenge = randomChallenge();
    const assertion = await navigator.credentials.get({ publicKey: {
        challenge,
        rpId: location.hostname,
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(config.id) }],
        userVerification: 'required',
        timeout: 60000
    } });
    const clientDataBytes = new Uint8Array(assertion.response.clientDataJSON);
    const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));
    if (clientData.type !== 'webauthn.get' || clientData.challenge !== toBase64Url(challenge) || clientData.origin !== location.origin) {
        throw new Error('Tantangan autentikasi passkey tidak valid.');
    }
    const authenticatorData = new Uint8Array(assertion.response.authenticatorData);
    const expectedRpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(location.hostname)));
    if (authenticatorData.length < 37 || expectedRpIdHash.some((byte, index) => authenticatorData[index] !== byte)) {
        throw new Error('Passkey berasal dari domain yang berbeda.');
    }
    if (!(authenticatorData[32] & 0x01) || !(authenticatorData[32] & 0x04)) {
        throw new Error('Perangkat belum memverifikasi kehadiran dan biometrik pengguna.');
    }
    const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes));
    const signedData = new Uint8Array(authenticatorData.length + clientDataHash.length);
    signedData.set(authenticatorData);
    signedData.set(clientDataHash, authenticatorData.length);
    const key = await crypto.subtle.importKey('spki', fromBase64Url(config.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const signature = toDerRaw(assertion.response.signature);
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signedData);
    if (!valid) throw new Error('Verifikasi tanda tangan passkey gagal.');
    unlockAdmin();
}

function unlockAdmin() {
    elements.authGate.hidden = true;
    elements.app.hidden = false;
    sessionStorage.setItem('nkjc_admin_unlocked', '1');
    loadTransactions();
}

function lockAdmin() {
    sessionStorage.removeItem('nkjc_admin_unlocked');
    elements.app.hidden = true;
    elements.authGate.hidden = false;
    showAuthMode();
    setAuthMessage('');
}

function bindEvents() {
    elements.authButton.addEventListener('click', async () => {
        elements.authButton.disabled = true;
        setAuthMessage('Ikuti verifikasi pada perangkat...');
        try { await authenticatePasskey(); }
        catch (error) {
            console.error('Autentikasi passkey gagal:', error);
            setAuthMessage(error.name === 'NotAllowedError' ? 'Verifikasi dibatalkan atau tidak diizinkan.' : error.message || 'Autentikasi gagal.');
        } finally { elements.authButton.disabled = false; }
    });
    document.getElementById('lock-button').addEventListener('click', lockAdmin);
    document.getElementById('refresh-button').addEventListener('click', loadTransactions);
    document.getElementById('clear-edits-button').addEventListener('click', clearLocalEdits);
    document.getElementById('reset-filters').addEventListener('click', () => {
        ['filter-id', 'filter-contact', 'filter-date', 'filter-from', 'filter-to'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('filter-source').value = 'all';
        renderRows();
    });
    ['filter-id', 'filter-contact', 'filter-date', 'filter-from', 'filter-to', 'filter-source'].forEach(id => {
        document.getElementById(id).addEventListener('input', renderRows);
        document.getElementById(id).addEventListener('change', renderRows);
    });
    document.querySelectorAll('.period-button').forEach(button => button.addEventListener('click', () => selectPeriod(button.dataset.period)));
    document.getElementById('apply-report-range').addEventListener('click', applyCustomReportRange);
    elements.rows.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const record = transactions.find(item => item.key === button.dataset.key);
        if (!record) return;
        if (button.dataset.action === 'edit') openEdit(record);
        if (button.dataset.action === 'print') printRecord(record);
    });
    elements.editForm.addEventListener('submit', saveLocalEdit);
    document.getElementById('close-edit').addEventListener('click', () => elements.dialog.close());
    document.getElementById('cancel-edit').addEventListener('click', () => elements.dialog.close());
    elements.dialog.addEventListener('click', event => { if (event.target === elements.dialog) elements.dialog.close(); });
}

bindEvents();
showAuthMode();