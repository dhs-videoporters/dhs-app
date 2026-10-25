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

  // Guardar productos en Contasimple desde el Excel del catálogo (crear los nuevos y cambiar los que han cambiado). Solo Dirección / Precios: editar.
  // Cada producto: {fila, id (vacío = nuevo), nombre, precio, iva, descripcion, codigo, activo}. No borra nada.
  guardarProductos: function (d, u) {
    exige_(u, 'precios', 'editar');
    const tk = csToken_(), out = [];
    (d.productos || []).slice(0, 100).forEach(p => {
      try {
        if (!p.nombre) throw new Error('Falta el nombre');
        const precio = Number(p.precio); if (!(precio >= 0)) throw new Error('Precio no válido');
        const iva = (p.iva === '' || p.iva === null || p.iva === undefined) ? null : Number(p.iva);
        if (p.id) {
          const r = cs_(tk, 'get', '/products/' + Number(p.id)); const a = (r && r.data) || r;
          const body = Object.assign({}, a, { name: String(p.nombre), price: precio, description: p.descripcion || '', internalCode: p.codigo || '', active: p.activo !== false });
          if (iva !== null) body.vat = iva;
          cs_(tk, 'put', '/products/' + Number(p.id), body);
          out.push({ fila: p.fila, id: Number(p.id), ok: true });
        } else {
          const r = cs_(tk, 'post', '/products', { name: String(p.nombre), price: precio, vat: iva === null ? 21 : iva, description: p.descripcion || '', internalCode: p.codigo || '', active: p.activo !== false });
          const n = (r && r.data) || r;
          out.push({ fila: p.fila, id: n.id, ok: true, nuevo: true, iva: n.vat });
        }
      } catch (e) { out.push({ fila: p.fila, ok: false, error: String(e && e.message || e) }); }
    });
    return out;
  },

  // Crear presupuesto en Contasimple para una comunidad. Solo Dirección (o quien tenga "Precios: editar").
  crearPresupuesto: function (d, u) {
    exige_(u, 'precios', 'editar');
    descuentos_(d.lineas);
    const tk = csToken_();
    // Presupuesto rápido (particular que solo da el teléfono): sin cliente en Contasimple hasta que se asocie
    const cliente = d.sinCliente ? null : cliente_(tk, d.cliente || {});
    const lineas = lineas_(d.lineas);
    const f = formatoPresupuesto_(tk);
    const num = numero_(cs_(tk, 'get', '/accounting/estimates/nextEstimateNumber/' + f.id));
    const r = cs_(tk, 'post', '/accounting/estimates', {
      targetEntityId: cliente || undefined, numberingFormatId: f.id, number: num,
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
  // Asociar un presupuesto rápido a su cliente cuando ya se tienen los datos (NIF): busca o crea el cliente en Contasimple
  // y pone sus datos en el presupuesto (mismas líneas, número, fecha, estado y notas). Lo segundo, si falla, no impide lo primero.
  asignarCliente: function (d, u) {
    exige_(u, 'precios', 'editar');
    const tk = csToken_();
    const c = d.cliente || {};
    const clienteId = cliente_(tk, c);
    let pdf = true, aviso = '';
    try {
      const f = formatoPresupuesto_(tk);
      cs_(tk, 'put', '/accounting/estimates/' + Number(d.id), {
        targetEntity: { organization: c.nombre || '', nif: c.nif || '', address: c.direccion || '', city: c.poblacion || '', country: 'España', phone: c.telefono || '' },
        numberingFormatId: f.id, number: d.numero, status: d.estadoCS || 'Creado',
        date: (d.fecha || Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd')) + 'T00:00:00', notes: d.notas || '', lines: lineas_(d.lineas)
      });
    } catch (e) { pdf = false; aviso = String(e && e.message || e).slice(0, 200); }
    return { clienteId: clienteId, pdf: pdf, aviso: aviso };
  },

  // Instalaciones de cámaras con sus revisiones. Solo para Cobros/Dirección: el mantenimiento (precio y años cobrados).
  // Solo para quien edita comunidades (oficina y Dirección): las claves y el correo de la finca (por si llaman por teléfono).
  camaras: function (d, u) {
    exige_(u, 'comunidades', 'ver');
    const I = leerCol_(PROYECTO_COBROS, 'dhs_instalaciones'), R = leerCol_(PROYECTO_COBROS, 'dhs_revisiones');
    const verEco = puede_(u, 'cobros', 'ver'), E = verEco ? leerCol_(PROYECTO_COBROS, 'dhs_economia') : {};
    const verClaves = puede_(u, 'comunidades', 'editar');
    const ALERTA = ['Incidencia', 'Renovar'];
    return Object.keys(I).filter(k => k.charAt(0) !== '_').map(k => {
      const i = I[k];
      const revs = Object.keys(R).filter(r => r.indexOf(k + '_') === 0).map(r => {
        const x = R[r], partes = r.split('_'), checks = x.checks || {};
        return { anio: Number(partes[partes.length - 2]), periodo: partes[partes.length - 1], hecha: !!x.hecha, fecha: x.fecha || '', tecnico: x.tecnico || '',
          incidencias: Object.keys(checks).filter(c => ALERTA.indexOf(checks[c]) >= 0) };
      }).sort((a, b) => (b.anio - a.anio) || (a.periodo < b.periodo ? 1 : -1));
      const out = { id: k, comunidad: i.comunidad || '', direccion: i.direccion || '', ciudad: i.ciudad || '', admin: i.admin || '', camaras: i.camaras,
        conexion: i.conexion || '', notas: i.notas || '', contacto: i.contacto || '', telefono: i.telefono || '', revisiones: revs };
      if (verClaves) { out.claves = i.claves || ''; out.emailFinca = i.emailFinca || ''; }
      if (verEco && E[k]) out.economia = { precio: E[k].precio || 0, cobros: E[k].cobros || {} };
      return out;
    });
  },

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
    // Facturas que no están en cobros: si son anteriores a la fecha desde la que cobros controla, no se cuentan
    // (se dieron por cobradas al empezar); si son posteriores, aún no han pasado a cobros y se muestra lo de Contasimple.
    const conf = cob.config || {};
    const desdeCob = conf.desde || (new Date().getFullYear() + '-01-01');
    res.forEach(f => {
      const c = cob['f_' + f.id];
      if (c) { aplicarCobro_(f, c); return; }
      if (desdeCob && f.fecha && f.fecha < desdeCob) { f.fuenteCobro = 'antes'; f.pendiente = 0; f.estado = 'Payed'; f.pagos = []; return; }
      f.fuenteCobro = 'contasimple'; f.sinCobros = true;
    });
    delete cob.config;
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
      (j.documents || []).forEach(d => { const id = d.name.split('/').pop(), v = aJSON_(d.fields || {}); if (v.tipo === 'factura' || id === 'config') o[id] = v; });
      token = j.nextPageToken || '';
    } while (token);
  } catch (e) { Logger.log('No se ha podido leer cobros: ' + e); }
  return o;
}
// Mismo criterio que la app de cobros: pendiente = cargos pendientes, devueltos o en la hoja del viernes.
// Los "cargados" (ya en el banco) no cuentan como pendientes, igual que en cobros.
const ABIERTO_ = ['pendiente', 'devuelto', 'enviar'];
function aplicarCobro_(f, c) {
  const cargos = c.cargos || [];
  const suma = L => Math.round(L.reduce((n, x) => n + (Number(x.importe) || 0), 0) * 100) / 100;
  const pend = suma(cargos.filter(x => ABIERTO_.includes(x.estado)));
  const banco = suma(cargos.filter(x => x.estado === 'cargado'));
  const cobrados = cargos.filter(x => x.estado === 'cobrado');
  f.fuenteCobro = 'cobros';
  f.estadoCobros = cargos.map(x => x.estado);
  f.pendiente = pend; f.importeBanco = banco;
  f.pagado = Math.round((suma(cargos) - pend - banco) * 100) / 100;
  f.estado = pend ? (cobrados.length || banco ? 'Incomplete' : 'Pending') : 'Payed';
  f.pagos = cobrados.map(x => ({ fecha: x.fechaCobro || '', importe: Number(x.importe) || 0, via: x.via || '' }));
  f.devuelto = cargos.some(x => x.estado === 'devuelto');
  f.enBanco = banco > 0;
  f.enHoja = cargos.some(x => x.estado === 'enviar');
}

// ---------- Cámaras (app de cámaras, proyecto dhs-camaras): solo lectura, a modo de información ----------
function leerCol_(proyecto, col) {
  const base = 'https://firestore.googleapis.com/v1/projects/' + proyecto + '/databases/(default)/documents/' + col;
  const o = {}; let token = '';
  do {
    const r = UrlFetchApp.fetch(base + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : ''),
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Goog-User-Project': proyecto }, muteHttpExceptions: true });
    if (r.getResponseCode() >= 300) throw new Error(col + ' ' + r.getResponseCode());
    const j = JSON.parse(r.getContentText() || '{}');
    (j.documents || []).forEach(d => { o[d.name.split('/').pop()] = aJSON_(d.fields || {}); });
    token = j.nextPageToken || '';
  } while (token);
  return o;
}

// ---------- Ayudas ----------
function formatoPresupuesto_(tk) {
  const r = cs_(tk, 'get', '/configuration/numberingFormats/estimates'); const L = (r && r.data) || r || [];
  return L.find(x => x.isDefault && x.isActive !== false) || L[0];
}
function numero_(r) { const v = (r && r.data !== undefined) ? r.data : r; return typeof v === 'string' ? v : String(v && (v.number || v.value) || v); }
function redondea_(x) { return Math.round(x * 100) / 100; }
// Descuentos: solo en productos del catálogo que lo admiten (Ajustes › Catálogo › Dto. máx.) y hasta ese máximo.
function descuentos_(L) {
  (L || []).forEach(l => {
    const desc = Number(l.descuento) || 0; if (!desc || !l.productoId) return;
    let max = 0;
    try { max = Number(aJSON_(pedir_(BASE + '/dhs_catalogo/' + encodeURIComponent(String(l.productoId))).fields || {}).dtoMax) || 0; } catch (e) { max = 0; }
    if (desc > max + 0.001) throw new Error('«' + l.concepto + '» ' + (max ? 'admite como máximo un ' + max + ' % de descuento.' : 'no admite descuento.'));
  });
}
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
