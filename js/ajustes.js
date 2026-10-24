// DHS App — Ajustes (solo oficina): Equipo (personal + accesos) y Registro de cambios.
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  const COLORES = [["#2f6fd6","Azul"],["#e8891c","Naranja"],["#2f9e5b","Verde"],["#8a5cc7","Morado"],["#d63384","Rosa"],["#0d9488","Turquesa"],["#a16207","Marrón"],["#64748b","Gris"]];
  const TIPOS = {plantilla:"Plantilla", subcontrata:"Subcontrata (electricista…)", otros:"Otros"};
  const ROLES = {"":"Sin acceso a la app", tecnico:"Técnico", admin:"Oficina"};
  let pest = "equipo";

  function vista(el){
    el.innerHTML = `
      <div class="pestanas">${[["equipo","Equipo"],["registro","Registro de cambios"]].map(([k,n]) => `<button class="pest ${k===pest?"on":""}" data-k="${k}">${n}</button>`).join("")}</div>
      <div id="cuerpoAj" class="panel cuerpo-ficha"></div>`;
    const pintar = () => (pest === "equipo" ? equipo : registro)(el.querySelector("#cuerpoAj"));
    el.querySelectorAll(".pest").forEach(b => b.onclick = () => { pest = b.dataset.k; el.querySelectorAll(".pest").forEach(x => x.classList.toggle("on", x===b)); pintar(); });
    pintar();
  }

  // ---------- EQUIPO ----------
  async function equipo(el){
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    const {db} = D();
    let personal = [], usuarios = {};
    try{
      const [p, u] = await Promise.all([db.collection("dhs_personal").get(), db.collection("dhs_usuarios").get()]);
      p.forEach(d => personal.push({id:d.id, ...d.data()}));
      u.forEach(d => usuarios[d.id] = d.data());
    }catch(e){ el.innerHTML = `<p class="vacio">No se han podido leer los datos (${esc(e.code)}).</p>`; return; }
    personal.sort((a,b) => (a.activo===false) - (b.activo===false) || a.nombre.localeCompare(b.nombre));
    const acceso = p => { const u = p.email && usuarios[p.email]; return u && u.activo !== false ? ROLES[u.rol] || "" : ""; };
    el.innerHTML = `
      <div class="cab-vecinos"><h3>Equipo · quién hace los trabajos</h3><button class="btn" id="btnNuevoP">+ Añadir persona</button></div>
      <p class="vacio" style="margin-bottom:8px">Cada persona es una columna del calendario, con su color. Solo entran en la app quienes tengan cuenta de Google y acceso (las subcontratas no).</p>
      <div class="lista">
        <div class="fila-eq"><b>Ángel</b><span class="vacio">herrerazarzoso@gmail.com</span><span class="tag">Oficina · fijo</span></div>
        <div class="fila-eq"><b>Joel</b><span class="vacio">dhsvideoporters@gmail.com</span><span class="tag">Oficina · fijo</span></div>
        ${personal.map(p => `
          <a class="fila-eq ${p.activo===false?"baja":""}" href="javascript:void 0" data-id="${p.id}">
            <b><span class="punto" style="background:${esc(p.color)}"></span>${esc(p.nombre)}</b>
            <span class="vacio">${esc(TIPOS[p.tipo]||"")}${p.email ? " · " + esc(p.email) : ""}</span>
            <span>${p.activo===false ? `<span class="tag gris">De baja</span>` : (acceso(p) ? `<span class="tag azul">${esc(acceso(p))}</span>` : `<span class="tag gris">Sin acceso</span>`)}</span>
          </a>`).join("") || `<p class="vacio" style="padding:10px 0">Todavía no hay nadie. Añade a Pedro, Alberto y los electricistas.</p>`}
      </div>`;
    el.querySelector("#btnNuevoP").onclick = () => editarP(el, null, {nombre:"", tipo:"plantilla", color:COLORES[0][0], email:"", activo:true}, "");
    el.querySelectorAll(".fila-eq[data-id]").forEach(a => a.onclick = () => {
      const p = personal.find(x => x.id === a.dataset.id), u = p.email && usuarios[p.email];
      editarP(el, p.id, p, u && u.activo !== false ? u.rol : "");
    });
  }

  function editarP(el, id, p, rolActual){
    el.innerHTML = `
      <form id="fP" class="form" style="max-width:520px">
        <h3>${id ? "Editar " + esc(p.nombre) : "Añadir persona"}</h3>
        <label class="campo"><span>Nombre *</span><input name="nombre" value="${esc(p.nombre)}" placeholder="Pedro"></label>
        <label class="campo"><span>Tipo</span><select name="tipo">${Object.entries(TIPOS).map(([k,n]) => `<option value="${k}" ${p.tipo===k?"selected":""}>${n}</option>`).join("")}</select></label>
        <div class="campo"><span>Color en el calendario</span><div class="colores">${COLORES.map(([c,n]) => `<label title="${n}"><input type="radio" name="color" value="${c}" ${p.color===c?"checked":""}><i style="background:${c}"></i></label>`).join("")}</div></div>
        <label class="campo"><span>Cuenta de Google (para entrar en la app)</span><input name="email" type="email" value="${esc(p.email)}" placeholder="pedro.dhs@gmail.com"></label>
        <label class="campo"><span>Acceso a la app</span><select name="rol">${Object.entries(ROLES).map(([k,n]) => `<option value="${k}" ${rolActual===k?"selected":""}>${n}</option>`).join("")}</select></label>
        <p class="vacio" style="margin-bottom:8px">Técnico: ve todo, crea trabajos y rellena los suyos; no borra ni ve Administradores. Oficina: todo, salvo editar Administradores (solo Ángel y Joel).</p>
        <p><button class="btn" type="submit">Guardar</button> <button class="btn sec" type="button" id="cancP">Cancelar</button>
          ${id ? `<button class="btn sec" type="button" id="bajaP" style="float:right">${p.activo===false ? "Volver a dar de alta" : "Dar de baja"}</button>` : ""}
          <span id="msgP" class="vacio"></span></p>
      </form>`;
    const msg = t => el.querySelector("#msgP").textContent = t;
    el.querySelector("#cancP").onclick = () => equipo(el);

    const guardar = async (datos, rol, accion) => {
      const {db, S} = D(), yo = S.usuario.email.toLowerCase();
      const firma = {por:yo, en:firebase.firestore.FieldValue.serverTimestamp()};
      const email = (datos.email || "").toLowerCase();
      if(["herrerazarzoso@gmail.com","dhsvideoporters@gmail.com"].includes(email)){ msg("Esa cuenta ya es de oficina fija."); return; }
      msg("Guardando…");
      try{
        const b = db.batch();
        const ref = id ? db.collection("dhs_personal").doc(id) : db.collection("dhs_personal").doc();
        b.set(ref, {...datos, email, modificado:firma, ...(id ? {} : {creado:firma})}, {merge:true});
        // Acceso: ficha en dhs_usuarios (id = correo). Si se cambia el correo, se desactiva el anterior.
        if(p.email && p.email !== email) b.set(db.collection("dhs_usuarios").doc(p.email), {activo:false, modificado:firma}, {merge:true});
        if(email) b.set(db.collection("dhs_usuarios").doc(email), {nombre:datos.nombre, rol:rol || "ninguno", personalId:ref.id, activo: !!rol && datos.activo !== false, modificado:firma}, {merge:true});
        await b.commit();
        await db.collection("dhs_registro").add({por:yo, en:firma.en, accion, coleccion:"dhs_personal", docId:ref.id, nombre:datos.nombre, acceso:rol||"sin acceso"});
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
      if(f.rol && !email) return msg("Para dar acceso hace falta su cuenta de Google.");
      if(f.rol && f.tipo === "subcontrata" && !confirm("Las subcontratas normalmente no entran en la app. ¿Seguro que quieres darle acceso?")) return;
      guardar({nombre, tipo:f.tipo, color:f.color || COLORES[0][0], email, activo: p.activo !== false}, f.rol, id ? "cambio" : "alta");
    };
    if(id) el.querySelector("#bajaP").onclick = () => {
      const alta = p.activo === false;
      if(!alta && !confirm("¿Dar de baja a " + p.nombre + "? Deja de salir en el calendario y, si tenía acceso, ya no podrá entrar. No se borra nada.")) return;
      guardar({nombre:p.nombre, tipo:p.tipo, color:p.color, email:p.email||"", activo:alta}, alta ? rolActual : "", alta ? "alta" : "baja");
    };
  }

  // ---------- REGISTRO ----------
  async function registro(el){
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    const {db} = D();
    try{
      const q = await db.collection("dhs_registro").orderBy("en", "desc").limit(150).get();
      const fmt = t => t && t.toDate ? t.toDate().toLocaleString("es-ES", {day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit"}) : "";
      const quien = e => e === "herrerazarzoso@gmail.com" ? "Ángel" : (e === "dhsvideoporters@gmail.com" ? "Joel" : e);
      const QUE = {"dhs_comunidades":"Comunidad", "dhs_comunidades/contactos":"Vecinos", "dhs_admins":"Administración", "dhs_personal":"Equipo"};
      el.innerHTML = `<h3>Registro de cambios · últimos ${q.size}</h3>
        <p class="vacio" style="margin-bottom:8px">Quién ha cambiado qué y cuándo. No se puede modificar ni borrar.</p>
        <div class="lista">${q.docs.map(d => { const r = d.data(); return `
          <div class="fila-reg"><span class="vacio">${fmt(r.en)}</span><b>${esc(quien(r.por))}</b>
            <span>${esc(r.accion||"")} · ${esc(QUE[r.coleccion] || r.coleccion || "")} ${esc(r.nombre || r.nuevo || r.docId || "")}${r.n ? " (" + esc(r.n) + ")" : ""}</span></div>`; }).join("") || `<p class="vacio">Sin cambios todavía.</p>`}</div>`;
    }catch(e){ el.innerHTML = `<p class="vacio">No se ha podido leer el registro (${esc(e.code)}).</p>`; }
  }

  window.DHS_AJ = { vista };
})();
