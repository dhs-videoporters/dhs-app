// DHS App — Intervenciones (colección dhs_trabajos): alta, lista con prioridades, ficha y lista por comunidad.
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sinAc = s => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const D = () => window.DHS;

  // Especialidad: de qué va (para que Joel vea de un vistazo qué es cada cosa).
  const ESPEC = {videoportero:["🔔","Videoportero"], antena:["📡","Antena / parabólica"], electricidad:["⚡","Electricidad"], camaras:["📹","Cámaras"], otros:["🔧","Otros"]};
  const TIPOS = {reparacion:"Reparación", instalacion:"Instalación", mantenimiento:"Mantenimiento", pequeno:"Cosa pequeña", presupuesto:"Visita para presupuesto"};
  // Prioridad con puntos de color. Joel la cambia tocando el punto en la lista.
  const PRIOR = {urgente:["🔴","Urgente",0], alta:["🟠","Alta",1], normal:["🟡","Normal",2], baja:["🟢","Baja",3]};
  const ORDEN_PRIOR = ["urgente","alta","normal","baja"];
  const ESTADOS = {nuevo:"Nuevo", presupuesto:"Pendiente de presupuesto", esperando:"Esperando respuesta", agendado:"Agendado", amedias:"A medias", hecho:"Hecho", facturado:"Facturado", cobrado:"Cobrado", cancelado:"Cancelado"};
  const CERRADOS = ["hecho","facturado","cobrado","cancelado"];
  const DURACIONES = [30,60,90,120,150,180,240,300,360,420,480];
  const durTxt = m => m < 60 ? m + " min" : (m % 60 ? Math.floor(m/60) + " h " + (m%60) + " min" : (m/60) + (m === 60 ? " hora" : " horas"));
  const HORAS = []; for(let h = 9; h < 18; h++){ HORAS.push(String(h).padStart(2,"0")+":00"); HORAS.push(String(h).padStart(2,"0")+":30"); }
  const fmtFecha = f => f ? new Date(f + "T12:00").toLocaleDateString("es-ES", {weekday:"short", day:"numeric", month:"short"}) : "";
  const especTxt = t => ESPEC[t.especialidad] ? ESPEC[t.especialidad][0] + " " + ESPEC[t.especialidad][1] : "";

  let PERSONAL = null;
  async function personal(){
    if(!PERSONAL){ const q = await D().db.collection("dhs_personal").get(); PERSONAL = {}; q.forEach(d => PERSONAL[d.id] = d.data()); }
    return PERSONAL;
  }

  // Número correlativo por año: 2026-0001 (transacción para que dos personas no saquen el mismo).
  async function siguienteNumero(){
    const {db} = D(), anyo = new Date().getFullYear(), ref = db.collection("dhs_contadores").doc("trabajos-" + anyo);
    const n = await db.runTransaction(async tx => {
      const d = await tx.get(ref);
      const v = d.exists ? d.data().valor + 1 : 1;
      tx.set(ref, {valor:v});
      return v;
    });
    return anyo + "-" + String(n).padStart(4, "0");
  }

  // Resumen de la ficha de la comunidad, para tenerla delante al dar de alta.
  function miniFicha(c, admins){
    const vp = c.videoportero || {}, tv = c.tv || {}, pr = c.presidente || {};
    const l = (k, v) => v ? `<div class="dato"><span>${k}</span><b>${v}</b></div>` : "";
    return `<div class="mini-ficha">
      ${l("Dirección", esc([c.direccion, c.poblacion].filter(Boolean).join(" · ")))}
      ${l("Administración", esc(admins[c.adminId] ? admins[c.adminId].nombre : ""))}
      ${l("Presidente", pr.nombre ? "★ " + esc([pr.nombre, pr.piso].filter(Boolean).join(" · ")) + (pr.telefono ? ` · <a href="tel:${esc(pr.telefono)}">${esc(pr.telefono)}</a>` : "") : "")}
      ${l("Vecinos", esc(c.vecinos))}
      ${l("Videoportero", esc([vp.marca, vp.modelo].filter(Boolean).join(" · ")))}
      ${l("Antena", esc([tv.antena, tv.parabolica ? "con parabólica" : ""].filter(Boolean).join(" · ")))}
      ${c.notas ? `<p class="vacio" style="white-space:pre-wrap;margin-top:4px">📝 ${esc(c.notas)}</p>` : ""}
      <p style="margin-top:6px"><a href="#comunidad/${encodeURIComponent(c._id)}" target="_blank">Abrir ficha completa ↗</a></p>
    </div>`;
  }

  // ---------- ALTA ----------
  async function nueva(el, comId){
    const {S} = D();
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    let C = {coms:{}, admins:{}}, P;
    try{ P = await personal(); if(S.puede("comunidades")) C = await window.DHS_COM.datos(); }
    catch(e){ el.innerHTML = `<div class="panel">No se han podido leer los datos (${esc(e.code)}).</div>`; return; }
    Object.entries(C.coms).forEach(([k,c]) => c._id = k);
    const com = comId ? C.coms[comId] : null;
    const adminsOrd = Object.entries(C.admins).filter(([k,a]) => a.activo !== false).sort((a,b) => a[1].nombre.localeCompare(b[1].nombre));
    const activos = Object.entries(P).filter(([k,p]) => p.activo !== false).sort((a,b) => a[1].nombre.localeCompare(b[1].nombre));
    const hoy = new Date().toISOString().slice(0,10);
    el.innerHTML = `
      <a href="${com ? "#comunidad/" + encodeURIComponent(comId) : "#intervenciones"}" class="volver">‹ ${com ? esc(com.nombre) : "Intervenciones"}</a>
      <form id="fT" class="panel form">
        <h2>Nueva intervención</h2>
        <div class="rejilla" style="margin-top:10px">
          <div class="bloque"><h3>Cliente</h3>
            <div class="seg2">
              <label><input type="radio" name="origen" value="comunidad" checked> Comunidad / empresa</label>
              <label><input type="radio" name="origen" value="particular"> Particular nuevo</label>
            </div>
            <div id="bloqueCom">
              <label class="campo"><span>1 · Administración</span>
                <select id="selAdm">
                  <option value="*">Todas</option>
                  ${adminsOrd.map(([k,a]) => `<option value="${esc(k)}" ${com && com.adminId === k ? "selected" : ""}>${esc(a.nombre)}</option>`).join("")}
                  <option value="-" ${com && !com.adminId ? "selected" : ""}>Sin administración (empresas y particulares)</option>
                </select></label>
              <label class="campo"><span>2 · Comunidad *</span>
                <select id="selCom"></select></label>
              <label class="campo"><span>o búscala por calle</span>
                <input id="busComT" placeholder="Escribe calle o nombre…" autocomplete="off">
                <div id="resComT" class="res-local oculto"></div></label>
              <input type="hidden" name="comunidadId" value="${esc(comId||"")}">
              <div id="infoCom"></div>
            </div>
            <div id="bloquePart" class="oculto">
              <label class="campo"><span>Nombre del cliente *</span><input name="pNombre"></label>
              <label class="campo"><span>Dirección *</span><input name="pDireccion"></label>
              <label class="campo"><span>Población</span><input name="pPoblacion"></label>
              <label class="campo"><span>Teléfono</span><input name="pTelefono" type="tel"></label>
              <label class="campo"><span>Correo (para la factura)</span><input name="pEmail" type="email"></label>
            </div>
          </div>
          <div class="bloque"><h3>Qué hay que hacer</h3>
            <div class="campo"><span>De qué es *</span><div class="seg2 grande">${Object.entries(ESPEC).map(([k,[i,n]]) => `<label><input type="radio" name="especialidad" value="${k}"> ${i} ${n}</label>`).join("")}</div></div>
            <div class="campo"><span>Prioridad</span><div class="seg2 grande">${ORDEN_PRIOR.map(k => `<label><input type="radio" name="urgencia" value="${k}" ${k==="normal"?"checked":""}> ${PRIOR[k][0]} ${PRIOR[k][1]}</label>`).join("")}</div></div>
            <label class="campo"><span>Tipo</span><select name="tipo">${Object.entries(TIPOS).map(([k,n]) => `<option value="${k}">${n}</option>`).join("")}</select></label>
            <label class="campo"><span>Descripción *</span><textarea name="descripcion" rows="4" placeholder="Ej.: No funciona el monitor del 3º 1ª, no se oye."></textarea></label>
            <label class="campo"><span>Quién avisa (nombre y piso)</span><input name="avisaNombre" placeholder="Raquel, 3º 1ª"></label>
            <label class="campo"><span>Teléfono de quien avisa</span><input name="avisaTel" type="tel"></label>
          </div>
          <div class="bloque"><h3>Cita</h3>
            <label class="chk" style="margin-bottom:8px"><input type="checkbox" id="sinFecha"> Todavía sin fecha</label>
            <div id="bloqueCita">
              <label class="campo"><span>Día</span><input name="fecha" type="date" value="${hoy}"></label>
              <label class="campo"><span>Hora</span><select name="hora">${HORAS.map(h => `<option ${h==="09:00"?"selected":""}>${h}</option>`).join("")}</select></label>
            </div>
            <label class="campo"><span>Duración estimada</span><select name="duracion">${DURACIONES.map(m => `<option value="${m}" ${m===60?"selected":""}>${durTxt(m)}</option>`).join("")}</select></label>
            <div class="campo"><span>Quién va</span>
              <div class="personas-sel">${activos.map(([k,p]) => `<label><input type="checkbox" name="asignados" value="${k}"><i style="background:${esc(p.color)}"></i>${esc(p.nombre)}</label>`).join("") || `<span class="vacio">Da de alta al equipo en Ajustes › Equipo.</span>`}</div>
            </div>
          </div>
        </div>
        <p style="margin-top:12px"><button class="btn" type="submit">Guardar intervención</button> <span id="msgT" class="vacio"></span></p>
      </form>`;

    const f = el.querySelector("#fT"), msg = t => el.querySelector("#msgT").textContent = t;
    const origen = () => f.origen.value;
    const pintarOrigen = () => { el.querySelector("#bloqueCom").classList.toggle("oculto", origen() !== "comunidad"); el.querySelector("#bloquePart").classList.toggle("oculto", origen() !== "particular"); };
    f.querySelectorAll('input[name=origen]').forEach(r => r.onchange = pintarOrigen); pintarOrigen();
    el.querySelector("#sinFecha").onchange = e => el.querySelector("#bloqueCita").classList.toggle("oculto", e.target.checked);

    // 1 · administración → 2 · comunidades de esa administración → ficha a la vista
    const selAdm = el.querySelector("#selAdm"), selCom = el.querySelector("#selCom"), info = el.querySelector("#infoCom");
    const elegir = id => {
      f.comunidadId.value = id || "";
      const c = C.coms[id];
      info.innerHTML = c ? miniFicha(c, C.admins) : "";
      if(selCom.value !== (id || "")) selCom.value = id || "";
    };
    const pintarComs = () => {
      const a = selAdm.value;
      const lista = Object.entries(C.coms).filter(([k,c]) => c.activo !== false && (a === "*" || (a === "-" ? !c.adminId : c.adminId === a)))
        .sort((x,y) => x[1].nombre.localeCompare(y[1].nombre));
      selCom.innerHTML = `<option value="">— Elige (${lista.length}) —</option>` + lista.map(([k,c]) => `<option value="${esc(k)}">${esc(c.nombre)}${c.direccion && c.direccion !== c.nombre ? " · " + esc(c.direccion) : ""}</option>`).join("");
      elegir(lista.some(([k]) => k === f.comunidadId.value) ? f.comunidadId.value : "");
    };
    selAdm.onchange = pintarComs;
    selCom.onchange = () => elegir(selCom.value);
    pintarComs();
    if(!S.puede("comunidades")){ selAdm.disabled = selCom.disabled = true; }

    // Búsqueda directa por calle (por si no sabes la administración)
    const bus = el.querySelector("#busComT"), res = el.querySelector("#resComT");
    bus.oninput = () => {
      const q = sinAc(bus.value.trim()); if(q.length < 2){ res.classList.add("oculto"); return; }
      const lista = Object.entries(C.coms).filter(([k,c]) => c.activo !== false && sinAc([c.nombre,c.direccion,c.poblacion,c.nif].join(" ")).includes(q)).slice(0, 10);
      res.innerHTML = lista.map(([k,c]) => `<div class="r-item" data-id="${k}"><b>${esc(c.nombre)}</b><span>${esc([c.direccion,c.poblacion, C.admins[c.adminId] ? C.admins[c.adminId].nombre : ""].filter(Boolean).join(" · "))}</span></div>`).join("") || `<div class="r-vacio">Sin resultados</div>`;
      res.classList.remove("oculto");
      res.querySelectorAll(".r-item").forEach(d => d.onmousedown = e => {
        e.preventDefault(); const c = C.coms[d.dataset.id];
        selAdm.value = c.adminId && C.admins[c.adminId] ? c.adminId : "-"; f.comunidadId.value = d.dataset.id;
        pintarComs(); bus.value = ""; res.classList.add("oculto");
      });
    };
    bus.onblur = () => setTimeout(() => res.classList.add("oculto"), 150);

    f.onsubmit = async ev => {
      ev.preventDefault();
      const fd = new FormData(f), v = k => (fd.get(k) || "").toString().trim();
      const asignados = fd.getAll("asignados");
      const sinFecha = el.querySelector("#sinFecha").checked;
      let cliente;
      if(origen() === "comunidad"){
        const id = v("comunidadId"); if(!id) return msg("Elige la comunidad.");
        const c = C.coms[id];
        cliente = {comunidadId:id, nombre:c.nombre, direccion:c.direccion||"", poblacion:c.poblacion||"", adminId:c.adminId||null, origen: c.adminId ? "administracion" : (c.tipo === "particular" ? "particular" : "empresa")};
      } else {
        if(!v("pNombre") || !v("pDireccion")) return msg("Pon el nombre y la dirección del particular.");
        cliente = {comunidadId:null, nombre:v("pNombre"), direccion:v("pDireccion"), poblacion:v("pPoblacion"), telefono:v("pTelefono"), email:v("pEmail").toLowerCase(), adminId:null, origen:"particular"};
      }
      if(!v("especialidad")) return msg("Marca de qué es: videoportero, antena, electricidad, cámaras u otros.");
      if(!v("descripcion")) return msg("Escribe qué hay que hacer.");
      if(!sinFecha && !asignados.length && !confirm("No has elegido quién va. ¿Guardar igualmente?")) return;
      const {db} = D(), yo = S.usuario.email.toLowerCase();
      const firma = {por:yo, en:firebase.firestore.FieldValue.serverTimestamp()};
      const dur = Number(v("duracion")) || 60;
      const citas = sinFecha ? [] : [{fecha:v("fecha"), hora:v("hora"), duracion:dur, personal:asignados}];
      msg("Guardando…");
      try{
        const numero = await siguienteNumero();
        const datos = {
          numero, ...cliente, especialidad:v("especialidad"), tipo:v("tipo"), urgencia:v("urgencia") || "normal",
          estado: citas.length ? "agendado" : (v("tipo") === "presupuesto" ? "presupuesto" : "nuevo"),
          descripcion:v("descripcion"), avisa:{nombre:v("avisaNombre"), telefono:v("avisaTel")},
          duracionEstimada:dur, citas, asignados, hechoPor:[], material:[], tiempoReal:null, fotos:[],
          creadoPorTecnico: !S.puede("trabajos","todo"),
          creado:firma, modificado:firma
        };
        const ref = await db.collection("dhs_trabajos").add(datos);
        await db.collection("dhs_registro").add({por:yo, en:firma.en, accion:"alta", coleccion:"dhs_trabajos", docId:ref.id, nombre:numero + " · " + cliente.nombre});
        // Al guardar: si es de una comunidad, se abre su ficha en la pestaña Intervenciones.
        if(cliente.comunidadId && S.puede("comunidades")){ window.DHS_COM.abrirPestana("intervenciones"); location.hash = "comunidad/" + encodeURIComponent(cliente.comunidadId); }
        else location.hash = "intervencion/" + ref.id;
      }catch(e){ msg("No se ha podido guardar (" + (e.code||e) + ")."); }
    };
  }

  // ---------- Leer ----------
  async function leer(filtroCom){
    const {db, S} = D();
    let q = db.collection("dhs_trabajos");
    if(filtroCom) q = q.where("comunidadId", "==", filtroCom);
    else if(!S.puede("trabajos","ver")) q = q.where("asignados", "array-contains", S.personalId || "-");   // subcontratas: solo los suyos
    const docs = []; (await q.get()).forEach(d => docs.push({id:d.id, ...d.data()}));
    return docs;
  }
  const porPrioridad = (a,b) => ((PRIOR[a.urgencia]||PRIOR.normal)[2] - (PRIOR[b.urgencia]||PRIOR.normal)[2]) || (a.numero||"").localeCompare(b.numero||"");

  function fila(t, P){
    const cita = (t.citas||[])[0], pr = PRIOR[t.urgencia] || PRIOR.normal;
    const quien = (t.asignados||[]).map(k => P[k] ? `<span class="quien"><i class="punto" style="background:${esc(P[k].color)}"></i>${esc(P[k].nombre)}</span>` : "").join("");
    const cambia = D().S.puede("trabajos","todo") && !CERRADOS.includes(t.estado);
    return `<div class="fila fila-int">
      <button class="prio ${cambia ? "cambia" : ""}" data-id="${t.id}" title="Prioridad: ${pr[1]}${cambia ? " (toca para cambiar)" : ""}" ${cambia ? "" : "disabled"}>${pr[0]}</button>
      <a class="f-cuerpo" href="#intervencion/${t.id}">
        <div class="f-nombre">${ESPEC[t.especialidad] ? ESPEC[t.especialidad][0] + " " : ""}${esc(t.nombre)} <span class="vacio">· ${esc(t.numero)}</span></div>
        <div class="f-sub">${esc((t.descripcion||"").slice(0,110))}</div>
        <div class="f-tags">${quien}<span class="tag est-${esc(t.estado)}">${esc(ESTADOS[t.estado]||t.estado)}</span>${cita ? `<span class="tag gris">${esc(fmtFecha(cita.fecha))} ${esc(cita.hora)}</span>` : `<span class="tag aviso">Sin fecha</span>`}</div>
      </a></div>`;
  }

  // Tocar el punto: urgente → alta → normal → baja → urgente…
  function activarPrioridad(el, docs, repintar){
    el.querySelectorAll(".prio.cambia").forEach(b => b.onclick = async () => {
      const t = docs.find(x => x.id === b.dataset.id); if(!t) return;
      const ant = PRIOR[t.urgencia] ? t.urgencia : "normal", nuevo = ORDEN_PRIOR[(ORDEN_PRIOR.indexOf(ant) + 1) % 4];
      const {db, S} = D(), yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
      t.urgencia = nuevo; repintar();
      try{
        await db.collection("dhs_trabajos").doc(t.id).update({urgencia:nuevo, modificado:{por:yo, en}});
        await db.collection("dhs_registro").add({por:yo, en, accion:"prioridad " + PRIOR[ant][1] + " → " + PRIOR[nuevo][1], coleccion:"dhs_trabajos", docId:t.id, nombre:t.numero + " · " + t.nombre});
      }catch(e){ t.urgencia = ant; repintar(); alert("No se ha podido cambiar (" + (e.code||e) + ")."); }
    });
  }

  // ---------- LISTA (pendientes primero, por prioridad) ----------
  const filtro = {ver:"pendientes", espec:"todas"};
  async function lista(el){
    const {S} = D();
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    let docs, P;
    try{ P = await personal(); docs = await leer(); }
    catch(e){ el.innerHTML = `<div class="panel">No se han podido leer las intervenciones (${esc(e.code)}).</div>`; return; }
    el.innerHTML = `
      <div class="panel">
        <div class="cab-lista"><h2>Intervenciones</h2>${S.puede("trabajos","editar") ? `<a class="btn" href="#nueva-intervencion">+ Nueva intervención</a>` : ""}</div>
        <div class="chips" id="chVer" style="margin-top:10px">
          ${[["pendientes","Pendientes"],["hechas","Hechas"],["todas","Todas"]].map(([k,n]) => `<button class="chip ${filtro.ver===k?"on":""}" data-k="${k}">${n}</button>`).join("")}
        </div>
        <div class="chips" id="chEsp" style="margin-top:6px">
          <button class="chip ${filtro.espec==="todas"?"on":""}" data-k="todas">Todo</button>
          ${Object.entries(ESPEC).map(([k,[i,n]]) => `<button class="chip ${filtro.espec===k?"on":""}" data-k="${k}">${i} ${n}</button>`).join("")}
        </div>
        <p class="vacio" style="margin-top:8px">${ORDEN_PRIOR.map(k => PRIOR[k][0] + " " + PRIOR[k][1]).join(" · ")}${S.puede("trabajos","todo") ? " — toca el punto para cambiar la prioridad" : ""}</p>
        <div class="lista" id="listaInt" style="margin-top:8px"></div>
      </div>`;
    const pintar = () => {
      const vis = docs.filter(t => (filtro.ver === "todas" || (filtro.ver === "pendientes" ? !CERRADOS.includes(t.estado) : CERRADOS.includes(t.estado)))
                              && (filtro.espec === "todas" || t.especialidad === filtro.espec)).sort(porPrioridad);
      const caja = el.querySelector("#listaInt");
      caja.innerHTML = vis.map(t => fila(t, P)).join("") || `<p class="vacio" style="padding:10px 0">No hay intervenciones aquí.</p>`;
      activarPrioridad(caja, docs, pintar);
    };
    const chips = (sel, campo) => el.querySelectorAll(sel + " .chip").forEach(b => b.onclick = () => { filtro[campo] = b.dataset.k; el.querySelectorAll(sel + " .chip").forEach(x => x.classList.toggle("on", x === b)); pintar(); });
    chips("#chVer", "ver"); chips("#chEsp", "espec");
    pintar();
  }

  // ---------- Pestaña "Intervenciones" de la ficha de comunidad ----------
  async function deComunidad(el, comId){
    const {S} = D();
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    let docs, P;
    try{ P = await personal(); docs = await leer(comId); }
    catch(e){ el.innerHTML = `<p class="vacio">No se han podido leer las intervenciones (${esc(e.code)}).</p>`; return; }
    const cifra = document.getElementById("cifraInt"); if(cifra) cifra.textContent = docs.length;
    const pend = docs.filter(t => !CERRADOS.includes(t.estado)).sort(porPrioridad);
    const hechas = docs.filter(t => CERRADOS.includes(t.estado)).sort((a,b) => (b.numero||"").localeCompare(a.numero||""));
    el.innerHTML = `
      <div class="cab-lista"><h3>Intervenciones</h3>${S.puede("trabajos","editar") ? `<a class="btn" href="#nueva-intervencion/${encodeURIComponent(comId)}">+ Nueva intervención</a>` : ""}</div>
      <h4 style="margin-top:10px">Pendientes (${pend.length})</h4><div class="lista" id="lPend"></div>
      <h4 style="margin-top:14px">Hechas (${hechas.length})</h4><div class="lista" id="lHech"></div>`;
    const pintar = () => {
      const a = el.querySelector("#lPend"); a.innerHTML = pend.map(t => fila(t, P)).join("") || `<p class="vacio">Nada pendiente.</p>`;
      activarPrioridad(a, pend, () => { pend.sort(porPrioridad); pintar(); });
      el.querySelector("#lHech").innerHTML = hechas.map(t => fila(t, P)).join("") || `<p class="vacio">Todavía ninguna.</p>`;
    };
    pintar();
  }
  async function contar(comId){ try{ return (await leer(comId)).length; }catch(e){ return null; } }

  // ---------- FICHA DE LA INTERVENCIÓN ----------
  async function ficha(el, id){
    const {db, S} = D();
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    let t, P;
    try{ P = await personal(); const d = await db.collection("dhs_trabajos").doc(id).get(); if(!d.exists) throw {code:"no existe"}; t = d.data(); }
    catch(e){ el.innerHTML = `<div class="panel">No se ha podido abrir la intervención (${esc(e.code)}). <a href="#intervenciones">Volver</a></div>`; return; }
    const dato = (k, v) => `<div class="dato"><span>${k}</span><b>${v === "" || v == null ? "—" : v}</b></div>`;
    const conFicha = t.comunidadId && S.puede("comunidades");
    const cliente = conFicha ? `<a href="#comunidad/${encodeURIComponent(t.comunidadId)}">${esc(t.nombre)}</a>` : esc(t.nombre);
    const pr = PRIOR[t.urgencia] || PRIOR.normal;
    el.innerHTML = `
      <a href="#intervenciones" class="volver">‹ Intervenciones</a>
      <div class="panel cab-ficha">
        <div class="ico-ficha">${ESPEC[t.especialidad] ? ESPEC[t.especialidad][0] : "🛠️"}</div>
        <div class="cab-txt"><h1>${cliente}</h1>
          <div class="vacio">${esc(t.numero)} · ${esc([t.direccion, t.poblacion].filter(Boolean).join(" · "))}</div></div>
        <div class="f-tags"><span class="tag">${pr[0]} ${pr[1]}</span><span class="tag est-${esc(t.estado)}">${esc(ESTADOS[t.estado]||t.estado)}</span></div>
      </div>
      <div class="panel" style="margin-top:14px"><div class="rejilla">
        <div class="bloque"><h3>Intervención</h3>
          ${dato("De qué es", esc(especTxt(t)))}${dato("Tipo", esc(TIPOS[t.tipo]))}${dato("Prioridad", pr[0] + " " + pr[1])}
          <p style="white-space:pre-wrap;margin-top:8px">${esc(t.descripcion)}</p></div>
        <div class="bloque"><h3>Contacto</h3>
          ${dato("Avisa", esc(t.avisa && t.avisa.nombre))}${dato("Teléfono", t.avisa && t.avisa.telefono ? `<a href="tel:${esc(t.avisa.telefono)}">${esc(t.avisa.telefono)}</a>` : "")}
          ${!t.comunidadId ? dato("Teléfono cliente", t.telefono ? `<a href="tel:${esc(t.telefono)}">${esc(t.telefono)}</a>` : "") + dato("Correo", esc(t.email)) : ""}</div>
        <div class="bloque"><h3>Cita</h3>
          ${(t.citas||[]).map(c => dato(esc(fmtFecha(c.fecha)) + " " + esc(c.hora), esc(durTxt(c.duracion)) + " · " + (c.personal||[]).map(k => P[k] ? `<span class="punto" style="background:${esc(P[k].color)}"></span>${esc(P[k].nombre)}` : "").join(", "))).join("") || `<p class="vacio">Sin fecha todavía.</p>`}
          ${dato("Duración estimada", esc(durTxt(t.duracionEstimada||60)))}</div>
      </div>
      ${conFicha ? `<p style="margin-top:12px"><a class="btn sec" href="#comunidad/${encodeURIComponent(t.comunidadId)}">Ver ficha de ${esc(t.nombre)}</a></p>` : ""}
      <p class="vacio" style="margin-top:12px">Cambiar estado, notas, material, tiempo, fotos y "Hecho" llegan en las sesiones 18 y 19.</p></div>`;
  }

  window.DHS_TRAB = { nueva, lista, ficha, deComunidad, contar, recargarPersonal: () => { PERSONAL = null; } };
})();
