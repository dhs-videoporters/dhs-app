// =====================================================================
// FACTURAS DE PROVEEDORES (Ángel 26/10/2026): Hipersuministros y demás. Los PDF ya los deja en Drive el script
// «DHS - Facturas a Drive» (nombre: AAAA-MM-DD_proveedor_cuenta_numero.pdf). Aquí se leen (texto con el OCR de Drive),
// se saca número, fecha, total, vencimiento y forma de pago, y se guardan en Firestore (dhs_proveedores, id = archivo de Drive).
// Lo que no se entiende bien queda marcado «revisar» (nunca se inventa un importe).
// Va en el Apps Script «Programa DHS». Se llama desde la app (acción leerProveedores) y cada día con la copia.
// =====================================================================
const PROV_MAX_POR_VEZ = 12;   // OCR ~3-5 s por PDF

function provFS_(proyecto) { return 'https://firestore.googleapis.com/v1/projects/' + proyecto + '/databases/(default)/documents'; }
function provPedir_(proyecto, url, op) {
  const r = UrlFetchApp.fetch(url, Object.assign({ headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': proyecto },
    contentType: 'application/json', muteHttpExceptions: true }, op || {}));
  if (r.getResponseCode() >= 300) throw new Error(r.getResponseCode() + ' ' + r.getContentText().slice(0, 200));
  return JSON.parse(r.getContentText() || '{}');
}
// Carpeta(s) donde están las facturas: la de cualquier PDF con nombre AAAA-MM-DD_proveedor_…
function provArchivos_() {
  const it = DriveApp.searchFiles("mimeType = 'application/pdf' and trashed = false and title contains '_'");
  const L = [];
  while (it.hasNext() && L.length < 2000) { const f = it.next(); if (/^\d{4}-\d{2}-\d{2}_[a-z0-9]+_/i.test(f.getName())) L.push(f); }
  return L;
}
function provYaLeidos_(proyecto) {
  const s = {}; let tk = '';
  do {
    const r = provPedir_(proyecto, provFS_(proyecto) + '/dhs_proveedores?pageSize=300&mask.fieldPaths=archivo' + (tk ? '&pageToken=' + encodeURIComponent(tk) : ''));
    (r.documents || []).forEach(d => s[d.name.split('/').pop()] = true); tk = r.nextPageToken || '';
  } while (tk);
  return s;
}
function provTexto_(f) {
  const tok = ScriptApp.getOAuthToken();
  const c = UrlFetchApp.fetch('https://www.googleapis.com/drive/v2/files/' + f.getId() + '/copy?ocr=true&ocrLanguage=es', {
    method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + tok }, muteHttpExceptions: true,
    payload: JSON.stringify({ title: 'tmp-ocr-' + f.getName(), mimeType: 'application/vnd.google-apps.document' }) });
  if (c.getResponseCode() >= 300) throw new Error('OCR ' + c.getResponseCode());
  const id = JSON.parse(c.getContentText()).id;
  try {
    return UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + id + '/export?mimeType=text/plain', { headers: { Authorization: 'Bearer ' + tok } }).getContentText();
  } finally { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} }
}
const provNum_ = s => Number(String(s).replace(/\./g, '').replace(',', '.'));
const provFecha_ = s => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; };
function provLeer_(nombre, t) {
  const p = nombre.replace(/\.pdf$/i, '').split('_');   // AAAA-MM-DD, proveedor, cuenta, número
  const o = { proveedor: (p[1] || '').toLowerCase(), cuenta: p[2] || '', numero: p.slice(3).join('_') || '', recibida: p[0], revisar: [] };
  const n = /N[uú]mero\s*[:\n ]\s*([A-Z0-9\-\/]+)/i.exec(t); if (n && !o.numero) o.numero = n[1];
  const fe = /(?:Invoice date|Data factura|Fecha factura|Fecha)\s*[:\n ]\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(t); o.fecha = fe ? provFecha_(fe[1]) : o.recibida;
  const eur = []; let m; const re = /(-?[\d.]+,\d{2})\s*EUR/g; while ((m = re.exec(t))) eur.push(provNum_(m[1]));
  o.total = eur.length ? eur[eur.length - 1] : null;
  const base = /Base imposable|Base imponible/i.test(t) && eur.length >= 3 ? eur[0] : null; if (base !== null) o.base = base;
  o.abono = /abonament|abono|rectificativa/i.test(t);
  // Vencimientos: «S'ha acordat el següent venciment» / «vencimiento» seguido de fecha e importe
  o.vencimientos = [];
  const iv = t.search(/venciment|vencimiento/i);
  if (iv >= 0) { const tr = t.slice(iv, iv + 400), rv = /(\d{1,2}\/\d{1,2}\/\d{4})\s+(-?[\d.]+,\d{2})/g; while ((m = rv.exec(tr))) o.vencimientos.push({ fecha: provFecha_(m[1]), importe: provNum_(m[2]) }); }
  const dias = /(\d{1,3})\s*(?:dies|días|dias)/i.exec(t); o.plazoDias = dias ? Number(dias[1]) : null;
  if (!o.vencimientos.length && o.total !== null) {
    if (o.plazoDias !== null) { const d = new Date(o.fecha + 'T12:00:00'); d.setDate(d.getDate() + o.plazoDias); o.vencimientos.push({ fecha: Utilities.formatDate(d, 'Europe/Madrid', 'yyyy-MM-dd'), importe: o.total }); }
    else o.revisar.push('sin vencimiento');
  }
  o.vence = o.vencimientos.length ? o.vencimientos[0].fecha : '';
  o.forma = /Domiciliaci[oó]n|SEPA|Rebut|Recibo/i.test(t) ? 'domiciliada' : (/Transfer[eè]ncia|Transferencia/i.test(t) ? 'transferencia' : (/Contado|Efectiu|Efectivo|Tarjeta|Targeta/i.test(t) ? 'contado' : ''));
  if (o.total === null) o.revisar.push('sin total');
  if (!o.forma) o.revisar.push('sin forma de pago');
  if (o.abono && o.total > 0) o.total = -o.total;
  const nom = /^\s*([^\n]{3,60}?(?:S\.?L\.?U?|S\.?A\.?)\b)/im.exec(t); o.proveedorNombre = nom ? nom[1].trim() : o.proveedor;
  return o;
}
function provAFS_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(provAFS_) } };
  if (typeof v === 'object') { const f = {}; Object.keys(v).forEach(k => f[k] = provAFS_(v[k])); return { mapValue: { fields: f } }; }
  return { stringValue: String(v) };
}
// Lee las facturas nuevas (como mucho PROV_MAX_POR_VEZ) y las guarda. Devuelve cuántas quedan.
function leerFacturasProveedores_(proyecto) {
  const ya = provYaLeidos_(proyecto), nuevas = provArchivos_().filter(f => !ya[f.getId()]);
  const hechas = [], fallos = [];
  nuevas.slice(0, PROV_MAX_POR_VEZ).forEach(f => {
    let o;
    try { o = provLeer_(f.getName(), provTexto_(f)); } catch (e) { o = provLeer_(f.getName(), ''); o.revisar.push('no se ha podido leer el PDF'); fallos.push(f.getName()); }
    Object.assign(o, { archivo: f.getId(), archivoNombre: f.getName(), url: f.getUrl(), estado: 'pendiente', leida: new Date().toISOString() });
    o.revisar = o.revisar.join(', ');
    const fields = {}; Object.keys(o).forEach(k => fields[k] = provAFS_(o[k]));
    provPedir_(proyecto, provFS_(proyecto) + '/dhs_proveedores/' + f.getId(), { method: 'patch', payload: JSON.stringify({ fields: fields }) });
    hechas.push(f.getName());
  });
  return { leidas: hechas.length, quedan: Math.max(0, nuevas.length - hechas.length), fallos: fallos };
}
// Para ejecutar a mano desde el editor (oficial)
function leerFacturasProveedores() { Logger.log(JSON.stringify(leerFacturasProveedores_('dhs-camaras'))); }
