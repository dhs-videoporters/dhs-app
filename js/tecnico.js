// DHS App — Pantalla del técnico (Ángel 31/10/2026): lo mínimo para trabajar desde el móvil.
// Agenda (hoy, mañana, pasado mañana) con solo sus intervenciones por hora → ficha básica: hora, dirección,
// contacto con botón Llamar, qué hay que hacer, qué se hizo antes, lo realizado, fotos, guardar avance y cerrar.
// Privativos (particulares): presupuesto sencillo por WhatsApp o correo y cobro (TPV o efectivo).
// Fichaje de entrada (a menos de 3 km de Viladecavalls) y salida.
// Sin menús: no crea intervenciones ni entra en la gestión general.
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  const CERRADOS = ["hecho","facturado","cobrado","cancelado","esperando"];
  // Punto de fichaje: Viladecavalls (centro del municipio; pendiente de confirmar la dirección exacta con Ángel)
  const FICHAJE = {lat:41.557778, lng:1.955833, radioKm:3, lugar:"Viladecavalls"};
  const isoLocal = d => d.toLocaleDateString("sv-SE");
  const masDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); };
  const DIAS = [["Hoy",0],["Mañana",1],["Pasado mañana",2]];
  const fmtDia = f => new Date(f + "T12:00").toLocaleDateString("es-ES", {weekday:"long", day:"numeric", month:"long"});
  const dur = m => !m ? "" : m < 60 ? m + " min" : (m % 60 ? Math.floor(m/60) + " h " + (m % 60) + " min" : (m/60) + " h");
  const eur = n => (Math.round((Number(n)||0) * 100) / 100).toLocaleString("es-ES", {minimumFractionDigits:2, maximumFractionDigits:2}) + " €";
  const num = v => Number(String(v||"").replace(",", ".")) || 0;
  let diaSel = 0, PREVIEW = null;   // PREVIEW = {pid, nombre} cuando Dirección mira la pantalla de un técnico

  const yoPid = () => PREVIEW ? PREVIEW.pid : D().S.personalId;
  const mio = c => !(c.personal||[]).length || (c.personal||[]).includes(yoPid());
  async function leerMios(){
    const L = [];
    (await D().db.collection("dhs_trabajos").where("asignados", "array-contains", yoPid()).get()).forEach(d => L.push({id:d.id, ...d.data()}));
    return L;
  }
  // Citas de un día para este técnico, ordenadas por hora
  const delDia = (L, f) => {
    const R = [];
    L.filter(t => t.estado !== "cancelado" && t.estado !== "esperando").forEach(t => (t.citas||[]).filter(c => c.fecha === f && mio(c)).forEach(c => R.push({t, c})));
    return R.sort((a,b) => (a.c.hora||"").localeCompare(b.c.hora||""));
  };
  const telLimpio = t => String(t||"").replace(/[^\d+]/g, "");
  function contacto(t, com){
    if(t.avisa && (t.avisa.nombre || t.avisa.telefono)) return {nombre:[t.avisa.nombre, t.avisa.piso].filter(Boolean).join(" · ") || "Contacto", tel:t.avisa.telefono || ""};
    if(t.telefono) return {nombre:t.nombre || "Cliente", tel:t.telefono};
    const p = (com && com.presidente) || {};
    if(p.telefono || p.nombre) return {nombre:"Presidente: " + [p.nombre, p.piso].filter(Boolean).join(" · "), tel:p.telefono || ""};
    return {nombre:"", tel:""};
  }
  const esPrivativo = (t, com) => t.origen === "particular" || (com && com.tipo === "particular") || (!t.comunidadId && !t.adminId);

  // ---------- AGENDA ----------
  async function agenda(el){
    const {S} = D();
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    if(!yoPid()){ el.innerHTML = `<div class="panel"><p class="vacio">Tu cuenta no está unida a nadie del equipo. Avisa a la oficina.</p></div>`; return; }
    let L; try{ L = await leerMios(); }catch(e){ el.innerHTML = `<div class="panel">No se han podido leer tus trabajos (${esc(e.code)}).</div>`; return; }
    const f = masDias(diaSel), lista = delDia(L, f);
    el.innerHTML = `<div class="tec">
      ${PREVIEW ? `<p class="tec-preview">👁️ Vista previa como <b>${esc(PREVIEW.nombre)}</b> (solo mirar). <a href="#calendario">Salir</a></p>` : ""}
      <div id="tecFichaje"></div>
      <div class="tec-dias">${DIAS.map(([n,i]) => `<button class="${i===diaSel?"on":""}" data-d="${i}">${n}<span>${delDia(L, masDias(i)).length}</span></button>`).join("")}</div>
      <p class="tec-fecha">${esc(fmtDia(f))}${diaSel ? " · solo información" : ""}</p>
      ${lista.map(({t,c}) => `<a class="tec-item ${CERRADOS.includes(t.estado) ? "hecha" : ""}" href="#t/${t.id}/${f}">
        <div class="ti-hora">${esc(c.hora || "—")}<span>${esc(dur(c.duracion))}</span></div>
        <div class="ti-cuerpo"><b>${esc(t.direccion || t.nombre)}</b><span>${esc(t.poblacion || "")}</span>
          <span class="ti-desc">${esc((t.descripcion || "").slice(0,80))}</span>
          ${CERRADOS.includes(t.estado) ? `<span class="ti-est ok">✅ Terminada</span>` : t.estado === "encurso" || t.resumenHecho ? `<span class="ti-est">▶️ Empezada</span>` : ""}</div>
        <div class="ti-ir">›</div></a>`).join("") || `<p class="vacio tec-nada">No tienes nada ${["hoy","mañana","pasado mañana"][diaSel]}.</p>`}
    </div>`;
    el.querySelectorAll(".tec-dias button").forEach(b => b.onclick = () => { diaSel = Number(b.dataset.d); agenda(el); });
    if(!PREVIEW) fichaje(el.querySelector("#tecFichaje"));
  }

  // ---------- FICHAJE: entrada (a menos de 3 km de Viladecavalls) y salida ----------
  const distKm = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng/2)**2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const posicion = () => new Promise((ok, ko) => {
    if(!navigator.geolocation) return ko("Este móvil no da la ubicación.");
    navigator.geolocation.getCurrentPosition(p => ok({lat:Math.round(p.coords.latitude*1e6)/1e6, lng:Math.round(p.coords.longitude*1e6)/1e6, precision:Math.round(p.coords.accuracy)}),
      e => ko(e.code === 1 ? "No has dado permiso de ubicación. Actívalo para esta web en el móvil." : "No se ha podido saber dónde estás. Prueba otra vez."), {enableHighAccuracy:true, timeout:15000, maximumAge:0});
  });
  async function fichaje(el){
    const {db, S} = D(), yo = S.usuario.email.toLowerCase(), hoy = isoLocal(new Date());
    let hoyL = [];
    try{ (await db.collection("dhs_fichajes").where("email", "==", yo).get()).forEach(d => { const f = d.data(); if(f.fecha === hoy && f.tipo !== "correccion") hoyL.push(f); }); }
    catch(e){ el.innerHTML = ""; return; }
    hoyL.sort((a,b) => ((a.en && a.en.toMillis && a.en.toMillis()) || 0) - ((b.en && b.en.toMillis && b.en.toMillis()) || 0));
    const ult = hoyL[hoyL.length - 1], dentro = ult && ult.tipo !== "salida";
    const hora = f => f && f.en && f.en.toDate ? f.en.toDate().toLocaleTimeString("es-ES", {hour:"2-digit", minute:"2-digit"}) : "";
    const ent = hoyL.find(f => f.tipo === "entrada"), sal = [...hoyL].reverse().find(f => f.tipo === "salida");
    el.innerHTML = `<div class="tec-fichaje ${dentro ? "dentro" : ""}">
      <div>${dentro ? `🟢 Trabajando desde las <b>${esc(hora(ent))}</b>` : sal ? `Jornada terminada a las <b>${esc(hora(sal))}</b>` : `⚪ Sin fichar hoy`}</div>
      <button class="btn ${dentro ? "sec" : ""}" id="btnFichar">${dentro ? "🔴 Fichar salida" : "🟢 Fichar entrada"}</button>
      <p class="vacio" id="msgFichar"></p></div>`;
    const b = el.querySelector("#btnFichar"), msg = x => el.querySelector("#msgFichar").textContent = x;
    b.onclick = async () => {
      const tipo = dentro ? "salida" : "entrada";
      if(tipo === "salida" && !await DHS_PREGUNTA("¿Fichar la salida? Terminas la jornada de hoy.")) return;
      b.disabled = true; msg("Mirando dónde estás…");
      let u;
      try{ u = await posicion(); }
      catch(e){ if(tipo === "entrada"){ msg(String(e)); b.disabled = false; return; } u = {sin:String(e)}; }
      if(tipo === "entrada"){
        const km = distKm(u, FICHAJE);
        if(km > FICHAJE.radioKm){ msg("Estás a " + km.toFixed(1).replace(".", ",") + " km de " + FICHAJE.lugar + ". La entrada solo se puede fichar a menos de " + FICHAJE.radioKm + " km."); b.disabled = false; return; }
      }
      msg("Guardando…");
      try{
        await db.collection("dhs_fichajes").add({tipo, email:yo, personalId:S.personalId, nombre:S.nombre, fecha:hoy, ubicacion:u, en:firebase.firestore.FieldValue.serverTimestamp()});
        fichaje(el);
      }catch(e){ msg("No se ha podido fichar (" + (e.code||e) + ")."); b.disabled = false; }
    };
  }

  // ---------- FICHA DE LA INTERVENCIÓN ----------
  async function ficha(el, id, fecha){
    const {db, S} = D();
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    const ref = db.collection("dhs_trabajos").doc(id);
    let t, com = null, antes = [], notas = [];
    try{ const d = await ref.get(); if(!d.exists) throw {code:"no existe"}; t = d.data(); }
    catch(e){ el.innerHTML = `<div class="panel">No se ha podido abrir (${esc(e.code)}). <a href="#agenda">Volver</a></div>`; return; }
    if(t.comunidadId){
      try{ const x = await db.collection("dhs_comunidades").doc(t.comunidadId).get(); com = x.exists ? x.data() : null; }catch(e){}
      try{ (await db.collection("dhs_trabajos").where("comunidadId", "==", t.comunidadId).get()).forEach(x => { const v = x.data(); if(x.id !== id && ["hecho","facturado","cobrado"].includes(v.estado)) antes.push(v); }); }catch(e){}
      antes.sort((a,b) => (b.fechaHecho||"").localeCompare(a.fechaHecho||"")); antes = antes.slice(0,3);
    }
    try{ (await ref.collection("notas").orderBy("en", "desc").limit(10).get()).forEach(n => { const v = n.data(); if(v.texto) notas.push(v); }); }catch(e){}
    const hoy = isoLocal(new Date());
    const c = (t.citas||[]).find(x => x.fecha === fecha && mio(x)) || (t.citas||[]).find(mio) || {};
    const cerrada = CERRADOS.includes(t.estado);
    const editable = !PREVIEW && !cerrada && c.fecha === hoy;
    const k = contacto(t, com), priv = esPrivativo(t, com);
    const mapa = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([t.direccion, t.poblacion].filter(Boolean).join(", "));
    const cobro = t.cobro || {}, pres = cobro.presupuesto || {};
    el.innerHTML = `<div class="tec">
      <a href="#agenda" class="volver">‹ Agenda</a>
      <div class="panel tec-ficha">
        <div class="tf-hora">🕘 ${esc(c.hora || "Sin hora")}${c.duracion ? ` <span>· ${esc(dur(c.duracion))}</span>` : ""}${c.fecha && c.fecha !== hoy ? `<span class="tf-dia">${esc(fmtDia(c.fecha))}</span>` : ""}</div>
        <h1>${esc(t.direccion || t.nombre)}</h1>
        <p class="vacio">${esc([t.poblacion, t.nombre !== t.direccion ? t.nombre : ""].filter(Boolean).join(" · "))} · <a href="${mapa}" target="_blank" rel="noopener">Cómo llegar</a></p>
        ${com && com.acceso ? `<p class="tf-acceso">🔑 ${esc(com.acceso)}</p>` : ""}

        <div class="tf-bloque"><h3>Contacto</h3>
          <p class="tf-nombre">${esc(k.nombre || "Sin contacto")}</p>
          ${k.tel ? `<a class="btn tf-llamar" href="tel:${esc(telLimpio(k.tel))}">📞 Llamar · ${esc(k.tel)}</a>` : `<p class="vacio">Sin teléfono.</p>`}</div>

        <div class="tf-bloque"><h3>Qué hay que hacer</h3><p class="tf-txt">${esc(t.descripcion || "—")}</p>
          ${t.estado === "amedias" && t.falta ? `<p class="tf-nota">🔧 Faltaba: ${esc(t.falta)}</p>` : ""}</div>

        <div class="tf-bloque"><h3>Qué se ha hecho antes</h3>
          ${notas.length ? notas.slice(0,5).map(n => `<p class="tf-ant">• ${n.en && n.en.toDate ? `<b>${esc(n.en.toDate().toLocaleDateString("es-ES", {day:"numeric", month:"short"}))}</b> ` : ""}${esc(n.texto)}</p>`).join("") : ""}
          ${antes.map(a => `<p class="tf-ant">• <b>${esc(a.fechaHecho ? new Date(a.fechaHecho + "T12:00").toLocaleDateString("es-ES", {day:"numeric", month:"short", year:"2-digit"}) : "")}</b> ${esc(a.resumenHecho || a.descripcion || "")}</p>`).join("")}
          ${!notas.length && !antes.length ? `<p class="vacio">Nada apuntado.</p>` : ""}</div>

        ${editable ? `<div class="tf-bloque"><h3>¿Qué has hecho?</h3>
            <textarea id="tfHecho" rows="4" placeholder="Ej.: Cambiado el monitor del 3º 1ª. Probado y funciona.">${esc(t.resumenHecho || "")}</textarea></div>
          <div class="tf-bloque" id="tfFotos"></div>
          ${priv ? bloquePrivativo(t, pres, cobro) : ""}
          <div class="tf-botones">
            <button class="btn sec" id="tfGuardar">💾 Guardar avance</button>
            <button class="btn btn-ok" id="tfCerrar">✅ Cerrar intervención</button></div>
          <p class="vacio" id="tfMsg"></p>`
        : cerrada ? `<div class="tf-bloque ok"><h3>✅ Terminada</h3><p>${esc(t.resumenHecho || "")}</p></div><div class="tf-bloque" id="tfFotos"></div>`
        : `<p class="tf-info">ℹ️ Solo información. La podrás rellenar el día de la intervención.</p>`}
      </div></div>`;
    const fotos = el.querySelector("#tfFotos");
    if(fotos) window.DHS_FOTOS.bloqueTrabajo(fotos, id, t, editable);
    if(!editable) return;

    const yo = S.usuario.email.toLowerCase(), firma = () => ({por:yo, en:firebase.firestore.FieldValue.serverTimestamp()});
    const msg = x => el.querySelector("#tfMsg").textContent = x;
    const texto = () => el.querySelector("#tfHecho").value.trim();
    const nota = x => ref.collection("notas").add({...x, por:yo, en:firebase.firestore.FieldValue.serverTimestamp()});
    // Guardar avance: lo escrito queda en la intervención y en su historial, sin cerrarla
    el.querySelector("#tfGuardar").onclick = async () => {
      const tx = texto(); if(!tx) return msg("Escribe primero lo que has hecho.");
      msg("Guardando…");
      try{
        const cambio = {resumenHecho:tx, modificado:firma()};
        if(["nuevo","agendado"].includes(t.estado)){ cambio.estado = "encurso"; cambio.empezado = t.empezado || Date.now(); }
        await ref.update(cambio);
        if(tx !== (t.resumenHecho || "")) await nota({tipo:"nota", texto:"Avance: " + tx});
        if(cambio.estado) await nota({tipo:"estado", de:t.estado, a:"encurso", texto:""});
        t.resumenHecho = tx; if(cambio.estado) t.estado = cambio.estado;
        msg("✔️ Guardado. La intervención sigue abierta.");
      }catch(e){ msg("No se ha podido guardar (" + (e.code||e) + ")."); }
    };
    // Cerrar: obligatorio lo hecho y al menos una foto
    el.querySelector("#tfCerrar").onclick = async () => {
      const tx = texto(); if(!tx) return msg("Para cerrar, escribe qué has hecho.");
      let fs = []; try{ fs = ((await ref.get()).data().fotos) || []; }catch(e){}
      if(!fs.length) return msg("Para cerrar, añade al menos una foto del trabajo.");
      if(!await DHS_PREGUNTA("¿Cerrar la intervención? Quedará como terminada.")) return;
      msg("Cerrando…");
      try{
        const cambio = {estado:"hecho", resumenHecho:tx, hechoPor:[S.personalId], fechaHecho:isoLocal(new Date()), falta:"", editando:null, modificado:firma()};
        if(t.empezado) cambio.tiempoReal = Math.max(15, Math.round((Date.now() - t.empezado) / 900000) * 15);
        if(t.adminId && t.comunidadId && !(t.avisoAdmin && ["enviado","enviadoPruebas","pendiente"].includes(t.avisoAdmin.estado))) cambio.avisoAdmin = {estado:"pendiente", pedidoPor:yo, pedidoEn:Date.now()};
        await ref.update(cambio);
        await nota({tipo:"estado", de:t.estado, a:"hecho", texto:tx});
        location.hash = "agenda";
      }catch(e){ msg("No se ha podido cerrar (" + (e.code||e) + ")."); }
    };
    if(priv) activarPrivativo(el, ref, t, firma, nota);
  }

  // ---------- PRIVATIVOS: presupuesto sencillo y cobro ----------
  const lineaP = (l={}) => `<div class="tp-linea"><input class="tp-con" placeholder="Concepto" value="${esc(l.concepto||"")}"><input class="tp-imp" inputmode="decimal" placeholder="€" value="${l.importe != null ? esc(String(l.importe).replace(".", ",")) : ""}"></div>`;
  function bloquePrivativo(t, pres, cobro){
    return `<div class="tf-bloque"><h3>Presupuesto (particular)</h3>
        <div id="tpLineas">${(pres.lineas||[]).map(lineaP).join("") || lineaP()}</div>
        <button type="button" class="btn sec btn-mini" id="tpMas">+ Otro concepto</button>
        <p class="tp-total">Total: <b id="tpTotal">${eur(pres.total)}</b> <span class="vacio">IVA incluido</span></p>
        <div class="tp-canal"><label><input type="radio" name="tpCanal" value="whatsapp" ${pres.canal !== "correo" ? "checked" : ""}> WhatsApp</label><label><input type="radio" name="tpCanal" value="correo" ${pres.canal === "correo" ? "checked" : ""}> Correo</label></div>
        <input id="tpDestino" placeholder="Móvil o correo del cliente" value="${esc(pres.destino || (pres.canal !== "correo" ? (t.avisa && t.avisa.telefono) || t.telefono || "" : t.email || ""))}">
        <button type="button" class="btn sec" id="tpEnviar">📤 Enviar presupuesto</button>
        ${pres.enviadoEn ? `<p class="vacio">Enviado por ${esc(pres.canal)} el ${esc(new Date(pres.enviadoEn).toLocaleDateString("es-ES"))}</p>` : ""}
      </div>
      <div class="tf-bloque"><h3>Cobro</h3>
        <p class="vacio">Presupuestado: <b id="tcPres">${eur(pres.total)}</b></p>
        <div class="tp-canal"><label><input type="radio" name="tcForma" value="tpv" ${cobro.forma !== "efectivo" ? "checked" : ""}> 💳 TPV</label><label><input type="radio" name="tcForma" value="efectivo" ${cobro.forma === "efectivo" ? "checked" : ""}> 💶 Efectivo</label></div>
        <input id="tcImporte" inputmode="decimal" placeholder="Importe cobrado €" value="${cobro.cobrado != null ? esc(String(cobro.cobrado).replace(".", ",")) : ""}">
        <p class="vacio" id="tcDif"></p>
        <button type="button" class="btn sec" id="tcGuardar">💾 Guardar cobro</button>
        <p class="vacio" id="tcMsg">${cobro.cobrado != null ? "Cobrado " + eur(cobro.cobrado) + " por " + (cobro.forma === "efectivo" ? "efectivo" : "TPV") : ""}</p>
      </div>`;
  }
  function activarPrivativo(el, ref, t, firma, nota){
    const caja = el.querySelector("#tpLineas");
    const lineas = () => [...caja.querySelectorAll(".tp-linea")].map(d => ({concepto:d.querySelector(".tp-con").value.trim(), importe:num(d.querySelector(".tp-imp").value)})).filter(l => l.concepto || l.importe);
    const total = () => Math.round(lineas().reduce((n,l) => n + l.importe, 0) * 100) / 100;
    const dif = () => { const c = num(el.querySelector("#tcImporte").value), p = total();
      el.querySelector("#tcPres").textContent = eur(p);
      el.querySelector("#tcDif").textContent = c && p && Math.abs(c - p) > 0.009 ? (c > p ? "Cobrado " + eur(c - p) + " más de lo presupuestado" : "Faltan " + eur(p - c) + " respecto al presupuesto") : ""; };
    const repintar = () => { el.querySelector("#tpTotal").textContent = eur(total()); dif(); };
    caja.addEventListener("input", repintar); el.querySelector("#tcImporte").addEventListener("input", dif); dif();
    el.querySelector("#tpMas").onclick = () => { caja.insertAdjacentHTML("beforeend", lineaP()); caja.lastElementChild.querySelector("input").focus(); };
    const canal = () => (el.querySelector("input[name=tpCanal]:checked") || {}).value || "whatsapp";
    const guardarCobro = extra => ref.update({cobro:{...(t.cobro||{}), ...extra}, modificado:firma()}).then(() => { t.cobro = {...(t.cobro||{}), ...extra}; });

    el.querySelector("#tpEnviar").onclick = async () => {
      const L = lineas().filter(l => l.concepto && l.importe), tot = total(), dest = el.querySelector("#tpDestino").value.trim(), cn = canal();
      if(!L.length) return alertar("Pon al menos un concepto con su importe.");
      if(!dest) return alertar(cn === "correo" ? "Pon el correo del cliente." : "Pon el móvil del cliente.");
      if(cn === "correo" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dest)) return alertar("El correo no parece correcto.");
      const txt = "Presupuesto DHS Videoporters\n" + [t.direccion, t.poblacion].filter(Boolean).join(", ") + "\n\n" + L.map(l => "· " + l.concepto + ": " + eur(l.importe)).join("\n") + "\n\nTotal: " + eur(tot) + " (IVA incluido)\n\nGracias por confiar en nosotros.";
      const presupuesto = {lineas:L, total:tot, canal:cn, destino:dest, enviadoEn:Date.now(), por:D().S.usuario.email.toLowerCase()};
      try{ await guardarCobro({presupuesto}); await nota({tipo:"nota", texto:"Presupuesto enviado por " + cn + " a " + dest + ": " + eur(tot)}); }
      catch(e){ return alertar("No se ha podido guardar (" + (e.code||e) + ")."); }
      if(cn === "correo") location.href = "mailto:" + encodeURIComponent(dest) + "?subject=" + encodeURIComponent("Presupuesto DHS Videoporters") + "&body=" + encodeURIComponent(txt);
      else { let n = telLimpio(dest).replace(/^\+/, ""); if(n.length === 9) n = "34" + n; window.open("https://wa.me/" + n + "?text=" + encodeURIComponent(txt), "_blank"); }
    };
    el.querySelector("#tcGuardar").onclick = async () => {
      const c = num(el.querySelector("#tcImporte").value), forma = (el.querySelector("input[name=tcForma]:checked") || {}).value || "tpv";
      if(!c) return el.querySelector("#tcMsg").textContent = "Pon el importe cobrado.";
      try{
        await guardarCobro({cobrado:c, forma, fecha:isoLocal(new Date()), presupuestado:total(), entregado:forma === "tpv"});
        await nota({tipo:"nota", texto:"Cobrado " + eur(c) + " por " + (forma === "tpv" ? "TPV" : "efectivo") + (total() ? " (presupuestado " + eur(total()) + ")" : "")});
        el.querySelector("#tcMsg").textContent = "✔️ Cobro guardado: " + eur(c) + " por " + (forma === "tpv" ? "TPV" : "efectivo") + ".";
      }catch(e){ el.querySelector("#tcMsg").textContent = "No se ha podido guardar (" + (e.code||e) + ")."; }
    };
    function alertar(x){ el.querySelector("#tfMsg").textContent = x; el.querySelector("#tfMsg").scrollIntoView({block:"center"}); }
  }

  // Dirección puede ver la pantalla de un técnico sin tocar nada: #vista-tecnico/p_pedro
  async function vistaPrevia(el, pid){
    try{ const d = await D().db.collection("dhs_personal").doc(pid).get(); PREVIEW = {pid, nombre:d.exists ? d.data().nombre : pid}; }
    catch(e){ PREVIEW = {pid, nombre:pid}; }
    agenda(el);
  }
  const salirVista = () => { PREVIEW = null; };

  window.DHS_TEC = { agenda, ficha, vistaPrevia, salirVista, enPrevia: () => !!PREVIEW };
})();
