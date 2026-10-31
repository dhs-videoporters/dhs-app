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
  // Almacén de DHS: Carrer de Baix 45, Viladecavalls (punto de la calle según OpenStreetMap). Ángel 31/10:
  // allí recogen y dejan la furgoneta. Más lejos de 500 m: avisa y, si fichan igualmente, queda marcado.
  const FICHAJE = {lat:41.55422, lng:1.95255, radioKm:0.5, lugar:"el almacén (Carrer de Baix, Viladecavalls)"};
  const isoLocal = d => d.toLocaleDateString("sv-SE");
  const masDias = n => { const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d); };
  // Los 3 próximos días laborables (sin sábados ni domingos), empezando por hoy si es laborable (Ángel 31/10)
  const laborables = () => { const L = [], d = new Date(); while(L.length < 3){ if(d.getDay() !== 0 && d.getDay() !== 6) L.push(isoLocal(d)); d.setDate(d.getDate() + 1); } return L; };
  const nomDia = f => f === masDias(0) ? "Hoy" : f === masDias(1) ? "Mañana" : new Date(f + "T12:00").toLocaleDateString("es-ES", {weekday:"long", day:"numeric"}).replace(/^./, x => x.toUpperCase());
  const fmtDia = f => new Date(f + "T12:00").toLocaleDateString("es-ES", {weekday:"long", day:"numeric", month:"long"});
  const dur = m => !m ? "" : m < 60 ? m + " min" : (m % 60 ? Math.floor(m/60) + " h " + (m % 60) + " min" : (m/60) + " h");
  const eur = n => (Math.round((Number(n)||0) * 100) / 100).toLocaleString("es-ES", {minimumFractionDigits:2, maximumFractionDigits:2}) + " €";
  const num = v => Number(String(v||"").replace(",", ".")) || 0;
  // En la versión de PRUEBAS, Dirección puede probar la pantalla del técnico de verdad (guardar, fotos, cerrar);
  // el fichaje se simula (no se guarda). En la oficial, la vista previa es solo para mirar.
  const PRUEBAS = () => (window.DHS_CONFIG || {}).entorno === "pruebas";
  let diaSel = 0, PREVIEW = null, SIM = [];   // PREVIEW = {pid, nombre} cuando Dirección mira la pantalla de un técnico

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
    const DL = laborables(); if(diaSel >= DL.length) diaSel = 0;
    const f = DL[diaSel], lista = delDia(L, f), esHoy = f === masDias(0);
    el.innerHTML = `<div class="tec">
      ${PREVIEW ? `<p class="tec-preview">👁️ ${PRUEBAS() ? "Probando como" : "Vista previa como"} <b>${esc(PREVIEW.nombre)}</b>${PRUEBAS() ? " (versión de pruebas: se puede tocar todo; el fichaje es simulado)" : " (solo mirar)"}. <a href="#salir-vista" class="tec-salir">✖ Salir de la vista técnico</a></p>` : ""}
      ${PREVIEW && PRUEBAS() ? `<div class="tec-demo"><button class="btn sec" id="tecDemo">🧪 Ponerle 5 intervenciones de prueba</button>${L.some(t => t.demo) ? ` <button class="btn-mini" id="tecDemoX">🧹 Quitar las de prueba</button>` : ""}<p class="vacio" id="tecDemoMsg"></p></div>` : ""}
      <div id="tecFichaje"></div>
      <div class="tec-dias">${DL.map((x,i) => `<button class="${i===diaSel?"on":""}" data-d="${i}">${esc(nomDia(x))}<span>${delDia(L, x).length}</span></button>`).join("")}</div>
      <p class="tec-fecha">${esc(fmtDia(f))}${esHoy ? "" : " · si acabas pronto, puedes adelantarlas"}</p>
      ${lista.map(({t,c}) => `<a class="tec-item ${CERRADOS.includes(t.estado) ? "hecha" : ""}" href="#t/${t.id}/${f}">
        <div class="ti-hora">${esc(c.hora || "—")}<span>${esc(dur(c.duracion))}</span></div>
        <div class="ti-cuerpo"><b>${esc(t.direccion || t.nombre)}</b><span>${esc(t.poblacion || "")}</span>
          <span class="ti-desc">${esc((t.descripcion || "").slice(0,80))}</span>
          ${CERRADOS.includes(t.estado) ? `<span class="ti-est ok">✅ Terminada</span>` : t.estado === "encurso" || t.resumenHecho ? `<span class="ti-est">▶️ Empezada</span>` : ""}</div>
        <div class="ti-ir">›</div></a>`).join("") || `<p class="vacio tec-nada">No tienes nada ${esHoy ? "hoy" : "el " + esc(fmtDia(f))}.</p>`}
    </div>`;
    el.querySelectorAll(".tec-dias button").forEach(b => b.onclick = () => { diaSel = Number(b.dataset.d); agenda(el); });
    const bD = el.querySelector("#tecDemo"), bX = el.querySelector("#tecDemoX"), mD = x => el.querySelector("#tecDemoMsg").textContent = x;
    if(bD) bD.onclick = async () => { bD.disabled = true; mD("Creando…"); try{ await crearDemo(); diaSel = 0; agenda(el); }catch(e){ mD("No se ha podido (" + (e.code||e) + ")."); bD.disabled = false; } };
    if(bX) bX.onclick = async () => { bX.disabled = true; try{ const b = D().db.batch(); L.filter(t => t.demo).forEach(t => b.delete(D().db.collection("dhs_trabajos").doc(t.id))); await b.commit(); agenda(el); }catch(e){ mD("No se ha podido (" + (e.code||e) + ")."); } };
    if(!PREVIEW || PRUEBAS()) fichaje(el.querySelector("#tecFichaje"));
    else el.querySelector("#tecFichaje").innerHTML = `<div class="tec-fichaje"><div>⚪ Sin fichar hoy</div><button class="btn" disabled>🟢 Fichar entrada</button></div>`;
  }

  // Solo en PRUEBAS: intervenciones de mentira para el técnico que se está probando (hoy, mañana y pasado), para ver cómo entra, escribe, hace fotos y cierra
  async function crearDemo(){
    const {db, S} = D(), pid = yoPid(), yo = S.usuario.email.toLowerCase();
    if(!PRUEBAS()) throw "solo en la versión de pruebas";
    const coms = [];
    try{ (await db.collection("dhs_comunidades").limit(40).get()).forEach(d => { const c = d.data(); if(c.activo !== false && c.tipo !== "particular" && c.direccion && coms.length < 3) coms.push({id:d.id, ...c}); }); }catch(e){}
    const com = i => coms[i] ? {comunidadId:coms[i].id, nombre:coms[i].nombre || coms[i].direccion, direccion:coms[i].direccion, poblacion:coms[i].poblacion || "", adminId:coms[i].adminId || null, origen:coms[i].adminId ? "administracion" : "empresa"}
                             : {comunidadId:null, nombre:"Comunidad de prueba " + (i+1), direccion:"Calle de Prueba " + (10 + i), poblacion:"Terrassa", adminId:"prueba", origen:"administracion"};
    const priv = (n, dir) => ({comunidadId:null, nombre:n, direccion:dir, poblacion:"Sabadell", telefono:"600000000", email:"", adminId:null, origen:"particular"});
    const L = [
      [0, "09:00", 60,  com(0), "No funciona el botón de abrir de la placa. Revisar pulsador y abrepuertas.", "videoportero"],
      [0, "11:00", 90,  com(1), "Monitor del 3º 2ª sin imagen. Comprobar cableado y cambiar monitor si hace falta.", "videoportero"],
      [0, "16:00", 60,  priv("Particular de prueba (Marta)", "Avenida de Prueba 5, 2º 1ª"), "Quiere cambiar su telefonillo por un monitor con vídeo. Hacer presupuesto y cobrar si lo hace hoy.", "videoportero"],
      [1, "10:00", 120, com(2), "Revisión de cámaras: 2 cámaras del parking no graban.", "camaras"],
      [2, "12:00", 60,  priv("Particular de prueba (Jordi)", "Calle Falsa 123, bajos"), "Abrepuertas de la puerta de la calle no abre. Cambiarlo.", "videoportero"]
    ];
    const firma = {por:yo, en:firebase.firestore.FieldValue.serverTimestamp()}, b = db.batch();
    L.forEach(([dia, hora, dur, cli, desc, esp], i) => b.set(db.collection("dhs_trabajos").doc(), {
      numero:"PRUEBA-" + (i+1), ...cli, especialidad:esp, tipo:"reparacion", urgencia:"normal", ruta:false, estado:"agendado",
      descripcion:desc, avisa:cli.origen === "particular" ? null : {nombre:"Vecino de prueba", piso:"1º 1ª", telefono:"600000000"},
      duracionEstimada:dur, citas:[{fecha:laborables()[dia], hora, duracion:dur, personal:[pid]}], asignados:[pid], hechoPor:[], material:[], tiempoReal:null, fotos:[],
      demo:true, creado:firma, modificado:firma}));
    await b.commit();
  }

  // ---------- FICHAJE: entrada (a menos de 3 km de Viladecavalls) y salida ----------
  const distKm = (a, b) => { const R = 6371, r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng/2)**2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const posicion = () => new Promise((ok, ko) => {
    if(!navigator.geolocation) return ko("Este móvil no da la ubicación.");
    navigator.geolocation.getCurrentPosition(p => ok({lat:Math.round(p.coords.latitude*1e6)/1e6, lng:Math.round(p.coords.longitude*1e6)/1e6, precision:Math.round(p.coords.accuracy)}),
      e => ko(e.code === 1 ? "No has dado permiso de ubicación. Actívalo para esta web en el móvil." : "No se ha podido saber dónde estás. Prueba otra vez."), {enableHighAccuracy:true, timeout:15000, maximumAge:0});
  });
  async function fichaje(el){ // devuelve una promesa: se espera para poner el aviso debajo
    const {db, S} = D(), yo = S.usuario.email.toLowerCase(), hoy = isoLocal(new Date());
    let hoyL = [];
    if(PREVIEW) hoyL = SIM.filter(f => f.fecha === hoy && f.pid === PREVIEW.pid);   // prueba: fichajes de mentira, solo en esta pantalla
    else try{ (await db.collection("dhs_fichajes").where("email", "==", yo).get()).forEach(d => { const f = d.data(); if(f.fecha === hoy && f.tipo !== "correccion") hoyL.push(f); }); }
    catch(e){ el.innerHTML = ""; return; }
    hoyL.sort((a,b) => ((a.en && a.en.toMillis && a.en.toMillis()) || 0) - ((b.en && b.en.toMillis && b.en.toMillis()) || 0));
    const ult = hoyL[hoyL.length - 1], dentro = ult && ult.tipo !== "salida";
    const hora = f => f && f.en && f.en.toDate ? f.en.toDate().toLocaleTimeString("es-ES", {hour:"2-digit", minute:"2-digit"}) : "";
    const ent = hoyL.find(f => f.tipo === "entrada"), sal = [...hoyL].reverse().find(f => f.tipo === "salida");
    el.innerHTML = `<div class="tec-fichaje ${dentro ? "dentro" : ""}">
      <div>${dentro ? `🟢 Trabajando desde las <b>${esc(hora(ent))}</b>${ent && ent.ubicacion && ent.ubicacion.fuera ? ` <span class="tec-pend">⚠️ pendiente de que la oficina lo acepte</span>` : ""}` : sal ? `Jornada terminada a las <b>${esc(hora(sal))}</b>` : `⚪ Sin fichar hoy`}</div>
      <button class="btn ${dentro ? "sec" : ""}" id="btnFichar">${dentro ? "🔴 Fichar salida" : "🟢 Fichar entrada"}</button>
      <p class="vacio" id="msgFichar"></p></div>`;
    const b = el.querySelector("#btnFichar"), msg = x => el.querySelector("#msgFichar").textContent = x;
    b.onclick = async () => {
      const tipo = dentro ? "salida" : "entrada";
      if(tipo === "salida" && !await DHS_PREGUNTA("¿Fichar la salida? Terminas la jornada de hoy.")) return;
      b.disabled = true; msg("Mirando dónde estás…");
      let u;
      try{ u = await posicion(); }
      catch(e){
        u = {sin:String(e), fuera:true, aviso:String(e) + " El fichaje queda pendiente de que la oficina lo acepte."};
      }
      if(u.lat != null){
        const km = Math.round(distKm(u, FICHAJE) * 10) / 10;
        u.distAlmacenKm = km;
        if(km - Math.min(u.precision || 0, 300) / 1000 > FICHAJE.radioKm){   // margen por el error del GPS (hasta 300 m)
          const txt = km < 1 ? Math.round(km * 1000) + " m" : String(km).replace(".", ",") + " km";
          u.fuera = true; u.aviso = "Estás a " + txt + " de " + FICHAJE.lugar + ". El fichaje queda pendiente de que la oficina lo acepte.";
        }
      }
      if(PREVIEW){   // prueba: hace como si fichara (sigue trabajando aunque esté lejos), pero no se guarda nada
        const ahora = new Date(); SIM.push({tipo, fecha:hoy, pid:PREVIEW.pid, ubicacion:u, en:{toDate:() => ahora, toMillis:() => ahora.getTime()}});
        await fichaje(el);
        el.querySelector("#msgFichar").textContent = "🧪 Prueba (no se guarda). " + (u.aviso ? "⚠️ " + u.aviso + " Puede seguir trabajando." : "Dentro del almacén: " + tipo + " fichada sin problema.");
        return;
      }
      msg("Guardando…");
      try{
        await db.collection("dhs_fichajes").add({tipo, email:yo, personalId:S.personalId, nombre:S.nombre, fecha:hoy, ubicacion:u, en:firebase.firestore.FieldValue.serverTimestamp()});
        const av = u.aviso; await fichaje(el); if(av){ const m2 = el.querySelector("#msgFichar"); if(m2) m2.textContent = "⚠️ " + av; }
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
    try{ (await ref.collection("notas").orderBy("en", "desc").limit(20).get()).forEach(n => { const v = n.data(); if(v.texto && !["cita","prioridad"].includes(v.tipo)) notas.push(v); }); }catch(e){}
    // Primera vez en la finca: foto de la placa del videoportero + ¿tiene cámaras? (Ángel 31/10)
    // Para todos (comunidades y particulares). Particular sin ficha de comunidad: se guarda en la propia intervención.
    let ed = null;
    const edEnTrabajo = !t.comunidadId || !com;
    if(edEnTrabajo){
      ed = {placa:(t.fotos||[]).some(f => /placa/i.test(f.etiqueta || "")), camaras:""};
      try{ (await ref.collection("notas").where("tipo", "==", "edificio").get()).forEach(n => { ed.camaras = n.data().camaras || ed.camaras; }); }catch(e){}
    }
    else {
      ed = {placa:false, camaras:com.camaras && com.camaras.tiene ? "si" : ""};
      try{ (await db.collection("dhs_comunidades").doc(t.comunidadId).collection("fotos").get()).forEach(d => { const v = d.data();
        if(d.id === "_edificio") ed.camaras = ed.camaras || v.camaras || ""; else if(v.ruta && /placa/i.test(v.etiqueta || "")) ed.placa = true; }); }catch(e){ ed = null; }
    }
    const hoy = isoLocal(new Date());
    const c = (t.citas||[]).find(x => x.fecha === fecha && mio(x)) || (t.citas||[]).find(mio) || {};
    const cerrada = CERRADOS.includes(t.estado);
    // Puede trabajar en cualquiera de sus 3 días (Ángel 31/10: si acaba pronto, adelanta una de mañana y la cierra)
    const vistaHoy = !cerrada && (c.fecha === hoy || laborables().includes(c.fecha) || !!PREVIEW);
    const editable = vistaHoy && (!PREVIEW || PRUEBAS());                  // en la vista previa de Dirección, igual pero sin poder tocar
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
        ${vistaHoy && ed && (!ed.placa || !ed.camaras) ? `<div class="tf-bloque tf-edificio" id="tfEdif"><h3>🏢 ${edEnTrabajo ? "Antes de empezar" : "Primera vez en esta finca"}</h3>
          <p>Antes de nada, 2 cosas rápidas:</p>
          <p class="ed-paso"><b>1.</b> Foto de la placa del videoportero (de cerca, que se vea la marca y los pulsadores).</p>
          <div id="edPlaca">${ed.placa ? `<p class="ed-ok">✅ Foto de la placa hecha</p>` : `<label class="btn tf-foto-grande">📷 Foto de la placa<input type="file" accept="image/*" capture="environment" hidden></label>`}</div>
          <p class="ed-paso"><b>2.</b> ${edEnTrabajo ? "¿Tiene cámaras (la casa o el edificio)?" : "¿El edificio tiene cámaras?"}</p>
          <div class="ed-cam" id="edCam">${ed.camaras ? `<p class="ed-ok">✅ Cámaras: ${ed.camaras === "si" ? "Sí" : "No"}</p>` : `<button class="btn sec" data-c="si">📹 Sí tiene</button><button class="btn sec" data-c="no">🚫 No tiene</button>`}</div>
          <p class="vacio" id="edMsg"></p></div>` : ""}

        <div class="tf-bloque"><h3>Contacto</h3>
          <p class="tf-nombre">${esc(k.nombre || "Sin contacto")}</p>
          ${k.tel ? `<a class="btn tf-llamar" href="tel:${esc(telLimpio(k.tel))}">📞 Llamar · ${esc(k.tel)}</a>` : `<p class="vacio">Sin teléfono.</p>`}</div>

        <div class="tf-bloque"><h3>Qué hay que hacer</h3><p class="tf-txt">${esc(t.descripcion || "—")}</p>
          ${t.estado === "amedias" && t.falta ? `<p class="tf-nota">🔧 Faltaba: ${esc(t.falta)}</p>` : ""}</div>

        <div class="tf-bloque"><h3>Qué se ha hecho antes</h3>
          ${notas.length ? notas.slice(0,5).map(n => `<p class="tf-ant">• ${n.en && n.en.toDate ? `<b>${esc(n.en.toDate().toLocaleDateString("es-ES", {day:"numeric", month:"short"}))}</b> ` : ""}${esc(n.texto)}</p>`).join("") : ""}
          ${antes.map(a => `<p class="tf-ant">• <b>${esc(a.fechaHecho ? new Date(a.fechaHecho + "T12:00").toLocaleDateString("es-ES", {day:"numeric", month:"short", year:"2-digit"}) : "")}</b> ${esc(a.resumenHecho || a.descripcion || "")}</p>`).join("")}
          ${!notas.length && !antes.length ? `<p class="vacio">Nada apuntado.</p>` : ""}</div>

        ${vistaHoy ? `<div class="tf-bloque"><h3>¿Qué has hecho?</h3>
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
    const edB = el.querySelector("#tfEdif");
    if(edB && editable){
      const fRef = edEnTrabajo ? null : db.collection("dhs_comunidades").doc(t.comunidadId).collection("fotos"), edMsg = x => edB.querySelector("#edMsg").textContent = x;
      const yoE = S.usuario.email.toLowerCase();
      const inp = edB.querySelector("#edPlaca input");
      if(inp) inp.onchange = async e => {
        const file = e.target.files[0]; e.target.value = ""; if(!file) return;
        edMsg("Subiendo la foto…");
        try{
          if(edEnTrabajo){
            const f = await window.DHS_FOTOS.subir(file, "particulares/" + id);
            await ref.update({fotos:firebase.firestore.FieldValue.arrayUnion({...f, etiqueta:"Placa del videoportero"}), modificado:firma()});
          } else {
            const f = await window.DHS_FOTOS.subir(file, "comunidades/" + t.comunidadId + "/finca");
            await fRef.add({...f, etiqueta:"Placa de calle", principal:true, trabajoId:id});
          }
          ed.placa = true; edB.querySelector("#edPlaca").innerHTML = `<p class="ed-ok">✅ Foto de la placa hecha</p>`; edMsg("");
        }catch(err){ edMsg("No se ha podido subir (" + (err.code || err) + ")."); }
      };
      edB.querySelectorAll("#edCam button").forEach(b => b.onclick = async () => {
        try{
          if(edEnTrabajo) await nota({tipo:"edificio", camaras:b.dataset.c, texto:"Cámaras: " + (b.dataset.c === "si" ? "sí tiene" : "no tiene")});
          else await fRef.doc("_edificio").set({tipo:"edificio", camaras:b.dataset.c, por:yoE, en:Date.now(), trabajoId:id});
          ed.camaras = b.dataset.c; edB.querySelector("#edCam").innerHTML = `<p class="ed-ok">✅ Cámaras: ${b.dataset.c === "si" ? "Sí" : "No"}</p>`;
        }catch(err){ edMsg("No se ha podido guardar (" + (err.code || err) + ")."); }
      });
    }
    if(vistaHoy && PREVIEW && !PRUEBAS()){   // vista previa: mismo aspecto, nada se puede tocar
      if(fotos) fotos.querySelector("h3").insertAdjacentHTML("afterend", `<span class="btn sec btn-foto">📷 Hacer / subir foto</span>`);
      el.querySelectorAll(".tec-ficha textarea, .tec-ficha input, .tec-ficha button").forEach(x => x.disabled = true);
      el.querySelector("#tfMsg").textContent = "Vista previa: así lo verá el técnico. Desde aquí no se puede guardar.";
    }
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
      if(ed && (!ed.placa || !ed.camaras)){ el.querySelector("#tfEdif").scrollIntoView({block:"center"}); return msg("Para cerrar, arriba del todo: foto de la placa del videoportero y si el edificio tiene cámaras."); }
      if(!await DHS_PREGUNTA("¿Cerrar la intervención? Quedará como terminada.")) return;
      msg("Cerrando…");
      try{
        const cambio = {estado:"hecho", resumenHecho:tx, hechoPor:[yoPid()], fechaHecho:isoLocal(new Date()), falta:"", editando:null, modificado:firma()};
        if(t.empezado) cambio.tiempoReal = Math.max(15, Math.round((Date.now() - t.empezado) / 900000) * 15);
        if(t.adminId && t.comunidadId && !(t.avisoAdmin && ["enviado","enviadoPruebas","pendiente"].includes(t.avisoAdmin.estado))) cambio.avisoAdmin = {estado:"pendiente", pedidoPor:yo, pedidoEn:Date.now()};
        await ref.update(cambio);
        await nota({tipo:"estado", de:t.estado, a:"hecho", texto:tx + (c.fecha && c.fecha > hoy ? " (adelantada: estaba para el " + fmtDia(c.fecha) + ", hecha hoy)" : "")});
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
    document.body.classList.add("modo-tec");
    try{ localStorage.setItem("dhs_vistaTec", pid); }catch(e){}
    try{ const d = await D().db.collection("dhs_personal").doc(pid).get(); PREVIEW = {pid, nombre:d.exists ? d.data().nombre : pid}; }
    catch(e){ PREVIEW = {pid, nombre:pid}; }
    agenda(el);
  }
  const salirVista = () => { if(PREVIEW && !D().S.modoTec) document.body.classList.remove("modo-tec"); PREVIEW = null; };

  window.DHS_TEC = { agenda, ficha, vistaPrevia, salirVista, enPrevia: () => !!PREVIEW };
})();
