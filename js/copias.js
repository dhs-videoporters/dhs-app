// DHS App — Copias de seguridad: descargar todo, aviso a los 30 días y restaurar (solo Dirección).
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  // Colecciones de la app y sus subcolecciones.
  const COLECCIONES = [
    ["dhs_admins"], ["dhs_comunidades", "contactos"], ["dhs_personal"], [window.DHS_COL_USU], ["dhs_perfiles"],
    ["dhs_ausencias"], ["dhs_trabajos", "notas"], ["dhs_contadores"], ["dhs_fichajes"], ["dhs_catalogo"], ["dhs_presupuestos"], ["dhs_bancos"], ["dhs_registro"]
  ];
  const NOMBRES = {dhs_admins:"Administraciones", dhs_comunidades:"Comunidades", dhs_personal:"Equipo", dhs_usuarios:"Accesos", dhs_app_usuarios:"Accesos", dhs_perfiles:"Perfiles",
                   dhs_ausencias:"Ausencias", dhs_trabajos:"Intervenciones", dhs_contadores:"Numeración", dhs_fichajes:"Fichajes", dhs_catalogo:"Catálogo", dhs_presupuestos:"Presupuestos", dhs_bancos:"Números de cuenta", dhs_registro:"Registro de cambios"};
  const ACCION = "copia de seguridad";
  const DIAS_AVISO = 4;   // la copia automática es de lunes a viernes: si pasan más de 4 días, algo ha fallado

  // Fechas de Firestore <-> JSON
  const aJSON = v => {
    if(v && typeof v.toMillis === "function") return {__fecha: v.toMillis()};
    if(Array.isArray(v)) return v.map(aJSON);
    if(v && typeof v === "object"){ const o = {}; for(const k in v) o[k] = aJSON(v[k]); return o; }
    return v;
  };
  const deJSON = v => {
    if(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1 && "__fecha" in v) return firebase.firestore.Timestamp.fromMillis(v.__fecha);
    if(Array.isArray(v)) return v.map(deJSON);
    if(v && typeof v === "object"){ const o = {}; for(const k in v) o[k] = deJSON(v[k]); return o; }
    return v;
  };

  async function ultimaCopia(){
    const q = await D().db.collection("dhs_registro").where("accion", "==", ACCION).get();
    let max = 0; q.forEach(d => { const t = d.data().en; if(t && t.toMillis && t.toMillis() > max) max = t.toMillis(); });
    return max;
  }
  const diasDesde = ms => ms ? Math.floor((Date.now() - ms) / 86400000) : null;

  async function descargar(msg){
    const {db, S} = D();
    const copia = {app:"dhs-app", entorno: window.DHS_CONFIG.entorno, fecha: new Date().toISOString(), por: S.usuario.email.toLowerCase(), datos:{}};
    let total = 0;
    for(const [col, sub] of COLECCIONES){
      msg("Leyendo " + NOMBRES[col] + "…");
      const q = await db.collection(col).get();
      copia.datos[col] = {};
      for(const d of q.docs){
        const doc = {datos: aJSON(d.data())};
        if(sub){
          const s = await d.ref.collection(sub).get();
          if(!s.empty){ doc[sub] = {}; s.forEach(x => doc[sub][x.id] = aJSON(x.data())); }
        }
        copia.datos[col][d.id] = doc; total++;
      }
    }
    const blob = new Blob([JSON.stringify(copia, null, 1)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dhs-app-" + (copia.entorno === "pruebas" ? "PRUEBAS-" : "") + "copia-" + copia.fecha.slice(0,10) + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    await db.collection("dhs_registro").add({por:copia.por, en:firebase.firestore.FieldValue.serverTimestamp(), accion:ACCION, coleccion:"todas", n:total});
    return total;
  }

  async function restaurar(copia, msg){
    const {db, S} = D(), yo = S.usuario.email.toLowerCase();
    const firma = {por:yo, en:firebase.firestore.FieldValue.serverTimestamp()};
    let ops = [];
    for(const [col, sub] of COLECCIONES){
      if(col === "dhs_registro" || col === "dhs_fichajes") continue;   // el registro y los fichajes no se reescriben nunca
      const docs = (copia.datos || {})[col] || {};
      for(const [id, doc] of Object.entries(docs)){
        const datos = deJSON(doc.datos || {});
        if("modificado" in datos || ["dhs_admins","dhs_comunidades"].includes(col)) datos.modificado = firma;
        ops.push([db.collection(col).doc(id), datos]);
        if(sub && doc[sub]) for(const [sid, sd] of Object.entries(doc[sub])){
          const x = deJSON(sd); x.modificado = firma;
          ops.push([db.collection(col).doc(id).collection(sub).doc(sid), x]);
        }
      }
    }
    for(let i = 0; i < ops.length; i += 400){
      msg("Restaurando… " + Math.min(i+400, ops.length) + " de " + ops.length);
      const b = db.batch(); ops.slice(i, i+400).forEach(([ref, d]) => b.set(ref, d)); await b.commit();
    }
    await db.collection("dhs_registro").add({por:yo, en:firebase.firestore.FieldValue.serverTimestamp(), accion:"restauración desde copia", coleccion:"todas", n:ops.length, nombre:copia.fecha || ""});
    return ops.length;
  }

  // ---------- Pestaña "Copias" de Ajustes ----------
  async function vista(el){
    const {S} = D();
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    let ult = 0; try{ ult = await ultimaCopia(); }catch(e){}
    const dias = diasDesde(ult);
    const aviso = dias === null ? `<div class="aviso-copia">Todavía no se ha hecho ninguna copia de seguridad (ni automática ni manual).</div>`
      : (dias > DIAS_AVISO ? `<div class="aviso-copia">La última copia es de hace <b>${dias} días</b>: la copia automática diaria no se ha hecho. Haz una manual y revisa el programa de copias.</div>` : "");
    el.innerHTML = `
      <h3>Copias de seguridad</h3>
      ${aviso}
      <p>Última copia: <b>${ult ? new Date(ult).toLocaleString("es-ES", {day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit"}) : "nunca"}</b>${dias !== null ? " (hace " + dias + (dias===1?" día)":" días)") : ""}</p>
      <p class="vacio" style="margin:6px 0 12px">Descarga un archivo con todo: administraciones, comunidades y vecinos, equipo, accesos, perfiles, trabajos y registro. Guárdalo en <b>Documentos › DHS › Copias</b>. La copia automática se hace <b>cada día de lunes a viernes a las 20:00</b> y se guarda en el Google Drive de DHS (carpeta «DHS · Copias app»). Si pasan más de ${DIAS_AVISO} días sin copia, la app avisa.</p>
      <p><button class="btn" id="btnCopia">⬇ Descargar copia ahora</button> <span id="msgCopia" class="vacio"></span></p>
      ${S.direccion ? `
      <div class="bloque" style="margin-top:18px">
        <h3>Restaurar desde una copia</h3>
        <p class="vacio">Solo Dirección. Vuelve a poner los datos tal como estaban en la copia (lo que se haya creado después se mantiene; lo que estaba en la copia se sobrescribe). El registro de cambios no se toca.</p>
        <p style="margin-top:8px"><input type="file" id="fRest" accept=".json"> <button class="btn sec" id="btnRest" disabled>Revisar copia</button></p>
        <div id="resRest"></div>
      </div>` : ""}`;
    const msg = t => el.querySelector("#msgCopia").textContent = t;
    el.querySelector("#btnCopia").onclick = async () => {
      const b = el.querySelector("#btnCopia"); b.disabled = true;
      try{ const n = await descargar(msg); msg("Copia descargada (" + n + " registros). Revisa tu carpeta de Descargas."); setTimeout(() => vista(el), 2500); }
      catch(e){ msg("No se ha podido hacer la copia (" + (e.code||e) + ")."); b.disabled = false; }
    };
    if(!S.direccion) return;
    const f = el.querySelector("#fRest"), bR = el.querySelector("#btnRest"), res = el.querySelector("#resRest");
    let copia = null;
    f.onchange = () => { bR.disabled = !f.files.length; res.innerHTML = ""; };
    bR.onclick = () => {
      const r = new FileReader();
      r.onload = () => {
        try{ copia = JSON.parse(r.result); if(copia.app !== "dhs-app" || !copia.datos) throw 0; }
        catch(e){ res.innerHTML = `<p class="ko">Ese archivo no es una copia de la DHS App.</p>`; return; }
        const otro = copia.entorno !== window.DHS_CONFIG.entorno;
        res.innerHTML = `
          <p style="margin-top:8px">Copia del <b>${esc(new Date(copia.fecha).toLocaleString("es-ES"))}</b>, hecha por ${esc(copia.por)}:</p>
          <ul class="vacio" style="margin:6px 0 6px 18px">${COLECCIONES.map(([c]) => `<li>${NOMBRES[c]}: ${Object.keys(copia.datos[c]||{}).length}</li>`).join("")}</ul>
          ${otro ? `<p class="ko"><b>Atención:</b> esta copia es de la versión <b>${esc(copia.entorno)}</b> y estás en <b>${esc(window.DHS_CONFIG.entorno)}</b>.</p>` : ""}
          <p><button class="btn" id="btnRestOk">Restaurar estos datos</button> <span id="msgRest" class="vacio"></span></p>`;
        res.querySelector("#btnRestOk").onclick = async () => {
          if(!confirm("¿Seguro? Se sobrescribirán los datos actuales con los de la copia." + (otro ? " Además, la copia es de otra versión de la app." : ""))) return;
          const m = t => res.querySelector("#msgRest").textContent = t;
          try{ const n = await restaurar(copia, m); m("Restaurado (" + n + " registros)."); await window.DHS_COM.recargar(); }
          catch(e){ m("No se ha podido restaurar (" + (e.code||e) + ")."); }
        };
      };
      r.readAsText(f.files[0]);
    };
  }

  // Aviso al entrar si hace más de 30 días (solo a quien puede hacer copias).
  async function avisoAlEntrar(){
    const {S} = D();
    if(!S.puede("ajustes","editar")) return;
    try{
      const dias = diasDesde(await ultimaCopia());
      if(dias !== null && dias <= DIAS_AVISO) return;
      const b = document.createElement("div");
      b.className = "aviso-flotante";
      b.innerHTML = (dias === null ? "Todavía no hay ninguna copia de seguridad." : "Hace " + dias + " días de la última copia de seguridad.") +
        ` <a href="#ajustes/copias">Hacer copia</a> <button aria-label="Cerrar">✕</button>`;
      b.querySelector("button").onclick = () => b.remove();
      b.querySelector("a").onclick = () => b.remove();
      document.body.appendChild(b);
    }catch(e){}
  }

  window.DHS_COPIAS = { vista, avisoAlEntrar };
})();
