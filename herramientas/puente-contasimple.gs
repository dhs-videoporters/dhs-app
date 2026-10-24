// =====================================================================
// PUENTE DHS App ↔ Contasimple (va en el Apps Script "Programa DHS", junto a la copia y los avisos).
// La app llama aquí (aplicación web) con el "pase" de la sesión de Google del usuario. El puente:
//   1) comprueba con Google quién es (correo verificado),
//   2) mira en la base de datos de la app si tiene permiso para esa acción,
//   3) solo entonces habla con Contasimple con la clave CS_KEY (que nunca sale de aquí).
// Necesita las funciones csToken_() y cs_() (bloque "Contasimple (DHS App)") y PROYECTO/BASE/pedir_ (copia semanal).
// =====================================================================
const FIREBASE_API_KEY = 'AIzaSyA8RF2qbRo5b89OHkTClQLMZxzeHqXdKNc';   // clave pública de la app web (pruebas)
const DIRECCION_FIJA = ['herrerazarzoso@gmail.com', 'dhsvideoporters@gmail.com'];
const IVA = 21;

function doPost(e) {
  let r;
  try {
    const req = JSON.parse(e.postData.contents || '{}');
    const u = usuario_(req.idToken);
    const accion = PUENTE[req.accion];
    if (!accion) throw new Error('Acción desconocida: ' + req.accion);
    r = { ok: true, datos: accion(req.datos || {}, u) };
  } catch (err) {
    r = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
}
function doGet() { return ContentService.createTextOutput('DHS · puente con Contasimple (solo para la app).'); }

// ---------- Quién es y qué puede ----------
function usuario_(idToken) {
  if (!idToken) throw new Error('Sin sesión.');
  const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY,
    { method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true });
  const j = JSON.parse(r.getContentText() || '{}');
  const us = (j.users || [])[0];
  if (!us || !us.email || us.emailVerified !== true) throw new Error('La sesión no es válida. Vuelve a entrar en la app.');
  const email = us.email.toLowerCase();
  if (DIRECCION_FIJA.indexOf(email) >= 0) return { email: email, direccion: true, permisos: {} };
  let f;
  try { f = aJSON_(pedir_(BASE + '/dhs_usuarios/' + encodeURIComponent(email)).fields || {}); } catch (e) { throw new Error('Tu cuenta no tiene acceso a la app.'); }
  if (f.activo === false || !f.perfil) throw new Error('Tu cuenta no tiene acceso a la app.');
  if (f.perfil === 'direccion') return { email: email, direccion: true, permisos: {} };
  const p = aJSON_(pedir_(BASE + '/dhs_perfiles/' + encodeURIComponent(f.perfil)).fields || {});
  return { email: email, direccion: false, permisos: p.permisos || {}, personalId: f.personalId || '' };
}
const NIV_ = { no: 0, propios: 0.5, ver: 1, editar: 2, todo: 3 };
function puede_(u, apartado, minimo) { return u.direccion || (NIV_[u.permisos[apartado]] || 0) >= NIV_[minimo]; }
function exige_(u, apartado, minimo) { if (!puede_(u, apartado, minimo)) throw new Error('No tienes permiso para esto.'); }

