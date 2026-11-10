// ---------- Furgoneta (GPS de Localiza) — Ángel 10/11/2026 ----------
// Pegar AL FINAL del archivo Código.gs del Apps Script "Programa DHS" (después de todo lo demás).
// El usuario y la clave de Localiza NO van aquí: se guardan en Configuración del proyecto › Propiedades del script:
//   LOCALIZA_USR  = usuario de Localiza
//   LOCALIZA_PASS = clave de Localiza
// Solo lee la posición (no cambia nada en Localiza). Solo para Dirección.
PUENTE.furgoneta = function (d, u) {
  if (!u.direccion) throw new Error('No tienes permiso para esto.');
  const pr = PropertiesService.getScriptProperties(), usr = pr.getProperty('LOCALIZA_USR'), pass = pr.getProperty('LOCALIZA_PASS');
  if (!usr || !pass) throw new Error('Falta poner el usuario y la clave de Localiza en las propiedades del script.');
  const r = UrlFetchApp.fetch('https://iotsensores.com/Utilidades/APIManager.aspx', {
    method: 'post', payload: { usr: usr, UserPass: pass, fn: 'devicelist' }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Localiza no responde (' + r.getResponseCode() + ').');
  let L; try { L = JSON.parse(r.getContentText() || '[]'); } catch (e) { throw new Error('Localiza no ha devuelto datos (¿usuario o clave mal puestos?).'); }
  return (L || []).map(x => ({
    nombre: x.Nombre, lat: Number(x.Latitud), lon: Number(x.Longitud), velocidad: Number(x.Velocidad) || 0,
    fecha: x.FechaGPS, rumbo: Number(x.Rumbo) || 0, satelites: Number(x.Satelites) || 0, validez: x.Validez
  }));
};
