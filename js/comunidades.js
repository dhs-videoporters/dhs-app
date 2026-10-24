// DHS App — Comunidades: lista con buscador y ficha con pestañas.
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sinAc = s => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const D = () => window.DHS;
  let CACHE = { admins:null, coms:null };
  let filtro = { texto:"", tipo:"todas", admin:"" };

  async function cargar(forzar){
    const {db} = D();
    if(!CACHE.admins || forzar){
      const a = await db.collection("dhs_admins").get();
      CACHE.admins = {}; a.forEach(d => CACHE.admins[d.id] = d.data());
    }
    if(!CACHE.coms || forzar){
      const c = await db.collection("dhs_comunidades").get();
      CACHE.coms = {}; c.forEach(d => CACHE.coms[d.id] = d.data());
    }
  }
  const nombreAdmin = id => id && CACHE.admins[id] ? CACHE.admins[id].nombre : "";
  const TIPOS = {comunidad:"Comunidad", empresa:"Empresa", particular:"Particular"};

  // ---------- LISTA ----------
  async function lista(el){
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    try{ await cargar(); }catch(e){ el.innerHTML = `<div class="panel">No se han podido leer los datos (${esc(e.code)}).</div>`; return; }
    const admins = Object.entries(CACHE.admins).filter(([k,a]) => a.activo !== false).sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre));
    el.innerHTML = `
      <div class="panel">
        <div class="cab-lista">
          <h2>Comunidades</h2>
          <input id="buscaCom" class="busca" placeholder="Buscar por nombre, calle, población o NIF…" value="${esc(filtro.texto)}">
        </div>
        <div class="filtros">
          ${["todas","comunidad","empresa","particular","sinadmin","nuevas"].map(t => `<button class="chip ${filtro.tipo===t?"on":""}" data-tipo="${t}">${{todas:"Todas",comunidad:"Comunidades",empresa:"Empresas",particular:"Particulares",sinadmin:"Sin administración",nuevas:"✱ Faltan datos"}[t]}</button>`).join("")}
          <select id="filtroAdmin" class="sel"><option value="">Todas las administraciones</option>${admins.map(([id,a])=>`<option value="${id}" ${filtro.admin===id?"selected":""}>${esc(a.nombre)}</option>`).join("")}</select>
        </div>
        <div id="cuentaCom" class="vacio"></div>
        <div id="listaCom" class="lista"></div>
      </div>`;
    const pintar = () => {
      const q = sinAc(filtro.texto);
      const filas = Object.entries(CACHE.coms).filter(([id,c]) => {
        if(c.activo === false) return false;
        if(filtro.tipo === "nuevas"){ if(!c.nueva) return false; }
        else if(filtro.tipo === "sinadmin" ? !!c.adminId : (filtro.tipo !== "todas" && c.tipo !== filtro.tipo)) return false;
        if(filtro.admin && c.adminId !== filtro.admin) return false;
        if(q && !sinAc([c.nombre,c.direccion,c.poblacion,c.nif,nombreAdmin(c.adminId)].join(" ")).includes(q)) return false;
        return true;
      }).sort((a,b) => a[1].nombre.localeCompare(b[1].nombre));
      document.getElementById("cuentaCom").textContent = filas.length + (filas.length === 1 ? " resultado" : " resultados");
      document.getElementById("listaCom").innerHTML = filas.map(([id,c]) => `
        <a class="fila" href="#comunidad/${encodeURIComponent(id)}">
          <div class="f-nombre">${c.nueva ? '<span class="tag aviso">✱ Faltan datos</span> ' : ""}${esc(c.nombre)}</div>
          <div class="f-sub">${esc([c.direccion, c.poblacion].filter(Boolean).join(" · ") || TIPOS[c.tipo] || "")}</div>
          <div class="f-tags">
            ${c.adminId ? `<span class="tag">${esc(nombreAdmin(c.adminId))}</span>` : (c.tipo==="comunidad" ? `<span class="tag aviso">Sin administración</span>` : `<span class="tag gris">${TIPOS[c.tipo]||""}</span>`)}
            ${c.camaras && c.camaras.tiene ? `<span class="tag azul">Cámaras</span>` : ""}
          </div>
        </a>`).join("") || `<p class="vacio">No hay resultados.</p>`;
    };
    el.querySelector("#buscaCom").oninput = e => { filtro.texto = e.target.value; pintar(); };
    el.querySelectorAll(".chip").forEach(b => b.onclick = () => { filtro.tipo = b.dataset.tipo; el.querySelectorAll(".chip").forEach(x=>x.classList.toggle("on", x===b)); pintar(); });
    el.querySelector("#filtroAdmin").onchange = e => { filtro.admin = e.target.value; pintar(); };
    pintar();
  }

  // ---------- FICHA ----------
  const PESTANAS = [
    ["info","Info"],["intervenciones","Intervenciones"],["presupuestos","Presupuestos"],["documentos","Documentos"],["galeria","Galería"]
  ];
  let pestanaActual = "info";

  async function ficha(el, id){
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    try{ await cargar(); }catch(e){ el.innerHTML = `<div class="panel">No se han podido leer los datos (${esc(e.code)}).</div>`; return; }
    const c = CACHE.coms[id];
    if(!c){ el.innerHTML = `<div class="panel">No existe esta comunidad. <a href="#comunidades">Volver</a></div>`; return; }
    const oficina = D().S.puede("comunidades","editar");
    el.innerHTML = `
      <a href="#comunidades" class="volver">‹ Comunidades</a>
      <div class="panel cab-ficha">
        <div class="ico-ficha">${c.tipo==="particular"?"🏠":(c.tipo==="empresa"?"🏭":"🏢")}</div>
        <div class="cab-txt">
          <h1>${esc(c.nombre)}</h1>
          <div class="vacio">${c.adminId ? "Administración: <b>"+(D().S.puede("administradores") ? '<a href="#administrador/'+encodeURIComponent(c.adminId)+'">'+esc(nombreAdmin(c.adminId))+'</a>' : esc(nombreAdmin(c.adminId)))+"</b>" : (c.tipo==="comunidad" ? '<span class="tag aviso">Sin administración</span>' : esc(TIPOS[c.tipo]))}${c.nif ? " · NIF "+esc(c.nif) : ""}</div>
        </div>
        <div class="cifras">
          <div class="cifra"><b>${c.vecinos ?? "—"}</b><span>vecinos</span></div>
          <div class="cifra"><b id="cifraInt">…</b><span>intervenciones</span></div>
          <div class="cifra"><b>${c.camaras && c.camaras.tiene ? (c.camaras.numero ?? "Sí") : "No"}</b><span>cámaras</span></div>
        </div>
      </div>
      ${D().S.puede("trabajos","editar") ? `<p style="margin:10px 0 0"><a class="btn" href="#nueva-intervencion/${encodeURIComponent(id)}">📅 Agendar intervención</a></p>` : ""}
      ${c.nueva ? `<div class="aviso-edicion" style="margin-top:12px">✱ <b>Comunidad nueva: faltan datos</b>${c.creadaDesde ? " (creada desde la intervención " + esc(c.creadaDesde) + ")" : ""}. Completa NIF, administración, pisos y vecinos, instalación… ${oficina ? `<button class="btn" id="btnCompletar" style="margin-left:6px">Completar datos</button>` : ""}</div>` : ""}
      <div class="pestanas">${PESTANAS.filter(([k]) => k !== "presupuestos" || (window.DHS_PRES && window.DHS_PRES.puedeVerPres())).map(([k,n]) => `<button class="pest ${k===pestanaActual?"on":""}" data-k="${k}">${n}</button>`).join("")}</div>
      <div id="cuerpoFicha" class="panel cuerpo-ficha"></div>`;
    const pintar = () => (CONTENIDO[pestanaActual])(document.getElementById("cuerpoFicha"), id, c, oficina);
    el.querySelectorAll(".pest").forEach(b => b.onclick = () => { pestanaActual = b.dataset.k; el.querySelectorAll(".pest").forEach(x=>x.classList.toggle("on",x===b)); pintar(); });
    const bC = el.querySelector("#btnCompletar");
    if(bC) bC.onclick = () => { pestanaActual = "info"; el.querySelectorAll(".pest").forEach(x => x.classList.toggle("on", x.dataset.k === "info")); editar(document.getElementById("cuerpoFicha"), id, c, oficina); };
    pintar();
    if(pestanaActual !== "intervenciones") window.DHS_TRAB.contar(id).then(n => { const b = document.getElementById("cifraInt"); if(b) b.textContent = n ?? "—"; });
  }

  const fila = (k, v) => `<div class="dato"><span>${k}</span><b>${v === "" || v == null ? "—" : v}</b></div>`;
  const siNo = v => v === true ? "Sí" : (v === false ? "No" : "—");

  const CONTENIDO = {
    info(el, id, c, oficina){
      const vp = c.videoportero || {}, tv = c.tv || {}, pr = c.presidente || {}, cam = c.camaras || {};
      el.innerHTML = `
        <div class="rejilla">
          <div class="bloque"><h3>Datos</h3>
            ${fila("Dirección", esc(c.direccion))}${fila("Población", esc(c.poblacion))}
            ${fila("Administración", esc(nombreAdmin(c.adminId)))}${fila("Vecinos", esc(c.vecinos))}
            ${fila("Acceso", esc(c.acceso))}
          </div>
          <div class="bloque"><h3>Instalación</h3>
            ${fila("Videoportero", esc([vp.marca, vp.modelo, vp.año].filter(Boolean).join(" · ")))}
            ${fila("Monitores", esc(vp.monitores))}
            ${fila("Antena", esc(tv.antena))}${fila("Multibanda", siNo(tv.multibanda))}${fila("Parabólica", siNo(tv.parabolica))}
            ${fila("Cámaras", cam.tiene ? "Sí"+(cam.numero ? " · "+esc(cam.numero) : "") : "No")}
          </div>
          <div class="bloque"><h3>Presidente</h3>
            ${fila("Presidente", pr.nombre ? "★ "+esc([pr.nombre, pr.piso].filter(Boolean).join(" · ")) : "")}
            ${fila("Teléfono", pr.telefono ? `<a href="tel:${esc(pr.telefono)}">${esc(pr.telefono)}</a>` : "")}
            ${fila("Desde", esc(pr.desde))}
            ${(c.historialPresidentes||[]).length ? `<p class="vacio" style="margin-top:6px">Anteriores: ${(c.historialPresidentes).slice().reverse().map(h => esc(h.nombre)+" ("+esc(h.piso||"")+", "+esc(h.desde||"?")+"–"+esc(h.hasta||"?")+")").join(" · ")}</p>` : ""}
          </div>
          <div class="bloque"><h3>Notas</h3><p style="white-space:pre-wrap">${esc(c.notas) || '<span class="vacio">Sin notas.</span>'}</p></div>
          ${window.DHS_BANCO && D().S.puede("cobros","ver") ? `<div class="bloque" id="bloqueBanco"></div>` : ""}
        </div>
        ${oficina || D().S.puede("vecinos","editar") ? `<p style="margin-top:14px"><button class="btn" id="btnEditar">${oficina ? "Editar ficha" : "Editar notas"}</button></p>` : ""}
        ${D().S.puede("vecinos") ? `<div class="bloque" id="bloqueVecinos" style="margin-top:14px"></div>` : ""}`;
      const bE = el.querySelector("#btnEditar"); if(bE) bE.onclick = () => editar(el, id, c, oficina);
      if(window.DHS_BANCO) window.DHS_BANCO.bloque(el.querySelector("#bloqueBanco"), id);
      if(D().S.puede("vecinos")) vecinos(el.querySelector("#bloqueVecinos"), id, c, oficina, () => CONTENIDO.info(el, id, c, oficina));
    },
    intervenciones: (el, id) => D().S.puede("trabajos","ver") ? window.DHS_TRAB.deComunidad(el, id) : el.innerHTML = `<h3>Intervenciones</h3><p class="vacio">Tu perfil no puede ver las intervenciones.</p>`,
    documentos:     el => el.innerHTML = `<h3>Documentos</h3><p class="vacio">Aquí se guardarán los presupuestos en PDF, actas y contratos (fase 6).</p>`,
    presupuestos:   (el, id, c) => window.DHS_PRES.pestana(el, id, c),
    galeria:        (el, id) => window.DHS_FOTOS.galeriaComunidad(el, id)
  };


  // ---------- VECINOS POR PISO ----------
  function pisos(e){
    const L = [];
    const nEsc = e.escaleras || 1, letras = "ABCDEFGH";
    const pta = i => e.puertas_letra ? letras[i] : (i+1) + "ª";
    const plantas = [];
    if(e.bajos) plantas.push(["B","Bajos"]);
    if(e.entresuelo) plantas.push(["E","Entlo."]);
    for(let p = 1; p <= (e.plantas||0); p++) plantas.push([String(p), p + "º"]);
    if(e.atico) plantas.push(["A","Ático"]);
    for(let s = 0; s < nEsc; s++){
      const es = nEsc > 1 ? "Esc. " + letras[s] + " · " : "";
      plantas.forEach(([k,n]) => { for(let i = 0; i < (e.puertas||1); i++) L.push({clave:`e${s+1}_${k}_${i+1}`, piso: es + n + " " + pta(i), escalera: nEsc > 1 ? letras[s] : ""}); });
    }
    return L;
  }

  async function vecinos(el, id, c, oficina, repintarInfo){
    const e = c.estructura;
    if(!e){
      el.innerHTML = `<h3>Vecinos</h3>` + (oficina
        ? `<p class="vacio">Indica cómo es el edificio y saldrán todos los pisos para apuntar nombre y teléfono.</p><p style="margin-top:8px"><button class="btn" id="btnEstr">Configurar pisos</button></p>`
        : `<p class="vacio">La oficina todavía no ha configurado los pisos de esta comunidad.</p>`);
      if(oficina) el.querySelector("#btnEstr").onclick = () => configurar(el, id, c, oficina, repintarInfo);
      return;
    }
    el.innerHTML = `<h3>Vecinos</h3><p class="vacio">Cargando…</p>`;
    const {db, S} = D();
    let guardados = {};
    try{ const q = await db.collection("dhs_comunidades").doc(id).collection("contactos").get(); q.forEach(d => guardados[d.id] = d.data()); }
    catch(err){ el.innerHTML = `<h3>Vecinos</h3><p class="vacio">No se han podido leer (${esc(err.code)}).</p>`; return; }
    const L = pisos(e), pr = c.presidente || {}, hist = c.historialPresidentes || [];
    const editaVec = S.puede("vecinos","editar");
    const etiquetaPresi = clave => {
      if(pr.clave === clave) return `<span class="tag presi">Presidente${pr.desde ? " desde "+esc(pr.desde) : ""}</span>`;
      const h = hist.filter(x => x.clave === clave).map(x => `<span class="tag gris">Presidente ${esc(x.desde||"?")}–${esc(x.hasta||"?")}</span>`);
      return h.join(" ");
    };
    el.innerHTML = `
      <div class="cab-vecinos"><h3>Vecinos · ${L.length} pisos</h3>
        ${oficina ? `<button class="btn sec" id="btnEstr">Cambiar distribución</button>` : ""}</div>
      <p class="vacio" style="margin-bottom:6px">${oficina ? "Pulsa la ★ para marcar al presidente." : (editaVec ? "Puedes apuntar y corregir nombres y teléfonos. El presidente lo marca la oficina." : "Solo lectura.")}</p>
      <div class="tabla-vecinos">
        ${L.map(p => { const g = guardados[p.clave] || {}; const esP = pr.clave === p.clave; return `
          <div class="veci" data-clave="${p.clave}" data-piso="${esc(p.piso)}">
            <button type="button" class="estrella ${esP?"on":""}" title="Marcar como presidente" ${oficina?"":"disabled"}>★</button>
            <span class="v-piso">${esc(p.piso)}</span>
            <input class="v-nombre" placeholder="Nombre" value="${esc(g.nombre||"")}" ${editaVec?"":"readonly"}>
            <input class="v-tel" type="tel" placeholder="Teléfono" value="${esc(g.telefono||"")}" ${editaVec?"":"readonly"}>
            ${g.telefono ? `<a class="v-llamar" href="tel:${esc(g.telefono.replace(/\s/g,""))}" title="Llamar">📞</a>` : `<span class="v-llamar"></span>`}
            <span class="v-presi">${etiquetaPresi(p.clave)}</span>
          </div>`; }).join("")}
      </div>
      <p style="margin-top:10px">${editaVec ? `<button class="btn" id="btnGuardarVec">Guardar vecinos</button>` : ""} <span id="msgVec" class="vacio"></span></p>`;
    const msg = t => el.querySelector("#msgVec").textContent = t;
    if(oficina) el.querySelector("#btnEstr").onclick = () => configurar(el, id, c, oficina, repintarInfo);
    const firma = () => ({por:S.usuario.email.toLowerCase(), en:firebase.firestore.FieldValue.serverTimestamp()});

    const cambiados = () => [...el.querySelectorAll(".veci")].map(r => ({
      clave:r.dataset.clave, piso:r.dataset.piso, nombre:r.querySelector(".v-nombre").value.trim(), telefono:r.querySelector(".v-tel").value.trim()
    })).filter(v => { const g = guardados[v.clave] || {}; return (g.nombre||"") !== v.nombre || (g.telefono||"") !== v.telefono; });

    const guardarCambios = async () => {
      const lista = cambiados();
      if(!lista.length) return 0;
      const b = db.batch(), ref = db.collection("dhs_comunidades").doc(id).collection("contactos");
      lista.forEach(v => b.set(ref.doc(v.clave), {piso:v.piso, nombre:v.nombre, telefono:v.telefono, modificado:firma()}, {merge:true}));
      await b.commit();
      await db.collection("dhs_registro").add({por:S.usuario.email.toLowerCase(), en:firebase.firestore.FieldValue.serverTimestamp(), accion:"cambio", coleccion:"dhs_comunidades/contactos", docId:id, n:lista.length});
      lista.forEach(v => guardados[v.clave] = {...(guardados[v.clave]||{}), ...v});
      return lista.length;
    };

    if(editaVec) el.querySelector("#btnGuardarVec").onclick = async () => {
      msg("Guardando…");
      try{ const n = await guardarCambios(); msg(n ? "Guardado (" + n + (n===1?" piso)":" pisos)") : "No hay cambios."); vecinos(el, id, c, oficina, repintarInfo); }
      catch(err){ msg("No se ha podido guardar (" + (err.code||err) + ")."); }
    };

    if(oficina) el.querySelectorAll(".estrella").forEach(b => b.onclick = async () => {
      const r = b.closest(".veci"), clave = r.dataset.clave;
      const nombre = r.querySelector(".v-nombre").value.trim(), telefono = r.querySelector(".v-tel").value.trim();
      if(pr.clave === clave) return;
      if(!nombre){ msg("Escribe primero el nombre del vecino de " + r.dataset.piso + "."); return; }
      const anyo = new Date().getFullYear();
      const historial = (c.historialPresidentes || []).slice();
      if(pr.nombre) historial.push({nombre:pr.nombre, piso:pr.piso||"", clave:pr.clave||"", desde:pr.desde||null, hasta:anyo});
      const cambios = {presidente:{nombre, piso:r.dataset.piso, telefono, clave, desde:anyo}, historialPresidentes:historial, modificado:firma()};
      msg("Guardando…");
      try{
        await guardarCambios();
        await db.collection("dhs_comunidades").doc(id).update(cambios);
        await db.collection("dhs_registro").add({por:S.usuario.email.toLowerCase(), en:firebase.firestore.FieldValue.serverTimestamp(), accion:"cambio presidente", coleccion:"dhs_comunidades", docId:id, nuevo:nombre, anterior:pr.nombre||""});
        Object.assign(c, cambios); CACHE.coms[id] = c;
        repintarInfo();
      }catch(err){ msg("No se ha podido guardar (" + (err.code||err) + ")."); }
    });
  }

  function configurar(el, id, c, oficina, repintarInfo){
    const e = c.estructura || {escaleras:1, plantas:4, puertas:2, bajos:true, entresuelo:false, atico:false, puertas_letra:false};
    const num = (n, l, v, min, max) => `<label class="campo"><span>${l}</span><select name="${n}">${Array.from({length:max-min+1},(_,i)=>i+min).map(x=>`<option ${x===v?"selected":""}>${x}</option>`).join("")}</select></label>`;
    const chk = (n, l, v) => `<label class="chk"><input type="checkbox" name="${n}" ${v?"checked":""}> ${l}</label>`;
    el.innerHTML = `
      <form id="fEstr"><h3>Distribución del edificio</h3>
        <div class="rejilla-p" style="max-width:640px">
          ${num("plantas","Plantas (sin contar bajos)",e.plantas,0,20)}
          ${num("puertas","Vecinos por rellano",e.puertas,1,8)}
          ${num("escaleras","Escaleras",e.escaleras,1,6)}
        </div>
        <div class="chks">${chk("bajos","Hay bajos",e.bajos)}${chk("entresuelo","Hay entresuelo",e.entresuelo)}${chk("atico","Hay ático",e.atico)}${chk("puertas_letra","Puertas con letra (A, B…) en vez de 1ª, 2ª",e.puertas_letra)}</div>
        <p class="vacio" id="previa" style="margin:8px 0"></p>
        <p><button class="btn" type="submit">Guardar distribución</button> <button class="btn sec" type="button" id="cancEstr">Cancelar</button> <span id="msgEstr" class="vacio"></span></p>
        ${c.estructura ? `<p class="vacio">Si cambias la distribución, los vecinos ya apuntados se mantienen en los pisos que sigan existiendo.</p>` : ""}
      </form>`;
    const f = el.querySelector("#fEstr");
    const leer = () => { const d = new FormData(f); return {plantas:+d.get("plantas"), puertas:+d.get("puertas"), escaleras:+d.get("escaleras"), bajos:d.has("bajos"), entresuelo:d.has("entresuelo"), atico:d.has("atico"), puertas_letra:d.has("puertas_letra")}; };
    const previa = () => { const L = pisos(leer()); el.querySelector("#previa").textContent = L.length + " pisos: " + L.slice(0,6).map(x=>x.piso).join(", ") + (L.length > 6 ? "…" : ""); };
    f.onchange = previa; previa();
    el.querySelector("#cancEstr").onclick = () => vecinos(el, id, c, oficina, repintarInfo);
    f.onsubmit = async ev => {
      ev.preventDefault();
      const estructura = leer(), {db, S} = D();
      const cambios = {estructura, modificado:{por:S.usuario.email.toLowerCase(), en:firebase.firestore.FieldValue.serverTimestamp()}};
      if(c.vecinos == null) cambios.vecinos = pisos(estructura).length;
      el.querySelector("#msgEstr").textContent = "Guardando…";
      try{
        await db.collection("dhs_comunidades").doc(id).update(cambios);
        await db.collection("dhs_registro").add({por:cambios.modificado.por, en:cambios.modificado.en, accion:"cambio", coleccion:"dhs_comunidades", docId:id, campos:Object.keys(cambios)});
        Object.assign(c, cambios); CACHE.coms[id] = c;
        window.DHS_COM.ficha(document.getElementById("contenido"), id);
      }catch(err){ el.querySelector("#msgEstr").textContent = "No se ha podido guardar (" + (err.code||err) + ")."; }
    };
  }

  // ---------- EDICIÓN ----------
  function editar(el, id, c, oficina){
    const vp = c.videoportero || {}, tv = c.tv || {}, pr = c.presidente || {};
    const ops = Object.entries(CACHE.admins).filter(([k,a]) => a.activo !== false || c.adminId === k).sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre)).map(([k,a])=>`<option value="${k}" ${c.adminId===k?"selected":""}>${esc(a.nombre)}</option>`).join("");
    const inp = (n, l, v, t="text") => `<label class="campo"><span>${l}</span><input name="${n}" type="${t}" value="${esc(v ?? "")}"></label>`;
    const sel3 = (n, l, v) => `<label class="campo"><span>${l}</span><select name="${n}"><option value="" ${v==null?"selected":""}>—</option><option value="si" ${v===true?"selected":""}>Sí</option><option value="no" ${v===false?"selected":""}>No</option></select></label>`;
    el.innerHTML = oficina ? `
      <form id="fEdit" class="form">
        <h3>Editar ficha</h3>
        <div class="rejilla">
          <div class="bloque">${inp("nombre","Nombre",c.nombre)}${inp("direccion","Dirección",c.direccion)}${inp("poblacion","Población",c.poblacion)}${inp("nif","NIF / CIF",c.nif)}
            <label class="campo"><span>Tipo</span><select name="tipo">${Object.entries(TIPOS).map(([k,n]) => `<option value="${k}" ${c.tipo===k?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
            <label class="campo"><span>Administración</span><select name="adminId"><option value="">Sin administración</option>${ops}</select></label>
            ${inp("vecinos","Nº de vecinos",c.vecinos,"number")}${inp("acceso","Acceso (llaves, código…)",c.acceso)}</div>
          <div class="bloque">${inp("vpMarca","Videoportero: marca",vp.marca)}${inp("vpModelo","Videoportero: modelo",vp.modelo)}${inp("vpAno","Año",vp.año,"number")}${inp("vpMon","Monitores",vp.monitores)}
            ${inp("tvAntena","Antena",tv.antena)}${sel3("tvMulti","Multibanda",tv.multibanda)}${sel3("tvPara","Parabólica",tv.parabolica)}</div>
          <div class="bloque">${inp("prNombre","Presidente",pr.nombre)}${inp("prPiso","Piso del presidente",pr.piso)}${inp("prTel","Teléfono del presidente",pr.telefono,"tel")}
            <label class="campo"><span>Notas</span><textarea name="notas" rows="5">${esc(c.notas)}</textarea></label></div>
        </div>
        ${c.nueva ? `<label class="chk" style="margin:6px 0 10px"><input type="checkbox" name="completa"> Ya están todos los datos (quitar ✱ "faltan datos")</label>` : ""}
        <p><button class="btn" type="submit">Guardar</button> <button class="btn sec" type="button" id="cancelar">Cancelar</button> <span id="msgEdit" class="vacio"></span></p>
      </form>` : `
      <form id="fEdit" class="form"><h3>Editar notas</h3>
        <label class="campo"><span>Notas</span><textarea name="notas" rows="6">${esc(c.notas)}</textarea></label>
        <p><button class="btn" type="submit">Guardar</button> <button class="btn sec" type="button" id="cancelar">Cancelar</button> <span id="msgEdit" class="vacio"></span></p>
      </form>`;
    el.querySelector("#cancelar").onclick = () => CONTENIDO.info(el, id, c, oficina);
    el.querySelector("#fEdit").onsubmit = async ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target).entries());
      const {db, S} = D();
      const firma = {por:S.usuario.email.toLowerCase(), en:firebase.firestore.FieldValue.serverTimestamp()};
      const b3 = v => v === "si" ? true : (v === "no" ? false : null);
      const num = v => v === "" || v == null ? null : Number(v);
      const cambios = oficina ? {
        nombre:(f.nombre||"").trim() || c.nombre, direccion:f.direccion.trim(), poblacion:f.poblacion.trim(), adminId:f.adminId || null,
        nif:(f.nif||"").trim().toUpperCase(), tipo:f.tipo || c.tipo || "comunidad", ...(c.nueva ? {nueva: !f.completa} : {}),
        vecinos:num(f.vecinos), acceso:f.acceso.trim(),
        videoportero:{marca:f.vpMarca.trim(), modelo:f.vpModelo.trim(), año:num(f.vpAno), monitores:f.vpMon.trim()},
        tv:{antena:f.tvAntena.trim(), multibanda:b3(f.tvMulti), parabolica:b3(f.tvPara)},
        presidente:Object.assign({}, c.presidente||{}, {nombre:f.prNombre.trim(), piso:f.prPiso.trim(), telefono:f.prTel.trim()}),
        notas:f.notas, modificado:firma
      } : { notas:f.notas, modificado:firma };
      document.getElementById("msgEdit").textContent = "Guardando…";
      try{
        await db.collection("dhs_comunidades").doc(id).update(cambios);
        await db.collection("dhs_registro").add({por:firma.por, en:firma.en, accion:"cambio", coleccion:"dhs_comunidades", docId:id, campos:Object.keys(cambios)});
        Object.assign(c, cambios); CACHE.coms[id] = c;
        window.DHS_COM.ficha(document.getElementById("contenido"), id);
      }catch(e){ document.getElementById("msgEdit").textContent = "No se ha podido guardar ("+(e.code||e)+")."; }
    };
  }

  // ---------- BUSCADOR GLOBAL (barra de arriba) ----------
  function buscadorGlobal(input, caja){
    let sel = -1, res = [];
    const cerrar = () => { caja.classList.add("oculto"); sel = -1; };
    const abrir = id => { cerrar(); input.value = ""; input.blur(); location.hash = "comunidad/" + encodeURIComponent(id); };
    input.oninput = async () => {
      const q = sinAc(input.value.trim());
      if(q.length < 2){ cerrar(); return; }
      try{ await cargar(); }catch(e){ return; }
      res = Object.entries(CACHE.coms).filter(([id,c]) => c.activo !== false &&
        sinAc([c.nombre,c.direccion,c.poblacion,c.nif,nombreAdmin(c.adminId),(c.presidente||{}).nombre].join(" ")).includes(q))
        .sort((a,b) => a[1].nombre.localeCompare(b[1].nombre)).slice(0, 12);
      sel = -1;
      caja.innerHTML = res.length ? res.map(([id,c],i) => `<div class="r-item" data-i="${i}"><b>${esc(c.nombre)}</b><span>${esc([c.direccion,c.poblacion,nombreAdmin(c.adminId)].filter(Boolean).join(" · "))}</span></div>`).join("")
        : `<div class="r-vacio">Sin resultados</div>`;
      caja.classList.remove("oculto");
      caja.querySelectorAll(".r-item").forEach(d => d.onmousedown = e => { e.preventDefault(); abrir(res[d.dataset.i][0]); });
    };
    input.onkeydown = e => {
      const items = caja.querySelectorAll(".r-item");
      if(e.key === "ArrowDown"){ sel = Math.min(sel+1, items.length-1); e.preventDefault(); }
      else if(e.key === "ArrowUp"){ sel = Math.max(sel-1, 0); e.preventDefault(); }
      else if(e.key === "Enter"){ if(res.length) abrir(res[Math.max(sel,0)][0]); return; }
      else if(e.key === "Escape"){ cerrar(); return; }
      items.forEach((d,i) => d.classList.toggle("sel", i === sel));
    };
    input.onblur = () => setTimeout(cerrar, 150);
  }

  window.DHS_COM = { anadir: (id, c) => { if(CACHE.coms) CACHE.coms[id] = c; }, pisos, abrirPestana: k => { pestanaActual = k; }, lista, ficha, buscadorGlobal, recargar: () => cargar(true), datos: async () => { await cargar(); return CACHE; } };
})();
