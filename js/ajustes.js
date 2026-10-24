// DHS App — Ajustes: Equipo (personal y accesos), Perfiles de permisos y Registro de cambios.
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sinAc = s => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const D = () => window.DHS;
  const COLORES = [["#2f6fd6","Azul"],["#e8891c","Naranja"],["#2f9e5b","Verde"],["#8a5cc7","Morado"],["#d63384","Rosa"],["#0d9488","Turquesa"],["#a16207","Marrón"],["#64748b","Gris"]];
  const TIPOS = {direccion:"Dirección", plantilla:"Plantilla", subcontrata:"Subcontrata (electricista…)", otros:"Otros"};
  const NOMBRE_NIVEL = {no:"No ve", propios:"Solo los suyos", ver:"Ve", editar:"Ve y edita", todo:"Todo"};
  const AYUDA_NIVEL = {trabajos:{propios:"solo los que tenga asignados, y los rellena", editar:"crea trabajos y rellena su parte", todo:"cambia cualquier dato y borra"}, vecinos:{editar:"también las notas de la ficha"}, precios:{ver:"se aplicará en presupuestos y facturas"}, cobros:{ver:"llegará en la fase de cobros"}};
  let pest = "equipo";
  const FIJOS = ["herrerazarzoso@gmail.com","dhsvideoporters@gmail.com"];

  async function leerPerfiles(){
    const q = await D().db.collection("dhs_perfiles").get();
    const P = {}; q.forEach(d => P[d.id] = d.data()); return P;
  }

  function vista(el){
    const tabs = [["equipo","Equipo"],["perfiles","Perfiles y permisos"],["registro","Registro de cambios"]];
    el.innerHTML = `
      <div class="pestanas">${tabs.map(([k,n]) => `<button class="pest ${k===pest?"on":""}" data-k="${k}">${n}</button>`).join("")}</div>
      <div id="cuerpoAj" class="panel cuerpo-ficha"></div>`;
    const pintar = () => ({equipo, perfiles, registro})[pest](el.querySelector("#cuerpoAj"));
    el.querySelectorAll(".pest").forEach(b => b.onclick = () => { pest = b.dataset.k; el.querySelectorAll(".pest").forEach(x => x.classList.toggle("on", x===b)); pintar(); });
    pintar();
  }

  // ---------- EQUIPO ----------
  async function equipo(el){
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    const {db, S} = D();
    let personal = [], usuarios = {}, P = {};
    try{
      const [p, u, pf] = await Promise.all([db.collection("dhs_personal").get(), db.collection("dhs_usuarios").get(), leerPerfiles()]);
      p.forEach(d => personal.push({id:d.id, ...d.data()}));
      u.forEach(d => usuarios[d.id] = d.data());
      P = pf;
    }catch(e){ el.innerHTML = `<p class="vacio">No se han podido leer los datos (${esc(e.code)}).</p>`; return; }
    personal.sort((a,b) => (a.activo===false) - (b.activo===false) || a.nombre.localeCompare(b.nombre));
    const edita = S.puede("ajustes","editar");
    const acceso = p => {
      const u = p.email && usuarios[p.email];
      if(!u || u.activo === false) return "";
      const id = u.perfil || ({admin:"oficina", tecnico:"tecnico", direccion:"direccion"}[u.rol] || "");
      return id === "direccion" ? "Dirección" : (P[id] ? P[id].nombre : "");
    };
    el.innerHTML = `
      <div class="cab-vecinos"><h3>Equipo · quién hace los trabajos</h3>${edita ? `<button class="btn" id="btnNuevoP">+ Añadir persona</button>` : ""}</div>
      <p class="vacio" style="margin-bottom:8px">Cada persona es una columna del calendario, con su color. Solo entran en la app quienes tengan cuenta de Google y un perfil de acceso.</p>
      <div class="lista">
        <div class="fila-eq"><b>Ángel</b><span class="vacio">herrerazarzoso@gmail.com</span><span class="tag">Dirección · fijo</span></div>
        <div class="fila-eq"><b>Joel</b><span class="vacio">dhsvideoporters@gmail.com</span><span class="tag">Dirección · fijo</span></div>
        ${personal.map(p => `
          <a class="fila-eq ${p.activo===false?"baja":""}" href="javascript:void 0" data-id="${p.id}">
            <b><span class="punto" style="background:${esc(p.color)}"></span>${esc(p.nombre)}</b>
            <span class="vacio">${esc(TIPOS[p.tipo]||"")}${p.email ? " · " + esc(p.email) : ""}</span>
            <span>${p.activo===false ? `<span class="tag gris">De baja</span>` : (acceso(p) ? `<span class="tag azul">${esc(acceso(p))}</span>` : `<span class="tag gris">Sin acceso</span>`)}</span>
          </a>`).join("") || `<p class="vacio" style="padding:10px 0">Todavía no hay nadie. Añade a Pedro, Alberto y los electricistas.</p>`}
      </div>`;
    if(!edita) return;
    el.querySelector("#btnNuevoP").onclick = () => editarP(el, null, {nombre:"", tipo:"plantilla", color:COLORES[0][0], email:"", activo:true}, "", P);
    el.querySelectorAll(".fila-eq[data-id]").forEach(a => a.onclick = () => {
      const p = personal.find(x => x.id === a.dataset.id), u = p.email && usuarios[p.email];
      const perfilActual = u && u.activo !== false ? (u.perfil || ({admin:"oficina", tecnico:"tecnico", direccion:"direccion"}[u.rol] || "")) : "";
      editarP(el, p.id, p, perfilActual, P);
    });
  }

  function editarP(el, id, p, perfilActual, P){
    const {S} = D();
    const opciones = [["","Sin acceso a la app"], ...Object.entries(P).sort((a,b) => a[1].nombre.localeCompare(b[1].nombre)).map(([k,v]) => [k, v.nombre]),
                      ...(S.direccion || perfilActual === "direccion" ? [["direccion","Dirección (todo)"]] : [])];
    el.innerHTML = `
      <form id="fP" class="form" style="max-width:520px">
        <h3>${id ? "Editar " + esc(p.nombre) : "Añadir persona"}</h3>
        <label class="campo"><span>Nombre *</span><input name="nombre" value="${esc(p.nombre)}" placeholder="Pedro"></label>
        <label class="campo"><span>Tipo</span><select name="tipo">${Object.entries(TIPOS).map(([k,n]) => `<option value="${k}" ${p.tipo===k?"selected":""}>${n}</option>`).join("")}</select></label>
        <div class="campo"><span>Color en el calendario</span><div class="colores">${COLORES.map(([c,n]) => `<label title="${n}"><input type="radio" name="color" value="${c}" ${p.color===c?"checked":""}><i style="background:${c}"></i></label>`).join("")}</div></div>
        <label class="campo"><span>Cuenta de Google (para entrar en la app)</span><input name="email" type="email" value="${esc(p.email)}" placeholder="pedro.dhs@gmail.com"></label>
        <label class="campo"><span>Perfil de acceso</span><select name="perfil">${opciones.map(([k,n]) => `<option value="${k}" ${perfilActual===k?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
        <p class="vacio" style="margin-bottom:8px">Lo que puede ver y editar cada perfil se cambia en la pestaña <b>Perfiles y permisos</b>.</p>
        <p><button class="btn" type="submit">Guardar</button> <button class="btn sec" type="button" id="cancP">Cancelar</button>
          ${id ? `<button class="btn sec" type="button" id="bajaP" style="float:right">${p.activo===false ? "Volver a dar de alta" : "Dar de baja"}</button>` : ""}
          <span id="msgP" class="vacio"></span></p>
      </form>`;
    const msg = t => el.querySelector("#msgP").textContent = t;
    el.querySelector("#cancP").onclick = () => equipo(el);

    const guardar = async (datos, perfil, accion) => {
      const {db, S} = D(), yo = S.usuario.email.toLowerCase();
      const firma = {por:yo, en:firebase.firestore.FieldValue.serverTimestamp()};
      const email = (datos.email || "").toLowerCase();
      if(FIJOS.includes(email)){ msg("Esa cuenta ya es de Dirección fija."); return; }
      msg("Guardando…");
      try{
        const b = db.batch();
        const ref = id ? db.collection("dhs_personal").doc(id) : db.collection("dhs_personal").doc();
        b.set(ref, {...datos, email, modificado:firma, ...(id ? {} : {creado:firma})}, {merge:true});
        if(p.email && p.email !== email) b.set(db.collection("dhs_usuarios").doc(p.email), {activo:false, modificado:firma}, {merge:true});
        if(email){
          // "rol" se mantiene por compatibilidad con la app de cámaras: admin = oficina/dirección, tecnico = resto.
          const pm = (P[perfil] && P[perfil].permisos) || {};
          const rol = perfil === "direccion" ? "direccion" : (pm.ajustes === "editar" ? "admin" : (["ver","editar"].includes(pm.comunidades) ? "tecnico" : "ninguno"));
          b.set(db.collection("dhs_usuarios").doc(email), {nombre:datos.nombre, perfil:perfil || "", rol, personalId:ref.id, activo: !!perfil && datos.activo !== false, modificado:firma}, {merge:true});
        }
        await b.commit();
        await db.collection("dhs_registro").add({por:yo, en:firma.en, accion, coleccion:"dhs_personal", docId:ref.id, nombre:datos.nombre, acceso: perfil ? (perfil === "direccion" ? "Dirección" : (P[perfil]||{}).nombre) : "sin acceso"});
        equipo(el);
      }catch(e){ msg("No se ha podido guardar (" + (e.code||e) + ")."); }
    };

    el.querySelector("#fP").onsubmit = ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target).entries());
      const nombre = (f.nombre||"").trim();
      if(!nombre) return msg("Pon el nombre.");
      const email = (f.email||"").trim();
      if(email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return msg("Revisa el correo.");
      if(f.perfil && !email) return msg("Para dar acceso hace falta su cuenta de Google.");
      if(f.perfil === "direccion" && !D().S.direccion) return msg("Solo Dirección puede dar el perfil de Dirección.");
      if(f.perfil && f.tipo === "subcontrata" && !confirm("Las subcontratas normalmente no entran en la app. ¿Seguro que quieres darle acceso?")) return;
      guardar({nombre, tipo:f.tipo, color:f.color || COLORES[0][0], email, activo: p.activo !== false}, f.perfil, id ? "cambio" : "alta");
    };
    if(id) el.querySelector("#bajaP").onclick = () => {
      const alta = p.activo === false;
      if(!alta && !confirm("¿Dar de baja a " + p.nombre + "? Deja de salir en el calendario y, si tenía acceso, ya no podrá entrar. No se borra nada.")) return;
      guardar({nombre:p.nombre, tipo:p.tipo, color:p.color, email:p.email||"", activo:alta}, alta ? perfilActual : "", alta ? "alta" : "baja");
    };
  }

  // ---------- PERFILES Y PERMISOS ----------
  async function perfiles(el){
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    const {S, APARTADOS} = D();
    let P;
    try{ P = await leerPerfiles(); }catch(e){ el.innerHTML = `<p class="vacio">No se han podido leer los perfiles (${esc(e.code)}).</p>`; return; }
    const ids = Object.keys(P).sort((a,b) => (P[b].base?1:0) - (P[a].base?1:0) || P[a].nombre.localeCompare(P[b].nombre));
    const edita = S.direccion;
    el.innerHTML = `
      <div class="cab-vecinos"><h3>Perfiles y permisos</h3>${edita ? `<button class="btn" id="btnNuevoPf">+ Nuevo perfil</button>` : ""}</div>
      <p class="vacio" style="margin-bottom:10px">${edita ? "Elige qué puede ver y editar cada perfil. Los cambios se aplican la próxima vez que esa persona entre." : "Solo Dirección puede cambiar los perfiles."} Dirección lo puede todo siempre.</p>
      <div class="tabla-perm">
        <table>
          <thead><tr><th>Apartado</th>${ids.map(id => `<th>${esc(P[id].nombre)}${edita && !P[id].base ? ` <button class="mini" data-borrar="${id}" title="Eliminar perfil">✕</button>` : ""}</th>`).join("")}</tr></thead>
          <tbody>${APARTADOS.map(([ap, nombre, niveles]) => `
            <tr><td><b>${esc(nombre)}</b></td>${ids.map(id => {
              const v = (P[id].permisos||{})[ap] || "no";
              return `<td><select data-pf="${id}" data-ap="${ap}" class="nivel n-${v}" ${edita?"":"disabled"}>${niveles.map(n => `<option value="${n}" ${v===n?"selected":""}>${NOMBRE_NIVEL[n]}${AYUDA_NIVEL[ap]&&AYUDA_NIVEL[ap][n] ? " ("+AYUDA_NIVEL[ap][n]+")" : ""}</option>`).join("")}</select></td>`;
            }).join("")}</tr>`).join("")}
          </tbody>
        </table>
      </div>
      ${edita ? `<p style="margin-top:12px"><button class="btn" id="btnGuardarPf">Guardar permisos</button> <span id="msgPf" class="vacio"></span></p>` : ""}`;
    if(!edita) return;
    const msg = t => el.querySelector("#msgPf").textContent = t;
    el.querySelectorAll("select.nivel").forEach(s => s.onchange = () => s.className = "nivel n-" + s.value);
    el.querySelector("#btnGuardarPf").onclick = async () => {
      const {db} = D(), yo = S.usuario.email.toLowerCase();
      const nuevos = {}; ids.forEach(id => nuevos[id] = {...(P[id].permisos||{})});
      el.querySelectorAll("select.nivel").forEach(s => nuevos[s.dataset.pf][s.dataset.ap] = s.value);
      const cambiados = ids.filter(id => JSON.stringify(nuevos[id]) !== JSON.stringify(P[id].permisos||{}));
      if(!cambiados.length) return msg("No hay cambios.");
      msg("Guardando…");
      try{
        const b = db.batch();
        cambiados.forEach(id => b.set(db.collection("dhs_perfiles").doc(id), {permisos:nuevos[id], modificado:{por:yo, en:firebase.firestore.FieldValue.serverTimestamp()}}, {merge:true}));
        await b.commit();
        await db.collection("dhs_registro").add({por:yo, en:firebase.firestore.FieldValue.serverTimestamp(), accion:"cambio permisos", coleccion:"dhs_perfiles", nombre:cambiados.map(id => P[id].nombre).join(", ")});
        perfiles(el);
      }catch(e){ msg("No se ha podido guardar (" + (e.code||e) + ")."); }
    };
    el.querySelector("#btnNuevoPf").onclick = async () => {
      const nombre = (prompt("Nombre del perfil nuevo (por ejemplo: Técnico con cobros, Administrativa):") || "").trim();
      if(!nombre) return;
      const id = sinAc(nombre).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40) || "perfil";
      if(P[id] || id === "direccion") return msg("Ya existe un perfil con ese nombre.");
      const base = (prompt("¿Copiar los permisos de qué perfil? Escribe: " + ids.map(i => P[i].nombre).join(" / "), P.tecnico ? P.tecnico.nombre : "") || "").trim();
      const desde = ids.find(i => sinAc(P[i].nombre) === sinAc(base));
      try{
        await D().db.collection("dhs_perfiles").doc(id).set({nombre, base:false, permisos:{...((desde && P[desde].permisos) || {})}, modificado:{por:S.usuario.email.toLowerCase(), en:firebase.firestore.FieldValue.serverTimestamp()}});
        perfiles(el);
      }catch(e){ msg("No se ha podido crear (" + (e.code||e) + ")."); }
    };
    el.querySelectorAll("[data-borrar]").forEach(b => b.onclick = async () => {
      const id = b.dataset.borrar;
      const enUso = (await D().db.collection("dhs_usuarios").where("perfil","==",id).get()).docs.filter(d => d.data().activo !== false).length;
      if(enUso) return msg("No se puede eliminar: lo usan " + enUso + (enUso===1?" persona.":" personas.") + " Cámbiales antes el perfil.");
      if(!confirm("¿Eliminar el perfil " + P[id].nombre + "?")) return;
      try{ await D().db.collection("dhs_perfiles").doc(id).delete(); perfiles(el); }catch(e){ msg("No se ha podido eliminar (" + (e.code||e) + ")."); }
    });
  }

  // ---------- REGISTRO ----------
  async function registro(el){
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    const {db} = D();
    try{
      const q = await db.collection("dhs_registro").orderBy("en", "desc").limit(150).get();
      const fmt = t => t && t.toDate ? t.toDate().toLocaleString("es-ES", {day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit"}) : "";
      const quien = e => e === "herrerazarzoso@gmail.com" ? "Ángel" : (e === "dhsvideoporters@gmail.com" ? "Joel" : e);
      const QUE = {"dhs_comunidades":"Comunidad", "dhs_comunidades/contactos":"Vecinos", "dhs_admins":"Administración", "dhs_personal":"Equipo", "dhs_perfiles":"Perfiles"};
      el.innerHTML = `<h3>Registro de cambios · últimos ${q.size}</h3>
        <p class="vacio" style="margin-bottom:8px">Quién ha cambiado qué y cuándo. No se puede modificar ni borrar.</p>
        <div class="lista">${q.docs.map(d => { const r = d.data(); return `
          <div class="fila-reg"><span class="vacio">${fmt(r.en)}</span><b>${esc(quien(r.por))}</b>
            <span>${esc(r.accion||"")} · ${esc(QUE[r.coleccion] || r.coleccion || "")} ${esc(r.nombre || r.nuevo || r.docId || "")}${r.n ? " (" + esc(r.n) + ")" : ""}</span></div>`; }).join("") || `<p class="vacio">Sin cambios todavía.</p>`}</div>`;
    }catch(e){ el.innerHTML = `<p class="vacio">No se ha podido leer el registro (${esc(e.code)}).</p>`; }
  }

  window.DHS_AJ = { vista };
})();
