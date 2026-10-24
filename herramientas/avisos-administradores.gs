/**
 * DHS App — Aviso a la administración cuando una intervención queda hecha.
 * Va en el MISMO proyecto de Apps Script que la copia semanal (usa sus ajustes: PROYECTO, ENTORNO, AVISAR_A, pedir_, valor_).
 * Cada 10 minutos mira las intervenciones con avisoAdmin.estado = "pendiente" (las marca el técnico al pulsar Hecho),
 * busca el correo de la administración y le manda un mensaje corto desde el Gmail de DHS:
 * "la incidencia está solucionada; en breve recibirán el informe y, si procede, el presupuesto".
 *
 * IMPORTANTE: en la versión de PRUEBAS los correos NO van a las administraciones: van a AVISAR_A (DHS) con "[PRUEBAS]".
 *
 * Instalación: pega este archivo en el mismo proyecto, ejecuta "instalarAvisos" y acepta los permisos.
 */

const AVISOS_CADA_MIN = 10;
const FIRMA = 'DHS Videoporters';

/** Ejecutar una sola vez: revisa los avisos cada 10 minutos. */
function instalarAvisos() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'avisosAdministradores') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('avisosAdministradores').timeBased().everyMinutes(AVISOS_CADA_MIN).create();
  avisosAdministradores();
}

function avisosAdministradores() {
  const q = pedir_(BASE + ':runQuery', { method: 'post', payload: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: 'dhs_trabajos' }],
    where: { fieldFilter: { field: { fieldPath: 'avisoAdmin.estado' }, op: 'EQUAL', value: { stringValue: 'pendiente' } } }
  } }) });
  (q || []).filter(r => r.document).forEach(r => {
    const nombreDoc = r.document.name, id = nombreDoc.split('/').pop();
    const t = aJSON_(r.document.fields || {});
    try {
      if (!t.adminId) return marcar_(id, 'sinAdministracion', []);
      const a = aJSON_(pedir_(BASE + '/dhs_admins/' + encodeURIComponent(t.adminId)).fields || {});
      const correos = (a.emails || []).filter(Boolean);
      if (!correos.length) { marcar_(id, 'sinCorreo', []); return registro_(id, t, 'aviso a la administración: ' + (a.nombre || '') + ' no tiene correo'); }
      const m = mensaje_(t, a);
      const pruebas = ENTORNO !== 'oficial';
      MailApp.sendEmail({
        to: pruebas ? AVISAR_A : correos.join(','),
        subject: (pruebas ? '[PRUEBAS · iría a ' + correos.join(', ') + '] ' : '') + m.asunto,
        body: m.texto, htmlBody: m.html, name: FIRMA, replyTo: AVISAR_A
      });
      marcar_(id, pruebas ? 'enviadoPruebas' : 'enviado', correos, a.nombre || '');
      registro_(id, t, 'aviso a la administración enviado' + (pruebas ? ' (pruebas: a DHS)' : '') + ': ' + (a.nombre || '') + ' · ' + correos.join(', '));
    } catch (e) {
      marcar_(id, 'error', [], '', String(e).slice(0, 200));
    }
  });
}

function mensaje_(t, a) {
  const h = Number(Utilities.formatDate(new Date(), 'Europe/Madrid', 'H'));
  const saludo = h < 14 ? 'Buenos días' : 'Buenas tardes';
  const fecha = t.fechaHecho ? Utilities.formatDate(new Date(t.fechaHecho + 'T12:00:00'), 'Europe/Madrid', 'dd/MM/yyyy') : Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy');
  const donde = [t.nombre, [t.direccion, t.poblacion].filter(Boolean).join(', ')].filter((x, i, L) => x && L.indexOf(x) === i).join(' · ');
  const aviso = (t.descripcion || '').replace(/\s+/g, ' ').slice(0, 160);
  const asunto = 'Incidencia solucionada · ' + (t.nombre || t.direccion || '');
  const texto = saludo + ':\n\n' +
    'Les informamos de que la incidencia comunicada en ' + donde + ' ya ha quedado solucionada.\n\n' +
    (aviso ? 'Aviso: ' + aviso + '\n' : '') +
    'Fecha de la intervención: ' + fecha + '\n' +
    'Referencia: ' + (t.numero || '') + '\n\n' +
    'En breve les enviaremos el informe con el detalle de lo realizado y, si procede, el presupuesto.\n\n' +
    'Un saludo,\n' + FIRMA;
  const e = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2933;line-height:1.5">' +
    '<p>' + saludo + ':</p>' +
    '<p>Les informamos de que la incidencia comunicada en <b>' + e(donde) + '</b> ya ha quedado <b>solucionada</b>.</p>' +
    '<table style="font-size:14px;border-collapse:collapse;margin:6px 0 12px">' +
    (aviso ? '<tr><td style="color:#6b7785;padding:2px 12px 2px 0">Aviso</td><td>' + e(aviso) + '</td></tr>' : '') +
    '<tr><td style="color:#6b7785;padding:2px 12px 2px 0">Fecha</td><td>' + e(fecha) + '</td></tr>' +
    '<tr><td style="color:#6b7785;padding:2px 12px 2px 0">Referencia</td><td>' + e(t.numero) + '</td></tr></table>' +
    '<p>En breve les enviaremos el informe con el detalle de lo realizado y, si procede, el presupuesto.</p>' +
    '<p>Un saludo,<br><b>' + FIRMA + '</b></p></div>';
  return { asunto: asunto, texto: texto, html: html };
}

function marcar_(id, estado, correos, admin, error) {
  const campos = { estado: { stringValue: estado }, en: { timestampValue: new Date().toISOString() },
    a: { arrayValue: { values: (correos || []).map(c => ({ stringValue: c })) } } };
  if (admin) campos.administracion = { stringValue: admin };
  if (error) campos.error = { stringValue: error };
  // Se conservan quién lo pidió y cuándo
  const prev = pedir_(BASE + '/dhs_trabajos/' + id + '?mask.fieldPaths=avisoAdmin').fields;
  const pv = prev && prev.avisoAdmin && prev.avisoAdmin.mapValue && prev.avisoAdmin.mapValue.fields || {};
  ['pedidoPor', 'pedidoEn'].forEach(k => { if (pv[k]) campos[k] = pv[k]; });
  pedir_(BASE + '/dhs_trabajos/' + id + '?updateMask.fieldPaths=avisoAdmin', { method: 'patch', payload: JSON.stringify({ fields: { avisoAdmin: { mapValue: { fields: campos } } } }) });
}

function registro_(id, t, accion) {
  pedir_(BASE + '/dhs_registro', { method: 'post', payload: JSON.stringify({ fields: {
    accion: { stringValue: accion }, coleccion: { stringValue: 'dhs_trabajos' }, docId: { stringValue: id },
    nombre: { stringValue: (t.numero || '') + ' · ' + (t.nombre || '') },
    por: { stringValue: 'avisos automáticos' }, en: { timestampValue: new Date().toISOString() }
  } }) });
}
