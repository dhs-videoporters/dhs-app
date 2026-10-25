// DHS App — Número de cuenta de cada comunidad (para cobrar). Va en una colección aparte (dhs_bancos)
// que solo puede leer quien tenga "Cobros" (Dirección: Ángel y Joel). Los técnicos no lo ven nunca.
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  const limpio = s => (s||"").replace(/\s+/g, "").toUpperCase();
  const fmt = s => limpio(s).replace(/(.{4})/g, "$1 ").trim();
  // Comprobación del IBAN español (dígitos de control, módulo 97)
  function valido(iban){
    const s = limpio(iban); if(!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
    const r = (s.slice(4) + s.slice(0,4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55);
    let m = 0; for(const d of r) m = (m * 10 + Number(d)) % 97; return m === 1;
  }
  const puede = () => D().S.puede("cobros","ver");
  const edita = () => D().S.puede("cobros","editar");

  // Bloque en la pestaña Info de la ficha (solo Dirección / Cobros)
  async function bloque(el, comId){
    if(!el) return;
    if(!puede()){ el.remove(); return; }
    const {db, S} = D();
    let b = null; try{ const d = await db.collection("dhs_bancos").doc(comId).get(); if(d.exists) b = d.data(); }catch(e){ el.innerHTML = `<h3>🏦 Cuenta</h3><p class="vacio">No se ha podido leer (${esc(e.code)}).</p>`; return; }
    const pinta = () => {
      el.innerHTML = `<h3>🏦 Número de cuenta <span class="vacio" style="font-weight:400;font-size:12px">(solo Dirección)</span></h3>
        ${b && b.iban ? `<p class="iban">${esc(fmt(b.iban))} ${valido(b.iban) ? "" : `<span class="tag aviso">IBAN no válido</span>`}</p>${b.titular ? `<p class="vacio">Titular: ${esc(b.titular)}</p>` : ""}${b.referencia ? `<p class="vacio">Referencia en el banco: ${esc(b.referencia)}</p>` : ""}${b.notas ? `<p class="vacio">Notas: ${esc(b.notas)}</p>` : ""}<p class="vacio">${b.origen ? "Origen: " + esc(b.origen) : ""}</p>` : `<p class="vacio">Sin número de cuenta.</p>`}
        ${edita() ? `<p style="margin-top:6px"><button class="btn sec mini-btn" id="btnIban">${b && b.iban ? "Cambiar" : "Añadir"}</button></p>
        <div id="fIban" class="oculto"><label class="campo"><span>IBAN</span><input id="inIban" value="${esc(b && b.iban ? fmt(b.iban) : "")}" placeholder="ES00 0000 0000 0000 0000 0000"></label>
          <label class="campo"><span>Titular (si no es la comunidad)</span><input id="inTit" value="${esc(b && b.titular || "")}"></label>
          <button class="btn mini-btn" id="okIban">Guardar</button> <span id="msgIban" class="vacio"></span></div>` : ""}`;
      const bI = el.querySelector("#btnIban"); if(!bI) return;
      bI.onclick = () => el.querySelector("#fIban").classList.toggle("oculto");
      el.querySelector("#okIban").onclick = async () => {
        const iban = limpio(el.querySelector("#inIban").value), m = x => el.querySelector("#msgIban").textContent = x;
        if(iban && !valido(iban)) return m("Ese IBAN no es válido (revisa los dígitos).");
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        try{
          await db.collection("dhs_bancos").doc(comId).set({iban, titular:el.querySelector("#inTit").value.trim(), origen:"a mano", modificado:{por:yo, en}}, {merge:true});
          await db.collection("dhs_registro").add({por:yo, en, accion:"número de cuenta " + (iban ? "cambiado (…" + iban.slice(-4) + ")" : "quitado"), coleccion:"dhs_bancos", docId:comId});
          b = {...(b||{}), iban, titular:el.querySelector("#inTit").value.trim(), origen:"a mano"}; pinta();
        }catch(e){ m("No se ha podido (" + (e.code||e) + ")."); }
      };
    };
    pinta();
  }

  // ---------- Ajustes › Cuentas: Excel de ida y vuelta ----------
  // Descargar: todas las comunidades con NIF, administración, IBAN y titular (y el ID de la app para volver a subirlo).
  // Subir: ese mismo Excel corregido, u otra lista (Excel, CSV o JSON) con columnas tipo Comunidad / NIF o CIF / IBAN.
  // Se une a cada comunidad por ID, código de Contasimple, NIF o, si no, se propone por el nombre (hay que confirmarlo).
  const PAL = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase()
    .replace(/\b(cdad|comunidad|comunitat|propietarios|propietaris|prop|cp|c\.p|de|del|la|el|les|i|y|n|no|num|nº|esc|escala)\b/g," ")
    .replace(/\bavda?\b/g,"avenida").replace(/\bav\b/g,"avenida").replace(/\bctra\b/g,"carretera").replace(/\brda\b/g,"ronda").replace(/\bpz\b|\bpl\b|\bplaca\b/g,"plaza")
    .replace(/\bparquing\b|\bpk\b|\bprk\b/g,"parking").split(/[^a-z0-9]+/).filter(Boolean);
  function parecido(a, b){
    const A = PAL(a), B = PAL(b); if(!A.length || !B.length) return 0;
    const numA = A.filter(x => /\d/.test(x)), numB = B.filter(x => /\d/.test(x));
    if(numA.length && !numA.every(n => numB.includes(n))) return 0;   // los números de la dirección tienen que coincidir
    if(A.includes("parking") !== B.includes("parking")) return 0;     // un parking no es la finca de al lado
    const SA = new Set(A), SB = new Set(B), com = [...SA].filter(x => SB.has(x)).length;
    return com / new Set([...SA, ...SB]).size;
  }
  async function vistaImportar(el){
    const {db, S} = D();
    if(!edita()){ el.innerHTML = `<p class="vacio">Solo Dirección.</p>`; return; }
    el.innerHTML = `<h3>Números de cuenta</h3>
      <p class="vacio" style="margin:4px 0 10px">Descarga el Excel con todas las comunidades, completa o corrige el NIF y el IBAN, y vuelve a subirlo. También sirve cualquier otra lista en Excel, CSV o JSON que tenga columnas como <b>Comunidad</b>, <b>NIF/CIF</b> e <b>IBAN</b>. Antes de guardar se ve todo para revisarlo. Solo lo ve Dirección.</p>
      <p><button class="btn sec" id="bDesc">⬇️ Descargar Excel de comunidades</button> <span id="msgDesc" class="vacio"></span></p>
      <p style="margin-top:10px"><input type="file" id="fCob" accept=".xlsx,.xls,.csv,.json"> <button class="btn" id="bRev" disabled>Revisar</button></p>
      <div id="resCob"></div>`;
    const f = el.querySelector("#fCob"), bR = el.querySelector("#bRev"), res = el.querySelector("#resCob");
    el.querySelector("#bDesc").onclick = async () => {
      const m = el.querySelector("#msgDesc"); m.textContent = "Preparando…";
      try{
        const C = await window.DHS_COM.datos(), B = {};
        (await db.collection("dhs_bancos").get()).forEach(d => B[d.id] = d.data());
        const filas = Object.entries(C.coms).filter(([k,c]) => c.activo !== false).sort((a,b) => (a[1].nombre||"").localeCompare(b[1].nombre||""))
          .map(([k,c]) => ({"Comunidad": c.nombre||"", "Dirección": c.direccion||"", "Población": c.poblacion||"", "Administración": c.adminId && C.admins[c.adminId] ? C.admins[c.adminId].nombre : "",
            "NIF": c.nif||"", "IBAN": B[k] && B[k].iban ? fmt(B[k].iban) : "", "Titular": B[k] && B[k].titular || "", "Ref. banco": B[k] && B[k].referencia || "", "Revisar": "", "Observaciones": B[k] && B[k].notas || "", "ID app": k}));
        await window.DHS_XLS.descargar("DHS comunidades y cuentas " + new Date().toISOString().slice(0,10), filas, "Comunidades");
        await db.collection("dhs_registro").add({por:S.usuario.email.toLowerCase(), en:firebase.firestore.FieldValue.serverTimestamp(), accion:"Excel de comunidades y cuentas descargado", coleccion:"dhs_bancos"});
        m.textContent = "Descargado (" + filas.length + " comunidades).";
      }catch(e){ m.textContent = "No se ha podido: " + (e.message||e.code||e); }
    };
    f.onchange = () => { bR.disabled = !f.files.length; res.innerHTML = ""; };
    bR.onclick = async () => {
      res.innerHTML = `<p class="vacio">Leyendo…</p>`;
      let filas; try{ filas = await window.DHS_XLS.leer(f.files[0]); }catch(e){ res.innerHTML = `<p class="ko">No se puede leer el archivo: ${esc(e.message||e)}</p>`; return; }
      const C = await window.DHS_COM.datos(), B = {};
      try{ (await db.collection("dhs_bancos").get()).forEach(d => B[d.id] = d.data()); }catch(e){}
      const cf = window.DHS_XLS.campo;
      const porCs = {}, porNif = {};
      Object.entries(C.coms).forEach(([k,c]) => { if(c.csId) porCs[String(c.csId)] = k; if(c.nif) porNif[limpio(c.nif)] = k; });
      const lista = Object.entries(C.coms).map(([k,c]) => [k, c.nombre || "", c.direccion || ""]);
      const L = [];
      filas.forEach(r => {
        if(r.tipo && r.tipo !== "cliente") return;              // copia de cobros: solo clientes
        const nombre = String(cf(r, "Comunidad", "nombre", "cliNombre", "cliente") || "").trim();
        const nif = limpio(cf(r, "NIF", "CIF", "nif_cif"));
        const iban = limpio(cf(r, "IBAN", "Cuenta", "Numero de cuenta", "Nº de cuenta"));
        const titular = String(cf(r, "Titular") || "").trim();
        const obs = String(cf(r, "Observaciones", "Notas") || "").trim();
        const revisar = ["true","si","sí","x","1"].includes(String(cf(r, "requiere_revision", "Revisar") || "").trim().toLowerCase());
        const ref = String(cf(r, "Ref. banco", "Referencia banco", "referencia_deudor") || "").trim();
        const idApp = String(cf(r, "ID app", "idApp") || "").trim(), csId = String(cf(r, "csId") || "");
        if(!iban && !nif) return;
        let k = null, como = "";
        if(idApp && C.coms[idApp]){ k = idApp; como = "ID"; }
        else if(csId && porCs[csId]){ k = porCs[csId]; como = "Contasimple"; }
        else if(nif && porNif[nif]){ k = porNif[nif]; como = "NIF"; }
        let sug = null;
        if(!k && nombre){
          let mejor = 0; lista.forEach(([id, n, d]) => { const p = Math.max(parecido(nombre, n), parecido(nombre, d)); if(p > mejor){ mejor = p; sug = id; } });
          if(mejor < 0.5) sug = null;
        }
        const ok = !iban || valido(iban);
        const nifDistinto = k && nif && C.coms[k].nif && limpio(C.coms[k].nif) !== nif;
        const ibanDistinto = k && iban && B[k] && B[k].iban && limpio(B[k].iban) !== iban;
        L.push({nombre, nif, iban, titular, obs, revisar, ref, ok, k, como, sug, nifDistinto, ibanDistinto,
          marcar: !!k && ok && !revisar && !nifDistinto, igual: k && B[k] && limpio(B[k].iban||"") === iban && (!nif || limpio(C.coms[k].nif||"") === nif)});
      });
      const nombres = {}; Object.entries(C.coms).forEach(([k,c]) => { let n = (c.nombre || k) + (c.poblacion ? " (" + c.poblacion + ")" : ""); while(nombres[n]) n += " ·"; nombres[n] = k; });
      const nomDe = k => Object.keys(nombres).find(n => nombres[n] === k) || k;
      const cuenta = x => L.filter(x).length;
      const pinta = () => {
        res.innerHTML = `
          <p style="margin-top:10px"><b>${L.length}</b> filas con NIF o IBAN · unidas: <b>${cuenta(x => x.k)}</b> · propuestas por el nombre (a confirmar): <b>${cuenta(x => !x.k && x.sug)}</b> · sin comunidad en la app: <b>${cuenta(x => !x.k && !x.sug)}</b>${cuenta(x => x.revisar) ? ` · marcadas «revisar»: <b>${cuenta(x => x.revisar)}</b>` : ""}</p>
          <p class="vacio">Las sin comunidad se pueden unir a mano (escribe y elige la comunidad) o crear como comunidad nueva (sale con «faltan datos»). Las que ya están igual no se tocan.</p>
          <p><button class="btn sec mini-btn" id="mSug">Aceptar todas las propuestas por nombre</button> <button class="btn sec mini-btn" id="mNada">Desmarcar todo</button></p>
          <datalist id="dlComs">${Object.keys(nombres).map(n => `<option value="${esc(n)}">`).join("")}</datalist>
          <div style="overflow-x:auto"><table class="tabla-fi tabla-imp"><thead><tr><th></th><th>En el archivo</th><th>NIF</th><th>Cuenta</th><th>Comunidad en la app</th><th>Notas</th></tr></thead><tbody>
          ${L.map((x,i) => `<tr class="${x.igual ? "imp-igual" : ""}" data-i="${i}">
            <td><input type="checkbox" class="cMar" ${x.marcar ? "checked" : ""} ${x.igual ? "disabled" : ""}></td>
            <td>${esc(x.nombre)}</td><td>${esc(x.nif)}${x.nifDistinto ? ` <span class="tag aviso">distinto en la app: ${esc(C.coms[x.k].nif)}</span>` : ""}</td>
            <td>${x.iban ? `…${esc(x.iban.slice(-4))} ${x.ok ? "" : `<span class="tag aviso">no válido</span>`}${x.ibanDistinto ? ` <span class="tag aviso">cambia la que había (…${esc(limpio(B[x.k].iban).slice(-4))})</span>` : ""}` : `<span class="vacio">sin cuenta</span>`}</td>
            <td>${x.k ? `${esc(nomDe(x.k))} <span class="vacio">(por ${x.como})</span>`
              : `<input class="cCom" list="dlComs" placeholder="Escribe la comunidad…" value="${x.sug ? esc(nomDe(x.sug)) : ""}">${x.sug ? ` <span class="vacio">propuesta</span>` : ""}
                 <label class="vacio" style="display:block"><input type="checkbox" class="cNueva"> crear como comunidad nueva</label>`}</td>
            <td>${x.igual ? `<span class="vacio">ya está igual</span>` : ""}${x.revisar ? `<span class="tag aviso">revisar</span> ` : ""}${esc(x.obs)}</td></tr>`).join("")}
          </tbody></table></div>
          <p style="margin-top:10px"><button class="btn" id="bImp">Guardar las marcadas</button> <span id="msgImp" class="vacio"></span></p>`;
        const filaDe = tr => L[tr.dataset.i];
        res.querySelectorAll("tr[data-i]").forEach(tr => {
          const x = filaDe(tr), c = tr.querySelector(".cMar"), inp = tr.querySelector(".cCom"), nu = tr.querySelector(".cNueva");
          c.onchange = () => x.marcar = c.checked;
          if(inp) inp.oninput = () => { x.elegida = nombres[inp.value] || null; if(x.elegida){ x.marcar = c.checked = true; if(nu) nu.checked = false; } };
          if(inp && x.sug) x.elegida = x.sug;
          if(nu) nu.onchange = () => { x.nueva = nu.checked; if(nu.checked){ x.marcar = c.checked = true; if(inp) inp.value = ""; x.elegida = null; } };
        });
        res.querySelector("#mSug").onclick = () => res.querySelectorAll("tr[data-i]").forEach(tr => { const x = filaDe(tr); if(!x.k && x.elegida && x.ok){ x.marcar = true; tr.querySelector(".cMar").checked = true; } });
        res.querySelector("#mNada").onclick = () => { L.forEach(x => x.marcar = false); res.querySelectorAll(".cMar").forEach(c => c.checked = false); };
        res.querySelector("#bImp").onclick = guardar;
      };
      async function guardar(){
        const m = t => res.querySelector("#msgImp").textContent = t;
        const sel = L.filter(x => x.marcar && !x.igual);
        const sinDestino = sel.filter(x => !x.k && !x.elegida && !x.nueva);
        if(sinDestino.length) return m(sinDestino.length + " marcada(s) no tienen comunidad: elige una o marca «crear como comunidad nueva».");
        const malos = sel.filter(x => x.iban && !x.ok);
        if(malos.length && !confirm(malos.length + " cuenta(s) no son válidas. ¿Guardarlas igualmente, marcadas como «IBAN no válido»?")) return;
        if(!sel.length) return m("No hay nada marcado.");
        if(!confirm("Se van a guardar " + sel.length + " filas" + (sel.filter(x => x.nueva).length ? " (" + sel.filter(x => x.nueva).length + " comunidades nuevas)" : "") + ". ¿Continuar?")) return;
        res.querySelector("#bImp").disabled = true; m("Guardando…");
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp(), firma = {por:yo, en};
        const origen = "importado: " + (f.files[0].name || "archivo").slice(0, 60);
        const ops = [];
        let nuevas = 0;
        for(const x of sel){
          let k = x.k || x.elegida;
          if(!k && x.nueva){
            const slug = (x.nombre || "sin-nombre").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50) || "sin-nombre";
            k = "c_" + slug; let n = 2; while(C.coms[k]) k = "c_" + slug + "-" + (n++);
            const com = {nombre:x.nombre, direccion:"", poblacion:"", nif:x.nif || "", adminId:null, activo:true, nueva:true, creadaDesde:"importación de cuentas", modificado:firma};
            C.coms[k] = com; window.DHS_COM.anadir(k, com); nuevas++;
            ops.push([db.collection("dhs_comunidades").doc(k), com, false]);
          } else if(x.nif && !C.coms[k].nif){
            ops.push([db.collection("dhs_comunidades").doc(k), {nif:x.nif, modificado:firma}, true]);
          }
          if(x.iban) ops.push([db.collection("dhs_bancos").doc(k), {iban:x.iban, ...(x.titular ? {titular:x.titular} : {}), ...(x.ref ? {referencia:x.ref} : {}), ...(x.obs ? {notas:x.obs} : {}), origen, modificado:firma}, true]);
        }
        try{
          for(let i = 0; i < ops.length; i += 400){ const b = db.batch(); ops.slice(i, i+400).forEach(([ref, d, merge]) => merge ? b.set(ref, d, {merge:true}) : b.set(ref, d)); await b.commit(); }
          await db.collection("dhs_registro").add({por:yo, en, accion:"cuentas importadas (" + sel.length + " filas, " + nuevas + " comunidades nuevas) desde " + origen, coleccion:"dhs_bancos"});
          window.DHS_COM.recargar && window.DHS_COM.recargar();
          m("Hecho: " + sel.length + " guardadas" + (nuevas ? ", " + nuevas + " comunidades nuevas" : "") + ".");
        }catch(e){ m("No se ha podido (" + (e.code||e.message||e) + ")."); res.querySelector("#bImp").disabled = false; }
      }
      pinta();
    };
  }

  window.DHS_BANCO = { bloque, vistaImportar, valido };
})();
