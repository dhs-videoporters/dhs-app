// DHS App — Fichaje (registro diario de jornada). Decisión de Ángel 24/10: se ficha desde esta app.
// - El trabajador ficha desde "Mi trabajo": Entrada / Pausa / Vuelta / Salida (hora del servidor, no la del móvil).
// - Los fichajes NO se pueden modificar ni borrar (registro legal). Si alguien se olvida, Dirección añade una
//   "corrección" con motivo, que queda a la vista.
// - Dirección/Oficina (Ajustes › Fichajes): tabla por trabajador y día, avisos de días sin fichar, descarga del mes.
// - Aviso al entrar si alguien tiene citas hoy y no ha fichado, o lleva varios días sin fichar.
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  const TIPOS = {entrada:"Entrada", pausa:"Pausa", vuelta:"Vuelta de la pausa", salida:"Salida"};
  const ICO = {entrada:"🟢", pausa:"⏸️", vuelta:"▶️", salida:"🔴"};
  const iso = d => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  const hhmm = ms => new Date(ms).toLocaleTimeString("es-ES", {hour:"2-digit", minute:"2-digit"});
  const durTxt = min => Math.floor(min/60) + " h " + String(Math.round(min%60)).padStart(2,"0") + " min";
  const DIAS_AVISO = 2;   // días laborables seguidos sin fichar para avisar

  // Momento de cada fichaje: el del servidor; en las correcciones, la hora corregida de ese día.
  const ms = f => f.tipo === "correccion" ? new Date(f.fecha + "T" + f.hora + ":00").getTime() : (f.en && f.en.toMillis ? f.en.toMillis() : Date.now());
  const tipoReal = f => f.tipo === "correccion" ? f.que : f.tipo;

  // Horas trabajadas de un día a partir de sus fichajes
  function calcular(L){
    L = L.slice().sort((a,b) => ms(a) - ms(b));
    let total = 0, desde = null, estado = "fuera", primera = null, ultima = null, fPrimera = null, fUltima = null;
    L.forEach(f => {
      const t = tipoReal(f), m = ms(f);
      if(t === "entrada" || t === "vuelta"){ if(desde === null) desde = m; estado = "dentro"; if(t === "entrada" && primera === null){ primera = m; fPrimera = f; } }
      else { if(desde !== null){ total += (m - desde) / 60000; desde = null; } estado = t === "pausa" ? "pausa" : "fuera"; if(t === "salida"){ ultima = m; fUltima = f; } }
    });
    const abierto = desde !== null;
    // Abierto hoy: cuenta hasta ahora. Abierto de un día pasado (sin salida): no se cuenta hasta que se corrija.
    if(abierto && iso(new Date(desde)) === iso(new Date())) total += (Date.now() - desde) / 60000;
    return {total, estado, primera, ultima, fPrimera, fUltima, abierto, correcciones: L.filter(f => f.tipo === "correccion").length};
  }

  // Ubicación SOLO en el momento de fichar (decisión de Ángel 24/10; el trabajador lo tiene firmado en el contrato).
  // Si el móvil no la da (permiso denegado, sin GPS…), se ficha igualmente y queda "sin ubicación".
  function ubicacion(){
    return new Promise(ok => {
      if(!navigator.geolocation) return ok({sin:"no disponible"});
      navigator.geolocation.getCurrentPosition(
        p => ok({lat:Math.round(p.coords.latitude*1e6)/1e6, lng:Math.round(p.coords.longitude*1e6)/1e6, precision:Math.round(p.coords.accuracy)}),
        e => ok({sin: e.code === 1 ? "permiso denegado" : "no disponible"}),
        {enableHighAccuracy:true, timeout:10000, maximumAge:60000});
    });
  }
  const mapaUbi = u => u && u.lat != null ? `https://www.google.com/maps/search/?api=1&query=${u.lat},${u.lng}` : "";
  const pinUbi = u => !u ? "" : (u.lat != null ? ` <a class="pin" href="${mapaUbi(u)}" target="_blank" rel="noopener" title="Ubicación al fichar (±${u.precision} m)">📍</a>` : ` <span class="pin sin" title="Sin ubicación: ${esc(u.sin)}">📍✕</span>`);

  // ---------- Tarjeta de fichaje en "Mi trabajo" ----------
  // ¿Tiene que fichar antes de trabajar? (plantilla, día laborable y hoy todavía nada fichado)
  let FICHADO_HOY = null;
  // Fichaje apagado de momento (Ángel 25/10: se activará cuando la app esté probada). Se enciende con fichaje:true en la configuración.
  const activo = () => (window.DHS_CONFIG || {}).fichaje === true;
  async function debeFichar(){
    const {db, S} = D();
    if(!activo() || !S.personalId) return false;
    const hoy = iso(new Date());
    if(FICHADO_HOY === hoy) return false;
    try{
      const p = await db.collection("dhs_personal").doc(S.personalId).get();
      if(!p.exists || p.data().tipo !== "plantilla") return false;
      let hay = false;
      (await db.collection("dhs_fichajes").where("email", "==", S.usuario.email.toLowerCase()).get()).forEach(d => { if(d.data().fecha === hoy) hay = true; });
      if(hay){ FICHADO_HOY = hoy; return false; }
      return true;
    }catch(e){ return false; }   // si no se puede comprobar, no se bloquea el trabajo
  }

  async function tarjeta(el, alFichar){
    const {db, S} = D();
    if(!activo() || !S.personalId){ el.innerHTML = ""; return; }
    const yo = S.usuario.email.toLowerCase(), hoy = iso(new Date());
    let hoyL = [];
    try{ (await db.collection("dhs_fichajes").where("email", "==", yo).get()).forEach(d => { const f = d.data(); if(f.fecha === hoy) hoyL.push(f); }); }
    catch(e){ el.innerHTML = `<div class="fichaje"><p class="vacio">No se ha podido leer el fichaje (${esc(e.code)}).</p></div>`; return; }
    const c = calcular(hoyL);
    const botones = c.estado === "dentro" ? ["pausa","salida"] : (c.estado === "pausa" ? ["vuelta","salida"] : ["entrada"]);
    el.innerHTML = `<div class="fichaje est-${c.estado}">
      <div class="fi-cab"><b>⏱️ Fichaje de hoy</b><span>${c.estado === "dentro" ? "Trabajando" : (c.estado === "pausa" ? "En pausa" : (hoyL.length ? "Jornada cerrada" : "Sin fichar"))} · ${durTxt(c.total)}</span></div>
      <div class="fi-botones">${botones.map(t => `<button class="btn fi-${t}" data-t="${t}">${ICO[t]} ${TIPOS[t]}</button>`).join("")}</div>
      ${hoyL.length ? `<p class="fi-lista">${hoyL.sort((a,b) => ms(a) - ms(b)).map(f => `${ICO[tipoReal(f)]} ${hhmm(ms(f))}${f.tipo === "correccion" ? "*" : ""}`).join(" · ")}</p>` : ""}
      <p class="msg-fi vacio"></p>
      <p class="fi-nota">📍 Al fichar se guarda tu ubicación en ese momento (solo entonces).</p></div>`;
    el.querySelectorAll("[data-t]").forEach(b => b.onclick = async () => {
      const t = b.dataset.t;
      if(t === "salida" && !confirm("¿Fichar la salida? Terminas la jornada de hoy.")) return;
      el.querySelectorAll("[data-t]").forEach(x => x.disabled = true);
      try{
        el.querySelector(".msg-fi").textContent = "Fichando…";
        const u = await ubicacion();
        await db.collection("dhs_fichajes").add({tipo:t, email:yo, personalId:S.personalId, nombre:S.nombre, fecha:hoy, ubicacion:u, en:firebase.firestore.FieldValue.serverTimestamp()});
        FICHADO_HOY = hoy;
        if(alFichar) alFichar(t); else tarjeta(el);
      }catch(e){ el.querySelector(".msg-fi").textContent = "No se ha podido fichar (" + (e.code||e) + ")."; el.querySelectorAll("[data-t]").forEach(x => x.disabled = false); }
    });
  }

  // ---------- Datos para Dirección ----------
  async function leerMes(desde, hasta){
    const {db} = D();
    const P = {}, F = [], T = [];
    (await db.collection("dhs_personal").get()).forEach(d => P[d.id] = d.data());
    (await db.collection("dhs_fichajes").where("fecha", ">=", desde).where("fecha", "<=", hasta).get()).forEach(d => F.push({id:d.id, ...d.data()}));
    // Desde cuándo se ficha con la app (antes no se marca nada como "sin fichar")
    let inicio = null;
    try{ (await db.collection("dhs_fichajes").orderBy("fecha").limit(1).get()).forEach(d => inicio = d.data().fecha); }catch(e){}
    try{ (await db.collection("dhs_trabajos").get()).forEach(d => T.push(d.data())); }catch(e){}
    return {P, F, T, inicio};
  }
  const plantilla = P => Object.entries(P).filter(([k,p]) => p.activo !== false && p.tipo === "plantilla").sort((a,b) => a[1].nombre.localeCompare(b[1].nombre));
  const citasDe = (T, k, f) => T.filter(t => !["cancelado"].includes(t.estado)).reduce((n, t) => n + (t.citas||[]).filter(c => c.fecha === f && (c.personal||t.asignados||[]).includes(k)).length, 0);
  const laborables = (desde, hasta) => { const L = []; for(let d = new Date(desde + "T12:00"); iso(d) <= hasta; d.setDate(d.getDate()+1)) if(![0,6].includes(d.getDay())) L.push(iso(d)); return L; };

  // ---------- Ajustes › Fichajes ----------
  let mesSel = iso(new Date()).slice(0,7);
  async function vista(el){
    const {db, S} = D();
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    const desde = mesSel + "-01", fin = new Date(Number(mesSel.slice(0,4)), Number(mesSel.slice(5,7)), 0), hasta = iso(fin), hoy = iso(new Date());
    let datos;
    try{ datos = await leerMes(desde, hasta); }catch(e){ el.innerHTML = `<p class="vacio">No se han podido leer los fichajes (${esc(e.code)}).</p>`; return; }
    const {P, F, T, inicio} = datos, gente = plantilla(P), dias = laborables(desde, hasta < hoy ? hasta : hoy);
    const cuenta = f => inicio && f >= inicio;   // solo desde que se empezó a fichar con la app
    const fila = (k, f) => calcular(F.filter(x => x.personalId === k && x.fecha === f));
    el.innerHTML = `
      <h3>Fichajes</h3>
      ${!inicio ? `<p class="aviso-cal">Todavía nadie ha fichado con la app. Los avisos de "sin fichar" empiezan a contar desde el primer fichaje.</p>` : ""}
      <p class="vacio" style="margin:4px 0 10px">Registro diario de jornada de la plantilla (obligatorio: se guarda 4 años). Los fichajes no se pueden cambiar; si alguien se olvida, añade una <b>corrección</b> con el motivo (sale con *).</p>
      <div class="fi-barra"><input type="month" id="mesFi" value="${mesSel}"> <button class="btn sec" id="csvFi">⬇ Descargar el mes (Excel/CSV)</button></div>
      ${gente.length ? gente.map(([k,p]) => {
        const filas = dias.map(f => ({f, c:fila(k, f), citas:citasDe(T, k, f)}));
        const totalMes = filas.reduce((n, x) => n + x.c.total, 0);
        const sinFichar = filas.filter(x => cuenta(x.f) && !F.some(y => y.personalId === k && y.fecha === x.f) && (x.citas > 0 || x.f < hoy));
        return `<div class="bloque fi-persona">
          <div class="fi-cab"><b><i class="punto" style="background:${esc(p.color)}"></i>${esc(p.nombre)}</b><span>${durTxt(totalMes)} este mes${sinFichar.length ? ` · <span class="tag aviso">${sinFichar.length} día${sinFichar.length===1?"":"s"} sin fichar</span>` : ""}</span></div>
          <table class="tabla-fi"><thead><tr><th>Día</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Citas</th><th></th></tr></thead><tbody>
          ${filas.slice().reverse().map(x => {
            const nada = !F.some(y => y.personalId === k && y.fecha === x.f);
            const malo = nada && cuenta(x.f) && (x.citas > 0 || x.f < hoy);
            return `<tr class="${malo ? "fi-mal" : ""} ${x.c.abierto && x.f < hoy ? "fi-abierto" : ""}">
              <td>${new Date(x.f + "T12:00").toLocaleDateString("es-ES", {weekday:"short", day:"numeric"})}</td>
              <td>${x.c.primera ? hhmm(x.c.primera) + pinUbi(x.c.fPrimera.ubicacion) : (nada ? "—" : "")}</td>
              <td>${x.c.ultima ? hhmm(x.c.ultima) + pinUbi(x.c.fUltima.ubicacion) : (x.c.abierto ? (x.f < hoy ? "⚠️ sin salida" : "trabajando") : "—")}</td>
              <td>${x.c.abierto && x.f < hoy ? "?" : (x.c.total ? durTxt(x.c.total) : "")}${x.c.correcciones ? " *" : ""}</td>
              <td>${x.citas || ""}</td>
              <td>${S.direccion ? `<button class="btn sec mini-btn" data-k="${k}" data-f="${x.f}">Corregir</button>` : ""}</td></tr>`;
          }).join("")}</tbody></table></div>`;
      }).join("") : `<p class="vacio">No hay nadie de plantilla en Ajustes › Equipo.</p>`}
      <form id="fCorr" class="bloque oculto" style="margin-top:12px">
        <h3>Corrección de fichaje</h3><p class="vacio" id="corrQuien"></p>
        <div class="fila-form">
          <label class="campo"><span>Qué</span><select name="que">${Object.entries(TIPOS).map(([k,n]) => `<option value="${k}">${n}</option>`).join("")}</select></label>
          <label class="campo"><span>Hora</span><input type="time" name="hora" value="09:00" required></label>
          <label class="campo" style="flex:1"><span>Motivo *</span><input name="motivo" placeholder="Se olvidó de fichar la entrada (confirmado por teléfono)" required></label>
        </div>
        <button class="btn" type="submit">Guardar corrección</button> <button class="btn sec" type="button" id="corrNo">Cancelar</button> <span id="msgCorr" class="vacio"></span>
      </form>`;
    el.querySelector("#mesFi").onchange = e => { mesSel = e.target.value || mesSel; vista(el); };
    el.querySelector("#csvFi").onclick = () => {
      const L = [["Trabajador","Fecha","Tipo","Hora","Corrección","Motivo","Corregido por","Ubicación"]];
      F.slice().sort((a,b) => (a.nombre||"").localeCompare(b.nombre||"") || ms(a) - ms(b)).forEach(f => L.push([(P[f.personalId]||{}).nombre || f.nombre || f.email, f.fecha, TIPOS[tipoReal(f)] || tipoReal(f), hhmm(ms(f)), f.tipo === "correccion" ? "Sí" : "", f.motivo || "", f.por || "", f.ubicacion ? (f.ubicacion.lat != null ? f.ubicacion.lat + "," + f.ubicacion.lng : "sin ubicación") : ""]));
      const csv = "﻿" + L.map(r => r.map(x => '"' + String(x).replace(/"/g,'""') + '"').join(";")).join("\r\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"})); a.download = "fichajes-" + mesSel + ".csv"; a.click();
    };
    const fC = el.querySelector("#fCorr"); let corr = null;
    el.querySelectorAll("[data-f][data-k].mini-btn").forEach(b => b.onclick = () => {
      corr = {k:b.dataset.k, f:b.dataset.f}; fC.classList.remove("oculto");
      el.querySelector("#corrQuien").textContent = (P[corr.k]||{}).nombre + " · " + new Date(corr.f + "T12:00").toLocaleDateString("es-ES", {weekday:"long", day:"numeric", month:"long"});
      fC.scrollIntoView({behavior:"smooth"});
    });
    el.querySelector("#corrNo").onclick = () => fC.classList.add("oculto");
    fC.onsubmit = async ev => {
      ev.preventDefault();
      const fd = new FormData(fC), yo = S.usuario.email.toLowerCase();
      const p = P[corr.k] || {};
      try{
        await db.collection("dhs_fichajes").add({tipo:"correccion", que:fd.get("que"), hora:fd.get("hora"), motivo:fd.get("motivo").trim(), fecha:corr.f,
          personalId:corr.k, email:(p.email||"").toLowerCase(), nombre:p.nombre||"", por:yo, en:firebase.firestore.FieldValue.serverTimestamp()});
        await db.collection("dhs_registro").add({por:yo, en:firebase.firestore.FieldValue.serverTimestamp(), accion:"corrección de fichaje: " + TIPOS[fd.get("que")] + " " + fd.get("hora") + " (" + fd.get("motivo").trim() + ")", coleccion:"dhs_fichajes", nombre:(p.nombre||"") + " · " + corr.f});
        vista(el);
      }catch(e){ el.querySelector("#msgCorr").textContent = "No se ha podido guardar (" + (e.code||e) + ")."; }
    };
  }

  // ---------- Aviso al entrar (Dirección y quien vea Ajustes) ----------
  async function avisoAlEntrar(){
    const {S} = D();
    if(!activo() || !S.puede("ajustes")) return;
    const hoy = new Date(), hoyI = iso(hoy);
    const desde = iso(new Date(hoy.getTime() - 14*86400000));
    let datos; try{ datos = await leerMes(desde, hoyI); }catch(e){ return; }
    const {P, F, T, inicio} = datos, avisos = [];
    if(!inicio) return;   // nadie ha empezado a fichar con la app todavía
    const dias = laborables(desde > inicio ? desde : inicio, hoyI);
    const pasadas = hoy.getHours()*60 + hoy.getMinutes() >= 9*60 + 30;
    plantilla(P).forEach(([k,p]) => {
      const ficho = f => F.some(y => y.personalId === k && y.fecha === f);
      if(pasadas && ![0,6].includes(hoy.getDay()) && citasDe(T, k, hoyI) > 0 && !ficho(hoyI)) avisos.push(`<b>${esc(p.nombre)}</b> tiene ${citasDe(T, k, hoyI)} cita(s) hoy y no ha fichado.`);
      let seguidos = 0; for(const f of dias.filter(f => f < hoyI).reverse()){ if(ficho(f)) break; seguidos++; }
      if(seguidos >= DIAS_AVISO && F.some(y => y.personalId === k) ) avisos.push(`<b>${esc(p.nombre)}</b> lleva ${seguidos} días laborables sin fichar.`);
      else if(seguidos >= DIAS_AVISO && !F.some(y => y.personalId === k)) avisos.push(`<b>${esc(p.nombre)}</b> no ha fichado ningún día en las dos últimas semanas.`);
    });
    if(!avisos.length) return;
    const b = document.createElement("div");
    b.className = "aviso-flotante aviso-fi";
    b.innerHTML = `⏱️ ${avisos.join("<br>")} <a href="#ajustes/fichajes">Ver fichajes</a> <button aria-label="Cerrar">✕</button>`;
    b.querySelector("button").onclick = () => b.remove();
    b.querySelector("a").onclick = () => b.remove();
    document.body.appendChild(b);
  }

  window.DHS_FICHA = { debeFichar, tarjeta, vista, avisoAlEntrar, activo };
})();
