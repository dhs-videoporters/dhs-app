// DHS App — Catálogo y presupuestos (fase 6). Todo se hace en la app y se copia solo en Contasimple
// a través del "puente" (Apps Script "Programa DHS"), que comprueba quién lo pide; la clave de Contasimple nunca llega aquí.
// - Numeración siempre correlativa de Contasimple (P-AAAA-####); la comunidad va como CLIENTE, no en el número.
// - Siempre IVA 21 %. Cambiar precios, descuentos y líneas libres: solo quien tenga "Precios: editar" (Dirección).
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sinAc = s => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const D = () => window.DHS;
  const eur = n => (Number(n)||0).toLocaleString("es-ES", {style:"currency", currency:"EUR"});
  const IVA = 21;
  const GRUPOS = ["Instalación","Mantenimiento","Cámaras","Otros"];
  const ESTADOS = {pendiente:["⏳","Pendiente"], enviado:["📨","Enviado"], aceptado:["✅","Aceptado"], rechazado:["✖️","Rechazado"], facturado:["🧾","Facturado"], parcial:["🧾","Facturado en parte"]};
  const r2 = x => Math.round(x * 100) / 100;
  // Quién hizo cada presupuesto: nombre de la persona según su cuenta (se guarda al crearlo; para los antiguos, se busca por el correo)
  const FIJOS = {"herrerazarzoso@gmail.com":"Ángel", "dhsvideoporters@gmail.com":"Joel"};
  let QUIEN = null;
  async function cargarQuien(){
    if(QUIEN) return QUIEN; QUIEN = {...FIJOS};
    try{ (await D().db.collection("dhs_personal").get()).forEach(d => { const x = d.data(); if(x.email) QUIEN[String(x.email).toLowerCase()] = (x.nombre || "").split(" ")[0] || x.email; }); }catch(e){}
    return QUIEN;
  }
  const quien = c => !c ? "" : (c.nombre || (QUIEN && QUIEN[String(c.por||"").toLowerCase()]) || FIJOS[String(c.por||"").toLowerCase()] || String(c.por||"").split("@")[0]);

  // ---------- Puente con Contasimple ----------
  async function llamar(accion, datos){
    const url = (window.DHS_CONFIG || {}).puenteUrl;
    if(!url) throw new Error("Falta conectar el puente con Contasimple (puenteUrl).");
    const idToken = await D().auth.currentUser.getIdToken();
    const r = await fetch(url, {method:"POST", body:JSON.stringify({idToken, accion, datos, entorno:(window.DHS_CONFIG||{}).entorno || "pruebas"})});   // texto plano: sin "preflight"
    const j = await r.json().catch(() => ({ok:false, error:"Respuesta no válida del puente (" + r.status + ")"}));
    if(!j.ok) throw new Error(j.error || "Error del puente");
    return j.datos;
  }
  const puedePrecios = () => D().S.puede("precios","editar");
  const puedeVerPres = () => D().S.puede("precios","editar") || D().S.puede("cobros","ver");

  // ---------- Catálogo ----------
  let CAT = null;
  async function catalogo(forzar){
    if(!CAT || forzar){ CAT = {}; (await D().db.collection("dhs_catalogo").get()).forEach(d => CAT[d.id] = d.data()); }
    return CAT;
  }

  async function vistaCatalogo(el){
    const {db, S} = D();
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    let C; try{ C = await catalogo(true); }catch(e){ el.innerHTML = `<p class="vacio">No se ha podido leer el catálogo (${esc(e.code||e)}).</p>`; return; }
    const edita = puedePrecios();
    const filtro = {q:"", grupo:"todos"};
    el.innerHTML = `
      <h3>Catálogo</h3>
      <p class="vacio" style="margin:4px 0 10px">Productos y servicios de Contasimple. ${edita ? "Para cambiar muchos a la vez o añadir nuevos: <b>Descargar Excel</b>, lo modificas y <b>Subir Excel</b>; se guarda aquí y en Contasimple. Pulsa <b>Actualizar desde Contasimple</b> para traer los precios al día. Elige el <b>grupo</b> de cada uno, marca qué puede presupuestar un técnico (por defecto, lo de Mantenimiento) y en <b>Dto. máx.</b> pon hasta qué % se le puede hacer descuento (vacío = sin descuento)." : "Solo lectura."}</p>
      <div class="fi-barra">
        <input id="qCat" placeholder="Buscar…" style="flex:1;min-width:180px">
        <select id="gCat"><option value="todos">Todos los grupos</option>${GRUPOS.concat(["(sin grupo)"]).map(g => `<option>${g}</option>`).join("")}</select>
        ${edita ? `<button class="btn" id="btnSync">⟳ Actualizar desde Contasimple</button>` : ""}
        <button class="btn sec" id="btnXls">⬇️ Descargar Excel</button>
        ${edita ? `<label class="btn sec" style="cursor:pointer">⬆️ Subir Excel<input type="file" id="fXls" accept=".xlsx,.xls,.csv" style="display:none"></label>` : ""}
        <span id="msgCat" class="vacio"></span>
      </div>
      <div id="impCat"></div>
      <p id="cuentaCat" class="vacio" style="font-weight:600"></p>
      <table class="tabla-fi tabla-cat"><thead><tr><th>Código</th><th>Producto / servicio</th><th>Tipo</th><th>Precio sin IVA</th><th>IVA</th><th>PVP (con IVA)</th><th>Grupo</th><th>Técnico</th><th title="Descuento máximo permitido. Vacío = no admite descuento">Dto. máx.</th></tr></thead><tbody id="tbCat"></tbody></table>`;
    const pintar = () => {
      const q = sinAc(filtro.q);
      const L = Object.entries(C).filter(([k,p]) => p.activo !== false && (!q || sinAc(p.nombre + " " + (p.descripcion||"") + " " + (p.codigo||"")).includes(q))
        && (filtro.grupo === "todos" || (filtro.grupo === "(sin grupo)" ? !p.grupo : p.grupo === filtro.grupo))).sort((a,b) => a[1].nombre.localeCompare(b[1].nombre));
      el.querySelector("#cuentaCat").textContent = L.length + " de " + Object.keys(C).length;
      el.querySelector("#tbCat").innerHTML = L.map(([k,p]) => `<tr data-k="${k}">
        <td>${esc(p.codigo||"")}</td><td>${esc(p.nombre)}${p.descripcion && p.descripcion !== p.nombre ? `<br><span class="vacio">${esc(p.descripcion)}</span>` : ""}</td><td>${esc(p.tipo||"")}</td>
        <td>${eur(p.precio)}</td><td>${p.iva === IVA ? IVA + " %" : `<span class="tag aviso">${esc(p.iva)} %</span>`}</td><td><b>${eur(r2((Number(p.precio)||0) * (1 + (Number(p.iva ?? IVA)||0) / 100)))}</b></td>
        <td>${edita ? `<select class="selGrupo"><option value="">—</option>${GRUPOS.map(g => `<option ${p.grupo===g?"selected":""}>${g}</option>`).join("")}</select>` : esc(p.grupo||"—")}</td>
        <td>${edita ? `<input type="checkbox" class="chkTec" ${p.tecnico ? "checked" : ""}>` : (p.tecnico ? "Sí" : "")}</td>
        <td>${edita ? `<input type="number" class="numDto" min="0" max="100" step="1" placeholder="no" value="${p.dtoMax || ""}" style="width:62px"> %` : (p.dtoMax ? "hasta " + p.dtoMax + " %" : "no")}</td></tr>`).join("") || `<tr><td colspan="9" class="vacio">${Object.keys(C).length ? "Nada con ese filtro." : "Todavía vacío: pulsa «Actualizar desde Contasimple»."}</td></tr>`;
      if(!edita) return;
      const guardar = async (k, cambio) => {
        const yo = S.usuario.email.toLowerCase();
        try{ await db.collection("dhs_catalogo").doc(k).set({...cambio, modificado:{por:yo, en:firebase.firestore.FieldValue.serverTimestamp()}}, {merge:true}); Object.assign(C[k], cambio); }
        catch(e){ alert("No se ha podido guardar (" + (e.code||e) + ")."); }
      };
      el.querySelectorAll(".selGrupo").forEach(s => s.onchange = () => { const k = s.closest("tr").dataset.k; const g = s.value;
        const c = {grupo:g}; if(g === "Mantenimiento" && C[k].tecnico === undefined) c.tecnico = true; guardar(k, c).then(pintar); });
      el.querySelectorAll(".chkTec").forEach(c => c.onchange = () => guardar(c.closest("tr").dataset.k, {tecnico:c.checked}));
      el.querySelectorAll(".numDto").forEach(c => c.onchange = () => { const v = Math.min(100, Math.max(0, Math.round(Number(c.value)||0))); c.value = v || ""; guardar(c.closest("tr").dataset.k, {dtoMax:v}); });
    };
    el.querySelector("#qCat").oninput = e => { filtro.q = e.target.value; pintar(); };
    el.querySelector("#gCat").onchange = e => { filtro.grupo = e.target.value; pintar(); };
    const bS = el.querySelector("#btnSync");
    if(bS) bS.onclick = async () => {
      const m = x => el.querySelector("#msgCat").textContent = x;
      bS.disabled = true; m("Leyendo Contasimple…");
      try{
        const L = await llamar("catalogo", {});
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        let nuevos = 0, cambian = 0;
        for(let i = 0; i < L.length; i += 400){
          const b = db.batch();
          L.slice(i, i+400).forEach(p => {
            const k = String(p.id), ant = C[k];
            if(!ant) nuevos++; else if(ant.precio !== p.precio || ant.nombre !== p.nombre) cambian++;
            b.set(db.collection("dhs_catalogo").doc(k), {csId:p.id, nombre:p.nombre, precio:p.precio, iva:p.iva, descripcion:p.descripcion, activo:p.activo, codigo:p.codigo, actualizado:en, modificado:{por:yo, en}}, {merge:true});
          });
          await b.commit();
        }
        await db.collection("dhs_registro").add({por:yo, en, accion:"catálogo actualizado desde Contasimple (" + L.length + " · " + nuevos + " nuevos · " + cambian + " cambian)", coleccion:"dhs_catalogo"});
        m(L.length + " productos · " + nuevos + " nuevos · " + cambian + " con cambios.");
        C = await catalogo(true); pintar();
      }catch(e){ m("No se ha podido: " + (e.message||e)); }
      bS.disabled = false;
    };
    // ---------- Excel del catálogo: descargar, cambiar lo que sea, añadir nuevos y volver a subir ----------
    const COLS = ["ID Contasimple","Código","Producto / servicio","Tipo","Grupo","Técnico","Dto. máx. %","Precio sin IVA","IVA %","Descripción","Activo"];
    el.querySelector("#btnXls").onclick = async () => {
      const m = x => el.querySelector("#msgCat").textContent = x;
      try{
        const filas = Object.entries(C).sort((a,b) => (a[1].codigo||"~").localeCompare(b[1].codigo||"~") || a[1].nombre.localeCompare(b[1].nombre)).map(([k,p]) => ({
          "ID Contasimple": p.csId || Number(k), "Código": p.codigo||"", "Producto / servicio": p.nombre||"", "Tipo": p.tipo||"", "Grupo": p.grupo||"",
          "Técnico": p.tecnico ? "Sí" : "No", "Dto. máx. %": p.dtoMax || "", "Precio sin IVA": Number(p.precio)||0, "IVA %": p.iva ?? IVA, "PVP con IVA (informativo)": r2((Number(p.precio)||0) * (1 + (Number(p.iva ?? IVA)||0) / 100)), "Descripción": p.descripcion && p.descripcion !== p.nombre ? p.descripcion : "", "Activo": p.activo === false ? "No" : "Sí"}));
        if(!filas.length) filas.push(Object.fromEntries(COLS.map(c => [c, ""])));
        await window.DHS_XLS.descargar("DHS catálogo " + new Date().toISOString().slice(0,10), filas, "Catálogo");
        m("Descargado. Para añadir uno nuevo, pon una fila con el ID vacío. El código no se puede repetir (para agrupar, usa Grupo). La columna PVP es solo informativa: el precio que manda es el «Precio sin IVA».");
      }catch(e){ m("No se ha podido: " + (e.message||e)); }
    };
    const fX = el.querySelector("#fXls");
    if(fX) fX.onchange = async () => {
      const box = el.querySelector("#impCat"), file = fX.files[0]; fX.value = "";
      if(!file) return;
      box.innerHTML = `<p class="vacio">Leyendo…</p>`;
      if(window.DHS_GUARDANDO_CAT){ box.innerHTML = `<p class="ko">Todavía se está guardando la subida anterior. Espera a que acabe.</p>`; return; }
      let filas; try{ filas = await window.DHS_XLS.leer(file); C = await catalogo(true); }catch(e){ box.innerHTML = `<p class="ko">No se puede leer: ${esc(e.message||e)}</p>`; return; }
      const cf = window.DHS_XLS.campo;
      const num = v => { if(typeof v === "number") return v; let t = String(v||"").replace(/[€%\s]/g,""); if(!t) return null; if(t.includes(",") && t.includes(".")) t = t.replace(/\./g,""); t = t.replace(",","."); const n = Number(t); return isNaN(n) ? NaN : n; };
      const siNo = (v, def) => { const t = sinAc(String(v||"")).trim(); return !t ? def : ["si","s","x","1","true"].includes(t); };
      const grupoDe = v => { const t = sinAc(String(v||"")).trim(); return GRUPOS.find(g => sinAc(g) === t) || (t ? String(v).trim() : ""); };
      const porNombre = {}; Object.entries(C).forEach(([k,p]) => porNombre[sinAc(p.nombre).trim()] = k);
      const L = [];
      filas.forEach((r, i) => {
        const nombre = String(cf(r, "Producto / servicio", "Producto", "Nombre", "Servicio") || "").trim();
        let id = String(cf(r, "ID Contasimple", "ID", "csId") || "").trim();
        // Sin ID pero con el nombre exacto de uno que ya existe: es ese mismo (p. ej. uno creado en una subida anterior que se cortó)
        let porNom = false; if(!id && nombre && porNombre[sinAc(nombre).trim()]){ id = porNombre[sinAc(nombre).trim()]; porNom = true; }
        if(!nombre && !id) return;
        const x = {fila:i+2, id, nombre, codigo:String(cf(r, "Código", "Codigo") || "").trim(), tipo:String(cf(r, "Tipo") || "").trim(), grupo:grupoDe(cf(r, "Grupo")),
          tecnico:siNo(cf(r, "Técnico", "Tecnico"), false), dtoMax:Math.min(100, Math.max(0, Math.round(num(cf(r, "Dto. máx. %", "Dto max", "Descuento máximo")) || 0))),
          precio:num(cf(r, "Precio sin IVA", "Precio")), iva:num(cf(r, "IVA %", "IVA")), descripcion:String(cf(r, "Descripción", "Descripcion") || "").trim(), activo:siNo(cf(r, "Activo"), true), err:"", cs:[], app:[]};
        if(!nombre) x.err = "Falta el nombre";
        else if(x.precio === null || isNaN(x.precio) || x.precio < 0) x.err = "Precio no válido";
        else if(x.iva !== null && (isNaN(x.iva) || x.iva < 0 || x.iva > 21)) x.err = "IVA no válido";
        const ant = id ? C[id] : null;
        if(id && !ant && !x.err) x.err = "Ese ID no está en el catálogo (para uno nuevo, deja el ID vacío)";
        if(porNom && !x.err) x.app.push("(sin ID en el Excel: unido por el nombre)");
        // En Contasimple el código no se puede repetir: cada producto el suyo (para agrupar está la columna Grupo)
        const cod = sinAc(x.codigo).trim();
        if(cod && !x.err){
          const otra = L.find(y => sinAc(y.codigo).trim() === cod);
          const ajeno = Object.entries(C).find(([k,p]) => k !== String(id) && sinAc(p.codigo||"").trim() === cod && !filas.some(r2_ => String(cf(r2_, "ID Contasimple", "ID", "csId") || "").trim() === k));
          if(otra) x.err = "Código repetido (fila " + otra.fila + "): en Contasimple cada producto necesita un código distinto";
          else if(ajeno) x.err = "Ese código ya lo tiene «" + ajeno[1].nombre + "»";
        }
        if(!id && !x.err && L.some(y => !y.id && sinAc(y.nombre).trim() === sinAc(nombre).trim())) x.err = "Repetido en el Excel (fila " + L.find(y => !y.id && sinAc(y.nombre).trim() === sinAc(nombre).trim()).fila + ")";
        if(!x.err){
          if(!ant){ x.nuevo = true; if(x.iva === null) x.iva = IVA; }
          else {
            const dif = (k, a, b, f) => { if((a ?? "") !== (b ?? "")) x.cs.push(f + ": " + (a === "" || a == null ? "—" : a) + " → " + (b === "" || b == null ? "—" : b)); };
            dif("nombre", ant.nombre, nombre, "nombre"); if(r2(ant.precio) !== r2(x.precio)) x.cs.push("precio: " + eur(ant.precio) + " → " + eur(x.precio));
            if(x.iva !== null && Number(ant.iva) !== x.iva) x.cs.push("IVA: " + ant.iva + " % → " + x.iva + " %");
            dif("codigo", ant.codigo||"", x.codigo, "código"); dif("desc", (ant.descripcion && ant.descripcion !== ant.nombre ? ant.descripcion : ""), x.descripcion, "descripción");
            if((ant.activo !== false) !== x.activo) x.cs.push(x.activo ? "se activa" : "se desactiva");
            if((ant.tipo||"") !== x.tipo) x.app.push("tipo: " + (ant.tipo||"—") + " → " + (x.tipo||"—"));
            if((ant.grupo||"") !== x.grupo) x.app.push("grupo: " + (ant.grupo||"—") + " → " + (x.grupo||"—"));
            if(!!ant.tecnico !== x.tecnico) x.app.push("técnico: " + (x.tecnico ? "sí" : "no"));
            if((Number(ant.dtoMax)||0) !== x.dtoMax) x.app.push("dto. máx.: " + (ant.dtoMax ? ant.dtoMax + " %" : "no") + " → " + (x.dtoMax ? x.dtoMax + " %" : "no"));
            if(x.iva === null) x.iva = Number(ant.iva);
          }
        }
        L.push(x);
      });
      const nuevos = L.filter(x => x.nuevo), cambiaCS = L.filter(x => !x.err && !x.nuevo && x.cs.length), soloApp = L.filter(x => !x.err && !x.nuevo && !x.cs.length && x.app.length), errores = L.filter(x => x.err);
      const iguales = L.length - nuevos.length - cambiaCS.length - soloApp.length - errores.length;
      const fila = (x, que) => `<tr><td>${x.fila}</td><td>${esc(x.codigo)}</td><td>${esc(x.nombre)}</td><td>${que}</td></tr>`;
      box.innerHTML = `<div class="bloque" style="margin:10px 0">
        <h4>Revisión del Excel «${esc(file.name)}»</h4>
        <p><b>${nuevos.length}</b> nuevos · <b>${cambiaCS.length}</b> cambian en Contasimple · <b>${soloApp.length}</b> cambian solo aquí (grupo, tipo, técnico, descuento) · ${iguales} sin cambios${errores.length ? ` · <b class="ko">${errores.length} con error (no se guardan)</b>` : ""}</p>
        <p class="vacio">Lo que no esté en el Excel no se borra. Para quitar uno, pon «No» en Activo.</p>
        ${L.length - iguales ? `<div style="max-height:380px;overflow:auto"><table class="tabla-fi"><thead><tr><th>Fila</th><th>Código</th><th>Producto / servicio</th><th>Qué pasa</th></tr></thead><tbody>
          ${errores.map(x => fila(x, `<span class="tag aviso">${esc(x.err)}</span>`)).join("")}
          ${nuevos.map(x => fila(x, `<span class="tag est-p-aceptado">nuevo</span> ${eur(x.precio)} · IVA ${x.iva} %${x.grupo ? " · " + esc(x.grupo) : ""}`)).join("")}
          ${cambiaCS.map(x => fila(x, esc(x.cs.concat(x.app).join(" · ")))).join("")}
          ${soloApp.map(x => fila(x, `<span class="vacio">solo aquí:</span> ` + esc(x.app.join(" · ")))).join("")}
        </tbody></table></div>` : ""}
        ${nuevos.length + cambiaCS.length + soloApp.length ? `<p style="margin-top:10px"><button class="btn" id="bGuardarXls">Guardar${nuevos.length + cambiaCS.length ? " aquí y en Contasimple" : ""}</button> <button class="btn sec" id="bCancelXls">Cancelar</button> <span id="msgXls" class="vacio"></span></p>` : `<p><button class="btn sec" id="bCancelXls">Cerrar</button></p>`}
      </div>`;
      box.querySelector("#bCancelXls").onclick = () => box.innerHTML = "";
      const bG = box.querySelector("#bGuardarXls"); if(!bG) return;
      bG.onclick = async () => {
        const m = t => box.querySelector("#msgXls").textContent = t;
        const aCS = nuevos.concat(cambiaCS);
        if(!await DHS_PREGUNTA((aCS.length ? aCS.length + " productos se van a crear o cambiar también en Contasimple. " : "") + "¿Guardar?")) return;
        bG.disabled = true; window.DHS_GUARDANDO_CAT = true;
        const avisoSalir = e => { e.preventDefault(); e.returnValue = ""; }; window.addEventListener("beforeunload", avisoSalir);
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        const res = {}; let fallos = [];
        const doc = (x, id) => [String(id), {csId:Number(id), nombre:x.nombre, precio:x.precio, iva:x.iva, descripcion:x.descripcion || x.nombre, codigo:x.codigo, activo:x.activo,
          tipo:x.tipo, grupo:x.grupo, tecnico:x.tecnico, dtoMax:x.dtoMax, modificado:{por:yo, en}}];
        const escribir = async ops => { for(let i = 0; i < ops.length; i += 400){ const b = db.batch(); ops.slice(i, i+400).forEach(([id, d]) => b.set(db.collection("dhs_catalogo").doc(id), d, {merge:true})); await b.commit(); } };
        try{
          // De 25 en 25: cada tanda se guarda aquí en cuanto Contasimple la acepta (si se corta, no se duplica nada al volver a subir)
          for(let i = 0; i < aCS.length; i += 25){
            m("Contasimple: " + Math.min(i + 25, aCS.length) + " de " + aCS.length + "… (no cierres esta pantalla)");
            const lote = aCS.slice(i, i+25);
            const R = await llamar("guardarProductos", {productos: lote.map(x => ({fila:x.fila, id:x.id || null, nombre:x.nombre, precio:x.precio, iva:x.iva, descripcion:x.descripcion, codigo:x.codigo, activo:x.activo}))});
            R.forEach(r => { res[r.fila] = r; if(!r.ok) fallos.push("fila " + r.fila + ": " + (/InternalCode_Duplicated/.test(r.error) ? "el código ya lo tiene otro producto en Contasimple" : r.error)); });
            await escribir(lote.filter(x => res[x.fila] && res[x.fila].ok).map(x => doc(x, x.id || res[x.fila].id)));
          }
          m("Guardando aquí…");
          await escribir(soloApp.map(x => doc(x, x.id)));
          const nOk = aCS.filter(x => res[x.fila] && res[x.fila].ok);
          await db.collection("dhs_registro").add({por:yo, en, accion:"catálogo subido por Excel (" + nOk.filter(x => x.nuevo).length + " nuevos, " + nOk.filter(x => !x.nuevo).length + " cambiados en Contasimple, " + soloApp.length + " solo en la app" + (fallos.length ? ", " + fallos.length + " fallos" : "") + ")", coleccion:"dhs_catalogo"});
          C = await catalogo(true); pintar();
          box.innerHTML = `<div class="bloque" style="margin:10px 0"><p>✅ Hecho: ${nOk.filter(x => x.nuevo).length} nuevos y ${nOk.filter(x => !x.nuevo).length} cambiados (aquí y en Contasimple), ${soloApp.length} cambiados solo aquí.</p>
            ${fallos.length ? `<p class="ko">No se han podido guardar ${fallos.length}:</p><ul>${fallos.map(f => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}<p><button class="btn sec" id="bCerrarXls">Cerrar</button></p></div>`;
          box.querySelector("#bCerrarXls").onclick = () => box.innerHTML = "";
        }catch(e){ m("Se ha parado: " + (e.message||e) + ". Lo que ya estaba hecho se queda; vuelve a subir el Excel para seguir."); bG.disabled = false; }
        finally{ window.DHS_GUARDANDO_CAT = false; window.removeEventListener("beforeunload", avisoSalir); }
      };
    };
    pintar();
  }

  // ---------- Presupuestos de una comunidad (pestaña de la ficha) ----------
  // Base económica de la comunidad: arriba lo que está vivo (presupuestos por aceptar, aceptados por hacer,
  // facturas sin cobrar); abajo, plegado, el historial de lo ya cerrado (cobrado, rechazado, facturado).
  async function pestana(el, comId, com){
    const {db, S} = D();
    if(!puedeVerPres()){ el.innerHTML = `<h3>Economía</h3><p class="vacio">Tu perfil no puede ver presupuestos.</p>`; return; }
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    let L = [];
    try{ await cargarQuien(); (await db.collection("dhs_presupuestos").where("comunidadId", "==", comId).get()).forEach(d => L.push({id:d.id, ...d.data()})); }
    catch(e){ el.innerHTML = `<p class="vacio">No se han podido leer (${esc(e.code||e)}).</p>`; return; }
    L.sort((a,b) => (b.numero||"").localeCompare(a.numero||""));
    const verFact = !!(window.DHS_ECO && S.puede("cobros","ver"));
    let F = [], errF = "";
    if(verFact && com.csId){ try{ F = (await window.DHS_ECO.deComunidad(com.csId)).filter(f => !f.rectificativa); }catch(e){ errF = e.message || String(e); } }
    const tot = p => (p.totales && p.totales.total) || 0;
    const facturado = p => (p.facturas||[]).reduce((n,f) => n + (f.total||0), 0);
    const porAceptar = L.filter(p => ["pendiente","enviado"].includes(p.estado));
    const porHacer = L.filter(p => ["aceptado","parcial"].includes(p.estado) && tot(p) - facturado(p) > 0.01);
    const cerrados = L.filter(p => !porAceptar.includes(p) && !porHacer.includes(p));
    const sinCobrar = F.filter(f => (f.pendiente||0) > 0.01);
    const cobradas = F.filter(f => !((f.pendiente||0) > 0.01));
    const suma = (X, g) => r2(X.reduce((n,x) => n + (g(x)||0), 0));
    const fch = f => f ? new Date(f + "T12:00").toLocaleDateString("es-ES") : "";
    const fila = p => { const e = ESTADOS[p.estado] || ["",p.estado]; return `<a class="fila fila-pres est-p-${esc(p.estado)}" href="#" data-id="${esc(p.id)}">
      <div class="f-nombre">${esc(p.numero)} <span class="vacio">· ${esc(fch(p.fecha))}${p.creado ? " · por " + esc(quien(p.creado)) : ""}</span></div>
      <div class="f-sub">${esc((p.lineas||[]).map(l => l.concepto).join(", ").slice(0,120))}</div>
      <div class="f-tags"><b>${eur(tot(p))}</b> <span class="tag est-p-${esc(p.estado)}">${e[0]} ${e[1]}</span>${p.estado === "parcial" ? ` <span class="vacio">falta ${eur(tot(p) - facturado(p))}</span>` : ""}</div></a>`; };
    const filaF = f => `<tr><td>${esc(f.numero)}</td><td>${esc(fch(f.fecha))}</td><td>${eur(f.total)}</td>
      <td>${(f.pendiente||0) > 0.01 ? `<span class="tag est-p-pendiente">⏳ Falta ${eur(f.pendiente)}</span>${f.devuelto ? ` <span class="tag aviso">devuelto</span>` : ""}${f.enHoja ? ` <span class="tag azul">en la hoja del viernes</span>` : ""}${f.sinCobros ? ` <span class="tag gris">aún no está en cobros</span>` : ""}`
        : `<span class="tag est-p-aceptado">✅ Cobrada${(f.pagos||[]).length && f.pagos[f.pagos.length-1].fecha ? " " + esc(fch(f.pagos[f.pagos.length-1].fecha)) : ""}</span>${f.enBanco ? ` <span class="tag azul">en el banco</span>` : ""}`}</td></tr>`;
    const tablaF = X => `<table class="tabla-fi"><thead><tr><th>Factura</th><th>Fecha</th><th>Total</th><th>Estado</th></tr></thead><tbody>${X.map(filaF).join("")}</tbody></table>`;
    const nHist = cerrados.length + cobradas.length;
    el.innerHTML = `
      <div class="cab-lista"><h3>Economía de la comunidad</h3>${puedePrecios() ? `<button class="btn" id="btnNuevoP">+ Nuevo presupuesto</button>` : ""}</div>
      ${!com.csId && !com.nif ? `<p class="aviso-cal">Esta comunidad no tiene NIF ni código de Contasimple: complétalo en «Editar ficha» antes de presupuestar.</p>` : ""}
      <div class="eco-cajas">
        <a class="eco-caja c3" href="#" data-ir="ecA"><span>Presupuestos por aceptar</span><b>${eur(suma(porAceptar, tot))}</b><i>${porAceptar.length} presupuesto${porAceptar.length===1?"":"s"}</i></a>
        <a class="eco-caja c1" href="#" data-ir="ecH"><span>Aceptado, pendiente de hacer</span><b>${eur(suma(porHacer, p => tot(p) - facturado(p)))}</b><i>${porHacer.length} presupuesto${porHacer.length===1?"":"s"}</i></a>
        ${verFact ? `<a class="eco-caja c2" href="#" data-ir="ecC"><span>Hecho, pendiente de cobrar</span><b>${eur(suma(sinCobrar, f => f.pendiente))}</b><i>${sinCobrar.length} factura${sinCobrar.length===1?"":"s"}</i></a>` : ""}
      </div>
      <h4 id="ecA" style="margin-top:14px">⏳ Presupuestos por aceptar (${porAceptar.length})</h4><div class="lista">${porAceptar.map(fila).join("") || `<p class="vacio">Ninguno.</p>`}</div>
      <h4 id="ecH" style="margin-top:14px">✅ Aceptados, pendientes de hacer (${porHacer.length})</h4><div class="lista">${porHacer.map(fila).join("") || `<p class="vacio">Ninguno.</p>`}</div>
      ${verFact ? `<h4 id="ecC" style="margin-top:14px">🧾 Hecho, pendiente de cobrar (${sinCobrar.length})</h4>
        ${!com.csId ? `<p class="vacio">Esta comunidad no está unida a un cliente de Contasimple (falta el código). Se une sola al hacerle su primer presupuesto.</p>`
          : errF ? `<p class="vacio">No se han podido leer las facturas: ${esc(errF)}</p>`
          : sinCobrar.length ? tablaF(sinCobrar) : `<p class="vacio">Nada pendiente de cobrar.</p>`}` : ""}
      <details class="eco-hist" style="margin-top:18px"><summary>Historial: cobrado y cerrado (${nHist})</summary>
        ${verFact && cobradas.length ? `<p class="vacio" style="margin-top:8px">Facturas cobradas (últimos 13 meses) · ${eur(suma(cobradas, f => f.total))}</p>${tablaF(cobradas)}` : ""}
        ${cerrados.length ? `<p class="vacio" style="margin-top:8px">Presupuestos facturados o rechazados</p><div class="lista">${cerrados.map(fila).join("")}</div>` : ""}
        ${!nHist ? `<p class="vacio">Todavía no hay nada cerrado.</p>` : ""}
      </details>`;
    el.querySelectorAll("[data-ir]").forEach(a => a.onclick = ev => { ev.preventDefault(); const x = el.querySelector("#" + a.dataset.ir); if(x) x.scrollIntoView({behavior:"smooth"}); });
    const bN = el.querySelector("#btnNuevoP"); if(bN) bN.onclick = () => editor(el, comId, com);
    el.querySelectorAll(".fila-pres").forEach(a => a.onclick = ev => { ev.preventDefault(); detalle(el, comId, com, L.find(p => p.id === a.dataset.id)); });
  }

  // ---------- Nuevo presupuesto ----------
  async function editor(el, comId, com, volver){
    const vuelve = volver || (() => pestana(el, comId, com)), rapido = !comId;
    const {db, S} = D();
    let C; try{ C = await catalogo(); }catch(e){ C = {}; }
    const dir = puedePrecios();
    const lineas = [];
    el.innerHTML = `
      <div class="cab-lista"><h3>${rapido ? "⚡ Presupuesto rápido" : "Nuevo presupuesto · " + esc(com.nombre)}</h3><button class="btn sec" id="btnVolverP">‹ Volver</button></div>
      <p class="vacio">${rapido ? "Para un particular que aún no ha dado la dirección: solo nombre y teléfono. Se guarda en Contasimple con el siguiente número, sin cliente; cuando lo acepte, lo asocias a su ficha." : "Se guarda en Contasimple con el siguiente número correlativo y esta comunidad como cliente."} IVA 21 %.</p>
      ${rapido ? `<div class="bloque" style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap">
        <label class="campo" style="flex:1;min-width:150px"><span>Teléfono *</span><input id="rTel" type="tel" value="${esc(com.telefono||"")}" placeholder="600 000 000"></label>
        <label class="campo" style="flex:1;min-width:180px"><span>Nombre</span><input id="rNombre" value="${esc(com.nombre||"")}" placeholder="Como se presenta: «soy Marta…»"></label>
        <label class="campo" style="flex:2;min-width:200px"><span>Dirección (si la da)</span><input id="rDir" placeholder="Calle, número…"></label>
        <label class="campo" style="flex:1;min-width:140px"><span>Población</span><input id="rPob" placeholder="Sabadell, Terrassa…"></label></div>` : ""}
      <div class="bloque" style="margin-top:10px">
        <label class="campo"><span>Añadir del catálogo</span><input id="busCat" placeholder="Escribe: LNB, monitor Fermax, hora de trabajo…" autocomplete="off"><div id="resCat" class="res-local oculto"></div></label>
        ${dir ? `<button class="btn sec" id="btnLibre">+ Línea libre (fuera de catálogo)</button>` : ""}
        <table class="tabla-fi tabla-lineas"><thead><tr><th>Concepto</th><th>Cant.</th><th>Precio</th><th>Dto. %</th><th>Importe</th><th></th></tr></thead><tbody id="tbL"></tbody></table>
        <div class="totales" id="totP"></div>
        <label class="campo" style="margin-top:8px"><span>Notas (salen en el presupuesto)</span><textarea id="notasP" rows="2"></textarea></label>
        <p><button class="btn" id="btnGuardarP">Guardar presupuesto</button> <span id="msgP" class="vacio"></span></p>
      </div>`;
    const tb = el.querySelector("#tbL");
    const calc = l => r2(l.cantidad * l.precio * (1 - (l.descuento||0)/100));
    // Descuento: solo en los productos que lo admiten (Ajustes › Catálogo › Dto. máx.) y hasta ese máximo; las líneas libres, sin límite
    const dtoMax = l => !l.productoId ? 100 : (Number(l.dtoMax) || 0);
    const totales = () => {
      const base = r2(lineas.reduce((n,l) => n + calc(l), 0)), iva = r2(base * IVA / 100);
      el.querySelector("#totP").innerHTML = `Base <b>${eur(base)}</b> · IVA 21 % <b>${eur(iva)}</b> · Total <b class="grande">${eur(base + iva)}</b>`;
    };
    const pintar = () => {
      tb.innerHTML = lineas.map((l, i) => `<tr data-i="${i}">
        <td>${dir || !l.productoId ? `<input class="lC" value="${esc(l.concepto)}">` : esc(l.concepto)}</td>
        <td><input class="lQ" type="number" min="0" step="0.5" value="${l.cantidad}"></td>
        <td>${dir ? `<input class="lP" type="number" step="0.01" value="${l.precio}">` : eur(l.precio)}</td>
        <td>${dir && dtoMax(l) ? `<input class="lD" type="number" min="0" max="${dtoMax(l)}" value="${l.descuento||0}" title="Máximo ${dtoMax(l)} %">` : (l.descuento ? l.descuento + " %" : `<span class="vacio" title="Este producto no admite descuento (Ajustes › Catálogo)">—</span>`)}</td>
        <td>${eur(calc(l))}</td><td><button class="btn sec mini-btn lX">✕</button></td></tr>`).join("") || `<tr><td colspan="6" class="vacio">Añade líneas del catálogo${dir ? " o una línea libre" : ""}.</td></tr>`;
      totales();
      tb.querySelectorAll("tr[data-i]").forEach(tr => {
        const l = lineas[tr.dataset.i];
        // Al escribir solo se recalcula el importe y los totales (sin redibujar: no se pierde lo que se teclea)
        const on = (cls, f) => { const x = tr.querySelector(cls); if(x) x.oninput = () => { f(x.value); tr.children[4].textContent = eur(calc(l)); totales(); }; };
        on(".lC", v => l.concepto = v); on(".lQ", v => l.cantidad = Number(v)||0); on(".lP", v => l.precio = Number(v)||0); on(".lD", v => { l.descuento = Math.min(dtoMax(l), Math.max(0, Number(v)||0)); const x = tr.querySelector(".lD"); if(Number(x.value) > dtoMax(l)) x.value = dtoMax(l); });
        tr.querySelector(".lX").onclick = () => { lineas.splice(tr.dataset.i, 1); pintar(); };
      });
    };
    const bus = el.querySelector("#busCat"), res = el.querySelector("#resCat");
    const permitidos = Object.entries(C).filter(([k,p]) => p.activo !== false && (dir || p.tecnico));
    bus.oninput = () => {
      const q = sinAc(bus.value.trim()); if(q.length < 2){ res.classList.add("oculto"); return; }
      const L = permitidos.filter(([k,p]) => sinAc(p.nombre + " " + (p.descripcion||"")).includes(q)).slice(0, 12);
      res.innerHTML = L.map(([k,p]) => `<div class="r-item" data-k="${k}"><b>${esc(p.nombre)}</b><span>${eur(p.precio)}${p.grupo ? " · " + esc(p.grupo) : ""}</span></div>`).join("") || `<div class="r-vacio">${Object.keys(C).length ? "No está en el catálogo" : "Catálogo vacío: actualízalo en Ajustes › Catálogo"}</div>`;
      res.classList.remove("oculto");
      res.querySelectorAll(".r-item").forEach(d => d.onmousedown = e => { e.preventDefault(); const p = C[d.dataset.k];
        lineas.push({productoId:p.csId || Number(d.dataset.k), concepto:p.nombre, cantidad:1, precio:p.precio, descuento:0, dtoMax:Number(p.dtoMax)||0}); bus.value = ""; res.classList.add("oculto"); pintar(); });
    };
    bus.onblur = () => setTimeout(() => res.classList.add("oculto"), 150);
    const bL = el.querySelector("#btnLibre"); if(bL) bL.onclick = () => { lineas.push({concepto:"", cantidad:1, precio:0, descuento:0}); pintar(); tb.querySelector("tr:last-child .lC").focus(); };
    el.querySelector("#btnVolverP").onclick = () => vuelve();
    el.querySelector("#btnGuardarP").onclick = async () => {
      const m = x => el.querySelector("#msgP").textContent = x;
      const L = lineas.filter(l => l.concepto && l.cantidad > 0);
      if(!L.length) return m("Añade al menos una línea con concepto y cantidad.");
      if(L.some(l => !l.productoId && !dir)) return m("Solo Dirección puede añadir líneas fuera de catálogo.");
      const rNom = rapido ? el.querySelector("#rNombre").value.trim() : "", rTel = rapido ? el.querySelector("#rTel").value.trim() : "";
      const rDir = rapido ? el.querySelector("#rDir").value.trim() : "", rPob = rapido ? el.querySelector("#rPob").value.trim() : "";
      if(rapido && rTel.replace(/\D/g,"").length < 9) return m("El teléfono es obligatorio (9 cifras como mínimo).");
      if(!await DHS_PREGUNTA("Se va a crear el presupuesto en Contasimple con el siguiente número. ¿Seguir?")) return;
      const b = el.querySelector("#btnGuardarP"); b.disabled = true; m("Guardando en Contasimple…");
      try{
        const notas = el.querySelector("#notasP").value.trim();
        const notasCS = rapido ? [notas, "Presupuesto para " + (rNom || "particular") + " · Tel. " + rTel + ([rDir, rPob].filter(Boolean).length ? " · " + [rDir, rPob].filter(Boolean).join(", ") : "")].filter(Boolean).join("\n") : notas;
        const r = await llamar("crearPresupuesto", rapido ? {sinCliente:true, lineas:L, notas:notasCS}
          : {cliente:{csId:com.csId||null, nif:com.nif||"", nombre:com.nombre, direccion:com.direccion||"", poblacion:com.poblacion||""}, lineas:L, notas});
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        await db.collection("dhs_presupuestos").doc(String(r.id)).set({csId:r.id, numero:r.numero, comunidadId:comId || null, nombre:rapido ? (rNom || "Particular") : com.nombre, clienteId:r.clienteId || null,
          ...(rapido ? {rapido:true, telefono:rTel, direccion:rDir, poblacion:rPob} : {}),
          fecha:new Date().toISOString().slice(0,10), lineas:L, totales:r.totales, notas:notasCS, estado:"pendiente", facturas:[],
          creado:{por:yo, en, nombre:quien({por:yo}) || S.nombre || ""}, modificado:{por:yo, en}});
        if(!rapido && !com.csId && r.clienteId){ try{ await db.collection("dhs_comunidades").doc(comId).update({csId:r.clienteId, modificado:{por:yo, en}}); com.csId = r.clienteId; }catch(e){} }
        await db.collection("dhs_registro").add({por:yo, en, accion:"presupuesto " + r.numero + " creado (" + eur(r.totales.total) + ")", coleccion:"dhs_presupuestos", docId:String(r.id), nombre:com.nombre});
        vuelve();
      }catch(e){ m("No se ha podido: " + (e.message||e)); b.disabled = false; }
    };
    pintar();
  }

  // ---------- Detalle: PDF, enviar, aceptar/rechazar, facturar ----------
  function detalle(el, comId, com, p, volver){
    const {db, S} = D(), dir = S.direccion, edita = puedePrecios();
    const vuelve = volver || (() => pestana(el, comId, com));
    const e = ESTADOS[p.estado] || ["",p.estado];
    el.innerHTML = `
      <div class="cab-lista"><h3>${esc(p.numero)} · ${esc(com.nombre)}</h3><button class="btn sec" id="btnVolverP">‹ Volver</button></div>
      <p><span class="tag est-p-${esc(p.estado)}">${e[0]} ${e[1]}</span> <span class="vacio">${p.fecha ? new Date(p.fecha + "T12:00").toLocaleDateString("es-ES") : ""}</span>
        ${p.creado ? ` · ✍️ hecho por <b>${esc(quien(p.creado))}</b>` : ""}${p.modificado && p.creado && p.modificado.por && p.modificado.por !== p.creado.por ? ` <span class="vacio">(último cambio: ${esc(quien(p.modificado))})</span>` : ""}
        ${p.telefono ? ` · 📞 <a href="tel:${esc(p.telefono)}">${esc(p.telefono)}</a>` : ""}
        ${!comId ? ` <span class="tag aviso">⚡ rápido · sin asociar a ninguna ficha</span>` : (!p.clienteId ? ` <span class="tag gris">sin cliente en Contasimple (falta NIF)</span>` : "")}</p>
      <table class="tabla-fi"><thead><tr><th>Concepto</th><th>Cant.</th><th>Precio</th><th>Dto.</th><th>Importe</th></tr></thead><tbody>
        ${(p.lineas||[]).map(l => `<tr><td>${esc(l.concepto)}</td><td>${l.cantidad}</td><td>${eur(l.precio)}</td><td>${l.descuento ? l.descuento + " %" : ""}</td><td>${eur(r2(l.cantidad*l.precio*(1-(l.descuento||0)/100)))}</td></tr>`).join("")}
      </tbody></table>
      <div class="totales">Base <b>${eur(p.totales.base)}</b> · IVA 21 % <b>${eur(p.totales.iva)}</b> · Total <b class="grande">${eur(p.totales.total)}</b></div>
      ${p.notas ? `<p class="ft-nota" style="margin-top:6px">${esc(p.notas)}</p>` : ""}
      ${(p.facturas||[]).length ? `<p style="margin-top:8px">Facturas: ${(p.facturas).map(f => `<b>${esc(f.numero)}</b> (${eur(f.total)})`).join(" · ")}</p>` : ""}
      ${p.formaPago ? `<p class="vacio">Forma de pago: ${esc(p.formaPago)}</p>` : ""}
      <div class="botones-pres">
        <button class="btn sec" id="bPdf">📄 Ver PDF</button>
        <button class="btn sec" id="bDescPdf">⬇️ Descargar PDF</button>
        ${edita ? `<button class="btn sec" id="bEnviar">📧 Enviar por correo</button>` : ""}
        ${edita && (!comId || !p.clienteId) ? `<button class="btn" id="bAsociar">🔗 ${!comId ? "Asociar a una ficha" : "Unir al cliente de Contasimple"}</button>` : ""}
        ${edita && ["pendiente","enviado"].includes(p.estado) ? `<button class="btn btn-ok" id="bAcepta">✅ Aceptado</button><button class="btn sec" id="bRechaza">✖️ Rechazado</button>` : ""}
        ${edita && comId && ["aceptado","parcial"].includes(p.estado) ? (p.intervencionId ? `<a class="btn sec" href="#intervencion/${esc(p.intervencionId)}">🛠️ Ver intervención ${esc(p.numeroIntervencion||"")}</a>` : `<button class="btn" id="bProgramar">📅 Programar intervención</button>`) : ""}
        ${dir && p.clienteId && ["aceptado","parcial"].includes(p.estado) ? `<button class="btn" id="bFacturar">🧾 Facturar…</button>` : ""}
      </div>
      ${["aceptado","parcial"].includes(p.estado) && (!comId || !p.clienteId) ? `<p class="aviso-cal" style="margin-top:8px">Para ${!comId ? "programar la intervención y facturar, asócialo a su ficha" : "facturar, completa el NIF en la ficha y pulsa «Unir al cliente de Contasimple»"} (dirección${!comId ? ", teléfono" : ""} y NIF).</p>` : ""}
      <div>
      </div>
      <div id="cajaAcc" class="bloque oculto" style="margin-top:10px"></div>
      <p id="msgD" class="vacio" style="margin-top:6px"></p>`;
    const m = x => el.querySelector("#msgD").textContent = x;
    const caja = el.querySelector("#cajaAcc");
    const yo = S.usuario.email.toLowerCase(), en = () => firebase.firestore.FieldValue.serverTimestamp();
    const ref = db.collection("dhs_presupuestos").doc(p.id);
    const reg = accion => db.collection("dhs_registro").add({por:yo, en:en(), accion:"presupuesto " + p.numero + ": " + accion, coleccion:"dhs_presupuestos", docId:p.id, nombre:com.nombre});
    el.querySelector("#btnVolverP").onclick = () => vuelve();
    el.querySelector("#bPdf").onclick = async () => {
      m("Pidiendo el PDF a Contasimple…");
      try{
        window.open(URL.createObjectURL(await pdfBlob()), "_blank"); m("");
      }catch(e){ m("No se ha podido: " + (e.message||e)); }
    };
    const pdfBlob = async () => {
      const r = await llamar("pdfPresupuesto", {id:p.csId, numero:p.numero});
      const bin = atob(r.base64), u8 = new Uint8Array(bin.length); for(let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      return new Blob([u8], {type:"application/pdf"});
    };
    // Descargar el PDF (el mismo de Contasimple) para mandarlo por el WhatsApp de cada uno
    el.querySelector("#bDescPdf").onclick = async () => {
      m("Pidiendo el PDF a Contasimple…");
      try{
        const blob = await pdfBlob(), a = document.createElement("a");
        const quienN = (p.rapido ? (p.nombre && p.nombre !== "Particular" ? p.nombre : (p.telefono || "")) : (com.nombre || "")).replace(/[\\/:*?"<>|]/g, "").trim();
        a.href = URL.createObjectURL(blob); a.download = "Presupuesto " + p.numero + (quienN ? " - " + quienN : "") + ".pdf";
        document.body.appendChild(a); a.click(); a.remove(); m("Descargado.");
      }catch(e){ m("No se ha podido: " + (e.message||e)); }
    };
    // Asociar a una ficha (comunidad o particular). Si la ficha tiene NIF, se une también al cliente de Contasimple.
    const bAs = el.querySelector("#bAsociar");
    if(bAs) bAs.onclick = async () => {
      const C = await window.DHS_COM.datos();
      const nombres = {}; Object.entries(C.coms).forEach(([k,c]) => { let n = (c.nombre || k) + (c.poblacion ? " (" + c.poblacion + ")" : ""); while(nombres[n]) n += " ·"; nombres[n] = k; });
      caja.classList.remove("oculto");
      caja.innerHTML = `<h4>${comId ? "Unir al cliente de Contasimple" : "Asociar " + esc(p.numero) + " a una ficha"}</h4>
        ${comId ? `<p class="vacio">La ficha «${esc(com.nombre)}» ${com.nif ? "tiene NIF " + esc(com.nif) : "no tiene NIF todavía: complétalo en su ficha (Editar ficha) y vuelve aquí"}.</p>` : `
        <label class="chk"><input type="radio" name="asT" value="existe" checked> Una ficha que ya existe (comunidad o cliente)</label>
        <div id="asExiste" style="margin:4px 0 8px 22px"><input id="asBus" list="dlAs" placeholder="Escribe y elige…" style="width:100%;max-width:420px"><datalist id="dlAs">${Object.keys(nombres).map(n => `<option value="${esc(n)}">`).join("")}</datalist></div>
        <label class="chk"><input type="radio" name="asT" value="nuevo"> Cliente nuevo (particular)</label>
        <div id="asNuevo" class="oculto" style="margin:4px 0 8px 22px;display:grid;gap:6px;max-width:460px">
          <label class="campo"><span>Nombre y apellidos</span><input id="asNom" value="${esc(p.nombre && p.nombre !== "Particular" ? p.nombre : "")}"></label>
          <label class="campo"><span>Teléfono</span><input id="asTel" type="tel" value="${esc(p.telefono||"")}"></label>
          <label class="campo"><span>Dirección</span><input id="asDir" placeholder="Calle, número, piso" value="${esc(p.direccion||"")}"></label>
          <label class="campo"><span>Población</span><input id="asPob" value="${esc(p.poblacion||"")}"></label>
          <label class="campo"><span>DNI / NIF (para facturar; si aún no lo tienes, déjalo vacío)</span><input id="asNif"></label>
        </div>`}
        <p><button class="btn" id="okAs">${comId ? "Unir" : "Asociar"}</button></p>`;
      if(!comId){
        const tg = () => { const n = caja.querySelector('input[name=asT]:checked').value === "nuevo"; caja.querySelector("#asNuevo").classList.toggle("oculto", !n); caja.querySelector("#asExiste").classList.toggle("oculto", n); };
        caja.querySelectorAll('input[name=asT]').forEach(r => r.onchange = tg); tg();
      }
      caja.querySelector("#okAs").onclick = async () => {
        let cid = comId, c = com;
        const firma = {por:yo, en:en()};
        try{
          if(!cid){
            if(caja.querySelector('input[name=asT]:checked').value === "existe"){
              cid = nombres[caja.querySelector("#asBus").value]; if(!cid) return m("Elige la ficha de la lista.");
              c = C.coms[cid];
            } else {
              const v = id => caja.querySelector(id).value.trim();
              const nom = v("#asNom"); if(!nom) return m("Pon el nombre.");
              const nif = v("#asNif").toUpperCase().replace(/[\s-]/g,"");
              const slug = nom.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50) || "particular";
              cid = "c_" + slug; let n = 2; while(C.coms[cid]) cid = "c_" + slug + "-" + (n++);
              c = {nombre:nom, telefono:v("#asTel"), direccion:v("#asDir"), poblacion:v("#asPob"), nif, tipo:"particular", origen:"particular", adminId:null, activo:true,
                   nueva: !(nif && v("#asDir")), creadaDesde:"presupuesto " + p.numero, modificado:firma};
              await db.collection("dhs_comunidades").doc(cid).set(c); window.DHS_COM.anadir(cid, c);
              await db.collection("dhs_registro").add({por:yo, en:en(), accion:"alta (cliente particular desde presupuesto " + p.numero + ")", coleccion:"dhs_comunidades", docId:cid, nombre:nom});
            }
            await ref.update({comunidadId:cid, nombre:c.nombre, asociadoEl:new Date().toISOString().slice(0,10), modificado:firma});
            Object.assign(p, {comunidadId:cid, nombre:c.nombre}); await reg("asociado a " + c.nombre);
          }
          let aviso = "";
          if(c.csId || c.nif){
            m("Uniendo al cliente en Contasimple…");
            const map = {pendiente:"Creado", enviado:"Enviado", aceptado:"Aceptado", parcial:"Parcial", rechazado:"Rechazado", facturado:"Facturado"};
            const r = await llamar("asignarCliente", {id:p.csId, numero:p.numero, fecha:p.fecha, notas:p.notas || "", lineas:p.lineas, estadoCS:map[p.estado] || "Creado",
              cliente:{csId:c.csId || null, nif:c.nif || "", nombre:c.nombre, direccion:c.direccion || "", poblacion:c.poblacion || "", telefono:c.telefono || ""}});
            await ref.update({clienteId:r.clienteId, modificado:firma}); p.clienteId = r.clienteId;
            if(!c.csId){ try{ await db.collection("dhs_comunidades").doc(cid).update({csId:r.clienteId, modificado:firma}); c.csId = r.clienteId; }catch(e){} }
            if(!r.pdf) aviso = " (el cliente queda unido, pero Contasimple no ha dejado poner sus datos en el PDF del presupuesto)";
          } else aviso = " Falta el NIF para unirlo en Contasimple: complétalo en la ficha cuando lo tengas.";
          detalle(el, cid, c, p, volver);
          el.querySelector("#msgD").textContent = "Hecho." + aviso;
        }catch(e){ m("No se ha podido: " + (e.message||e)); }
      };
    };
    const cambiaEstado = async (nuevo, csEstado, extra = {}) => {
      m("Guardando…");
      try{ await llamar("estadoPresupuesto", {id:p.csId, estado:csEstado}); await ref.update({estado:nuevo, ...extra, modificado:{por:yo, en:en()}}); await reg(ESTADOS[nuevo][1].toLowerCase()); Object.assign(p, {estado:nuevo}, extra); detalle(el, comId, com, p, volver); }
      catch(e){ m("No se ha podido: " + (e.message||e)); }
    };
    const bA = el.querySelector("#bAcepta");
    if(bA) bA.onclick = () => {
      caja.classList.remove("oculto");
      caja.innerHTML = `<h4>¿Cómo se paga?</h4>
        <label class="chk"><input type="radio" name="fp" value="Todo al terminar" checked> Todo al terminar</label>
        <label class="chk"><input type="radio" name="fp" value="50 % de entrada y 50 % al terminar"> 50 % de entrada y 50 % al terminar</label>
        <label class="chk"><input type="radio" name="fp" value="otro"> Otro: <input id="fpOtro" placeholder="Ej.: 30 % entrada, resto al terminar"></label>
        <p style="margin-top:8px"><button class="btn btn-ok" id="okAcepta">Marcar como aceptado</button></p>`;
      caja.querySelector("#okAcepta").onclick = () => {
        const v = caja.querySelector('input[name=fp]:checked').value;
        cambiaEstado("aceptado", "Aceptado", {formaPago: v === "otro" ? (caja.querySelector("#fpOtro").value.trim() || "Otro") : v, aceptadoEl:new Date().toISOString().slice(0,10)});
      };
    };
    const bPg = el.querySelector("#bProgramar");
    if(bPg) bPg.onclick = () => {
      window.DHS_TRAB.prefijar({presupuestoId:p.id, presupuestoNumero:p.numero, comunidadId:comId,
        descripcion:"Presupuesto aceptado " + p.numero + ": " + (p.lineas||[]).map(l => (l.cantidad !== 1 ? l.cantidad + " × " : "") + l.concepto).join(", ")});
      location.hash = "nueva-intervencion/" + encodeURIComponent(comId);
    };
    const bR = el.querySelector("#bRechaza"); if(bR) bR.onclick = async () => { if(await DHS_PREGUNTA("¿Marcar como rechazado?")) cambiaEstado("rechazado", "Rechazado"); };
    const bE = el.querySelector("#bEnviar");
    if(bE) bE.onclick = async () => {
      let para = "";
      try{ const C = await window.DHS_COM.datos(); const a = C.admins[com.adminId]; para = a && (a.emails||[])[0] || ""; }catch(e){}
      caja.classList.remove("oculto");
      caja.innerHTML = `<h4>Enviar ${esc(p.numero)}</h4>
        <label class="campo"><span>Para</span><input id="ePara" type="email" value="${esc(para)}"></label>
        <label class="campo"><span>Asunto</span><input id="eAsunto" value="Presupuesto ${esc(p.numero)} · ${esc(com.nombre)}"></label>
        <label class="campo"><span>Texto</span><textarea id="eTexto" rows="5">Buenos días:\n\nLes adjuntamos el presupuesto ${esc(p.numero)} para ${esc(com.nombre)}.\n\nQuedamos a su disposición para cualquier consulta.\n\nUn saludo,\nDHS Videoporters</textarea></label>
        <p class="vacio">Sale desde Contasimple con el PDF adjunto; las respuestas llegan al Gmail de DHS.</p>
        <p><button class="btn" id="okEnviar">Enviar</button></p>`;
      caja.querySelector("#okEnviar").onclick = async () => {
        const para2 = caja.querySelector("#ePara").value.trim(); if(!para2) return m("Pon el correo de destino.");
        if(!await DHS_PREGUNTA("¿Enviar el presupuesto a " + para2 + "?")) return;
        m("Enviando…");
        try{
          await llamar("enviarPresupuesto", {id:p.csId, numero:p.numero, para:para2, asunto:caja.querySelector("#eAsunto").value, texto:caja.querySelector("#eTexto").value});
          const nuevo = p.estado === "pendiente" ? "enviado" : p.estado;
          await ref.update({estado:nuevo, enviadoA:para2, enviadoEl:new Date().toISOString().slice(0,10), modificado:{por:yo, en:en()}});
          if(nuevo === "enviado") try{ await llamar("estadoPresupuesto", {id:p.csId, estado:"Enviado"}); }catch(e){}
          await reg("enviado a " + para2); Object.assign(p, {estado:nuevo}); detalle(el, comId, com, p, volver);
        }catch(e){ m("No se ha podido: " + (e.message||e)); }
      };
    };
    const bF = el.querySelector("#bFacturar");
    if(bF) bF.onclick = () => {
      const yaFact = (p.facturas||[]).reduce((n,f) => n + (f.base||0), 0), quedaBase = r2(p.totales.base - yaFact);
      caja.classList.remove("oculto");
      caja.innerHTML = `<h4>Facturar ${esc(p.numero)}</h4>
        <p class="vacio">Forma de pago acordada: <b>${esc(p.formaPago || "—")}</b>. ${yaFact ? "Ya facturado: base " + eur(yaFact) + ". Queda: base " + eur(quedaBase) + "." : ""}</p>
        <label class="chk"><input type="radio" name="fq" value="todo" checked> ${yaFact ? "El resto (" + eur(quedaBase) + " + IVA)" : "Todo (" + eur(p.totales.base) + " + IVA)"}</label>
        <label class="chk"><input type="radio" name="fq" value="pct"> Un porcentaje: <input id="fPct" type="number" min="1" max="100" value="50" style="width:70px"> % (entrada)</label>
        <p class="aviso-edicion" style="margin-top:8px">⚠️ Se emitirá una <b>factura real</b> en Contasimple con el siguiente número. Una factura emitida no se puede borrar sin más.</p>
        <p><button class="btn" id="okFact">Emitir factura</button></p>`;
      caja.querySelector("#okFact").onclick = async () => {
        const modo = caja.querySelector('input[name=fq]:checked').value, pct = Math.min(100, Math.max(1, Number(caja.querySelector("#fPct").value)||0));
        let lineasF;
        if(modo === "todo" && !yaFact) lineasF = p.lineas;
        else {
          const base = modo === "todo" ? quedaBase : r2(p.totales.base * pct / 100);
          lineasF = [{concepto:(modo === "todo" ? "Resto" : pct + " % (entrada)") + " del presupuesto " + p.numero + " · " + com.nombre, cantidad:1, precio:base, descuento:0}];
        }
        const totalTxt = eur(r2(lineasF.reduce((n,l) => n + l.cantidad*l.precio*(1-(l.descuento||0)/100), 0) * 1.21));
        if(!await DHS_PREGUNTA("¿Emitir la factura en Contasimple por " + totalTxt + " (IVA incluido)?")) return;
        m("Emitiendo la factura…");
        try{
          const r = await llamar("facturar", {clienteId:p.clienteId, presupuestoId:p.csId, lineas:lineasF, notas:"Presupuesto " + p.numero});
          const facturas = (p.facturas||[]).concat([{csId:r.id, numero:r.numero, periodo:r.periodo, base:r.totales.base, total:r.totales.total, fecha:new Date().toISOString().slice(0,10), cobrada:false}]);
          const baseFact = facturas.reduce((n,f) => n + f.base, 0);
          const nuevo = baseFact >= p.totales.base - 0.01 ? "facturado" : "parcial";
          await ref.update({facturas, estado:nuevo, modificado:{por:yo, en:en()}});
          await reg("factura " + r.numero + " emitida (" + eur(r.totales.total) + ")");
          Object.assign(p, {facturas, estado:nuevo}); detalle(el, comId, com, p, volver);
        }catch(e){ m("No se ha podido: " + (e.message||e)); }
      };
    };
  }

  // ---------- Apartado Presupuestos: todos juntos y los rápidos (particulares que solo dan el teléfono) ----------
  let filtroG = {q:"", f:"todos"};
  async function vistaGeneral(el){
    const {db} = D();
    if(!puedePrecios()){ el.innerHTML = `<div class="panel">Sin permiso.</div>`; return; }
    el.innerHTML = `<div class="panel"><p class="vacio">Cargando…</p></div>`;
    let L = [], C;
    try{ await cargarQuien(); (await db.collection("dhs_presupuestos").get()).forEach(d => L.push({id:d.id, ...d.data()})); C = await window.DHS_COM.datos(); }
    catch(e){ el.innerHTML = `<div class="panel">No se ha podido cargar (${esc(e.code||e.message||e)}).</div>`; return; }
    L.sort((a,b) => (b.numero||"").localeCompare(a.numero||""));
    const nombres = {}; Object.entries(C.coms).forEach(([k,c]) => { let n = (c.nombre || k) + (c.poblacion ? " (" + c.poblacion + ")" : ""); while(nombres[n]) n += " ·"; nombres[n] = k; });
    const F = {
      todos:["Todos", () => true],
      rapidos:["⚡ Rápidos sin asociar", p => !p.comunidadId],
      aceptar:["⏳ Por aceptar", p => ["pendiente","enviado"].includes(p.estado)],
      aceptados:["✅ Aceptados", p => ["aceptado","parcial"].includes(p.estado)],
      cerrados:["Cerrados", p => ["facturado","rechazado"].includes(p.estado)]
    };
    const pinta = () => {
      const q = sinAc(filtroG.q), qd = filtroG.q.replace(/\D/g, "");
      const V = L.filter(F[filtroG.f][1]).filter(p => !q || (qd.length >= 3 && String(p.telefono||"").replace(/\D/g, "").includes(qd)) || sinAc([p.numero, p.nombre, p.telefono, p.direccion, p.poblacion, quien(p.creado), p.comunidadId && C.coms[p.comunidadId] ? C.coms[p.comunidadId].nombre : "", (p.lineas||[]).map(l => l.concepto).join(" ")].join(" ")).includes(q));
      el.querySelector("#listaG").innerHTML = V.map(p => { const e = ESTADOS[p.estado] || ["",p.estado]; return `<a class="fila fila-pres est-p-${esc(p.estado)}" href="#" data-id="${esc(p.id)}">
        <div class="f-nombre">${esc(p.numero)} · ${esc(p.comunidadId && C.coms[p.comunidadId] ? C.coms[p.comunidadId].nombre : (p.nombre || "Particular"))} <span class="vacio">· ${p.fecha ? esc(new Date(p.fecha + "T12:00").toLocaleDateString("es-ES")) : ""}${p.creado ? " · por " + esc(quien(p.creado)) : ""}</span></div>
        <div class="f-sub">${!p.comunidadId ? `⚡ ${p.telefono ? "📞 " + esc(p.telefono) + " · " : ""}` : ""}${esc((p.lineas||[]).map(l => l.concepto).join(", ").slice(0,110))}</div>
        <div class="f-tags"><b>${eur(p.totales && p.totales.total)}</b> <span class="tag est-p-${esc(p.estado)}">${e[0]} ${e[1]}</span></div></a>`; }).join("") || `<p class="vacio">Nada con este filtro.</p>`;
      el.querySelector("#cuentaG").textContent = V.length + " presupuesto" + (V.length === 1 ? "" : "s") + " · " + eur(r2(V.reduce((n,p) => n + ((p.totales && p.totales.total) || 0), 0)));
      el.querySelectorAll("#listaG .fila-pres").forEach(a => a.onclick = ev => {
        ev.preventDefault(); const p = L.find(x => x.id === a.dataset.id);
        const cid = p.comunidadId && C.coms[p.comunidadId] ? p.comunidadId : null;
        detalle(el.querySelector(".panel"), cid, cid ? C.coms[cid] : {nombre:p.nombre || "Particular", telefono:p.telefono || ""}, p, () => vistaGeneral(el));
      });
    };
    el.innerHTML = `<div class="panel">
      <div class="cab-lista"><h2>Presupuestos</h2>
        <span><button class="btn" id="bRapido">⚡ Presupuesto rápido</button> <button class="btn sec" id="bParaCom">+ Para una comunidad o cliente</button></span></div>
      <p class="vacio">«Rápido» es para quien te pide precio por WhatsApp sin dar la dirección: con el teléfono basta (nombre, dirección y población si los da). Si lo acepta, lo asocias a su ficha y sigue como los demás.</p>
      <div id="cajaCom" class="bloque oculto" style="margin:8px 0"><input id="busCom" list="dlComG" placeholder="Escribe la comunidad o el cliente y elígelo…" style="width:100%;max-width:460px"><datalist id="dlComG">${Object.keys(nombres).map(n => `<option value="${esc(n)}">`).join("")}</datalist></div>
      <div class="fi-barra" style="margin-top:8px"><input id="qG" placeholder="Buscar: teléfono, nombre, número, comunidad, producto…" value="${esc(filtroG.q)}" style="flex:1;min-width:200px">
        <span class="chips">${Object.entries(F).map(([k,[t]]) => `<button class="chip ${filtroG.f === k ? "on" : ""}" data-f="${k}">${t} (${L.filter(F[k][1]).length})</button>`).join("")}</span></div>
      <p id="cuentaG" class="vacio" style="font-weight:600"></p>
      <div class="lista" id="listaG"></div></div>`;
    el.querySelector("#qG").oninput = e => { filtroG.q = e.target.value; pinta(); };
    el.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { filtroG.f = b.dataset.f; vistaGeneral(el); });
    el.querySelector("#bRapido").onclick = () => editor(el.querySelector(".panel"), null, {nombre:"", telefono:""}, () => vistaGeneral(el));
    el.querySelector("#bParaCom").onclick = () => { el.querySelector("#cajaCom").classList.toggle("oculto"); el.querySelector("#busCom").focus(); };
    el.querySelector("#busCom").onchange = e => { const k = nombres[e.target.value]; if(!k) return; window.DHS_COM.abrirPestana("presupuestos"); location.hash = "comunidad/" + encodeURIComponent(k); };
    pinta();
  }

  window.DHS_PRES = { llamar, vistaCatalogo, pestana, puedeVerPres, vistaGeneral };
})();
