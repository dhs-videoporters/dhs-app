// DHS App — Proveedores (Ángel 26/10/2026): facturas de material (Hipersuministros…) y cuándo hay que pagarlas.
// Las lee el puente de los PDF que el script «DHS - Facturas a Drive» deja en Drive (dhs_proveedores, id = archivo).
// Domiciliadas: se dan por pagadas solas al llegar el vencimiento. Transferencia: se marca «Pagada» a mano.
// Lo que el puente no entiende sale «⚠️ Revisar» y se corrige a mano. Solo Cobros (Dirección).
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  const eur = n => (Number(n)||0).toLocaleString("es-ES", {style:"currency", currency:"EUR"});
  const r2 = x => Math.round(x * 100) / 100;
  const fch = f => f ? new Date(f + "T12:00").toLocaleDateString("es-ES", {day:"2-digit", month:"2-digit", year:"2-digit"}) : "—";
  const hoy = () => new Date().toISOString().slice(0,10);
  const masDias = (f, n) => { const d = new Date(f + "T12:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
  const FORMAS = {domiciliada:"🏦 Domiciliada", transferencia:"💸 Transferencia", contado:"💶 Contado", "":"—"};
  let filtro = {prov:"", ver:"pendientes", dia:""}, leyendo = false;

  // Estado real: pagada a mano, o domiciliada con el vencimiento ya pasado
  const pagada = f => f.estado === "pagada" || (f.forma === "domiciliada" && f.vence && f.vence < hoy());

  const sinEsp = t => String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const numES = t => Number(String(t).replace(/\./g,"").replace(",","."));
  const isoES = t => { const x = /(\d{2})\/(\d{2})\/(\d{4})/.exec(t||""); return x ? x[3] + "-" + x[2] + "-" + x[1] : ""; };
  let pdfjs = null;
  function cargarPdf(){
    if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if(!pdfjs) pdfjs = new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; ok(window.pdfjsLib); };
      s.onerror = () => { pdfjs = null; ko(new Error("No se ha podido cargar el lector de PDF")); }; document.head.appendChild(s); });
    return pdfjs;
  }
  // Movimientos: [{fecha, concepto, importe}] (importe negativo = pago)
  async function leerBanco(file){
    const movs = [];
    if(/\.pdf$/i.test(file.name)){
      const lib = await cargarPdf(), doc = await lib.getDocument({data: await file.arrayBuffer()}).promise;
      for(let p = 1; p <= doc.numPages; p++){
        const tc = await (await doc.getPage(p)).getTextContent(), filas = {};
        tc.items.forEach(it => { const y = Math.round(it.transform[5]); (filas[y] = filas[y] || []).push(it); });
        Object.keys(filas).map(Number).sort((a,b) => b - a).forEach(y => {
          const t = filas[y].sort((a,b) => a.transform[4] - b.transform[4]).map(i => i.str).join(" ").replace(/\s+/g," ").trim();
          const x = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+\d{2}\/\d{2}\/\d{4}\s+(-?[\d.]+,\d{2})/.exec(t);
          if(x) movs.push({fecha:isoES(x[1]), concepto:x[2], importe:numES(x[3])});
        });
      }
    } else {
      const filas = await window.DHS_XLS.leer(file), cf = window.DHS_XLS.campo;
      filas.forEach(r => { const fe = cf(r, "Fecha", "Fecha operación", "Fecha oper", "F. Operación", "Fecha valor"), co = cf(r, "Concepto", "Descripción", "Movimiento"), im = cf(r, "Importe", "Cantidad");
        if(!fe || im === "") return; const f = /\d{4}-\d{2}-\d{2}/.test(fe) ? String(fe).slice(0,10) : isoES(String(fe));
        const n = typeof im === "number" ? im : numES(String(im).replace(/[^\d,.-]/g,"")); if(f && !isNaN(n)) movs.push({fecha:f, concepto:String(co), importe:n}); });
    }
    if(!movs.length) throw new Error("no he encontrado movimientos (fecha, concepto, importe) en el archivo");
    return movs;
  }
  // Cruce: cada pago al proveedor con su(s) factura(s) por importe exacto y fecha cercana al vencimiento
  function cruzar(el, L, movs, guarda){
    const dias = (a, b) => Math.abs((new Date(a + "T12:00") - new Date(b + "T12:00")) / 86400000);
    const claves = {}; L.forEach(f => { const k = sinEsp(f.proveedorNombre || f.proveedor).replace(/(sl|sa|slu)$/,""); claves[f.proveedor] = [sinEsp(f.proveedor), k].filter(x => x.length >= 4); });
    const usadas = new Set(L.filter(f => f.banco).map(f => f.id)), cruces = [], sinFactura = [];
    const pagos = movs.filter(x => x.importe < 0).sort((a,b) => a.fecha.localeCompare(b.fecha));
    pagos.forEach(mv => {
      const c = sinEsp(mv.concepto), prov = Object.keys(claves).find(k => claves[k].some(x => c.includes(x)));
      if(!prov) return;
      const imp = Math.abs(mv.importe);
      const cand = L.filter(f => f.proveedor === prov && !usadas.has(f.id) && f.total != null && (!f.vence || dias(f.vence, mv.fecha) <= 25));
      let elegidas = null;
      const una = cand.filter(f => Math.abs(f.total - imp) < 0.01).sort((a,b) => dias(a.vence || mv.fecha, mv.fecha) - dias(b.vence || mv.fecha, mv.fecha))[0];
      if(una) elegidas = [una];
      else { // varias facturas en un mismo recibo (como mucho 4)
        const C = cand.slice(0, 14);
        const busca = (i, suma, sel) => { if(Math.abs(suma - imp) < 0.01 && sel.length) return sel; if(i >= C.length || sel.length >= 4 || suma > imp + 0.01) return null;
          return busca(i + 1, suma + C[i].total, sel.concat([C[i]])) || busca(i + 1, suma, sel); };
        elegidas = busca(0, 0, []);
      }
      if(elegidas){ elegidas.forEach(f => usadas.add(f.id)); cruces.push({mv, facturas:elegidas}); }
      else sinFactura.push({mv, prov});
    });
    const h = hoy(), cruzadas = new Set(cruces.flatMap(x => x.facturas.map(f => f.id)));
    const vencidasSin = L.filter(f => !f.banco && !cruzadas.has(f.id) && f.vence && f.vence < h && f.vence >= (pagos[0] ? pagos[0].fecha : h) && f.estado !== "pagada");
    const caja = el.querySelector("#cajaProv");
    caja.innerHTML = `<div class="bloque" style="margin-top:12px"><h3>🏦 Cruce con el banco</h3>
      <p><b>${cruces.length}</b> pagos del banco casan con <b>${cruces.reduce((n,x) => n + x.facturas.length, 0)}</b> facturas.${sinFactura.length ? ` <b>${sinFactura.length}</b> pagos al proveedor sin factura que case.` : ""}${vencidasSin.length ? ` <b class="ko">${vencidasSin.length}</b> facturas vencidas que no aparecen pagadas en el banco.` : ""}</p>
      <table class="tabla-fi"><thead><tr><th>Banco</th><th>Importe</th><th>Factura(s)</th></tr></thead><tbody>
        ${cruces.map(x => `<tr><td>${fch(x.mv.fecha)}</td><td>${eur(x.mv.importe)}</td><td>${x.facturas.map(f => esc(f.numero || f.archivoNombre) + " (" + eur(f.total) + ", vence " + fch(f.vence) + ")").join("<br>")}</td></tr>`).join("")}
        ${sinFactura.map(x => `<tr class="fi-mal"><td>${fch(x.mv.fecha)}</td><td>${eur(x.mv.importe)}</td><td>⚠️ ${esc(x.mv.concepto)}: no encuentro su factura (¿anterior a julio, o falta en Drive?)</td></tr>`).join("")}
      </tbody></table>
      ${vencidasSin.length ? `<h4 style="margin-top:10px">Vencidas que no salen pagadas en el banco</h4><ul>${vencidasSin.map(f => `<li>${esc(f.proveedorNombre || f.proveedor)} · ${esc(f.numero)} · ${eur(f.total)} · vencía ${fch(f.vence)} · ${FORMAS[f.forma||""]||""}</li>`).join("")}</ul>` : ""}
      ${cruces.length ? `<p><button class="btn btn-ok" id="bGuardaCruce">Marcar ${cruces.reduce((n,x) => n + x.facturas.length, 0)} facturas como pagadas</button> <span id="msgCruce" class="vacio"></span></p>` : ""}</div>`;
    const bG = caja.querySelector("#bGuardaCruce");
    if(bG) bG.onclick = async () => { bG.disabled = true; const mc = t => caja.querySelector("#msgCruce").textContent = t;
      try{ let n = 0; for(const x of cruces) for(const f of x.facturas){ await guarda(f.id, {estado:"pagada", pagadaEl:x.mv.fecha, banco:true, bancoImporte:x.mv.importe}, "pagada según el banco " + (f.numero||f.id)); n++; mc("Guardando " + n + "…"); }
        vista(el, false); }catch(e){ mc("No se ha podido guardar (" + (e.code||e) + ")."); bG.disabled = false; } };
    caja.scrollIntoView({behavior:"smooth"});
  }

  async function vista(el, leerNuevas){
    const {db, S} = D();
    if(!S.puede("cobros","ver")){ el.innerHTML = `<div class="panel">Sin permiso.</div>`; return; }
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    let L = [];
    try{ (await db.collection("dhs_proveedores").get()).forEach(d => L.push({id:d.id, ...d.data()})); }
    catch(e){ el.innerHTML = `<div class="panel">No se han podido leer las facturas de proveedores (${esc(e.code||e.message||e)}).${e.code === "permission-denied" ? " Falta publicar la regla de «dhs_proveedores» en Firebase." : ""}</div>`; return; }
    const provs = [...new Set(L.map(f => f.proveedor))].sort();
    const nomProv = k => { const f = L.find(x => x.proveedor === k); return (f && f.proveedorNombre) || k; };
    const V = L.filter(f => !filtro.prov || f.proveedor === filtro.prov);
    const pend = V.filter(f => !pagada(f)), h = hoy(), sem = masDias(h, 7), finMes = h.slice(0,7) + "-31";
    const vencidas = pend.filter(f => f.vence && f.vence < h), semana = pend.filter(f => f.vence >= h && f.vence <= sem), mes = pend.filter(f => f.vence > sem && f.vence <= finMes);
    const revisar = V.filter(f => f.revisar);
    const suma = X => r2(X.reduce((n,f) => n + (Number(f.total)||0), 0));
    const prev = {}; pend.filter(f => f.vence >= h).forEach(f => { const k = f.vence.slice(0,7); prev[k] = r2((prev[k]||0) + (Number(f.total)||0)); });
    const nomMes = k => new Date(k + "-15").toLocaleDateString("es-ES", {month:"long", year:"numeric"});
    let lista = filtro.ver === "pendientes" ? pend : filtro.ver === "revisar" ? revisar : V;
    if(filtro.dia) lista = V.filter(f => f.vence === filtro.dia);
    // Calendario de pagos: lo que se paga cada día (este mes y los dos siguientes)
    const porDia = {}; pend.forEach(f => { if(f.vence >= h) porDia[f.vence] = r2((porDia[f.vence]||0) + (Number(f.total)||0)); });
    const calendario = () => { let out = ""; const d0 = new Date(h.slice(0,7) + "-01T12:00");
      for(let k = 0; k < 3; k++){
        const d = new Date(d0); d.setMonth(d.getMonth() + k); const y = d.getFullYear(), mm = d.getMonth(), dias = new Date(y, mm + 1, 0).getDate(), pri = (new Date(y, mm, 1).getDay() + 6) % 7;
        const clave = n => y + "-" + String(mm + 1).padStart(2,"0") + "-" + String(n).padStart(2,"0");
        let celdas = "", totMes = 0; for(let i = 0; i < pri; i++) celdas += `<div class="cp-d vacia"></div>`;
        for(let n = 1; n <= dias; n++){ const c = clave(n), v = porDia[c]; if(v) totMes += v;
          celdas += `<div class="cp-d${v ? " con" : ""}${c === h ? " hoy" : ""}${filtro.dia === c ? " sel" : ""}" ${v ? `data-dia="${c}" title="Ver las facturas de este día"` : ""}><span>${n}</span>${v ? `<b>${eur(v).replace(/,\d\d\s€/, " €")}</b>` : ""}</div>`; }
        out += `<div class="cp-mes"><h4>${esc(d.toLocaleDateString("es-ES", {month:"long", year:"numeric"}))} · ${eur(r2(totMes))}</h4><div class="cp-cab"><i>L</i><i>M</i><i>X</i><i>J</i><i>V</i><i>S</i><i>D</i></div><div class="cp-grid">${celdas}</div></div>`;
      } return out; };
    lista.sort((a,b) => (a.vence||"9").localeCompare(b.vence||"9") || (b.fecha||"").localeCompare(a.fecha||""));
    const editaPag = S.puede("cobros","editar");
    el.innerHTML = `
      <div class="panel">
        <div class="cab-lista"><h2>Proveedores · facturas de material</h2>
          <select id="fProv"><option value="">Todos los proveedores</option>${provs.map(k => `<option value="${esc(k)}" ${filtro.prov===k?"selected":""}>${esc(nomProv(k))}</option>`).join("")}</select>
          ${editaPag ? `<button class="btn sec" id="bLeer">⟳ Leer facturas nuevas de Drive</button> <button class="btn sec" id="bBanco">🏦 Cruzar con el banco</button><input type="file" id="fBanco" accept=".pdf,.xlsx,.xls,.csv" class="oculto">` : ""}</div>
        <p class="vacio" id="msgProv">Se leen los PDF que llegan al Drive de DHS (Hipersuministros…). Domiciliadas: se dan por pagadas al vencer. Transferencias: márcalas como pagadas.</p>
        <div class="eco-cajas">
          <div class="eco-caja ${vencidas.length ? "c-mal" : "c1"}"><span>Vencidas sin pagar</span><b>${eur(suma(vencidas))}</b><i>${vencidas.length} factura${vencidas.length===1?"":"s"}</i></div>
          <div class="eco-caja c2"><span>Vence en 7 días</span><b>${eur(suma(semana))}</b><i>${semana.length} factura${semana.length===1?"":"s"}${semana.filter(f => f.forma !== "domiciliada").length ? " · " + semana.filter(f => f.forma !== "domiciliada").length + " por transferencia" : ""}</i></div>
          <div class="eco-caja c3"><span>Resto de este mes</span><b>${eur(suma(mes))}</b><i>${mes.length} factura${mes.length===1?"":"s"}</i></div>
        </div>
        ${Object.keys(prev).length ? `<div class="eco-prev"><b>Por pagar:</b> ${Object.keys(prev).sort().map(k => `${esc(nomMes(k))} <b>${eur(prev[k])}</b>`).join(" · ")}</div>` : ""}
        <details class="cal-pagos" ${Object.keys(porDia).length ? "open" : ""}><summary>📅 Calendario de pagos (qué se paga cada día)</summary><div class="cp-meses">${calendario()}</div></details>
        ${filtro.dia ? `<p class="aviso-cal" style="margin-top:10px">Facturas que vencen el ${fch(filtro.dia)} <button class="btn sec" id="bQuitaDia">Ver todas</button></p>` : ""}
        <div class="filtros" style="margin-top:12px">
          ${[["pendientes","Por pagar (" + pend.length + ")"],["todas","Todas (" + V.length + ")"],["revisar","⚠️ Revisar (" + revisar.length + ")"]].map(([k,t]) => `<button class="chip ${filtro.ver===k?"on":""}" data-ver="${k}">${t}</button>`).join("")}
        </div>
        <table class="tabla-fi"><thead><tr><th>Proveedor</th><th>Factura</th><th>Fecha</th><th>Vence</th><th>Importe</th><th>Pago</th><th>Estado</th><th></th></tr></thead><tbody>
          ${lista.map(f => { const pg = pagada(f), venc = !pg && f.vence && f.vence < h;
            return `<tr class="${venc ? "fi-mal" : ""}" data-id="${esc(f.id)}"><td>${esc(f.proveedorNombre || f.proveedor)}</td>
            <td>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.numero || f.archivoNombre)}</a>` : esc(f.numero)}${f.abono ? ` <span class="tag">abono</span>` : ""}</td>
            <td>${fch(f.fecha)}</td><td>${fch(f.vence)}${(f.vencimientos||[]).length > 1 ? ` <span class="vacio">(+${f.vencimientos.length - 1})</span>` : ""}</td>
            <td><b>${f.total != null ? eur(f.total) : "?"}</b></td><td>${FORMAS[f.forma || ""] || esc(f.forma)}</td>
            <td>${f.revisar ? `<span class="tag aviso" title="${esc(f.revisar)}">⚠️ Revisar</span> ` : ""}${pg ? `<span class="tag est-p-aceptado">✅ Pagada${f.pagadaEl ? " " + fch(f.pagadaEl) : (f.forma === "domiciliada" ? " (domiciliada, sin comprobar)" : "")}${f.banco ? " 🏦" : ""}</span>` : (venc ? `<span class="tag aviso">Vencida</span>` : `<span class="tag est-p-pendiente">⏳ Pendiente</span>`)}</td>
            <td>${editaPag ? `${!pg && f.forma !== "domiciliada" ? `<button class="btn sec bPag">Pagada</button>` : ""} <button class="btn sec bEdit" title="Corregir">✏️</button>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="8" class="vacio">${L.length ? "Nada con este filtro." : "Todavía no hay facturas leídas: pulsa «Leer facturas nuevas de Drive»."}</td></tr>`}
        </tbody></table>
        <div id="cajaProv"></div>
      </div>`;
    const m = t => el.querySelector("#msgProv").textContent = t;
    el.querySelector("#fProv").onchange = e => { filtro.prov = e.target.value; vista(el, false); };
    el.querySelectorAll("[data-ver]").forEach(b => b.onclick = () => { filtro.ver = b.dataset.ver; filtro.dia = ""; vista(el, false); });
    el.querySelectorAll("[data-dia]").forEach(c => c.onclick = () => { filtro.dia = filtro.dia === c.dataset.dia ? "" : c.dataset.dia; vista(el, false); });
    const bQd = el.querySelector("#bQuitaDia"); if(bQd) bQd.onclick = () => { filtro.dia = ""; vista(el, false); };
    // Cruzar con el extracto del banco (PDF, Excel o CSV): los adeudos de cada proveedor marcan sus facturas como pagadas
    const bB = el.querySelector("#bBanco"), fB = el.querySelector("#fBanco");
    if(bB){ bB.onclick = () => fB.click();
      fB.onchange = async () => { const file = fB.files[0]; fB.value = ""; if(!file) return;
        m("Leyendo el extracto del banco…");
        try{ const movs = await leerBanco(file); cruzar(el, L, movs, guarda); }
        catch(e){ m("No se ha podido leer el extracto: " + (e.message||e)); }
      };
    }
    const yo = S.usuario.email.toLowerCase(), en = () => firebase.firestore.FieldValue.serverTimestamp();
    const guarda = async (id, cambio, accion) => {
      await db.collection("dhs_proveedores").doc(id).set({...cambio, modificado:{por:yo, en:en()}}, {merge:true});
      await db.collection("dhs_registro").add({por:yo, en:en(), accion:"proveedores: " + accion, coleccion:"dhs_proveedores", docId:id});
    };
    el.querySelectorAll(".bPag").forEach(b => b.onclick = async () => {
      const f = L.find(x => x.id === b.closest("tr").dataset.id);
      if(!await DHS_PREGUNTA("¿Marcar como pagada la factura " + (f.numero||"") + " de " + (f.proveedorNombre||f.proveedor) + " (" + eur(f.total) + ")?", "Sí, pagada", "No")) return;
      try{ await guarda(f.id, {estado:"pagada", pagadaEl:hoy()}, "pagada " + (f.numero||f.id)); vista(el, false); }catch(e){ m("No se ha podido guardar (" + (e.code||e) + ")."); }
    });
    el.querySelectorAll(".bEdit").forEach(b => b.onclick = () => {
      const f = L.find(x => x.id === b.closest("tr").dataset.id), caja = el.querySelector("#cajaProv");
      caja.innerHTML = `<form class="bloque" id="fEd" style="margin-top:12px"><h3>Corregir ${esc(f.numero || f.archivoNombre)}</h3>
        ${f.revisar ? `<p class="aviso-cal">No se ha podido leer: ${esc(f.revisar)}. Míralo en el PDF y complétalo.</p>` : ""}
        <div class="fila-form">
          <label class="campo"><span>Proveedor</span><input name="proveedorNombre" value="${esc(f.proveedorNombre||f.proveedor)}"></label>
          <label class="campo"><span>Número</span><input name="numero" value="${esc(f.numero)}"></label>
          <label class="campo"><span>Fecha</span><input name="fecha" type="date" value="${esc(f.fecha)}"></label>
          <label class="campo"><span>Vence</span><input name="vence" type="date" value="${esc(f.vence)}"></label>
          <label class="campo"><span>Importe total (IVA incl.)</span><input name="total" type="number" step="0.01" value="${f.total ?? ""}"></label>
          <label class="campo"><span>Pago</span><select name="forma">${Object.entries(FORMAS).filter(([k]) => k).map(([k,t]) => `<option value="${k}" ${f.forma===k?"selected":""}>${t}</option>`).join("")}</select></label>
          <label class="campo"><span>Estado</span><select name="estado"><option value="pendiente" ${f.estado!=="pagada"?"selected":""}>Pendiente</option><option value="pagada" ${f.estado==="pagada"?"selected":""}>Pagada</option></select></label>
        </div>
        <p><button class="btn" type="submit">Guardar</button> <button class="btn sec" type="button" id="bCanEd">Cancelar</button></p></form>`;
      const fe = caja.querySelector("#fEd");
      caja.querySelector("#bCanEd").onclick = () => caja.innerHTML = "";
      fe.onsubmit = async ev => { ev.preventDefault();
        const g = k => fe[k].value;
        const c = {proveedorNombre:g("proveedorNombre"), numero:g("numero"), fecha:g("fecha"), vence:g("vence"), total:g("total") === "" ? null : r2(Number(g("total"))), forma:g("forma"), estado:g("estado"), revisar:""};
        if(c.estado === "pagada" && f.estado !== "pagada") c.pagadaEl = hoy();
        if(c.vence !== f.vence) c.vencimientos = [{fecha:c.vence, importe:c.total}];
        try{ await guarda(f.id, c, "corregida " + (c.numero||f.id)); vista(el, false); }catch(e){ m("No se ha podido guardar (" + (e.code||e) + ")."); }
      };
      fe.scrollIntoView({behavior:"smooth"});
    });
    const bL = el.querySelector("#bLeer");
    const leer = async () => {
      if(leyendo) return; leyendo = true; if(bL) bL.disabled = true;
      let total = 0;
      try{
        for(let i = 0; i < 20; i++){
          m("Leyendo facturas nuevas de Drive… " + (total ? total + " leídas" : ""));
          const r = await window.DHS_PRES.llamar("leerProveedores", {});
          total += r.leidas;
          if(!r.quedan || !r.leidas) break;
        }
        leyendo = false;
        if(total) vista(el, false); else m("No hay facturas nuevas en Drive.");
      }catch(e){ leyendo = false; if(bL) bL.disabled = false; m("No se han podido leer: " + (e.message||e)); }
    };
    if(bL) bL.onclick = leer;
    if(leerNuevas !== false && editaPag && !leyendo) leer();
  }
  window.DHS_PROV = { vista };
})();
