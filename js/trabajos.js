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
  const avisaTxt = t => t.avisa ? [t.avisa.nombre, t.avisa.piso].filter(Boolean).join(" · ") : "";
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
  // Desde el calendario: día, hora, duración y técnico vienen ya puestos.
  let PREFIJO = null;
  const prefijar = p => { PREFIJO = p; };
  async function nueva(el, comId){
    const pre = PREFIJO; PREFIJO = null;
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
      <a href="${pre ? "#calendario" : (com ? "#comunidad/" + encodeURIComponent(comId) : "#intervenciones")}" class="volver">‹ ${pre ? "Calendario" : (com ? esc(com.nombre) : "Intervenciones")}</a>
      <form id="fT" class="panel form">
        <h2>Nueva intervención</h2>
        ${pre ? `<p class="aviso-cal">📅 <b>${esc(fmtFecha(pre.fecha))} · ${esc(pre.hora)} (${esc(durTxt(pre.duracion))})</b> · ${(pre.personal||[]).map(k => P[k] ? esc(P[k].nombre) : "").join(", ")} — elige la comunidad y qué hay que hacer.</p>` : ""}
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
            <div class="campo"><span>Quién avisa</span>
              <div id="avisaPisoCaja"><input name="avisaPisoTxt" placeholder="Piso (ej.: 3º 1ª)"></div>
              <input name="avisaNombre" placeholder="Nombre" style="margin-top:6px">
              <input name="avisaTel" type="tel" placeholder="Teléfono" style="margin-top:6px">
              <p id="avisaInfo" class="vacio" style="margin-top:4px"></p></div>
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
    if(pre){
      f.fecha.value = pre.fecha; f.hora.value = pre.hora;
      if(![...f.duracion.options].some(o => Number(o.value) === pre.duracion)) f.duracion.insertAdjacentHTML("beforeend", `<option value="${pre.duracion}">${durTxt(pre.duracion)}</option>`);
      f.duracion.value = String(pre.duracion);
      f.querySelectorAll('input[name=asignados]').forEach(i => i.checked = (pre.personal||[]).includes(i.value));
    }

    // 1 · administración → 2 · comunidades de esa administración → ficha a la vista
    const selAdm = el.querySelector("#selAdm"), selCom = el.querySelector("#selCom"), info = el.querySelector("#infoCom");
    // Vecinos de la comunidad: al elegir el piso salen nombre y teléfono; si no estaba guardado, se guarda al dar de alta.
    let VEC = {}, PISOS = [];
    const cajaPiso = el.querySelector("#avisaPisoCaja"), avInfo = x => el.querySelector("#avisaInfo").textContent = x;
    async function cargarVecinos(id){
      VEC = {}; PISOS = [];
      const c = id ? C.coms[id] : null;
      if(c && c.estructura && window.DHS_COM.pisos){
        PISOS = window.DHS_COM.pisos(c.estructura);
        if(S.puede("vecinos")){ try{ (await D().db.collection("dhs_comunidades").doc(id).collection("contactos").get()).forEach(d => VEC[d.id] = d.data()); }catch(e){} }
        const pr = c.presidente || {};
        cajaPiso.innerHTML = `<select name="avisaClave"><option value="">— Piso —</option>${PISOS.map(p => `<option value="${p.clave}">${esc(p.piso)}${VEC[p.clave] && VEC[p.clave].nombre ? " · " + esc(VEC[p.clave].nombre) : ""}${pr.clave === p.clave ? " ★" : ""}</option>`).join("")}<option value="_otro">Otro (portería, zona común…)</option></select><input name="avisaPisoTxt" placeholder="¿Dónde?" class="oculto" style="margin-top:6px">`;
        const sel = cajaPiso.querySelector("select");
        sel.onchange = () => {
          const k = sel.value, g = VEC[k] || (pr.clave === k ? {nombre:pr.nombre, telefono:pr.telefono} : {});
          cajaPiso.querySelector("input").classList.toggle("oculto", k !== "_otro");
          f.avisaNombre.value = g.nombre || ""; f.avisaTel.value = g.telefono || "";
          avInfo(!k || k === "_otro" ? "" : (g.nombre || g.telefono ? "Guardado en los vecinos de la comunidad." : (S.puede("vecinos","editar") ? "No está guardado: lo que escribas se guardará en los vecinos de la comunidad." : "")));
        };
      } else {
        cajaPiso.innerHTML = `<input name="avisaPisoTxt" placeholder="Piso (ej.: 3º 1ª)">`;
        avInfo(c ? "Esta comunidad no tiene configurados los pisos (Ficha › Vecinos)." : "");
      }
    }
    const elegir = id => {
      f.comunidadId.value = id || "";
      const c = C.coms[id];
      info.innerHTML = c ? miniFicha(c, C.admins) : "";
      cargarVecinos(c ? id : null);
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
      const clave = cliente.comunidadId && v("avisaClave") && v("avisaClave") !== "_otro" ? v("avisaClave") : "";
      const pisoTxt = clave ? (PISOS.find(p => p.clave === clave) || {}).piso || "" : v("avisaPisoTxt");
      const avisa = {nombre:v("avisaNombre"), piso:pisoTxt, telefono:v("avisaTel"), clave};
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
          descripcion:v("descripcion"), avisa:avisa,
          duracionEstimada:dur, citas, asignados, hechoPor:[], material:[], tiempoReal:null, fotos:[],
          creadoPorTecnico: !S.puede("trabajos","todo"),
          creado:firma, modificado:firma
        };
        const ref = await db.collection("dhs_trabajos").add(datos);
        await db.collection("dhs_registro").add({por:yo, en:firma.en, accion:"alta", coleccion:"dhs_trabajos", docId:ref.id, nombre:numero + " · " + cliente.nombre});
        // El vecino que avisa se guarda (o se completa) en los vecinos de la comunidad
        const g = VEC[clave] || {};
        if(clave && S.puede("vecinos","editar") && (avisa.nombre || avisa.telefono) && ((avisa.nombre && avisa.nombre !== (g.nombre||"")) || (avisa.telefono && avisa.telefono !== (g.telefono||"")))){
          try{
            await db.collection("dhs_comunidades").doc(cliente.comunidadId).collection("contactos").doc(clave)
              .set({piso:avisa.piso, nombre:avisa.nombre || g.nombre || "", telefono:avisa.telefono || g.telefono || "", modificado:firma}, {merge:true});
            await db.collection("dhs_registro").add({por:yo, en:firma.en, accion:"cambio (desde intervención " + numero + ")", coleccion:"dhs_comunidades/contactos", docId:cliente.comunidadId, nombre:cliente.nombre + " · " + avisa.piso});
          }catch(e){ console.warn("Vecino no guardado", e.code); }
        }
        // Al guardar: si es de una comunidad, se abre su ficha en la pestaña Intervenciones.
        if(pre) location.hash = "calendario";        // apuntada desde el calendario: se vuelve a él con la cita puesta
        else if(cliente.comunidadId && S.puede("comunidades")){ window.DHS_COM.abrirPestana("intervenciones"); location.hash = "comunidad/" + encodeURIComponent(cliente.comunidadId); }
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
        <div class="f-sub">${CERRADOS.includes(t.estado) && t.resumenHecho ? "✅ " + (t.fechaHecho ? esc(fmtFecha(t.fechaHecho)) + " · " : "") + esc(t.resumenHecho.slice(0,110)) : esc((t.descripcion||"").slice(0,110))}${t.estado === "amedias" && t.falta ? ` <span class="tag aviso">Falta: ${esc(t.falta.slice(0,60))}</span>` : ""}</div>
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
  const filtro = {ver:"pendientes", espec:"todas", quien:"todos", estado:"todos", texto:""};
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
        <div class="filtros-int">
          <input id="busInt" placeholder="Buscar calle, número, descripción…" value="${esc(filtro.texto)}">
          <select id="selQuien"><option value="todos">Todo el equipo</option><option value="nadie" ${filtro.quien==="nadie"?"selected":""}>Sin asignar</option>${Object.entries(P).filter(([k,p]) => p.activo !== false).sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre)).map(([k,p]) => `<option value="${esc(k)}" ${filtro.quien===k?"selected":""}>${esc(p.nombre)}</option>`).join("")}</select>
          <select id="selEstado"><option value="todos">Todos los estados</option>${Object.entries(ESTADOS).map(([k,n]) => `<option value="${k}" ${filtro.estado===k?"selected":""}>${n}</option>`).join("")}</select>
        </div>
        <p class="vacio" style="margin-top:8px">${ORDEN_PRIOR.map(k => PRIOR[k][0] + " " + PRIOR[k][1]).join(" · ")}${S.puede("trabajos","todo") ? " — toca el punto para cambiar la prioridad" : ""}</p>
        <p id="cuentaInt" class="vacio" style="margin-top:4px;font-weight:600"></p><div class="lista" id="listaInt" style="margin-top:4px"></div>
      </div>`;
    const pintar = () => {
      const vis = docs.filter(t => (filtro.ver === "todas" || (filtro.ver === "pendientes" ? !CERRADOS.includes(t.estado) : CERRADOS.includes(t.estado)))
                              && (filtro.espec === "todas" || t.especialidad === filtro.espec)
                              && (filtro.estado === "todos" || t.estado === filtro.estado)
                              && (filtro.quien === "todos" || (filtro.quien === "nadie" ? !(t.asignados||[]).length : (t.asignados||[]).includes(filtro.quien)))
                              && (!filtro.texto || sinAc([t.numero, t.nombre, t.direccion, t.poblacion, t.descripcion, avisaTxt(t)].join(" ")).includes(sinAc(filtro.texto)))).sort(porPrioridad);
      el.querySelector("#cuentaInt").textContent = vis.length + (vis.length === 1 ? " intervención" : " intervenciones");
      const caja = el.querySelector("#listaInt");
      caja.innerHTML = vis.map(t => fila(t, P)).join("") || `<p class="vacio" style="padding:10px 0">No hay intervenciones aquí.</p>`;
      activarPrioridad(caja, docs, pintar);
    };
    const chips = (sel, campo) => el.querySelectorAll(sel + " .chip").forEach(b => b.onclick = () => { filtro[campo] = b.dataset.k; el.querySelectorAll(sel + " .chip").forEach(x => x.classList.toggle("on", x === b)); pintar(); });
    chips("#chVer", "ver"); chips("#chEsp", "espec");
    el.querySelector("#busInt").oninput = e => { filtro.texto = e.target.value.trim(); pintar(); };
    el.querySelector("#selQuien").onchange = e => { filtro.quien = e.target.value; pintar(); };
    el.querySelector("#selEstado").onchange = e => { filtro.estado = e.target.value; if(e.target.value !== "todos"){ filtro.ver = "todas"; el.querySelectorAll("#chVer .chip").forEach(x => x.classList.toggle("on", x.dataset.k === "todas")); } pintar(); };
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

  // ---------- FICHA DE LA INTERVENCIÓN (sesión 18: estados, historial, notas, cita) ----------
  // Estados que puede poner cada uno. Con "editar" (técnicos) o "solo los suyos" (subcontratas): los del día a día.
  // Con "todo" (Dirección, Oficina): además presupuesto, esperando respuesta, cancelado, facturado y cobrado.
  const EST_TECNICO = ["nuevo","agendado","amedias","hecho"];
  const EST_TODO = ["nuevo","presupuesto","esperando","agendado","amedias","hecho","facturado","cobrado","cancelado"];
  const ICO_EST = {nuevo:"🆕", presupuesto:"📝", esperando:"⏳", agendado:"📅", amedias:"🔧", hecho:"✅", facturado:"🧾", cobrado:"💶", cancelado:"✖️"};
  const horaReg = ts => ts && ts.toDate ? ts.toDate().toLocaleString("es-ES", {day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit"}) : "ahora";

  // ---------- Aviso de edición simultánea (18b) ----------
  // Al empezar a cambiar algo se marca `editando` durante 10 minutos; si otro abre la misma intervención, ve el aviso.
  const MIN_EDICION = 10;
  function avisoEdicion(t){
    const e = t.editando, yo = D().S.usuario.email.toLowerCase();
    if(!e || !e.hasta || e.hasta < Date.now() || e.por === yo) return "";
    return `<div class="aviso-edicion">✏️ <b>${esc(e.nombre || e.por)}</b> está cambiando esta intervención ahora mismo (desde las ${new Date(e.hasta - MIN_EDICION*60000).toLocaleTimeString("es-ES", {hour:"2-digit", minute:"2-digit"})}). Espera a que termine o llámale para no pisaros los cambios.</div>`;
  }
  function marcarEdicion(ref){
    let hecho = false;
    return () => {
      if(hecho) return; hecho = true;
      const {S} = D(), yo = S.usuario.email.toLowerCase();
      ref.update({editando:{por:yo, nombre:S.nombre, hasta:Date.now() + MIN_EDICION*60000}, modificado:{por:yo, en:firebase.firestore.FieldValue.serverTimestamp()}}).catch(() => {});
    };
  }

  // ---------- WhatsApp (22): texto con lo justo para pasar la intervención a un técnico o subcontrata ----------
  async function textoWhatsApp(t, id, conEnlace){
    const {S} = D(); let c = null;
    if(t.comunidadId && S.puede("comunidades")){ try{ c = (await window.DHS_COM.datos()).coms[t.comunidadId] || null; }catch(e){} }
    const cita = (t.citas||[])[0], pr = PRIOR[t.urgencia] || PRIOR.normal;
    const l = [];
    l.push(`*${pr[0]} ${especTxt(t) || "Intervención"}* · ${t.numero}`);
    l.push(`📍 ${[t.direccion || t.nombre, t.poblacion].filter(Boolean).join(", ")}`);
    if(cita) l.push(`📅 ${fmtFecha(cita.fecha)} a las ${cita.hora} (${durTxt(cita.duracion)})`);
    l.push(""); l.push(t.descripcion || "");
    if(t.avisa && (t.avisa.nombre || t.avisa.telefono || t.avisa.piso)) l.push("", `📞 Avisa: ${[avisaTxt(t), t.avisa.telefono].filter(Boolean).join(" · ")}`);
    else if(!t.comunidadId && t.telefono) l.push("", `📞 ${t.nombre} · ${t.telefono}`);
    if(c && c.acceso) l.push(`🔑 ${c.acceso}`);
    l.push("", "🗺️ " + mapa(t));
    if(conEnlace) l.push("", "Ficha en la app: " + location.origin + location.pathname + "#trabajo/" + id);
    return l.join("\n");
  }

  async function ficha(el, id){
    const {db, S} = D();
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    const ref = db.collection("dhs_trabajos").doc(id);
    let t, P, notas = [];
    try{
      P = await personal(); const d = await ref.get(); if(!d.exists) throw {code:"no existe"}; t = d.data();
      (await ref.collection("notas").orderBy("en").get()).forEach(n => notas.push(n.data()));
    }catch(e){ el.innerHTML = `<div class="panel">No se ha podido abrir la intervención (${esc(e.code)}). <a href="#intervenciones">Volver</a></div>`; return; }
    const todo = S.puede("trabajos","todo");
    const mio = (t.asignados||[]).includes(S.personalId);
    const puedeTocar = todo || S.puede("trabajos","editar") || mio;
    const estadosPosibles = todo ? EST_TODO : EST_TECNICO;
    const yo = S.usuario.email.toLowerCase();
    const nombreDe = correo => { const p = Object.values(P).find(x => (x.email||"").toLowerCase() === correo); return p ? p.nombre : (correo === "herrerazarzoso@gmail.com" ? "Ángel" : correo === "dhsvideoporters@gmail.com" ? "Joel" : correo); };
    const dato = (k, v) => `<div class="dato"><span>${k}</span><b>${v === "" || v == null ? "—" : v}</b></div>`;
    const conFicha = t.comunidadId && S.puede("comunidades");
    const cliente = conFicha ? `<a href="#comunidad/${encodeURIComponent(t.comunidadId)}">${esc(t.nombre)}</a>` : esc(t.nombre);
    const pr = PRIOR[t.urgencia] || PRIOR.normal;
    const activos = Object.entries(P).filter(([k,p]) => p.activo !== false).sort((a,b) => a[1].nombre.localeCompare(b[1].nombre));
    const cita0 = (t.citas||[])[0] || {};

    el.innerHTML = `
      <a href="#intervenciones" class="volver">‹ Intervenciones</a>
      ${avisoEdicion(t)}
      <div class="panel cab-ficha">
        <div class="ico-ficha">${ESPEC[t.especialidad] ? ESPEC[t.especialidad][0] : "🛠️"}</div>
        <div class="cab-txt"><h1>${cliente}</h1>
          <div class="vacio">${esc(t.numero)} · ${esc([t.direccion, t.poblacion].filter(Boolean).join(" · "))}</div></div>
        <div class="f-tags"><span class="tag">${pr[0]} ${pr[1]}</span><span class="tag est-${esc(t.estado)}">${ICO_EST[t.estado]||""} ${esc(ESTADOS[t.estado]||t.estado)}</span></div>
      </div>

      ${puedeTocar ? `<div class="panel" style="margin-top:14px">
        <h3>Estado</h3>
        <div class="estados">${estadosPosibles.map(k => `<button class="est-btn est-${k} ${t.estado===k?"on":""}" data-k="${k}" ${t.estado===k?"disabled":""}>${ICO_EST[k]} ${ESTADOS[k]}</button>`).join("")}</div>
        <div id="cajaEstado" class="oculto" style="margin-top:10px">
          <div id="cajaHecho" class="oculto"><div class="campo"><span>¿Quién lo ha hecho?</span>
            <div class="personas-sel">${activos.map(([k,p]) => `<label><input type="checkbox" name="hechoPor" value="${k}" ${(t.hechoPor||[]).concat(t.asignados||[]).includes(k)?"checked":""}><i style="background:${esc(p.color)}"></i>${esc(p.nombre)}</label>`).join("")}</div></div></div>
          <label class="campo"><span id="txtNotaEst">Nota (opcional)</span><textarea id="notaEst" rows="2"></textarea></label>
          <button class="btn" id="okEst">Guardar</button> <button class="btn sec" id="noEst">Cancelar</button> <span id="msgEst" class="vacio"></span>
        </div>
        ${!todo ? `<p class="vacio" style="margin-top:6px">Presupuesto, cancelar, facturar y cobrar lo hace la oficina.</p>` : ""}
      </div>` : ""}

      <div class="panel" style="margin-top:14px"><div class="rejilla">
        <div class="bloque"><h3>Intervención</h3>
          ${dato("De qué es", esc(especTxt(t)))}${dato("Tipo", esc(TIPOS[t.tipo]))}
          ${dato("Prioridad", todo && !CERRADOS.includes(t.estado) ? `<select id="selPrio">${ORDEN_PRIOR.map(k => `<option value="${k}" ${k===(t.urgencia||"normal")?"selected":""}>${PRIOR[k][0]} ${PRIOR[k][1]}</option>`).join("")}</select>` : pr[0] + " " + pr[1])}
          <p style="white-space:pre-wrap;margin-top:8px">${esc(t.descripcion)}</p></div>
        <div class="bloque"><h3>Contacto</h3>
          ${dato("Avisa", esc(avisaTxt(t)))}${dato("Teléfono", t.avisa && t.avisa.telefono ? `<a href="tel:${esc(t.avisa.telefono)}">${esc(t.avisa.telefono)}</a>` : "")}
          ${!t.comunidadId ? dato("Teléfono cliente", t.telefono ? `<a href="tel:${esc(t.telefono)}">${esc(t.telefono)}</a>` : "") + dato("Correo", esc(t.email)) : ""}</div>
        <div class="bloque"><h3>Cita</h3>
          ${(t.citas||[]).map(c => dato(esc(fmtFecha(c.fecha)) + " " + esc(c.hora), esc(durTxt(c.duracion)) + " · " + (c.personal||[]).map(k => P[k] ? `<span class="punto" style="background:${esc(P[k].color)}"></span>${esc(P[k].nombre)}` : "").join(", "))).join("") || `<p class="vacio">Sin fecha todavía.</p>`}
          ${dato("Duración estimada", esc(durTxt(t.duracionEstimada||60)))}
          ${(t.hechoPor||[]).length ? dato("Hecho por", (t.hechoPor).map(k => P[k] ? esc(P[k].nombre) : "").join(", ")) : ""}
          ${todo && !CERRADOS.includes(t.estado) ? `<p style="margin-top:8px"><button class="btn sec" id="btnCita">${(t.citas||[]).length ? "Cambiar cita" : "Poner cita"}</button></p>
          <form id="fCita" class="oculto" style="margin-top:8px">
            <label class="campo"><span>Día</span><input name="fecha" type="date" value="${esc(cita0.fecha || new Date().toISOString().slice(0,10))}"></label>
            <label class="campo"><span>Hora</span><select name="hora">${HORAS.map(h => `<option ${h===(cita0.hora||"09:00")?"selected":""}>${h}</option>`).join("")}</select></label>
            <label class="campo"><span>Duración</span><select name="duracion">${DURACIONES.map(m => `<option value="${m}" ${m===(cita0.duracion||t.duracionEstimada||60)?"selected":""}>${durTxt(m)}</option>`).join("")}</select></label>
            <div class="campo"><span>Quién va</span><div class="personas-sel">${activos.map(([k,p]) => `<label><input type="checkbox" name="asignados" value="${k}" ${(t.asignados||[]).includes(k)?"checked":""}><i style="background:${esc(p.color)}"></i>${esc(p.nombre)}</label>`).join("")}</div></div>
            <button class="btn" type="submit">Guardar cita</button> <button class="btn sec" type="button" id="quitaCita">Quitar cita</button> <span id="msgCita" class="vacio"></span>
          </form>` : ""}
        </div>
      </div>
      ${t.resumenHecho || (t.material||[]).length || t.tiempoReal ? `<div class="bloque" style="margin-top:14px"><h3>Lo que se ha hecho${t.fechaHecho ? " · " + esc(fmtFecha(t.fechaHecho)) : ""}</h3>
        ${t.resumenHecho ? `<p style="white-space:pre-wrap">${esc(t.resumenHecho)}</p>` : ""}
        ${t.falta ? `<p class="ft-nota">🔧 Falta: ${esc(t.falta)}</p>` : ""}
        ${(t.material||[]).length ? dato("Material", (t.material).map(x => esc(x.cant + " × " + x.desc)).join("<br>")) : ""}
        ${t.tiempoReal ? dato("Tiempo", esc(durTxt(t.tiempoReal))) : ""}</div>` : ""}
      <p style="margin-top:12px">${conFicha ? `<a class="btn sec" href="#comunidad/${encodeURIComponent(t.comunidadId)}">Ver ficha de ${esc(t.nombre)}</a> ` : ""}<a class="btn sec" href="#trabajo/${id}">📋 Ficha de trabajo (lo que ve el técnico)</a>
        ${S.puede("trabajos","editar") ? ` <button class="btn sec" id="btnWA">📲 Pasar por WhatsApp</button>` : ""}</p>
      <div id="cajaWA" class="oculto bloque" style="margin-top:10px">
        <label class="chk"><input type="checkbox" id="waEnlace" checked> Añadir enlace a la ficha (solo si la persona tiene acceso a la app)</label>
        <textarea id="waTexto" rows="10" style="width:100%;margin-top:8px;padding:8px;border:1px solid #cfd7e3;border-radius:6px;font:inherit"></textarea>
        <p style="margin-top:6px"><a class="btn" id="waAbrir" target="_blank" rel="noopener">Abrir WhatsApp</a> <button class="btn sec" id="waCopiar">Copiar texto</button> <span id="waMsg" class="vacio"></span></p>
        <p class="vacio">Puedes retocar el texto antes de enviarlo. WhatsApp te dejará elegir a quién.</p>
      </div>
      </div>

      <div class="panel" style="margin-top:14px" id="bFotosInt"></div>
      <div class="panel" style="margin-top:14px">
        <h3>Historial y notas</h3>
        <div class="historial">
          <div class="h-item"><b>${horaReg(t.creado && t.creado.en)}</b> · ${esc(nombreDe(t.creado && t.creado.por))} · 🆕 Creada${t.creadoPorTecnico ? " (por técnico)" : ""}</div>
          ${notas.map(n => `<div class="h-item ${n.tipo === "estado" ? "" : "nota"}"><b>${horaReg(n.en)}</b> · ${esc(nombreDe(n.por))} · ${n.tipo === "estado" ? (ICO_EST[n.a]||"") + " " + esc(ESTADOS[n.de]||n.de) + " → <b>" + esc(ESTADOS[n.a]||n.a) + "</b>" : (n.tipo === "cita" ? "📅 " : (n.tipo === "prioridad" ? "🎯 " : "📝 "))}${n.texto ? `<div class="h-txt">${esc(n.texto)}</div>` : ""}</div>`).join("")}
        </div>
        ${puedeTocar ? `<div style="margin-top:10px"><textarea id="nuevaNota" rows="2" placeholder="Añadir una nota (qué se ha visto, qué falta, a quién se ha llamado…)" style="width:100%;padding:7px 9px;border:1px solid #cfd7e3;border-radius:6px;font:inherit"></textarea>
          <p style="margin-top:6px"><button class="btn sec" id="btnNota">Añadir nota</button> <span id="msgNota" class="vacio"></span></p></div>` : ""}
      </div>`;

    window.DHS_FOTOS.bloqueTrabajo(el.querySelector("#bFotosInt"), id, t, puedeTocar);
    const firma = () => ({por:yo, en:firebase.firestore.FieldValue.serverTimestamp()});
    const empiezo = marcarEdicion(ref);
    const bWA = el.querySelector("#btnWA");
    if(bWA){
      const caja = el.querySelector("#cajaWA"), tx = el.querySelector("#waTexto"), abrir = el.querySelector("#waAbrir");
      const actualizar = () => abrir.href = "https://wa.me/?text=" + encodeURIComponent(tx.value);
      const generar = async () => { tx.value = await textoWhatsApp(t, id, el.querySelector("#waEnlace").checked); actualizar(); };
      bWA.onclick = async () => { caja.classList.toggle("oculto"); if(!caja.classList.contains("oculto")) await generar(); };
      el.querySelector("#waEnlace").onchange = generar;
      tx.oninput = actualizar;
      el.querySelector("#waCopiar").onclick = async () => { try{ await navigator.clipboard.writeText(tx.value); el.querySelector("#waMsg").textContent = "Copiado."; }catch(e){ tx.select(); el.querySelector("#waMsg").textContent = "Selecciona y copia."; } };
      abrir.onclick = () => registro("enviada por WhatsApp");
    }
    const nota = datos => ref.collection("notas").add({...datos, por:yo, en:firebase.firestore.FieldValue.serverTimestamp()});
    const registro = accion => db.collection("dhs_registro").add({por:yo, en:firebase.firestore.FieldValue.serverTimestamp(), accion, coleccion:"dhs_trabajos", docId:id, nombre:t.numero + " · " + t.nombre});

    // Cambiar estado
    let elegido = null;
    const caja = el.querySelector("#cajaEstado");
    el.querySelectorAll(".est-btn").forEach(b => b.onclick = () => {
      elegido = b.dataset.k; empiezo();
      el.querySelectorAll(".est-btn").forEach(x => x.classList.toggle("marcado", x === b));
      caja.classList.remove("oculto");
      el.querySelector("#cajaHecho").classList.toggle("oculto", elegido !== "hecho");
      el.querySelector("#txtNotaEst").textContent = elegido === "amedias" ? "¿Qué falta? (material, otra visita…)" : (elegido === "cancelado" ? "Motivo de la cancelación" : "Nota (opcional)");
    });
    if(caja){
      el.querySelector("#noEst").onclick = () => { caja.classList.add("oculto"); el.querySelectorAll(".est-btn").forEach(x => x.classList.remove("marcado")); };
      el.querySelector("#okEst").onclick = async () => {
        const m = x => el.querySelector("#msgEst").textContent = x;
        const texto = el.querySelector("#notaEst").value.trim();
        if(elegido === "amedias" && !texto) return m("Escribe qué falta.");
        if(elegido === "cancelado" && !texto) return m("Escribe el motivo.");
        const cambio = {estado:elegido, editando:null, modificado:firma()};
        if(elegido === "hecho"){
          const hp = [...el.querySelectorAll('input[name=hechoPor]:checked')].map(x => x.value);
          if(!hp.length) return m("Marca quién lo ha hecho.");
          cambio.hechoPor = hp;
        }
        m("Guardando…");
        try{
          await ref.update(cambio);
          await nota({tipo:"estado", de:t.estado, a:elegido, texto});
          await registro("estado " + (ESTADOS[t.estado]||t.estado) + " → " + ESTADOS[elegido]);
          ficha(el, id);
        }catch(e){ m("No se ha podido cambiar (" + (e.code||e) + ")."); }
      };
    }

    // Prioridad desde la ficha
    const sp = el.querySelector("#selPrio");
    if(sp) sp.onchange = async () => {
      const ant = t.urgencia || "normal", nuevo = sp.value;
      try{
        await ref.update({urgencia:nuevo, modificado:firma()});
        await nota({tipo:"prioridad", texto:"Prioridad: " + PRIOR[ant][1] + " → " + PRIOR[nuevo][1]});
        await registro("prioridad " + PRIOR[ant][1] + " → " + PRIOR[nuevo][1]);
        ficha(el, id);
      }catch(e){ sp.value = ant; alert("No se ha podido cambiar (" + (e.code||e) + ")."); }
    };

    // Cita (solo "todo": Dirección y Oficina)
    const fC = el.querySelector("#fCita");
    if(fC){
      el.querySelector("#btnCita").onclick = () => { fC.classList.toggle("oculto"); empiezo(); };
      const guardarCita = async (citas, asignados, texto) => {
        const m = x => el.querySelector("#msgCita").textContent = x;
        const cambio = {citas, asignados, editando:null, modificado:firma()};
        if(citas.length && ["nuevo"].includes(t.estado)) cambio.estado = "agendado";
        if(!citas.length && t.estado === "agendado") cambio.estado = "nuevo";
        m("Guardando…");
        try{
          await ref.update(cambio);
          await nota({tipo:"cita", texto});
          if(cambio.estado) await nota({tipo:"estado", de:t.estado, a:cambio.estado, texto:""});
          await registro("cita: " + texto);
          ficha(el, id);
        }catch(e){ m("No se ha podido guardar (" + (e.code||e) + ")."); }
      };
      fC.onsubmit = ev => {
        ev.preventDefault();
        const fd = new FormData(fC), as = fd.getAll("asignados");
        if(!as.length) return el.querySelector("#msgCita").textContent = "Marca quién va.";
        const c = {fecha:fd.get("fecha"), hora:fd.get("hora"), duracion:Number(fd.get("duracion")), personal:as};
        guardarCita([c], as, fmtFecha(c.fecha) + " " + c.hora + " · " + durTxt(c.duracion) + " · " + as.map(k => P[k] ? P[k].nombre : "").join(", "));
      };
      el.querySelector("#quitaCita").onclick = () => { if(confirm("¿Quitar la cita? La intervención queda sin fecha.")) guardarCita([], t.asignados || [], "Cita quitada"); };
    }

    // Notas
    const bN = el.querySelector("#btnNota");
    if(bN) bN.onclick = async () => {
      const tx = el.querySelector("#nuevaNota").value.trim(); if(!tx) return;
      bN.disabled = true;
      try{ await nota({tipo:"nota", texto:tx}); ficha(el, id); }
      catch(e){ el.querySelector("#msgNota").textContent = "No se ha podido guardar (" + (e.code||e) + ")."; bN.disabled = false; }
    };
  }

  // ---------- ZONA DE TRABAJO DEL TÉCNICO (sesión 19, idea de Ángel 24/10) ----------
  // "Mi trabajo": solo mis intervenciones. "Ficha de trabajo": solo la información justa para ir y hacerlo
  // (nada de precios, cobros ni datos de la administración). Al terminar, lo hecho pasa a la intervención
  // y a la pestaña Intervenciones de la comunidad.
  const hoyISO = () => new Date().toISOString().slice(0,10);
  const TIEMPOS = []; for(let m = 15; m <= 600; m += 15) TIEMPOS.push(m);
  const mapa = t => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([t.direccion, t.poblacion].filter(Boolean).join(", "));

  async function miTrabajo(el){
    const {db, S} = D();
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    if(!S.personalId){ el.innerHTML = `<div class="panel"><h2>Mi trabajo</h2><p class="vacio">Tu cuenta no está unida a nadie del equipo. Pide a la oficina que lo haga en Ajustes › Equipo.</p></div>`; return; }
    let docs = [];
    try{ (await db.collection("dhs_trabajos").where("asignados", "array-contains", S.personalId).get()).forEach(d => docs.push({id:d.id, ...d.data()})); }
    catch(e){ el.innerHTML = `<div class="panel">No se han podido leer tus intervenciones (${esc(e.code)}).</div>`; return; }
    const hoy = hoyISO(), fecha = t => ((t.citas||[])[0] || {}).fecha || "", hora = t => ((t.citas||[])[0] || {}).hora || "";
    const abiertas = docs.filter(t => !CERRADOS.includes(t.estado));
    const grupo = (titulo, lista) => `<h3 style="margin-top:14px">${titulo} <span class="vacio">(${lista.length})</span></h3>` +
      (lista.map(t => `<a class="tarjeta-t" href="#trabajo/${t.id}">
        <div class="tt-hora">${fecha(t) ? (fecha(t) === hoy ? esc(hora(t)) : esc(fmtFecha(fecha(t))) + "<br>" + esc(hora(t))) : "—"}</div>
        <div class="tt-cuerpo"><b>${(PRIOR[t.urgencia]||PRIOR.normal)[0]} ${ESPEC[t.especialidad] ? ESPEC[t.especialidad][0] : ""} ${esc(t.direccion || t.nombre)}</b>
          <span>${esc(t.poblacion||"")}${t.estado === "amedias" ? " · 🔧 a medias" : ""}</span>
          <span class="tt-desc">${esc((t.descripcion||"").slice(0,90))}</span></div></a>`).join("") || `<p class="vacio">Nada.</p>`);
    const ord = (a,b) => (fecha(a)+hora(a)).localeCompare(fecha(b)+hora(b)) || porPrioridad(a,b);
    el.innerHTML = `<div class="panel mi-trabajo">
      <h2>Mi trabajo</h2>
      <p class="vacio">${new Date().toLocaleDateString("es-ES", {weekday:"long", day:"numeric", month:"long"})}</p>
      ${grupo("Hoy", abiertas.filter(t => fecha(t) && fecha(t) <= hoy).sort(ord))}
      ${grupo("Próximos días", abiertas.filter(t => fecha(t) > hoy).sort(ord))}
      ${grupo("Sin fecha", abiertas.filter(t => !fecha(t)).sort(porPrioridad))}
      ${grupo("Hecho hoy", docs.filter(t => CERRADOS.includes(t.estado) && t.fechaHecho === hoy))}
    </div>`;
  }

  async function fichaTrabajo(el, id){
    const {db, S} = D();
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    const ref = db.collection("dhs_trabajos").doc(id);
    let t, P, c = null, admins = {}, anteriores = [];
    try{ P = await personal(); const d = await ref.get(); if(!d.exists) throw {code:"no existe"}; t = d.data(); }
    catch(e){ el.innerHTML = `<div class="panel">No se ha podido abrir (${esc(e.code)}). <a href="#mitrabajo">Volver</a></div>`; return; }
    if(t.comunidadId && S.puede("comunidades")){ try{ const C = await window.DHS_COM.datos(); c = C.coms[t.comunidadId] || null; admins = C.admins; }catch(e){} }
    if(t.comunidadId && S.puede("trabajos","ver")){ try{ anteriores = (await leer(t.comunidadId)).filter(x => x.id !== id && CERRADOS.includes(x.estado)).sort((a,b) => (b.fechaHecho||b.numero||"").localeCompare(a.fechaHecho||a.numero||"")).slice(0,3); }catch(e){} }
    const pr = PRIOR[t.urgencia] || PRIOR.normal, cita = (t.citas||[])[0];
    const tel = (n, v) => v ? `<a class="btn-tel" href="tel:${esc(v)}">📞 ${esc(n)}</a>` : "";
    const vp = (c && c.videoportero) || {}, tv = (c && c.tv) || {}, pres = (c && c.presidente) || {};
    const cerrado = CERRADOS.includes(t.estado);
    const puede = S.puede("trabajos","editar") || (t.asignados||[]).includes(S.personalId);
    el.innerHTML = `
      <a href="#mitrabajo" class="volver">‹ Mi trabajo</a>
      <div class="panel ficha-trabajo">
        ${avisoEdicion(t)}
        <div class="ft-cab"><span class="ft-prio">${pr[0]} ${pr[1]}</span><span class="vacio">${esc(t.numero)}</span></div>
        <h1>${ESPEC[t.especialidad] ? ESPEC[t.especialidad][0] + " " : ""}${esc(t.direccion || t.nombre)}</h1>
        <p class="vacio">${esc([t.nombre !== t.direccion ? t.nombre : "", t.poblacion].filter(Boolean).join(" · "))}</p>
        <p style="margin-top:8px"><a class="btn sec" href="${mapa(t)}" target="_blank" rel="noopener">🗺️ Cómo llegar</a></p>
        ${cita ? `<p style="margin-top:8px">📅 <b>${esc(fmtFecha(cita.fecha))} · ${esc(cita.hora)}</b> · ${esc(durTxt(cita.duracion))}${(cita.personal||[]).length > 1 ? " · con " + (cita.personal).filter(k => k !== S.personalId).map(k => P[k] ? esc(P[k].nombre) : "").join(", ") : ""}</p>` : ""}

        <div class="ft-bloque"><h3>Qué hay que hacer</h3>
          <p class="ft-desc">${esc(t.descripcion)}</p>
          <p class="vacio">${esc(especTxt(t))} · ${esc(TIPOS[t.tipo]||"")}</p></div>

        <div class="ft-bloque"><h3>A quién llamar</h3>
          ${t.avisa && (t.avisa.nombre || t.avisa.telefono || t.avisa.piso) ? `<p>Avisa: <b>${esc(avisaTxt(t))}</b></p>${tel(t.avisa.nombre || t.avisa.piso || "Llamar", t.avisa.telefono)}` : ""}
          ${!t.comunidadId && t.telefono ? tel(t.nombre, t.telefono) : ""}
          ${pres.nombre ? `<p style="margin-top:6px">Presidente: <b>★ ${esc([pres.nombre, pres.piso].filter(Boolean).join(" · "))}</b></p>${tel("Presidente", pres.telefono)}` : ""}
          ${!(t.avisa && t.avisa.telefono) && !pres.telefono && !t.telefono ? `<p class="vacio">Sin teléfono.</p>` : ""}</div>

        ${c ? `<div class="ft-bloque"><h3>La finca</h3>
          ${c.acceso ? `<p>🔑 <b>Acceso:</b> ${esc(c.acceso)}</p>` : ""}
          ${vp.marca || vp.modelo ? `<p>🔔 Videoportero: ${esc([vp.marca, vp.modelo, vp.año].filter(Boolean).join(" · "))}${vp.monitores ? " · " + esc(vp.monitores) + " monitores" : ""}</p>` : ""}
          ${tv.antena || tv.parabolica ? `<p>📡 Antena: ${esc([tv.antena, tv.parabolica ? "con parabólica" : "", tv.multibanda ? "multibanda" : ""].filter(Boolean).join(" · "))}</p>` : ""}
          ${c.camaras && c.camaras.tiene ? `<p>📹 Cámaras${c.camaras.numero ? ": " + esc(c.camaras.numero) : ""}</p>` : ""}
          ${c.vecinos ? `<p>🏢 ${esc(c.vecinos)} vecinos</p>` : ""}
          ${c.notas ? `<p class="ft-nota">📝 ${esc(c.notas)}</p>` : ""}
          ${S.puede("vecinos") ? `<p style="margin-top:6px"><a href="#comunidad/${encodeURIComponent(t.comunidadId)}">Ver teléfonos de vecinos ›</a></p>` : ""}</div>` : ""}

        ${anteriores.length ? `<div class="ft-bloque"><h3>Últimas veces que fuimos</h3>
          ${anteriores.map(a => `<p>• <b>${esc(a.fechaHecho ? fmtFecha(a.fechaHecho) : a.numero)}</b> ${ESPEC[a.especialidad] ? ESPEC[a.especialidad][0] : ""} ${esc(a.resumenHecho || a.descripcion || "")}${(a.hechoPor||[]).length ? ` <span class="vacio">(${(a.hechoPor).map(k => P[k] ? esc(P[k].nombre) : "").join(", ")})</span>` : ""}</p>`).join("")}</div>` : ""}

        <div class="ft-bloque" id="bFotos"></div>
        ${cerrado ? `<div class="ft-bloque ok"><h3>✅ ${esc(ESTADOS[t.estado])}${t.fechaHecho ? " · " + esc(fmtFecha(t.fechaHecho)) : ""}</h3>
          ${t.resumenHecho ? `<p>${esc(t.resumenHecho)}</p>` : ""}
          ${(t.material||[]).length ? `<p class="vacio">Material: ${(t.material).map(m => esc(m.cant + " × " + m.desc)).join(" · ")}</p>` : ""}
          ${t.tiempoReal ? `<p class="vacio">Tiempo: ${esc(durTxt(t.tiempoReal))}</p>` : ""}</div>`
        : puede ? `<form id="fFin" class="ft-bloque fin"><h3>Al terminar</h3>
          ${t.estado === "amedias" && t.falta ? `<p class="ft-nota">🔧 La última vez faltaba: ${esc(t.falta)}</p>` : ""}
          <label class="campo"><span>¿Qué se ha hecho? *</span><textarea name="resumen" rows="3" placeholder="Ej.: Cambiado el monitor del 3º 1ª por uno nuevo. Probado y funciona.">${esc(t.resumenHecho||"")}</textarea></label>
          <div class="campo"><span>Material usado</span>
            <div id="lineasMat">${(t.material||[]).map(m => lineaMat(m)).join("") || lineaMat()}</div>
            <button type="button" class="btn sec" id="masMat">+ Otro material</button></div>
          <label class="campo"><span>Tiempo que ha llevado</span><select name="tiempo">${TIEMPOS.map(m => `<option value="${m}" ${m === (t.tiempoReal || (cita && cita.duracion) || 60) ? "selected" : ""}>${durTxt(m)}</option>`).join("")}</select></label>
          <div class="campo"><span>¿Quién lo ha hecho?</span><div class="personas-sel">${Object.entries(P).filter(([k,p]) => p.activo !== false).map(([k,p]) => `<label><input type="checkbox" name="hechoPor" value="${k}" ${(t.asignados||[]).includes(k) ? "checked" : ""}><i style="background:${esc(p.color)}"></i>${esc(p.nombre)}</label>`).join("")}</div></div>
          <div id="cajaFalta" class="oculto"><label class="campo"><span>¿Qué falta? *</span><textarea name="falta" rows="2" placeholder="Ej.: Pedir monitor Fermax, volver el martes.">${esc(t.falta||"")}</textarea></label></div>
          <div class="ft-botones"><button type="button" class="btn btn-ok" id="btnHecho">✅ Hecho</button><button type="button" class="btn sec" id="btnMedias">🔧 Queda a medias</button></div>
          <p id="msgFin" class="vacio" style="margin-top:6px"></p>
        </form>` : ""}
        ${S.puede("trabajos","ver") ? `<p style="margin-top:14px"><a href="#intervencion/${id}" class="vacio">Ver la intervención completa (historial) ›</a></p>` : ""}
      </div>`;

    window.DHS_FOTOS.bloqueTrabajo(el.querySelector("#bFotos"), id, t, puede);
    const f = el.querySelector("#fFin"); if(!f) return;
    const empiezo = marcarEdicion(ref);
    f.addEventListener("input", empiezo); f.addEventListener("change", empiezo);
    el.querySelector("#masMat").onclick = () => el.querySelector("#lineasMat").insertAdjacentHTML("beforeend", lineaMat());
    const m = x => el.querySelector("#msgFin").textContent = x;
    let modoMedias = false;
    const guardar = async estado => {
      const fd = new FormData(f), resumen = (fd.get("resumen")||"").trim(), falta = (fd.get("falta")||"").trim();
      const hp = fd.getAll("hechoPor");
      const material = [...el.querySelectorAll(".linea-mat")].map(l => ({cant:Number(l.querySelector(".m-cant").value) || 1, desc:l.querySelector(".m-desc").value.trim()})).filter(x => x.desc);
      if(!resumen) return m("Escribe qué se ha hecho.");
      if(!hp.length) return m("Marca quién lo ha hecho.");
      if(estado === "amedias" && !falta) return m("Escribe qué falta.");
      const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
      const cambio = {estado, resumenHecho:resumen, material, tiempoReal:Number(fd.get("tiempo")), hechoPor:hp, falta: estado === "amedias" ? falta : "", fechaHecho:hoyISO(), editando:null, modificado:{por:yo, en}};
      m("Guardando…");
      try{
        await ref.update(cambio);
        await ref.collection("notas").add({tipo:"estado", de:t.estado, a:estado, texto: resumen + (estado === "amedias" ? "\nFalta: " + falta : ""), por:yo, en});
        await db.collection("dhs_registro").add({por:yo, en, accion:"estado " + (ESTADOS[t.estado]||t.estado) + " → " + ESTADOS[estado] + " (ficha de trabajo)", coleccion:"dhs_trabajos", docId:id, nombre:t.numero + " · " + t.nombre});
        location.hash = "mitrabajo";
        if(!S.personalId) fichaTrabajo(el, id);
      }catch(e){ m("No se ha podido guardar (" + (e.code||e) + ")."); }
    };
    el.querySelector("#btnHecho").onclick = () => guardar("hecho");
    el.querySelector("#btnMedias").onclick = () => {
      if(!modoMedias){ modoMedias = true; el.querySelector("#cajaFalta").classList.remove("oculto"); el.querySelector("#btnMedias").textContent = "🔧 Guardar a medias"; return; }
      guardar("amedias");
    };
  }
  function lineaMat(x = {}){
    return `<div class="linea-mat"><input class="m-cant" type="number" min="1" value="${esc(x.cant || 1)}"><input class="m-desc" placeholder="Ej.: Monitor Fermax Duox" value="${esc(x.desc || "")}"></div>`;
  }

  window.DHS_TRAB = { prefijar, nueva, lista, ficha, deComunidad, contar, miTrabajo, fichaTrabajo, recargarPersonal: () => { PERSONAL = null; } };
})();
