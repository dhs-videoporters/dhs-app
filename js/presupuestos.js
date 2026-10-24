// DHS App — Catálogo y presupuestos (fase 6). Todo se hace en la app y se copia solo en Contasimple
// a través del "puente" (Apps Script "Programa DHS"), que comprueba quién lo pide; la clave de Contasimple nunca llega aquí.
// - Numeración siempre correlativa de Contasimple (P-AAAA-####); la comunidad va como CLIENTE, no en el número.
// - Siempre IVA 21 %. Cambiar precios, descuentos y líneas libres: solo quien tenga "Precios: editar" (Dirección).
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sinAc = s => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const D = () => window.DHS;
  const eur = n => (Number(n)||0).toLocaleString("es-ES", {style:"currency", currency:"EUR"});
  const IVA = 21;
  const GRUPOS = ["Instalación","Mantenimiento","Cámaras","Otros"];
  const ESTADOS = {pendiente:["⏳","Pendiente"], enviado:["📨","Enviado"], aceptado:["✅","Aceptado"], rechazado:["✖️","Rechazado"], facturado:["🧾","Facturado"], parcial:["🧾","Facturado en parte"]};
  const r2 = x => Math.round(x * 100) / 100;

  // ---------- Puente con Contasimple ----------
  async function llamar(accion, datos){
    const url = (window.DHS_CONFIG || {}).puenteUrl;
    if(!url) throw new Error("Falta conectar el puente con Contasimple (puenteUrl).");
    const idToken = await D().auth.currentUser.getIdToken();
    const r = await fetch(url, {method:"POST", body:JSON.stringify({idToken, accion, datos})});   // texto plano: sin "preflight"
    const j = await r.json().catch(() => ({ok:false, error:"Respuesta no válida del puente (" + r.status + ")"}));
    if(!j.ok) throw new Error(j.error || "Error del puente");
    return j.datos;
  }
  const puedePrecios = () => D().S.puede("precios","editar");
  const puedeVerPres = () => D().S.puede("precios","editar") || D().S.puede("cobros","ver");

  // ---------- Catálogo ----------
  let CAT = null;
  async function catalogo(forzar){
    if(!CAT || forzar){ CAT = {}; (await D().db.collection("dhs_catalogo").get()).forEach(d => CAT[d.id] = d.data()); }
    return CAT;
  }

  async function vistaCatalogo(el){
    const {db, S} = D();
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    let C; try{ C = await catalogo(true); }catch(e){ el.innerHTML = `<p class="vacio">No se ha podido leer el catálogo (${esc(e.code||e)}).</p>`; return; }
    const edita = puedePrecios();
    const filtro = {q:"", grupo:"todos"};
    el.innerHTML = `
      <h3>Catálogo</h3>
      <p class="vacio" style="margin:4px 0 10px">Productos y servicios de Contasimple. ${edita ? "Pulsa <b>Actualizar desde Contasimple</b> para traer los precios al día. Elige el <b>grupo</b> de cada uno y marca qué puede presupuestar un técnico (por defecto, lo de Mantenimiento)." : "Solo lectura."}</p>
      <div class="fi-barra">
        <input id="qCat" placeholder="Buscar…" style="flex:1;min-width:180px">
        <select id="gCat"><option value="todos">Todos los grupos</option>${GRUPOS.concat(["(sin grupo)"]).map(g => `<option>${g}</option>`).join("")}</select>
        ${edita ? `<button class="btn" id="btnSync">⟳ Actualizar desde Contasimple</button>` : ""}
        <span id="msgCat" class="vacio"></span>
      </div>
      <p id="cuentaCat" class="vacio" style="font-weight:600"></p>
      <table class="tabla-fi tabla-cat"><thead><tr><th>Producto / servicio</th><th>Precio</th><th>IVA</th><th>Grupo</th><th>Técnico</th></tr></thead><tbody id="tbCat"></tbody></table>`;
    const pintar = () => {
      const q = sinAc(filtro.q);
      const L = Object.entries(C).filter(([k,p]) => p.activo !== false && (!q || sinAc(p.nombre + " " + (p.descripcion||"")).includes(q))
        && (filtro.grupo === "todos" || (filtro.grupo === "(sin grupo)" ? !p.grupo : p.grupo === filtro.grupo))).sort((a,b) => a[1].nombre.localeCompare(b[1].nombre));
      el.querySelector("#cuentaCat").textContent = L.length + " de " + Object.keys(C).length;
      el.querySelector("#tbCat").innerHTML = L.map(([k,p]) => `<tr data-k="${k}">
        <td>${esc(p.nombre)}${p.descripcion && p.descripcion !== p.nombre ? `<br><span class="vacio">${esc(p.descripcion)}</span>` : ""}</td>
        <td>${eur(p.precio)}</td><td>${p.iva === IVA ? IVA + " %" : `<span class="tag aviso">${esc(p.iva)} %</span>`}</td>
        <td>${edita ? `<select class="selGrupo"><option value="">—</option>${GRUPOS.map(g => `<option ${p.grupo===g?"selected":""}>${g}</option>`).join("")}</select>` : esc(p.grupo||"—")}</td>
        <td>${edita ? `<input type="checkbox" class="chkTec" ${p.tecnico ? "checked" : ""}>` : (p.tecnico ? "Sí" : "")}</td></tr>`).join("") || `<tr><td colspan="5" class="vacio">${Object.keys(C).length ? "Nada con ese filtro." : "Todavía vacío: pulsa «Actualizar desde Contasimple»."}</td></tr>`;
      if(!edita) return;
      const guardar = async (k, cambio) => {
        const yo = S.usuario.email.toLowerCase();
        try{ await db.collection("dhs_catalogo").doc(k).set({...cambio, modificado:{por:yo, en:firebase.firestore.FieldValue.serverTimestamp()}}, {merge:true}); Object.assign(C[k], cambio); }
        catch(e){ alert("No se ha podido guardar (" + (e.code||e) + ")."); }
      };
      el.querySelectorAll(".selGrupo").forEach(s => s.onchange = () => { const k = s.closest("tr").dataset.k; const g = s.value;
        const c = {grupo:g}; if(g === "Mantenimiento" && C[k].tecnico === undefined) c.tecnico = true; guardar(k, c).then(pintar); });
      el.querySelectorAll(".chkTec").forEach(c => c.onchange = () => guardar(c.closest("tr").dataset.k, {tecnico:c.checked}));
    };
    el.querySelector("#qCat").oninput = e => { filtro.q = e.target.value; pintar(); };
    el.querySelector("#gCat").onchange = e => { filtro.grupo = e.target.value; pintar(); };
    const bS = el.querySelector("#btnSync");
    if(bS) bS.onclick = async () => {
      const m = x => el.querySelector("#msgCat").textContent = x;
      bS.disabled = true; m("Leyendo Contasimple…");
      try{
        const L = await llamar("catalogo", {});
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        let nuevos = 0, cambian = 0;
        for(let i = 0; i < L.length; i += 400){
          const b = db.batch();
          L.slice(i, i+400).forEach(p => {
            const k = String(p.id), ant = C[k];
            if(!ant) nuevos++; else if(ant.precio !== p.precio || ant.nombre !== p.nombre) cambian++;
            b.set(db.collection("dhs_catalogo").doc(k), {csId:p.id, nombre:p.nombre, precio:p.precio, iva:p.iva, descripcion:p.descripcion, activo:p.activo, codigo:p.codigo, actualizado:en, modificado:{por:yo, en}}, {merge:true});
          });
          await b.commit();
        }
        await db.collection("dhs_registro").add({por:yo, en, accion:"catálogo actualizado desde Contasimple (" + L.length + " · " + nuevos + " nuevos · " + cambian + " cambian)", coleccion:"dhs_catalogo"});
        m(L.length + " productos · " + nuevos + " nuevos · " + cambian + " con cambios.");
        C = await catalogo(true); pintar();
      }catch(e){ m("No se ha podido: " + (e.message||e)); }
      bS.disabled = false;
    };
    pintar();
  }

  // ---------- Presupuestos de una comunidad (pestaña de la ficha) ----------
  async function pestana(el, comId, com){
    const {db} = D();
    if(!puedeVerPres()){ el.innerHTML = `<h3>Presupuestos</h3><p class="vacio">Tu perfil no puede ver presupuestos.</p>`; return; }
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    let L = [];
    try{ (await db.collection("dhs_presupuestos").where("comunidadId", "==", comId).get()).forEach(d => L.push({id:d.id, ...d.data()})); }
    catch(e){ el.innerHTML = `<p class="vacio">No se han podido leer (${esc(e.code||e)}).</p>`; return; }
    L.sort((a,b) => (b.numero||"").localeCompare(a.numero||""));
    const pend = L.filter(p => ["pendiente","enviado"].includes(p.estado)), resto = L.filter(p => !["pendiente","enviado"].includes(p.estado));
    const fila = p => { const e = ESTADOS[p.estado] || ["",p.estado]; return `<a class="fila fila-pres est-p-${esc(p.estado)}" href="#" data-id="${esc(p.id)}">
      <div class="f-nombre">${esc(p.numero)} <span class="vacio">· ${p.fecha ? esc(new Date(p.fecha + "T12:00").toLocaleDateString("es-ES")) : ""}</span></div>
      <div class="f-sub">${esc((p.lineas||[]).map(l => l.concepto).join(", ").slice(0,120))}</div>
      <div class="f-tags"><b>${eur(p.totales && p.totales.total)}</b> <span class="tag est-p-${esc(p.estado)}">${e[0]} ${e[1]}</span></div></a>`; };
    el.innerHTML = `
      <div class="cab-lista"><h3>Presupuestos</h3>${puedePrecios() ? `<button class="btn" id="btnNuevoP">+ Nuevo presupuesto</button>` : ""}</div>
      ${!com.csId && !com.nif ? `<p class="aviso-cal">Esta comunidad no tiene NIF ni código de Contasimple: complétalo en «Editar ficha» antes de presupuestar.</p>` : ""}
      <h4 style="margin-top:10px">Pendientes (${pend.length})</h4><div class="lista">${pend.map(fila).join("") || `<p class="vacio">Ninguno.</p>`}</div>
      <h4 style="margin-top:14px">Resueltos (${resto.length})</h4><div class="lista">${resto.map(fila).join("") || `<p class="vacio">Ninguno.</p>`}</div>`;
    const bN = el.querySelector("#btnNuevoP"); if(bN) bN.onclick = () => editor(el, comId, com);
    el.querySelectorAll(".fila-pres").forEach(a => a.onclick = ev => { ev.preventDefault(); detalle(el, comId, com, L.find(p => p.id === a.dataset.id)); });
  }

  // ---------- Nuevo presupuesto ----------
  async function editor(el, comId, com){
    const {db, S} = D();
    let C; try{ C = await catalogo(); }catch(e){ C = {}; }
    const dir = puedePrecios();
    const lineas = [];
    el.innerHTML = `
      <div class="cab-lista"><h3>Nuevo presupuesto · ${esc(com.nombre)}</h3><button class="btn sec" id="btnVolverP">‹ Volver</button></div>
      <p class="vacio">Se guarda en Contasimple con el siguiente número correlativo y esta comunidad como cliente. IVA 21 %.</p>
      <div class="bloque" style="margin-top:10px">
        <label class="campo"><span>Añadir del catálogo</span><input id="busCat" placeholder="Escribe: LNB, monitor Fermax, hora de trabajo…" autocomplete="off"><div id="resCat" class="res-local oculto"></div></label>
        ${dir ? `<button class="btn sec" id="btnLibre">+ Línea libre (fuera de catálogo)</button>` : ""}
        <table class="tabla-fi tabla-lineas"><thead><tr><th>Concepto</th><th>Cant.</th><th>Precio</th><th>Dto. %</th><th>Importe</th><th></th></tr></thead><tbody id="tbL"></tbody></table>
        <div class="totales" id="totP"></div>
        <label class="campo" style="margin-top:8px"><span>Notas (salen en el presupuesto)</span><textarea id="notasP" rows="2"></textarea></label>
        <p><button class="btn" id="btnGuardarP">Guardar presupuesto</button> <span id="msgP" class="vacio"></span></p>
      </div>`;
    const tb = el.querySelector("#tbL");
    const calc = l => r2(l.cantidad * l.precio * (1 - (l.descuento||0)/100));
    const totales = () => {
      const base = r2(lineas.reduce((n,l) => n + calc(l), 0)), iva = r2(base * IVA / 100);
      el.querySelector("#totP").innerHTML = `Base <b>${eur(base)}</b> · IVA 21 % <b>${eur(iva)}</b> · Total <b class="grande">${eur(base + iva)}</b>`;
    };
    const pintar = () => {
      tb.innerHTML = lineas.map((l, i) => `<tr data-i="${i}">
        <td>${dir || !l.productoId ? `<input class="lC" value="${esc(l.concepto)}">` : esc(l.concepto)}</td>
        <td><input class="lQ" type="number" min="0" step="0.5" value="${l.cantidad}"></td>
        <td>${dir ? `<input class="lP" type="number" step="0.01" value="${l.precio}">` : eur(l.precio)}</td>
        <td>${dir ? `<input class="lD" type="number" min="0" max="100" value="${l.descuento||0}">` : (l.descuento ? l.descuento + " %" : "")}</td>
        <td>${eur(calc(l))}</td><td><button class="btn sec mini-btn lX">✕</button></td></tr>`).join("") || `<tr><td colspan="6" class="vacio">Añade líneas del catálogo${dir ? " o una línea libre" : ""}.</td></tr>`;
      totales();
      tb.querySelectorAll("tr[data-i]").forEach(tr => {
        const l = lineas[tr.dataset.i];
        // Al escribir solo se recalcula el importe y los totales (sin redibujar: no se pierde lo que se teclea)
        const on = (cls, f) => { const x = tr.querySelector(cls); if(x) x.oninput = () => { f(x.value); tr.children[4].textContent = eur(calc(l)); totales(); }; };
        on(".lC", v => l.concepto = v); on(".lQ", v => l.cantidad = Number(v)||0); on(".lP", v => l.precio = Number(v)||0); on(".lD", v => l.descuento = Math.min(100, Math.max(0, Number(v)||0)));
        tr.querySelector(".lX").onclick = () => { lineas.splice(tr.dataset.i, 1); pintar(); };
      });
    };
    const bus = el.querySelector("#busCat"), res = el.querySelector("#resCat");
    const permitidos = Object.entries(C).filter(([k,p]) => p.activo !== false && (dir || p.tecnico));
    bus.oninput = () => {
      const q = sinAc(bus.value.trim()); if(q.length < 2){ res.classList.add("oculto"); return; }
      const L = permitidos.filter(([k,p]) => sinAc(p.nombre + " " + (p.descripcion||"")).includes(q)).slice(0, 12);
      res.innerHTML = L.map(([k,p]) => `<div class="r-item" data-k="${k}"><b>${esc(p.nombre)}</b><span>${eur(p.precio)}${p.grupo ? " · " + esc(p.grupo) : ""}</span></div>`).join("") || `<div class="r-vacio">${Object.keys(C).length ? "No está en el catálogo" : "Catálogo vacío: actualízalo en Ajustes › Catálogo"}</div>`;
      res.classList.remove("oculto");
      res.querySelectorAll(".r-item").forEach(d => d.onmousedown = e => { e.preventDefault(); const p = C[d.dataset.k];
        lineas.push({productoId:p.csId || Number(d.dataset.k), concepto:p.nombre, cantidad:1, precio:p.precio, descuento:0}); bus.value = ""; res.classList.add("oculto"); pintar(); });
    };
    bus.onblur = () => setTimeout(() => res.classList.add("oculto"), 150);
    const bL = el.querySelector("#btnLibre"); if(bL) bL.onclick = () => { lineas.push({concepto:"", cantidad:1, precio:0, descuento:0}); pintar(); tb.querySelector("tr:last-child .lC").focus(); };
    el.querySelector("#btnVolverP").onclick = () => pestana(el, comId, com);
    el.querySelector("#btnGuardarP").onclick = async () => {
      const m = x => el.querySelector("#msgP").textContent = x;
      const L = lineas.filter(l => l.concepto && l.cantidad > 0);
      if(!L.length) return m("Añade al menos una línea con concepto y cantidad.");
      if(L.some(l => !l.productoId && !dir)) return m("Solo Dirección puede añadir líneas fuera de catálogo.");
      if(!confirm("Se va a crear el presupuesto en Contasimple con el siguiente número. ¿Seguir?")) return;
      const b = el.querySelector("#btnGuardarP"); b.disabled = true; m("Guardando en Contasimple…");
      try{
        const r = await llamar("crearPresupuesto", {cliente:{csId:com.csId||null, nif:com.nif||"", nombre:com.nombre, direccion:com.direccion||"", poblacion:com.poblacion||""},
          lineas:L, notas:el.querySelector("#notasP").value.trim()});
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection("dhs_presupuestos").doc(String(r.id)).set({csId:r.id, numero:r.numero, comunidadId:comId, nombre:com.nombre, clienteId:r.clienteId,
          fecha:new Date().toISOString().slice(0,10), lineas:L, totales:r.totales, notas:el.querySelector("#notasP").value.trim(), estado:"pendiente", facturas:[],
          creado:{por:yo, en}, modificado:{por:yo, en}});
        if(!com.csId && r.clienteId){ try{ await db.collection("dhs_comunidades").doc(comId).update({csId:r.clienteId, modificado:{por:yo, en}}); com.csId = r.clienteId; }catch(e){} }
        await db.collection("dhs_registro").add({por:yo, en, accion:"presupuesto " + r.numero + " creado (" + eur(r.totales.total) + ")", coleccion:"dhs_presupuestos", docId:String(r.id), nombre:com.nombre});
        pestana(el, comId, com);
      }catch(e){ m("No se ha podido: " + (e.message||e)); b.disabled = false; }
    };
    pintar();
  }

  // ---------- Detalle: PDF, enviar, aceptar/rechazar, facturar ----------
  function detalle(el, comId, com, p){
    const {db, S} = D(), dir = S.direccion, edita = puedePrecios();
    const e = ESTADOS[p.estado] || ["",p.estado];
    el.innerHTML = `
      <div class="cab-lista"><h3>${esc(p.numero)} · ${esc(com.nombre)}</h3><button class="btn sec" id="btnVolverP">‹ Volver</button></div>
      <p><span class="tag est-p-${esc(p.estado)}">${e[0]} ${e[1]}</span> <span class="vacio">${p.fecha ? new Date(p.fecha + "T12:00").toLocaleDateString("es-ES") : ""}</span></p>
      <table class="tabla-fi"><thead><tr><th>Concepto</th><th>Cant.</th><th>Precio</th><th>Dto.</th><th>Importe</th></tr></thead><tbody>
        ${(p.lineas||[]).map(l => `<tr><td>${esc(l.concepto)}</td><td>${l.cantidad}</td><td>${eur(l.precio)}</td><td>${l.descuento ? l.descuento + " %" : ""}</td><td>${eur(r2(l.cantidad*l.precio*(1-(l.descuento||0)/100)))}</td></tr>`).join("")}
      </tbody></table>
      <div class="totales">Base <b>${eur(p.totales.base)}</b> · IVA 21 % <b>${eur(p.totales.iva)}</b> · Total <b class="grande">${eur(p.totales.total)}</b></div>
      ${p.notas ? `<p class="ft-nota" style="margin-top:6px">${esc(p.notas)}</p>` : ""}
      ${(p.facturas||[]).length ? `<p style="margin-top:8px">Facturas: ${(p.facturas).map(f => `<b>${esc(f.numero)}</b> (${eur(f.total)})`).join(" · ")}</p>` : ""}
      ${p.formaPago ? `<p class="vacio">Forma de pago: ${esc(p.formaPago)}</p>` : ""}
      <div class="botones-pres">
        <button class="btn sec" id="bPdf">📄 Ver PDF</button>
        ${edita ? `<button class="btn sec" id="bEnviar">📧 Enviar por correo</button>` : ""}
        ${edita && ["pendiente","enviado"].includes(p.estado) ? `<button class="btn btn-ok" id="bAcepta">✅ Aceptado</button><button class="btn sec" id="bRechaza">✖️ Rechazado</button>` : ""}
        ${dir && ["aceptado","parcial"].includes(p.estado) ? `<button class="btn" id="bFacturar">🧾 Facturar…</button>` : ""}
      </div>
      <div id="cajaAcc" class="bloque oculto" style="margin-top:10px"></div>
      <p id="msgD" class="vacio" style="margin-top:6px"></p>`;
    const m = x => el.querySelector("#msgD").textContent = x;
    const caja = el.querySelector("#cajaAcc");
    const yo = S.usuario.email.toLowerCase(), en = () => firebase.firestore.FieldValue.serverTimestamp();
    const ref = db.collection("dhs_presupuestos").doc(p.id);
    const reg = accion => db.collection("dhs_registro").add({por:yo, en:en(), accion:"presupuesto " + p.numero + ": " + accion, coleccion:"dhs_presupuestos", docId:p.id, nombre:com.nombre});
    el.querySelector("#btnVolverP").onclick = () => pestana(el, comId, com);
    el.querySelector("#bPdf").onclick = async () => {
      m("Pidiendo el PDF a Contasimple…");
      try{
        const r = await llamar("pdfPresupuesto", {id:p.csId, numero:p.numero});
        const bin = atob(r.base64), u8 = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        window.open(URL.createObjectURL(new Blob([u8], {type:"application/pdf"})), "_blank"); m("");
      }catch(e){ m("No se ha podido: " + (e.message||e)); }
    };
    const cambiaEstado = async (nuevo, csEstado, extra = {}) => {
      m("Guardando…");
      try{ await llamar("estadoPresupuesto", {id:p.csId, estado:csEstado}); await ref.update({estado:nuevo, ...extra, modificado:{por:yo, en:en()}}); await reg(ESTADOS[nuevo][1].toLowerCase()); Object.assign(p, {estado:nuevo}, extra); detalle(el, comId, com, p); }
      catch(e){ m("No se ha podido: " + (e.message||e)); }
    };
    const bA = el.querySelector("#bAcepta");
    if(bA) bA.onclick = () => {
      caja.classList.remove("oculto");
      caja.innerHTML = `<h4>¿Cómo se paga?</h4>
        <label class="chk"><input type="radio" name="fp" value="Todo al terminar" checked> Todo al terminar</label>
        <label class="chk"><input type="radio" name="fp" value="50 % de entrada y 50 % al terminar"> 50 % de entrada y 50 % al terminar</label>
        <label class="chk"><input type="radio" name="fp" value="otro"> Otro: <input id="fpOtro" placeholder="Ej.: 30 % entrada, resto al terminar"></label>
        <p style="margin-top:8px"><button class="btn btn-ok" id="okAcepta">Marcar como aceptado</button></p>`;
      caja.querySelector("#okAcepta").onclick = () => {
        const v = caja.querySelector('input[name=fp]:checked').value;
        cambiaEstado("aceptado", "Aceptado", {formaPago: v === "otro" ? (caja.querySelector("#fpOtro").value.trim() || "Otro") : v, aceptadoEl:new Date().toISOString().slice(0,10)});
      };
    };
    const bR = el.querySelector("#bRechaza"); if(bR) bR.onclick = () => { if(confirm("¿Marcar como rechazado?")) cambiaEstado("rechazado", "Rechazado"); };
    const bE = el.querySelector("#bEnviar");
    if(bE) bE.onclick = async () => {
      let para = "";
      try{ const C = await window.DHS_COM.datos(); const a = C.admins[com.adminId]; para = a && (a.emails||[])[0] || ""; }catch(e){}
      caja.classList.remove("oculto");
      caja.innerHTML = `<h4>Enviar ${esc(p.numero)}</h4>
        <label class="campo"><span>Para</span><input id="ePara" type="email" value="${esc(para)}"></label>
        <label class="campo"><span>Asunto</span><input id="eAsunto" value="Presupuesto ${esc(p.numero)} · ${esc(com.nombre)}"></label>
        <label class="campo"><span>Texto</span><textarea id="eTexto" rows="5">Buenos días:\n\nLes adjuntamos el presupuesto ${esc(p.numero)} para ${esc(com.nombre)}.\n\nQuedamos a su disposición para cualquier consulta.\n\nUn saludo,\nDHS Videoporters</textarea></label>
        <p class="vacio">Sale desde Contasimple con el PDF adjunto; las respuestas llegan al Gmail de DHS.</p>
        <p><button class="btn" id="okEnviar">Enviar</button></p>`;
      caja.querySelector("#okEnviar").onclick = async () => {
        const para2 = caja.querySelector("#ePara").value.trim(); if(!para2) return m("Pon el correo de destino.");
        if(!confirm("¿Enviar el presupuesto a " + para2 + "?")) return;
        m("Enviando…");
        try{
          await llamar("enviarPresupuesto", {id:p.csId, numero:p.numero, para:para2, asunto:caja.querySelector("#eAsunto").value, texto:caja.querySelector("#eTexto").value});
          const nuevo = p.estado === "pendiente" ? "enviado" : p.estado;
          await ref.update({estado:nuevo, enviadoA:para2, enviadoEl:new Date().toISOString().slice(0,10), modificado:{por:yo, en:en()}});
          if(nuevo === "enviado") try{ await llamar("estadoPresupuesto", {id:p.csId, estado:"Enviado"}); }catch(e){}
          await reg("enviado a " + para2); Object.assign(p, {estado:nuevo}); detalle(el, comId, com, p);
        }catch(e){ m("No se ha podido: " + (e.message||e)); }
      };
    };
    const bF = el.querySelector("#bFacturar");
    if(bF) bF.onclick = () => {
      const yaFact = (p.facturas||[]).reduce((n,f) => n + (f.base||0), 0), quedaBase = r2(p.totales.base - yaFact);
      caja.classList.remove("oculto");
      caja.innerHTML = `<h4>Facturar ${esc(p.numero)}</h4>
        <p class="vacio">Forma de pago acordada: <b>${esc(p.formaPago || "—")}</b>. ${yaFact ? "Ya facturado: base " + eur(yaFact) + ". Queda: base " + eur(quedaBase) + "." : ""}</p>
        <label class="chk"><input type="radio" name="fq" value="todo" checked> ${yaFact ? "El resto (" + eur(quedaBase) + " + IVA)" : "Todo (" + eur(p.totales.base) + " + IVA)"}</label>
        <label class="chk"><input type="radio" name="fq" value="pct"> Un porcentaje: <input id="fPct" type="number" min="1" max="100" value="50" style="width:70px"> % (entrada)</label>
        <p class="aviso-edicion" style="margin-top:8px">⚠️ Se emitirá una <b>factura real</b> en Contasimple con el siguiente número. Una factura emitida no se puede borrar sin más.</p>
        <p><button class="btn" id="okFact">Emitir factura</button></p>`;
      caja.querySelector("#okFact").onclick = async () => {
        const modo = caja.querySelector('input[name=fq]:checked').value, pct = Math.min(100, Math.max(1, Number(caja.querySelector("#fPct").value)||0));
        let lineasF;
        if(modo === "todo" && !yaFact) lineasF = p.lineas;
        else {
          const base = modo === "todo" ? quedaBase : r2(p.totales.base * pct / 100);
          lineasF = [{concepto:(modo === "todo" ? "Resto" : pct + " % (entrada)") + " del presupuesto " + p.numero + " · " + com.nombre, cantidad:1, precio:base, descuento:0}];
        }
        const totalTxt = eur(r2(lineasF.reduce((n,l) => n + l.cantidad*l.precio*(1-(l.descuento||0)/100), 0) * 1.21));
        if(!confirm("¿Emitir la factura en Contasimple por " + totalTxt + " (IVA incluido)?")) return;
        m("Emitiendo la factura…");
        try{
          const r = await llamar("facturar", {clienteId:p.clienteId, presupuestoId:p.csId, lineas:lineasF, notas:"Presupuesto " + p.numero});
          const facturas = (p.facturas||[]).concat([{csId:r.id, numero:r.numero, periodo:r.periodo, base:r.totales.base, total:r.totales.total, fecha:new Date().toISOString().slice(0,10), cobrada:false}]);
          const baseFact = facturas.reduce((n,f) => n + f.base, 0);
          const nuevo = baseFact >= p.totales.base - 0.01 ? "facturado" : "parcial";
          await ref.update({facturas, estado:nuevo, modificado:{por:yo, en:en()}});
          await reg("factura " + r.numero + " emitida (" + eur(r.totales.total) + ")");
          Object.assign(p, {facturas, estado:nuevo}); detalle(el, comId, com, p);
        }catch(e){ m("No se ha podido: " + (e.message||e)); }
      };
    };
  }

  window.DHS_PRES = { llamar, vistaCatalogo, pestana, puedeVerPres };
})();
