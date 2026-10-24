// DHS App — Administradores de fincas: lista, ficha con personas de contacto y edición.
// Solo Ángel y Joel pueden crear o modificar (las reglas de Firestore lo imponen igual).
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const sinAc = s => (s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  const slug = s => sinAc(s).replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50);
  const D = () => window.DHS;
  const puedeEditar = () => D().S.direccion === true;
  let texto = "";

  const tel = t => t ? `<a href="tel:${esc(t.replace(/\s/g,""))}">${esc(t)}</a>` : "";
  const mail = m => m ? `<a href="mailto:${esc(m)}">${esc(m)}</a>` : "";

  // ---------- LISTA ----------
  async function lista(el){
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    let C; try{ C = await window.DHS_COM.datos(); }catch(e){ el.innerHTML = `<div class="panel">No se han podido leer los datos (${esc(e.code)}).</div>`; return; }
    const nComs = {}; Object.values(C.coms).forEach(c => { if(c.adminId) nComs[c.adminId] = (nComs[c.adminId]||0) + 1; });
    el.innerHTML = `
      <div class="panel">
        <div class="cab-lista">
          <h2>Administradores</h2>
          <input id="buscaAdm" class="busca" placeholder="Buscar administración, persona, correo o teléfono…" value="${esc(texto)}">
          ${puedeEditar() ? `<button class="btn" id="btnNuevo">+ Nueva administración</button>` : ""}
        </div>
        <div id="cuentaAdm" class="vacio" style="margin-top:8px"></div>
        <div id="listaAdm" class="lista"></div>
      </div>`;
    const pintar = () => {
      const q = sinAc(texto);
      const filas = Object.entries(C.admins).filter(([id,a]) => a.activo !== false &&
          (!q || sinAc([a.nombre, ...(a.alias||[]), ...(a.emails||[]), a.telefono, ...(a.personas||[]).map(p => [p.nombre,p.telefono,p.movil,p.email].join(" "))].join(" ")).includes(q)))
        .sort((a,b) => a[1].nombre.localeCompare(b[1].nombre));
      el.querySelector("#cuentaAdm").textContent = filas.length + (filas.length === 1 ? " administración" : " administraciones");
      el.querySelector("#listaAdm").innerHTML = filas.map(([id,a]) => {
        const sinMail = !(a.emails||[]).length;
        return `<a class="fila" href="#administrador/${encodeURIComponent(id)}">
          <div class="f-nombre">${esc(a.nombre)}</div>
          <div class="f-sub">${esc([(a.emails||[])[0], a.telefono, (a.personas||[]).length ? (a.personas.length + (a.personas.length===1?" persona":" personas")) : ""].filter(Boolean).join(" · ")) || "Sin datos de contacto"}</div>
          <div class="f-tags"><span class="tag gris">${nComs[id]||0} comunidades</span>${sinMail ? `<span class="tag aviso">Sin correo</span>` : ""}</div>
        </a>`; }).join("") || `<p class="vacio">No hay resultados.</p>`;
    };
    el.querySelector("#buscaAdm").oninput = e => { texto = e.target.value; pintar(); };
    if(puedeEditar()) el.querySelector("#btnNuevo").onclick = () => editar(el, null, {nombre:"", alias:[], emails:[], telefono:"", web:"", direccion:"", notas:"", personas:[], activo:true});
    pintar();
  }

  // ---------- FICHA ----------
  async function ficha(el, id){
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    let C; try{ C = await window.DHS_COM.datos(); }catch(e){ el.innerHTML = `<div class="panel">No se han podido leer los datos (${esc(e.code)}).</div>`; return; }
    const a = C.admins[id];
    if(!a){ el.innerHTML = `<div class="panel">No existe esta administración. <a href="#administradores">Volver</a></div>`; return; }
    const coms = Object.entries(C.coms).filter(([k,c]) => c.adminId === id && c.activo !== false).sort((x,y)=>x[1].nombre.localeCompare(y[1].nombre));
    const personas = a.personas || [];
    el.innerHTML = `
      <a href="#administradores" class="volver">‹ Administradores</a>
      <div class="panel cab-ficha">
        <div class="ico-ficha">👥</div>
        <div class="cab-txt"><h1>${esc(a.nombre)}</h1>
          <div class="vacio">${(a.alias||[]).length ? "También escrito como: "+esc(a.alias.join(", ")) : ""}</div></div>
        <div class="cifras"><div class="cifra"><b>${coms.length}</b><span>comunidades</span></div><div class="cifra"><b>${personas.length}</b><span>personas</span></div></div>
      </div>
      <div class="panel" style="margin-top:14px">
        <div class="rejilla">
          <div class="bloque"><h3>Datos de la administración</h3>
            <div class="dato"><span>Correo</span><b>${(a.emails||[]).map(mail).join("<br>") || "—"}</b></div>
            <div class="dato"><span>Teléfono</span><b>${tel(a.telefono) || "—"}</b></div>
            <div class="dato"><span>Web</span><b>${a.web ? `<a href="${esc(/^https?:/.test(a.web)?a.web:"https://"+a.web)}" target="_blank" rel="noopener">${esc(a.web)}</a>` : "—"}</b></div>
            <div class="dato"><span>Dirección</span><b>${esc(a.direccion) || "—"}</b></div>
            <p style="white-space:pre-wrap;margin-top:8px">${esc(a.notas) || '<span class="vacio">Sin notas.</span>'}</p>
          </div>
          <div class="bloque"><h3>Personas de contacto</h3>
            ${personas.length ? personas.map(p => `
              <div class="persona">
                <b>${esc(p.nombre) || "—"}</b>${p.cargo ? ` <span class="vacio">· ${esc(p.cargo)}</span>` : ""}
                <div class="p-datos">${[tel(p.telefono), tel(p.movil), mail(p.email)].filter(Boolean).join(" · ") || '<span class="vacio">Sin datos</span>'}</div>
                ${p.nota ? `<div class="vacio">${esc(p.nota)}</div>` : ""}
              </div>`).join("") : `<p class="vacio">Todavía no hay personas de contacto.</p>`}
          </div>
          <div class="bloque"><h3>Comunidades que lleva</h3>
            ${coms.length ? coms.map(([k,c]) => `<div class="dato"><a href="#comunidad/${encodeURIComponent(k)}">${esc(c.nombre)}</a><span>${esc(c.poblacion||"")}</span></div>`).join("") : `<p class="vacio">Ninguna asignada todavía. Se asignan desde la ficha de cada comunidad.</p>`}
          </div>
        </div>
        ${puedeEditar() ? `<p style="margin-top:14px"><button class="btn" id="btnEditar">Editar administración</button></p>` : `<p class="vacio" style="margin-top:14px">Solo Ángel y Joel pueden modificar esta ficha.</p>`}
      </div>`;
    if(puedeEditar()) el.querySelector("#btnEditar").onclick = () => editar(el, id, a);
  }

  // ---------- EDICIÓN / ALTA ----------
  function editar(el, id, a){
    const inp = (n, l, v, t="text", ph="") => `<label class="campo"><span>${l}</span><input name="${n}" type="${t}" value="${esc(v ?? "")}" placeholder="${esc(ph)}"></label>`;
    const filaPersona = (p={}) => `
      <div class="persona-edit">
        <div class="rejilla-p">
          <input data-k="nombre" placeholder="Nombre" value="${esc(p.nombre||"")}">
          <input data-k="cargo" placeholder="Cargo (gestora, contable…)" value="${esc(p.cargo||"")}">
          <input data-k="telefono" type="tel" placeholder="Teléfono" value="${esc(p.telefono||"")}">
          <input data-k="movil" type="tel" placeholder="Móvil" value="${esc(p.movil||"")}">
          <input data-k="email" type="email" placeholder="Correo" value="${esc(p.email||"")}">
          <input data-k="nota" placeholder="Nota (horario, qué lleva…)" value="${esc(p.nota||"")}">
        </div>
        <button type="button" class="btn sec quitar">Quitar</button>
      </div>`;
    el.innerHTML = `
      ${id ? `<a href="#administrador/${encodeURIComponent(id)}" class="volver">‹ Volver a la ficha</a>` : `<a href="#administradores" class="volver">‹ Administradores</a>`}
      <form id="fAdm" class="panel form">
        <h2>${id ? "Editar " + esc(a.nombre) : "Nueva administración"}</h2>
        <div class="rejilla" style="margin-top:10px">
          <div class="bloque"><h3>Datos</h3>
            ${inp("nombre","Nombre *",a.nombre)}
            ${inp("emails","Correos (separados por coma)",(a.emails||[]).join(", "),"text","info@administracion.es")}
            ${inp("telefono","Teléfono",a.telefono,"tel")}
            ${inp("web","Web",a.web)}
            ${inp("direccion","Dirección",a.direccion)}
            ${inp("alias","Otros nombres con que aparece (separados por coma)",(a.alias||[]).join(", "))}
            <label class="campo"><span>Notas</span><textarea name="notas" rows="4">${esc(a.notas)}</textarea></label>
          </div>
          <div class="bloque" style="grid-column:span 2"><h3>Personas de contacto</h3>
            <div id="personas">${(a.personas||[]).map(filaPersona).join("")}</div>
            <button type="button" class="btn sec" id="addPersona">+ Añadir persona</button>
          </div>
        </div>
        <p style="margin-top:12px"><button class="btn" type="submit">Guardar</button>
          ${id ? `<button class="btn sec" type="button" id="btnBaja" style="float:right">Dar de baja</button>` : ""}
          <span id="msgAdm" class="vacio"></span></p>
      </form>`;
    const caja = el.querySelector("#personas");
    const enlazarQuitar = () => caja.querySelectorAll(".quitar").forEach(b => b.onclick = () => b.closest(".persona-edit").remove());
    el.querySelector("#addPersona").onclick = () => { caja.insertAdjacentHTML("beforeend", filaPersona()); enlazarQuitar(); caja.lastElementChild.querySelector("input").focus(); };
    enlazarQuitar();
    const msg = t => el.querySelector("#msgAdm").textContent = t;

    const guardar = async (datos, accion) => {
      const {db, S} = D(), email = S.usuario.email.toLowerCase();
      const firma = {por:email, en:firebase.firestore.FieldValue.serverTimestamp()};
      let docId = id;
      if(!docId){
        docId = "a_" + slug(datos.nombre);
        if((await db.collection("dhs_admins").doc(docId).get()).exists){ msg("Ya existe una administración con ese nombre."); return false; }
        datos.creado = firma; datos.activo = true;
      }
      datos.modificado = firma;
      msg("Guardando…");
      try{
        await db.collection("dhs_admins").doc(docId).set(datos, {merge:true});
        await db.collection("dhs_registro").add({por:email, en:firma.en, accion, coleccion:"dhs_admins", docId, campos:Object.keys(datos)});
        await window.DHS_COM.recargar();
        location.hash = accion === "baja" ? "administradores" : "administrador/" + encodeURIComponent(docId);
        if(accion !== "baja" && id) ficha(document.getElementById("contenido"), docId);
        return true;
      }catch(e){ msg("No se ha podido guardar (" + (e.code||e) + ")."); return false; }
    };

    el.querySelector("#fAdm").onsubmit = async ev => {
      ev.preventDefault();
      const f = Object.fromEntries(new FormData(ev.target).entries());
      const nombre = (f.nombre||"").trim();
      if(!nombre){ msg("Pon el nombre de la administración."); return; }
      const lista = t => (t||"").split(/[,;]+/).map(x => x.trim()).filter(Boolean);
      const emails = lista(f.emails).map(x => x.toLowerCase());
      const malo = emails.find(m => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m));
      if(malo){ msg("Revisa el correo: «" + malo + "» no es válido."); return; }
      const personas = [...caja.querySelectorAll(".persona-edit")].map(div => {
        const p = {}; div.querySelectorAll("input").forEach(i => p[i.dataset.k] = i.value.trim()); return p;
      }).filter(p => Object.values(p).some(Boolean));
      await guardar({nombre, emails, telefono:f.telefono.trim(), web:f.web.trim(), direccion:f.direccion.trim(), alias:lista(f.alias), notas:f.notas, personas}, id ? "cambio" : "alta");
    };
    if(id) el.querySelector("#btnBaja").onclick = async () => {
      if(!confirm("¿Dar de baja " + a.nombre + "? No se borra: deja de salir en la lista y en los desplegables.")) return;
      await guardar({activo:false}, "baja");
    };
  }

  window.DHS_ADM = { lista, ficha };
})();
