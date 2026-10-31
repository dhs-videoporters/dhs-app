/**
 * DHS App — Copia de seguridad automática diaria (de lunes a viernes, a las 20:00).
 * Se instala UNA vez en script.google.com con la cuenta dhsvideoporters@gmail.com.
 * Guarda una copia completa de la base de datos (Firestore) en Google Drive y avisa por correo si falla.
 *
 * Instalación: pega este archivo, ejecuta la función "instalar" y acepta los permisos.
 */

// ---- Ajustes ----
const PROYECTO = 'dhs-camaras';          // OFICIAL desde el 25/10/2026 (antes 'dhs-pruebas')
const ENTORNO = 'oficial';               // 'pruebas' / 'oficial'
const CARPETA = 'DHS · Copias app';      // carpeta de Google Drive donde se guardan
const SEMANAS_A_GUARDAR = 12;            // las copias más antiguas se borran
const AVISAR_A = 'dhsvideoporters@gmail.com';
const HORA = 20;                         // de lunes a viernes a partir de las 20:00

const BASE = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO + '/databases/(default)/documents';

/** Ejecutar una sola vez: programa la copia de cada día laborable y hace una copia de prueba. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'copiaSemanal') ScriptApp.deleteTrigger(t); });
  [ScriptApp.WeekDay.MONDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.WEDNESDAY, ScriptApp.WeekDay.THURSDAY, ScriptApp.WeekDay.FRIDAY]
    .forEach(d => ScriptApp.newTrigger('copiaSemanal').timeBased().onWeekDay(d).atHour(HORA).create());
  copiaSemanal();
}

/** Hace la copia completa (de toda la base oficial: app, cámaras y cobros). Se ejecuta sola de lunes a viernes.
 *  31/10: rápida (las subcolecciones se piden de 50 en 50 a la vez; antes era una petición por documento y pasaba de los 6 minutos de Google)
 *  y PRIMERO la copia, DESPUÉS las facturas de proveedores, solo si sobra tiempo. */
function copiaSemanal() {
  const inicio = Date.now();
  try {
    const copia = { app: 'dhs-app', entorno: ENTORNO, fecha: new Date().toISOString(), por: 'copia automática (diaria)', datos: {} };
    let total = 0;
    const rutas = [];   // [col, id] de cada documento
    listarColecciones_('').forEach(col => {
      copia.datos[col] = {};
      listarDocs_(col).forEach(doc => {
        const id = doc.name.split('/').pop();
        copia.datos[col][id] = { datos: aJSON_(doc.fields || {}) };
        rutas.push([col, id]); total++;
      });
    });
    // ¿Qué documentos tienen subcolecciones? (de 50 en 50 a la vez)
    const conSub = [];
    pedirVarios_(rutas.map(([col, id]) => ({ url: BASE + '/' + col + '/' + id + ':listCollectionIds', method: 'post', payload: JSON.stringify({ pageSize: 100 }) })))
      .forEach((r, i) => (r.collectionIds || []).forEach(sub => conSub.push([rutas[i][0], rutas[i][1], sub])));
    // Documentos de cada subcolección (también de 50 en 50; si alguna tiene más de 300, se sigue pidiendo aparte)
    pedirVarios_(conSub.map(([col, id, sub]) => ({ url: BASE + '/' + col + '/' + id + '/' + sub + '?pageSize=300' })))
      .forEach((r, i) => {
        const [col, id, sub] = conSub[i], dest = copia.datos[col][id][sub] = {};
        let docs = r.documents || [];
        if (r.nextPageToken) docs = listarDocs_(col + '/' + id + '/' + sub);
        docs.forEach(s => dest[s.name.split('/').pop()] = aJSON_(s.fields || {}));
      });
    const carpeta = carpeta_();
    const nombre = 'dhs-app-' + (ENTORNO === 'pruebas' ? 'PRUEBAS-' : '') + 'copia-' + copia.fecha.slice(0, 10) + '.json';
    carpeta.createFile(nombre, JSON.stringify(copia), 'application/json');
    limpiar_(carpeta);
    apuntarEnRegistro_(total);
    Logger.log('Copia hecha: ' + nombre + ' (' + total + ' documentos, ' + Math.round((Date.now() - inicio) / 1000) + ' s)');
  } catch (e) {
    MailApp.sendEmail(AVISAR_A, '⚠ DHS App: ha fallado la copia de seguridad de hoy',
      'No se ha podido hacer la copia automática de ' + PROYECTO + '.\n\nError: ' + e + '\n\nHaz una copia manual desde la app (Ajustes › Copias) y avisa a Claude.');
    throw e;
  }
  // Después de la copia: leer facturas de proveedores nuevas, solo mientras quede margen
  try {
    if (typeof leerFacturasProveedores_ === 'function')
      for (let i = 0; i < 5 && Date.now() - inicio < 3.5 * 60 * 1000; i++) { const r = leerFacturasProveedores_(PROYECTO); if (!r.quedan || !r.leidas) break; }
  } catch (e) { Logger.log('Proveedores: ' + e); }
}

