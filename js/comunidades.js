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
          ${["todas","comunidad","empresa","particular","sinadmin"].map(t => `<button class="chip ${filtro.tipo===t?"on":""}" data-tipo="${t}">${{todas:"Todas",comunidad:"Comunidades",empresa:"Empresas",particular:"Particulares",sinadmin:"Sin administración"}[t]}</button>`).join("")}
          <select id="filtroAdmin" class="sel"><option value="">Todas las administraciones</option>${admins.map(([id,a])=>`<option value="${id}" ${filtro.admin===id?"selected":""}>${esc(a.nombre)}</option>`).join("")}</select>
        </div>
        <div id="cuentaCom" class="vacio"></div>
        <div id="listaCom" class="lista"></div>
      </div>`;
    const pintar = () => {
      const q = sinAc(filtro.texto);
      const filas = Object.entries(CACHE.coms).filter(([id,c]) => {
        if(c.activo === false) return false;
        if(filtro.tipo === "sinadmin" ? !!c.adminId : (filtro.tipo !== "todas" && c.tipo !== filtro.tipo)) return false;
        if(filtro.admin && c.adminId !== filtro.admin) return false;
        if(q && !sinAc([c.nombre,c.direccion,c.poblacion,c.nif,nombreAdmin(c.adminId)].join(" ")).includes(q)) return false;
        return true;
      }).sort((a,b) => a[1].nombre.localeCompare(b[1].nombre));
      document.getElementById("cuentaCom").textContent = filas.length + (filas.length === 1 ? " resultado" : " resultados");
      document.getElementById("listaCom").innerHTML = filas.map(([id,c]) => `
        <a class="fila" href="#comunidad/${encodeURIComponent(id)}">
          <div class="f-nombre">${esc(c.nombre)}</div>
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
    ["info","Info"],["intervenciones","Intervenciones"],["documentos","Documentos"],["economicos","Datos económicos"],["galeria","Galería"]
  ];
  let pestanaActual = "info";

  async function ficha(el, id){
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    try{ await cargar(); }catch(e){ el.innerHTML = `<div class="panel">No se han podido leer los datos (${esc(e.code)}).</div>`; return; }
    const c = CACHE.coms[id];
    if(!c){ el.innerHTML = `<div class="panel">No existe esta comunidad. <a href="#comunidades">Volver</a></div>`; return; }
    const oficina = D().S.rol === "oficina";
    el.innerHTML = `
      <a href="#comunidades" class="volver">‹ Comunidades</a>
      <div class="panel cab-ficha">
        <div class="ico-ficha">${c.tipo==="particular"?"🏠":(c.tipo==="empresa"?"🏭":"🏢")}</div>
        <div class="cab-txt">
          <h1>${esc(c.nombre)}</h1>
          <div class="vacio">${c.adminId ? "Administración: <b>"+(oficina ? '<a href="#administrador/'+encodeURIComponent(c.adminId)+'">'+esc(nombreAdmin(c.adminId))+'</a>' : esc(nombreAdmin(c.adminId)))+"</b>" : (c.tipo==="comunidad" ? '<span class="tag aviso">Sin administración</span>' : esc(TIPOS[c.tipo]))}${c.nif ? " · NIF "+esc(c.nif) : ""}</div>
        </div>
        <div class="cifras">
          <div class="cifra"><b>${c.vecinos ?? "—"}</b><span>vecinos</span></div>
          <div class="cifra"><b>0</b><span>intervenciones</span></div>
          <div class="cifra"><b>${c.camaras && c.camaras.tiene ? (c.camaras.numero ?? "Sí") : "No"}</b><span>cámaras</span></div>
        </div>
      </div>
      <div class="pestanas">${PESTANAS.map(([k,n]) => `<button class="pest ${k===pestanaActual?"on":""}" data-k="${k}">${n}</button>`).join("")}</div>
      <div id="cuerpoFicha" class="panel cuerpo-ficha"></div>`;
    const pintar = () => (CONTENIDO[pestanaActual])(document.getElementById("cuerpoFicha"), id, c, oficina);
    el.querySelectorAll(".pest").forEach(b => b.onclick = () => { pestanaActual = b.dataset.k; el.querySelectorAll(".pest").forEach(x=>x.classList.toggle("on",x===b)); pintar(); });
    pintar();
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
          <div class="bloque"><h3>Contacto</h3>
            ${fila("Presidente", esc([pr.nombre, pr.piso].filter(Boolean).join(" · ")))}
            ${fila("Teléfono", pr.telefono ? `<a href="tel:${esc(pr.telefono)}">${esc(pr.telefono)}</a>` : "")}
            <p class="vacio" style="margin-top:8px">Los contactos de vecinos por piso llegan en la sesión 14.</p>
          </div>
          <div class="bloque"><h3>Notas</h3><p style="white-space:pre-wrap">${esc(c.notas) || '<span class="vacio">Sin notas.</span>'}</p></div>
        </div>
        <p style="margin-top:14px"><button class="btn" id="btnEditar">${oficina ? "Editar ficha" : "Editar notas"}</button></p>`;
      el.querySelector("#btnEditar").onclick = () => editar(el, id, c, oficina);
    },
    intervenciones: el => el.innerHTML = `<h3>Intervenciones</h3><p class="vacio">Aquí saldrán las reparaciones e instalaciones hechas en esta comunidad, con fecha y técnico (fase 3).</p>`,
    documentos:     el => el.innerHTML = `<h3>Documentos</h3><p class="vacio">Aquí se guardarán los presupuestos en PDF, actas y contratos (fase 6).</p>`,
    economicos:     el => el.innerHTML = `<h3>Datos económicos</h3><p class="vacio">Aquí saldrán los presupuestos enviados, aceptados y rechazados, las facturas y lo pendiente de cobro (fases 6 y 7).</p>`,
    galeria:        el => el.innerHTML = `<h3>Galería</h3><p class="vacio">Aquí se subirán las fotos de la comunidad: placa, cuarto de antenas, grabador… (fase 3).</p>`
  };

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
          <div class="bloque">${inp("nombre","Nombre",c.nombre)}${inp("direccion","Dirección",c.direccion)}${inp("poblacion","Población",c.poblacion)}
            <label class="campo"><span>Administración</span><select name="adminId"><option value="">Sin administración</option>${ops}</select></label>
            ${inp("vecinos","Nº de vecinos",c.vecinos,"number")}${inp("acceso","Acceso (llaves, código…)",c.acceso)}</div>
          <div class="bloque">${inp("vpMarca","Videoportero: marca",vp.marca)}${inp("vpModelo","Videoportero: modelo",vp.modelo)}${inp("vpAno","Año",vp.año,"number")}${inp("vpMon","Monitores",vp.monitores)}
            ${inp("tvAntena","Antena",tv.antena)}${sel3("tvMulti","Multibanda",tv.multibanda)}${sel3("tvPara","Parabólica",tv.parabolica)}</div>
          <div class="bloque">${inp("prNombre","Presidente",pr.nombre)}${inp("prPiso","Piso del presidente",pr.piso)}${inp("prTel","Teléfono del presidente",pr.telefono,"tel")}
            <label class="campo"><span>Notas</span><textarea name="notas" rows="5">${esc(c.notas)}</textarea></label></div>
        </div>
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
        vecinos:num(f.vecinos), acceso:f.acceso.trim(),
        videoportero:{marca:f.vpMarca.trim(), modelo:f.vpModelo.trim(), año:num(f.vpAno), monitores:f.vpMon.trim()},
        tv:{antena:f.tvAntena.trim(), multibanda:b3(f.tvMulti), parabolica:b3(f.tvPara)},
        presidente:{nombre:f.prNombre.trim(), piso:f.prPiso.trim(), telefono:f.prTel.trim()},
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

  window.DHS_COM = { lista, ficha, buscadorGlobal, recargar: () => cargar(true), datos: async () => { await cargar(); return CACHE; } };
})();
