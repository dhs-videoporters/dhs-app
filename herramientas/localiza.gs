// ---------- Furgoneta (GPS de Localiza) — Ángel 10/11/2026 ----------
// Va AL FINAL de Código.gs del Apps Script "Programa DHS" (sustituye a la versión anterior de PUENTE.furgoneta).
// Propiedades del script: LOCALIZA_USR y LOCALIZA_PASS = el usuario y la clave con los que se entra en la web de Localiza.
// Entra en la web como lo haría una persona, lee la clave interna que usa su propia web para pedir posiciones
// y pide la lista de vehículos. Solo lee (no cambia nada en Localiza). Solo para Dirección.
PUENTE.furgoneta = function (d, u) {
  if (!u.direccion) throw new Error('No tienes permiso para esto.');
  const pr = PropertiesService.getScriptProperties(), usr = pr.getProperty('LOCALIZA_USR'), pass = pr.getProperty('LOCALIZA_PASS');
  if (!usr || !pass) throw new Error('Falta poner el usuario y la clave de Localiza en las propiedades del script.');
  const W = 'https://iotsensores.com';
  const cache = CacheService.getScriptCache();
  let api = cache.get('localiza_api');   // "usr|clave" internos, guardados 6 horas
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
  const r = UrlFetchApp.fetch(W + '/Utilidades/APIManager.aspx', { method: 'post', payload: { usr: au, UserPass: ap, fn: 'devicelist' }, muteHttpExceptions: true });
  let L; try { L = JSON.parse(r.getContentText() || '[]'); } catch (e) { L = null; }
  if (!L || !L.length) { cache.remove('localiza_api'); if (!L) throw new Error('Localiza no ha devuelto datos. Prueba otra vez en un minuto.'); }
  return L.map(x => ({
    nombre: x.Nombre, lat: Number(x.Latitud), lon: Number(x.Longitud), velocidad: Number(x.Velocidad) || 0,
    fecha: x.FechaGPS, rumbo: Number(x.Rumbo) || 0, satelites: Number(x.Satelites) || 0, validez: x.Validez
  }));
};