/** Muchas peticiones a Firestore a la vez (de 50 en 50). Devuelve las respuestas en el mismo orden. */
function pedirVarios_(lista) {
  const cab = { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROYECTO }, out = [];
  for (let i = 0; i < lista.length; i += 50) {
    const trozo = lista.slice(i, i + 50).map(q => Object.assign({ headers: cab, contentType: 'application/json', muteHttpExceptions: true, method: 'get' }, q));
    UrlFetchApp.fetchAll(trozo).forEach(r => {
      if (r.getResponseCode() >= 300) throw new Error(r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
      out.push(JSON.parse(r.getContentText() || '{}'));
    });
  }
  return out;
}

function pedir_(url, opciones) {
  const r = UrlFetchApp.fetch(url, Object.assign({
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROYECTO },
    contentType: 'application/json', muteHttpExceptions: true
  }, opciones || {}));
  if (r.getResponseCode() >= 300) throw new Error(r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
  return JSON.parse(r.getContentText() || '{}');
}
function listarColecciones_(ruta) {
  const url = BASE + (ruta ? '/' + ruta : '') + ':listCollectionIds';
  let ids = [], token = '';
  do {
    const r = pedir_(url, { method: 'post', payload: JSON.stringify({ pageSize: 100, pageToken: token }) });
    ids = ids.concat(r.collectionIds || []); token = r.nextPageToken || '';
  } while (token);
  return ids;
}
function listarDocs_(ruta) {
  let docs = [], token = '';
  do {
    const r = pedir_(BASE + '/' + ruta + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''));
    docs = docs.concat(r.documents || []); token = r.nextPageToken || '';
  } while (token);
  return docs;
}
// Valores de Firestore -> mismo formato que la copia manual de la app (fechas como {__fecha: ms})
function valor_(v) {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return { __fecha: Date.parse(v.timestampValue) };
  if ('mapValue' in v) return aJSON_(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valor_);
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  return null;
}
function aJSON_(campos) { const o = {}; Object.keys(campos).forEach(k => o[k] = valor_(campos[k])); return o; }
function carpeta_() {
  const it = DriveApp.getFoldersByName(CARPETA);
  return it.hasNext() ? it.next() : DriveApp.createFolder(CARPETA);
}
function limpiar_(carpeta) {
  const limite = Date.now() - SEMANAS_A_GUARDAR * 7 * 86400000;
  const it = carpeta.getFiles();
  while (it.hasNext()) { const f = it.next(); if (/^dhs-app-.*copia-/.test(f.getName()) && f.getDateCreated().getTime() < limite) f.setTrashed(true); }
}
// Deja constancia en el registro de la app (así el aviso de "hace X días" se pone a cero).
function apuntarEnRegistro_(total) {
  pedir_(BASE + '/dhs_registro', { method: 'post', payload: JSON.stringify({ fields: {
    accion: { stringValue: 'copia de seguridad' }, coleccion: { stringValue: 'todas' },
    por: { stringValue: 'copia automática (diaria)' }, n: { integerValue: String(total) },
    en: { timestampValue: new Date().toISOString() }
  } }) });
}
