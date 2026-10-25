// DHS App — Cámaras, a modo de información (Ángel 25/10: el trabajo de los chicos sigue en la app de cámaras, que se queda).
// Se lee de la app de cámaras a través del puente (solo lectura): nº de cámaras, conexión, notas, revisiones y, solo para
// Dirección, el mantenimiento (precio y años cobrados). Las claves de los grabadores no salen de la app de cámaras.
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  const eur = n => (Number(n)||0).toLocaleString("es-ES", {style:"currency", currency:"EUR"});
  const fch = f => f ? new Date(String(f).slice(0,10) + "T12:00").toLocaleDateString("es-ES") : "";
  const APP_CAMARAS = "https://angelchiva.github.io/dhs-camaras/";
  const PER = {verano:"Verano (marzo)", invierno:"Invierno (octubre)"};
  const CHECK = {limpieza:"limpieza", grabacion:"grabación", retencion:"conservación de imágenes", fechahora:"fecha y hora", disco:"disco duro / alimentación", angulos:"ángulos", carteles:"carteles"};

  let CACHE = null, EN = 0;
  async function datos(forzar){
    if(!CACHE || forzar || Date.now() - EN > 300000){ CACHE = await window.DHS_PRES.llamar("camaras", {}); EN = Date.now(); }
    return CACHE;
  }
  // Mismo criterio que la app de cámaras: verano = cambio de hora de marzo (1 mar–30 abr), invierno = octubre (1 oct–30 nov)
  function estado(inst, y, p){
    const r = (inst.revisiones||[]).find(x => x.anio === y && x.periodo === p);
    if(r && r.hecha) return r.incidencias.length ? {c:"warn", t:"hecha, con incidencia"} : {c:"ok", t:"hecha"};
    const hoy = new Date(), ini = new Date(y, p === "verano" ? 2 : 9, 1), fin = new Date(y, p === "verano" ? 3 : 10, 30, 23, 59);
    if(hoy > fin) return {c:"bad", t:"atrasada"};
    if(r) return {c:"now", t:"a medias"};
    if(hoy >= ini) return {c:"now", t:"toca ahora"};
    return {c:"", t:"pendiente"};
  }
  const pastilla = s => `<span class="cam-pill ${s.c}">${esc(s.t)}</span>`;
  function cobroAnio(inst, y){
    if(!inst.economia) return null;
    const c = (inst.economia.cobros||{})[y];
    if(!c) return {c:"", t:"sin cobrar"};
    if(c.cobrado) return {c:"ok", t:"cobrado" + (c.fecha ? " " + fch(c.fecha) : "")};
    if(c.incluido) return {c:"ok", t:"incluido (1er año)"};
    return {c:"bad", t:"sin cobrar"};
  }

  // Parecido de nombres (mismo criterio que al unir cuentas): números de la dirección iguales, parking con parking
  const PAL = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()
    .replace(/\b(cdad|comunidad|comunitat|ccpp|propietarios|propietaris|prop|cp|c\.p|de|del|la|el|les|i|y|n|no|num|esc|escala)\b/g," ")
    .replace(/\bavda?\b|\bav\b/g,"avenida").replace(/\bctra\b/g,"carretera").replace(/\brda\b/g,"ronda").replace(/\bpz\b|\bpl\b|\bplaca\b/g,"plaza")
    .replace(/\bparquing\b|\bpk\b|\bprk\b/g,"parking").split(/[^a-z0-9]+/).filter(Boolean);
  function parecido(a, b){
    const A = PAL(a), B = PAL(b); if(!A.length || !B.length) return 0;
    const nA = A.filter(x => /\d/.test(x)), nB = B.filter(x => /\d/.test(x));
    if(nA.length && !nA.every(n => nB.includes(n))) return 0;
    if(A.includes("parking") !== B.includes("parking")) return 0;
    const SA = new Set(A), SB = new Set(B); return [...SA].filter(x => SB.has(x)).length / new Set([...SA, ...SB]).size;
  }

  // Pestaña "Cámaras" de la ficha de una comunidad
  async function pestana(el, comId, com){
    const {db, S} = D();
    el.innerHTML = `<p class="vacio">Leyendo la app de cámaras…</p>`;
    let L; try{ L = await datos(); }catch(e){ el.innerHTML = `<p class="vacio">No se ha podido leer la app de cámaras: ${esc(e.message||e)}</p>`; return; }
    const puedeUnir = S.puede("comunidades","editar");
    const idUnida = com.camarasId || (com.camaras && com.camaras.instalacionId) || null;
    let inst = idUnida ? L.find(x => x.id === idUnida) : null;
    let sug = null;
    if(!inst && !com.sinCamaras && !(com.camaras && com.camaras.tiene === false && com.camarasRevisado)){
      let mejor = 0; L.forEach(x => { const p = Math.max(parecido(com.nombre, x.comunidad), parecido(com.direccion, x.comunidad), parecido(com.nombre, x.direccion)); if(p > mejor){ mejor = p; sug = x; } });
      if(mejor < 0.5) sug = null;
    }
    const unir = async (camId, sin) => {
      const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
      const x = camId ? L.find(i => i.id === camId) : null;
      const cambio = sin ? {sinCamaras:true, camarasId:null, camaras:{tiene:false, instalacionId:null, numero:null}}
                         : {camarasId:camId, sinCamaras:false, camaras:{tiene:true, instalacionId:camId, numero:x && x.camaras != null ? x.camaras : null}};
      await db.collection("dhs_comunidades").doc(comId).set({...cambio, modificado:{por:yo, en}}, {merge:true});
      await db.collection("dhs_registro").add({por:yo, en, accion: sin ? "marcada sin cámaras" : "unida a la app de cámaras (" + camId + ")", coleccion:"dhs_comunidades", docId:comId, nombre:com.nombre});
      Object.assign(com, cambio); pestana(el, comId, com);
    };
    const elegir = () => `<p style="margin-top:8px"><select id="selCam"><option value="">Elegir instalación de la app de cámaras…</option>${L.slice().sort((a,b) => a.comunidad.localeCompare(b.comunidad)).map(x => `<option value="${esc(x.id)}">${esc(x.comunidad)}${x.ciudad ? " (" + esc(x.ciudad) + ")" : ""}</option>`).join("")}</select>
      <button class="btn sec mini-btn" id="bUnirSel">Unir</button> <button class="btn sec mini-btn" id="bSinCam">No tiene cámaras</button></p>`;
    const enlazar = () => {
      const bS = el.querySelector("#bUnirSel"); if(bS) bS.onclick = () => { const v = el.querySelector("#selCam").value; if(v) unir(v); };
      const bN = el.querySelector("#bSinCam"); if(bN) bN.onclick = () => unir(null, true);
      const bU = el.querySelector("#bUnirSug"); if(bU) bU.onclick = () => unir(sug.id);
      const bQ = el.querySelector("#bQuitar"); if(bQ) bQ.onclick = () => unir(null, true);
    };
    if(!inst){
      el.innerHTML = `<h3>📹 Cámaras</h3>
        ${sug ? `<p>En la app de cámaras hay una instalación que parece esta: <b>${esc(sug.comunidad)}</b>${sug.ciudad ? " (" + esc(sug.ciudad) + ")" : ""}.</p>${puedeUnir ? `<p><button class="btn" id="bUnirSug">Sí, es esta</button></p>` : ""}`
          : `<p class="vacio">${com.sinCamaras ? "Marcada como sin cámaras." : "No está unida a ninguna instalación de la app de cámaras."}</p>`}
        ${puedeUnir ? `<details style="margin-top:6px"><summary class="vacio">${sug ? "No es esa: elegir otra o marcar que no tiene" : "Unirla a mano"}</summary>${elegir()}</details>` : ""}
        <p style="margin-top:10px"><a class="btn sec" href="${APP_CAMARAS}" target="_blank" rel="noopener">Abrir la app de cámaras ↗</a></p>`;
      enlazar(); return;
    }
    const y = new Date().getFullYear();
    const años = [...new Set([y, ...(inst.revisiones||[]).map(r => r.anio)])].sort((a,b) => b - a).slice(0, 4);
    // Si el nº de cámaras ha cambiado en la app de cámaras, se pone al día en la ficha (para la cabecera y la lista)
    if(puedeUnir && (!com.camaras || com.camaras.numero !== (inst.camaras ?? null) || com.camaras.instalacionId !== inst.id)){
      const cam = {tiene:true, instalacionId:inst.id, numero:inst.camaras ?? null};
      try{ await db.collection("dhs_comunidades").doc(comId).set({camaras:cam, camarasId:inst.id, modificado:{por:S.usuario.email.toLowerCase(), en:firebase.firestore.FieldValue.serverTimestamp()}}, {merge:true}); com.camaras = cam; com.camarasId = inst.id; }catch(e){}
    }
    el.innerHTML = `<h3>📹 Cámaras <span class="vacio" style="font-weight:400;font-size:13px">· información de la app de cámaras (el trabajo se sigue haciendo allí)</span></h3>
      <div class="cam-datos">
        <div><span>Cámaras</span><b>${inst.camaras != null ? esc(inst.camaras) : "—"}</b></div>
        <div><span>Conexión</span><b>${esc(inst.conexion || "—")}</b></div>
        <div><span>Contacto</span><b>${esc(inst.contacto || "—")}${inst.telefono ? ` · <a href="tel:${esc(inst.telefono)}">${esc(inst.telefono)}</a>` : ""}</b></div>
        <div><span>En la app de cámaras</span><b>${esc(inst.comunidad)}</b></div>
        <div><span>Dirección</span><b>${esc([inst.direccion, inst.ciudad].filter(Boolean).join(", ") || "—")}</b></div>
        <div><span>Administración</span><b>${esc(inst.admin || "—")}</b></div>
        ${inst.emailFinca !== undefined ? `<div><span>Correo de la finca</span><b>${inst.emailFinca ? `<a href="mailto:${esc(inst.emailFinca)}">${esc(inst.emailFinca)}</a>` : "—"}</b></div>` : ""}
        ${inst.economia ? `<div><span>Mantenimiento</span><b>${eur(inst.economia.precio)} / año</b></div>` : ""}
      </div>
      ${inst.claves !== undefined ? `<div class="bloque" style="margin-top:8px"><b>🔑 Claves del grabador</b>
        ${inst.claves ? ` <button class="btn sec mini-btn" id="bClaves">Mostrar</button><pre id="txtClaves" class="cam-claves oculto"></pre>` : ` <span class="vacio">no hay claves guardadas</span>`}
        <p class="vacio" style="margin:4px 0 0">Para consultarlas si llaman por teléfono. Se cambian en la app de cámaras. Queda registrado quién las mira.</p></div>` : ""}
      ${inst.notas ? `<p class="ft-nota" style="margin-top:8px">${esc(inst.notas)}</p>` : ""}
      <table class="tabla-fi" style="margin-top:10px"><thead><tr><th>Año</th><th>${PER.verano}</th><th>${PER.invierno}</th>${inst.economia ? "<th>Cobro del mantenimiento</th>" : ""}</tr></thead><tbody>
        ${años.map(a => `<tr><td><b>${a}</b></td>${["verano","invierno"].map(p => { const r = (inst.revisiones||[]).find(x => x.anio === a && x.periodo === p);
          return `<td>${pastilla(estado(inst, a, p))}${r && r.hecha ? `<br><span class="vacio">${esc(fch(r.fecha))}${r.tecnico ? " · " + esc(r.tecnico) : ""}${r.incidencias.length ? " · ⚠️ " + esc(r.incidencias.map(k => CHECK[k] || k).join(", ")) : ""}</span>` : ""}</td>`; }).join("")}
          ${inst.economia ? `<td>${pastilla(cobroAnio(inst, a))}</td>` : ""}</tr>`).join("")}
      </tbody></table>
      <p style="margin-top:10px"><a class="btn sec" href="${APP_CAMARAS}" target="_blank" rel="noopener">Abrir la app de cámaras ↗</a>
        ${puedeUnir ? ` <button class="btn sec mini-btn" id="bQuitar" title="Si se unió a la instalación equivocada">Desunir</button>` : ""}</p>`;
    enlazar();
    const bC = el.querySelector("#bClaves");
    if(bC) bC.onclick = async () => {
      const t = el.querySelector("#txtClaves"), ver = t.classList.contains("oculto");
      t.textContent = ver ? inst.claves : ""; t.classList.toggle("oculto", !ver); bC.textContent = ver ? "Ocultar" : "Mostrar";
      if(ver) try{ await db.collection("dhs_registro").add({por:S.usuario.email.toLowerCase(), en:firebase.firestore.FieldValue.serverTimestamp(), accion:"ha mirado las claves de cámaras", coleccion:"dhs_comunidades", docId:comId, nombre:com.nombre}); }catch(e){}
    };
  }

  // Resumen para Economía (solo Dirección): mantenimientos de este año, revisiones y cobros
  async function resumen(el){
    let L; try{ L = await datos(); }catch(e){ el.innerHTML = `<p class="vacio">No se ha podido leer la app de cámaras: ${esc(e.message||e)}</p>`; return; }
    const y = new Date().getFullYear(), conEco = L.filter(x => x.economia);
    const fila = x => { const c = cobroAnio(x, y); return {x, v:estado(x, y, "verano"), i:estado(x, y, "invierno"), c}; };
    const F = L.map(fila).sort((a,b) => a.x.comunidad.localeCompare(b.x.comunidad));
    const nOk = p => F.filter(f => f[p].c === "ok" || f[p].c === "warn").length;
    const sinCobrar = F.filter(f => f.c && f.c.c === "bad");
    el.innerHTML = `<h3 style="margin-top:18px">📹 Mantenimientos de cámaras ${y}</h3>
      <p class="vacio">${L.length} instalaciones · revisión de verano hecha en ${nOk("v")} · de invierno en ${nOk("i")}${conEco.length ? ` · mantenimiento ${y} sin cobrar: <b>${sinCobrar.length}</b> (${eur(sinCobrar.reduce((n,f) => n + (Number(f.x.economia.precio)||0), 0))})` : ""}</p>
      <details class="eco-hist"><summary>Ver todas</summary>
      <table class="tabla-fi" style="margin-top:8px"><thead><tr><th>Instalación</th><th>Administración</th><th>Verano</th><th>Invierno</th>${conEco.length ? `<th>Cobro ${y}</th>` : ""}</tr></thead><tbody>
        ${F.map(f => `<tr><td>${esc(f.x.comunidad)}</td><td>${esc(f.x.admin)}</td><td>${pastilla(f.v)}</td><td>${pastilla(f.i)}</td>${conEco.length ? `<td>${f.c ? pastilla(f.c) : ""}${f.x.economia ? ` <span class="vacio">${eur(f.x.economia.precio)}</span>` : ""}</td>` : ""}</tr>`).join("")}
      </tbody></table></details>`;
  }

  window.DHS_CAMS = { pestana, resumen, datos };
})();