// ---------- Acciones ----------
const PUENTE = {
  // Catálogo completo de Contasimple (para guardarlo en la app)
  catalogo: function (d, u) {
    exige_(u, 'precios', 'editar');
    const tk = csToken_(); let todos = [], i = 0;
    for (;;) {
      const r = cs_(tk, 'get', '/products?startIndex=' + i + '&numRows=200&includeInactive=true');
      const L = (r && r.data) || r || [];
      todos = todos.concat(L); if (L.length < 200 || todos.length > 3000) break; i += 200;
    }
    return todos.map(p => ({ id: p.id, nombre: p.name, precio: p.price, iva: p.vat, descuento: p.discountPercentage || 0,
      descripcion: p.description || '', activo: p.active !== false, codigo: p.internalCode || '' }));
  },

  // Crear presupuesto en Contasimple para una comunidad. Solo Dirección (o quien tenga "Precios: editar").
  crearPresupuesto: function (d, u) {
    exige_(u, 'precios', 'editar');
    const tk = csToken_();
    const cliente = cliente_(tk, d.cliente || {});
    const lineas = lineas_(d.lineas);
    const f = formatoPresupuesto_(tk);
    const num = numero_(cs_(tk, 'get', '/accounting/estimates/nextEstimateNumber/' + f.id));
    const r = cs_(tk, 'post', '/accounting/estimates', {
      targetEntityId: cliente, numberingFormatId: f.id, number: num,
      date: Utilities.formatDate(new Date(), 'Europe/Madrid', "yyyy-MM-dd'T'00:00:00"),
      status: 'Creado', notes: d.notas || '', lines: lineas
    });
    const est = (r && r.data) || r;
    return { id: est.id, numero: est.number || num, clienteId: cliente, totales: totales_(lineas) };
  },

  // PDF del presupuesto (en base64, para verlo o descargarlo)
  pdfPresupuesto: function (d, u) {
    exige_(u, 'precios', 'ver');
    const tk = csToken_();
    const r = UrlFetchApp.fetch(CS_API + '/accounting/estimates/' + Number(d.id) + '/pdf',
      { headers: { Authorization: 'Bearer ' + tk, 'Accept-Language': 'es-ES' }, muteHttpExceptions: true });
    if (r.getResponseCode() >= 300) throw new Error('No se ha podido sacar el PDF (' + r.getResponseCode() + ')');
    return { base64: Utilities.base64Encode(r.getBlob().getBytes()), nombre: (d.numero || 'presupuesto') + '.pdf' };
  },

  // Cambiar estado en Contasimple: Enviado / Aceptado / Rechazado
  estadoPresupuesto: function (d, u) {
    exige_(u, 'precios', 'editar');
    const ok = ['Creado', 'Enviado', 'Aceptado', 'Rechazado'];
    if (ok.indexOf(d.estado) < 0) throw new Error('Estado no válido');
    cs_(csToken_(), 'put', '/accounting/estimates/' + Number(d.id) + '/status', { status: d.estado });
    return { id: d.id, estado: d.estado };
  },

  // Enviar el presupuesto por correo desde Contasimple
  enviarPresupuesto: function (d, u) {
    exige_(u, 'precios', 'editar');
    if (!d.para) throw new Error('Falta el correo de destino');
    cs_(csToken_(), 'post', '/accounting/estimates/' + Number(d.id) + '/send',
      { to: d.para, replyTo: 'dhsvideoporters@gmail.com', blindCopy: true, subject: d.asunto || 'Presupuesto ' + (d.numero || ''), body: d.texto || '' });
    return { enviado: true };
  },

  // Facturas emitidas desde una fecha (SOLO LECTURA), para la pantalla de Economía
  facturas: function (d, u) {
    exige_(u, 'cobros', 'ver');
    const tk = csToken_();
    const desde = d.desde || Utilities.formatDate(new Date(Date.now() - 400 * 86400000), 'Europe/Madrid', "yyyy-MM-dd'T'00:00:00");
    let todas = [], i = 0;
    for (;;) {
      const r = cs_(tk, 'get', '/accounting/invoices/issued/from?date=' + encodeURIComponent(desde) + '&startIndex=' + i + '&numRows=100');
      const L = (r && r.data) || [];
      todas = todas.concat(L); if (L.length < 100 || todas.length > 5000) break; i += 100;
    }
    // Estado de cobro real: manda la app de cobros (proyecto dhs-camaras); si la factura no está allí, Contasimple.
    const cob = cobros_();
    const res = todas.map(f => ({
      id: f.id, numero: f.number, fecha: (f.invoiceDate || '').slice(0, 10), estado: f.status,
      total: f.totalAmount, pagado: f.totalPayedAmount || 0, pendiente: f.totalAmountPerPay,
      clienteId: (f.target && f.target.id) || f.originalTargetEntityID || null,
      cliente: (f.target && (f.target.organization || f.target.name)) || f.entityString || '',
      presupuestoId: f.relatedEstimateId || null, rectificativa: !!f.isRectificationInvoice,
      pagos: (f.payments || []).map(p => ({ fecha: (p.date || p.paymentDate || '').slice(0, 10), importe: p.amount || p.totalAmount || 0 }))
    }));
    res.forEach(f => {
      const c = cob['f_' + f.id];
      if (!c) { f.fuenteCobro = 'contasimple'; return; }
      aplicarCobro_(f, c);
    });
    // Facturas metidas a mano en cobros (no están en Contasimple)
    Object.keys(cob).filter(k => cob[k].origen === 'manual').forEach(k => {
      const c = cob[k];
      const f = { id: k, numero: c.numero || '', fecha: c.fecha || '', total: c.total || 0, clienteId: null, cliente: c.cliNombre || '', manual: true, pagos: [] };
      aplicarCobro_(f, c); res.push(f);
    });
    return res;
  },

  // Facturar (todo o un plazo) a partir de un presupuesto aceptado. SOLO Dirección.
  facturar: function (d, u) {
    if (!u.direccion) throw new Error('Solo Dirección puede facturar.');
    const tk = csToken_();
    const lineas = lineas_(d.lineas);
    const ahora = new Date();
    const periodo = Utilities.formatDate(ahora, 'Europe/Madrid', 'yyyy') + '-' + Math.ceil(Number(Utilities.formatDate(ahora, 'Europe/Madrid', 'M')) / 3) + 'T';
    const fmts = cs_(tk, 'get', '/configuration/numberingFormats/invoices'); const FL = (fmts && fmts.data) || fmts || [];
    const f = FL.find(x => x.isDefault && x.isActive !== false) || FL[0];
    const clases = cs_(tk, 'get', '/configuration/invoiceClasses/issued'); const CL = (clases && clases.data) || clases || [];
    const clase = (CL.find(x => x.isDefault) || CL[0] || {}).id;
    const num = numero_(cs_(tk, 'get', '/accounting/' + periodo + '/invoices/issued/nextInvoiceNumber/' + f.id));
    const r = cs_(tk, 'post', '/accounting/' + periodo + '/invoices/issued', {
      targetEntityId: Number(d.clienteId), relatedEstimatesId: d.presupuestoId ? Number(d.presupuestoId) : undefined,
      numberingFormatId: f.id, number: num, invoiceClass: clase,
      date: Utilities.formatDate(ahora, 'Europe/Madrid', "yyyy-MM-dd'T'00:00:00"), notes: d.notas || '', lines: lineas
    });
    const inv = (r && r.data) || r;
    return { id: inv.id, numero: inv.number || num, periodo: periodo, totales: totales_(lineas) };
  }
};

