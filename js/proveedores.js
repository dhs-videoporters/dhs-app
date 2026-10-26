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
  let filtro = {prov:"", ver:"pendientes"}, leyendo = false;

  // Estado real: pagada a mano, o domiciliada con el vencimiento ya pasado
  const pagada = f => f.estado === "pagada" || (f.forma === "domiciliada" && f.vence && f.vence < hoy());

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
    const lista = filtro.ver === "pendientes" ? pend : filtro.ver === "revisar" ? revisar : V;
    lista.sort((a,b) => (a.vence||"9").localeCompare(b.vence||"9") || (b.fecha||"").localeCompare(a.fecha||""));
    const editaPag = S.puede("cobros","editar");
    el.innerHTML = `
      <div class="panel">
        <div class="cab-lista"><h2>Proveedores · facturas de material</h2>
          <select id="fProv"><option value="">Todos los proveedores</option>${provs.map(k => `<option value="${esc(k)}" ${filtro.prov===k?"selected":""}>${esc(nomProv(k))}</option>`).join("")}</select>
          ${editaPag ? `<button class="btn sec" id="bLeer">⟳ Leer facturas nuevas de Drive</button>` : ""}</div>
        <p class="vacio" id="msgProv">Se leen los PDF que llegan al Drive de DHS (Hipersuministros…). Domiciliadas: se dan por pagadas al vencer. Transferencias: márcalas como pagadas.</p>
        <div class="eco-cajas">
          <div class="eco-caja ${vencidas.length ? "c-mal" : "c1"}"><span>Vencidas sin pagar</span><b>${eur(suma(vencidas))}</b><i>${vencidas.length} factura${vencidas.length===1?"":"s"}</i></div>
          <div class="eco-caja c2"><span>Vence en 7 días</span><b>${eur(suma(semana))}</b><i>${semana.length} factura${semana.length===1?"":"s"}${semana.filter(f => f.forma !== "domiciliada").length ? " · " + semana.filter(f => f.forma !== "domiciliada").length + " por transferencia" : ""}</i></div>
          <div class="eco-caja c3"><span>Resto de este mes</span><b>${eur(suma(mes))}</b><i>${mes.length} factura${mes.length===1?"":"s"}</i></div>
        </div>
        ${Object.keys(prev).length ? `<div class="eco-prev"><b>Por pagar:</b> ${Object.keys(prev).sort().map(k => `${esc(nomMes(k))} <b>${eur(prev[k])}</b>`).join(" · ")}</div>` : ""}
        <div class="filtros" style="margin-top:12px">
          ${[["pendientes","Por pagar (" + pend.length + ")"],["todas","Todas (" + V.length + ")"],["revisar","⚠️ Revisar (" + revisar.length + ")"]].map(([k,t]) => `<button class="chip ${filtro.ver===k?"on":""}" data-ver="${k}">${t}</button>`).join("")}
        </div>
        <table class="tabla-fi"><thead><tr><th>Proveedor</th><th>Factura</th><th>Fecha</th><th>Vence</th><th>Importe</th><th>Pago</th><th>Estado</th><th></th></tr></thead><tbody>
          ${lista.map(f => { const pg = pagada(f), venc = !pg && f.vence && f.vence < h;
            return `<tr class="${venc ? "fi-mal" : ""}" data-id="${esc(f.id)}"><td>${esc(f.proveedorNombre || f.proveedor)}</td>
            <td>${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.numero || f.archivoNombre)}</a>` : esc(f.numero)}${f.abono ? ` <span class="tag">abono</span>` : ""}</td>
            <td>${fch(f.fecha)}</td><td>${fch(f.vence)}${(f.vencimientos||[]).length > 1 ? ` <span class="vacio">(+${f.vencimientos.length - 1})</span>` : ""}</td>
            <td><b>${f.total != null ? eur(f.total) : "?"}</b></td><td>${FORMAS[f.forma || ""] || esc(f.forma)}</td>
            <td>${f.revisar ? `<span class="tag aviso" title="${esc(f.revisar)}">⚠️ Revisar</span> ` : ""}${pg ? `<span class="tag est-p-aceptado">✅ Pagada${f.pagadaEl ? " " + fch(f.pagadaEl) : (f.forma === "domiciliada" ? " (domiciliada)" : "")}</span>` : (venc ? `<span class="tag aviso">Vencida</span>` : `<span class="tag est-p-pendiente">⏳ Pendiente</span>`)}</td>
            <td>${editaPag ? `${!pg && f.forma !== "domiciliada" ? `<button class="btn sec bPag">Pagada</button>` : ""} <button class="btn sec bEdit" title="Corregir">✏️</button>` : ""}</td></tr>`; }).join("") || `<tr><td colspan="8" class="vacio">${L.length ? "Nada con este filtro." : "Todavía no hay facturas leídas: pulsa «Leer facturas nuevas de Drive»."}</td></tr>`}
        </tbody></table>
        <div id="cajaProv"></div>
      </div>`;
    const m = t => el.querySelector("#msgProv").textContent = t;
    el.querySelector("#fProv").onchange = e => { filtro.prov = e.target.value; vista(el, false); };
    el.querySelectorAll("[data-ver]").forEach(b => b.onclick = () => { filtro.ver = b.dataset.ver; vista(el, false); });
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
