// ---------- Furgoneta (GPS de Localiza) — Ángel 10/11/2026 ----------
// Va AL FINAL de Código.gs del Apps Script "Programa DHS" (sustituye entero al bloque anterior de la furgoneta).
// Propiedades del script: LOCALIZA_USR y LOCALIZA_PASS = el usuario y la clave con los que se entra en la web de Localiza.
// Entra en la web como lo haría una persona, lee la clave interna que usa su propia web y pide los datos.
// Solo lee (no cambia nada en Localiza). Solo para Dirección. Localiza da las posiciones en radianes: aquí se pasan a grados.
function localizaApi_(nueva) {
  const pr = PropertiesService.getScriptProperties(), usr = pr.getProperty('LOCALIZA_USR'), pass = pr.getProperty('LOCALIZA_PASS');
  if (!usr || !pass) throw new Error('Falta poner el usuario y la clave de Localiza en las propiedades del script.');
  const W = 'https://iotsensores.com', cache = CacheService.getScriptCache();
  let api = nueva ? null : cache.get('localiza_api');
  if (!api) {
    const galletas = {};
    const guardar = r => { let sc = r.getAllHeaders()['Set-Cookie']; if (!sc) return; (Array.isArray(sc) ? sc : [sc]).forEach(c => { const p = String(c).split(';')[0].split('='); galletas[p[0].trim()] = p.slice(1).join('='); }); };
    const cab = () => ({ Cookie: Object.keys(galletas).map(k => k + '=' + galletas[k]).join('; ') });
    const r0 = UrlFetchApp.fetch(W + '/onlinetrack/', { muteHttpExceptions: true, followRedirects: false }); guardar(r0);
    const h0 = r0.getContentText(), oculto = n => { const m = h0.match(new RegExp('name="' + n + '"[^>]*value="([^"]*)"')); return m ? m[1] : ''; };
    const r1 = UrlFetchApp.fetch(W + '/onlinetrack/ValidacionUsuarios/Validacion.asp', { method: 'post', headers: cab(), followRedirects: false, muteHttpExceptions: true,
      payload: { url_ot: oculto('url_ot'), url_return: oculto('url_return'), url_returnDosFases: oculto('url_returnDosFases'), UserName: usr, UserPass: pass } });
    guardar(r1);
    let loc = r1.getAllHeaders()['Location'];
    for (let i = 0; loc && i < 4; i++) { const url = /^https?:/.test(loc) ? loc : W + (loc.charAt(0) === '/' ? '' : '/onlinetrack/ValidacionUsuarios/') + loc;
      const r = UrlFetchApp.fetch(url, { headers: cab(), followRedirects: false, muteHttpExceptions: true }); guardar(r); loc = r.getAllHeaders()['Location']; }
    const h = UrlFetchApp.fetch(W + '/onlinetrack/Google/map_options.asp', { headers: cab(), muteHttpExceptions: true }).getContentText();
    const i = h.search(/"fn"\s*:\s*"devicelist"/);
    if (i < 0) throw new Error('No se ha podido entrar en Localiza: revisa el usuario y la clave en las propiedades del script.');
    const seg = h.slice(Math.max(0, i - 400), i + 100);
    const au = (seg.match(/"?usr"?\s*:\s*['"]([^'"]+)/) || [])[1], ap = (seg.match(/"UserPass"\s*:\s*['"]([^'"]+)/) || [])[1];
    if (!au || !ap) throw new Error('Localiza ha cambiado su web: avisa a Claude.');
    api = au + '|' + ap; cache.put('localiza_api', api, 21600);
  }
  const [au, ap] = api.split('|');
  return function (datos) {
    const r = UrlFetchApp.fetch(W + '/Utilidades/APIManager.aspx', { method: 'post', payload: Object.assign({ usr: au, UserPass: ap }, datos), muteHttpExceptions: true });
    try { return JSON.parse(r.getContentText() || 'null'); } catch (e) { return null; }
  };
}
const gradosLoc_ = x => { x = Number(x); return Math.abs(x) <= Math.PI ? x * 180 / Math.PI : x; };
function vehiculosLoc_() {
  let pedir = localizaApi_(), L = pedir({ fn: 'devicelist' });
  if (!L || !L.length) { pedir = localizaApi_(true); L = pedir({ fn: 'devicelist' }); }
  if (!L) throw new Error('Localiza no ha devuelto datos. Prueba otra vez en un minuto.');
  return { pedir: pedir, L: L };
}
PUENTE.furgoneta = function (d, u) {
  if (!u.direccion) throw new Error('No tienes permiso para esto.');
  return vehiculosLoc_().L.map(x => ({
    id: x.id, nombre: x.Nombre, lat: gradosLoc_(x.Latitud), lon: gradosLoc_(x.Longitud), velocidad: Number(x.Velocidad) || 0,
    fecha: x.FechaGPS, rumbo: Number(x.Rumbo) || 0, satelites: Number(x.Satelites) || 0, validez: x.Validez
  }));
};
// Recorrido de un día (d.fecha = "2026-11-10"): puntos [lat, lon, "hora", velocidad, kms]
PUENTE.recorrido = function (d, u) {
  if (!u.direccion) throw new Error('No tienes permiso para esto.');
  const f = String(d.fecha || '').match(/^\d{4}-\d{2}-\d{2}$/) ? d.fecha : Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd');
  const v = vehiculosLoc_();
  return v.L.map(x => {
    const P = v.pedir({ fn: 'routes', deviceid: x.id, startdate: f + ' 00:00:00', enddate: f + ' 23:59:59', rs: 'JSON' }) || [];
    return { id: x.id, nombre: x.Nombre, puntos: (Array.isArray(P) ? P : []).map(p => [gradosLoc_(p.Latitud), gradosLoc_(p.Longitud), String(p.Fecha || ''), Number(p.Velocidad) || 0, Number(p.Kms) || 0]) };
  });
};