// ---------- Cobros (app de cobros, proyecto dhs-camaras): solo lectura ----------
const PROYECTO_COBROS = 'dhs-camaras';
function cobros_() {
  const base = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO_COBROS + '/databases/(default)/documents/dhs_cobros';
  const o = {}; let token = '';
  try {
    do {
      const r = UrlFetchApp.fetch(base + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''),
        { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': PROYECTO_COBROS }, muteHttpExceptions: true });
      if (r.getResponseCode() >= 300) throw new Error('cobros ' + r.getResponseCode());
      const j = JSON.parse(r.getContentText() || '{}');
      (j.documents || []).forEach(d => { const v = aJSON_(d.fields || {}); if (v.tipo === 'factura') o[d.name.split('/').pop()] = v; });
      token = j.nextPageToken || '';
    } while (token);
  } catch (e) { Logger.log('No se ha podido leer cobros: ' + e); }
  return o;
}
// Estado de cobro según los cargos de cobros: cobrado / pendiente (con lo que falta) y fecha del último cobro
function aplicarCobro_(f, c) {
  const cargos = c.cargos || [];
  const pend = cargos.filter(x => x.estado !== 'cobrado').reduce((n, x) => n + (Number(x.importe) || 0), 0);
  const cobrados = cargos.filter(x => x.estado === 'cobrado');
  f.fuenteCobro = 'cobros';
  f.estadoCobros = cargos.map(x => x.estado);
  if (cargos.length && !pend) { f.estado = 'Payed'; f.pagado = f.total; f.pendiente = 0; }
  else if (cargos.length) { f.estado = cobrados.length ? 'Incomplete' : 'Pending'; f.pendiente = Math.round(pend * 100) / 100; f.pagado = Math.round((f.total - pend) * 100) / 100; }
  const fechas = cobrados.map(x => x.fechaCobro).filter(Boolean).sort();
  if (fechas.length) f.pagos = cobrados.map(x => ({ fecha: x.fechaCobro || '', importe: Number(x.importe) || 0, via: x.via || '' }));
  f.devuelto = cargos.some(x => x.estado === 'devuelto');
  f.enBanco = cargos.some(x => x.estado === 'cargado' || x.estado === 'enviar');
}

// ---------- Ayudas ----------
function formatoPresupuesto_(tk) {
  const r = cs_(tk, 'get', '/configuration/numberingFormats/estimates'); const L = (r && r.data) || r || [];
  return L.find(x => x.isDefault && x.isActive !== false) || L[0];
}
function numero_(r) { const v = (r && r.data !== undefined) ? r.data : r; return typeof v === 'string' ? v : String(v && (v.number || v.value) || v); }
function redondea_(x) { return Math.round(x * 100) / 100; }
// Líneas: siempre IVA 21 %. Base = cantidad × precio × (1 − descuento).
function lineas_(L) {
  if (!L || !L.length) throw new Error('El presupuesto no tiene líneas.');
  return L.map(l => {
    const cant = Number(l.cantidad) || 0, precio = Number(l.precio) || 0, desc = Math.min(100, Math.max(0, Number(l.descuento) || 0));
    if (!l.concepto) throw new Error('Hay una línea sin concepto.');
    const base = redondea_(cant * precio * (1 - desc / 100));
    const o = { concept: String(l.concepto).slice(0, 250), quantity: cant, unitAmount: precio, discountPercentage: desc,
      vatPercentage: IVA, vatAmount: redondea_(base * IVA / 100), totalTaxableAmount: base, detailedDescription: l.detalle || '' };
    if (l.productoId) o.productId = Number(l.productoId);
    return o;
  });
}
function totales_(lineas) {
  const base = redondea_(lineas.reduce((n, l) => n + l.totalTaxableAmount, 0));
  const iva = redondea_(lineas.reduce((n, l) => n + l.vatAmount, 0));
  return { base: base, iva: iva, total: redondea_(base + iva) };
}
// Cliente de Contasimple para la comunidad: el código guardado, o se busca por NIF.
function cliente_(tk, c) {
  if (c.csId) return Number(c.csId);
  if (!c.nif) throw new Error('Esta comunidad no tiene NIF ni código de Contasimple. Complétalo en su ficha.');
  const r = cs_(tk, 'get', '/entities/customers/search/nif?query=' + encodeURIComponent(c.nif) + '&exactMatch=true');
  const L = (r && r.data) || r || [];
  if (L.length) return L[0].id;
  const n = cs_(tk, 'post', '/entities/customers', { organization: c.nombre, nif: c.nif, address: c.direccion || '', city: c.poblacion || '', country: 'España' });
  return ((n && n.data) || n).id;
}
