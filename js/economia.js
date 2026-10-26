// DHS App — Economía (fase 7, primera parte). Solo quien tenga "Cobros" (Dirección: Ángel y Joel).
//   1) Aceptado, pendiente de hacer: presupuestos aceptados aún no facturados del todo (dinero que va a entrar).
//   2) Hecho, pendiente de cobrar: facturas emitidas sin cobrar. Manda la app de cobros; si una factura no está allí, Contasimple.
//   3) Cobrado: lo cobrado en el mes elegido.
// Las facturas se leen a través del puente (solo lectura).
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  const eur = n => (Number(n)||0).toLocaleString("es-ES", {style:"currency", currency:"EUR"});
  const r2 = x => Math.round(x * 100) / 100;
  const fch = f => f ? new Date(f + "T12:00").toLocaleDateString("es-ES", {day:"2-digit", month:"2-digit", year:"2-digit"}) : "";
  const dias = f => f ? Math.floor((Date.now() - new Date(f + "T12:00")) / 86400000) : null;

  // Facturas (cacheadas 5 minutos para no pedirlas a cada paso)
  let FACT = null, FACT_EN = 0;
  async function facturas(forzar){
    if(!FACT || forzar || Date.now() - FACT_EN > 300000){ FACT = await window.DHS_PRES.llamar("facturas", {}); FACT_EN = Date.now(); }
    return FACT;
  }

  let mes = new Date().toISOString().slice(0,7), adminF = "";
  async function vista(el, forzar){
    const {db, S} = D();
    if(!S.puede("cobros","ver")){ el.innerHTML = `<div class="panel">Sin permiso.</div>`; return; }
    el.innerHTML = `<div class="panel">Cargando (Contasimple y cobros)…</div>`;
    let F, P = [], T = {}, C, PROV = [];
    try{
      [F, C] = await Promise.all([facturas(forzar), window.DHS_COM.datos()]);
      (await db.collection("dhs_presupuestos").get()).forEach(d => P.push({id:d.id, ...d.data()}));
      (await db.collection("dhs_trabajos").get()).forEach(d => T[d.id] = d.data());
      try{ const hh = new Date().toISOString().slice(0,10); (await db.collection("dhs_proveedores").get()).forEach(d => { const f = d.data();
        if(f.estado !== "pagada" && !(f.forma === "domiciliada" && f.vence && f.vence < hh)) PROV.push(f); }); }catch(e){ PROV = null; }
    }catch(e){ el.innerHTML = `<div class="panel">No se ha podido cargar: ${esc(e.message||e.code||e)}</div>`; return; }
    // Cliente de Contasimple → comunidad de la app
    const porCs = {}; Object.entries(C.coms).forEach(([k,c]) => { if(c.csId) porCs[String(c.csId)] = k; });
    const comDe = clienteId => porCs[String(clienteId)] ? C.coms[porCs[String(clienteId)]] : null;
    const adminDe = c => c && c.adminId && C.admins[c.adminId] ? C.admins[c.adminId].nombre : "";
    const pasaAdmin = c => !adminF || (adminF === "-" ? !(c && c.adminId) : (c && c.adminId === adminF));

    // 1) Aceptado, pendiente de hacer
    const acept = P.filter(p => ["aceptado","parcial"].includes(p.estado)).map(p => {
      const fact = (p.facturas||[]).reduce((n,f) => n + (f.total||0), 0);
      const t = p.intervencionId ? T[p.intervencionId] : null, cita = t && (t.citas||[])[0];
      const pag = r2((p.pagosRecibidos||[]).reduce((n,x) => n + (Number(x.importe)||0), 0));
      return {...p, pendienteFacturar:r2((p.totales.total||0) - fact), pagado:pag, falta:r2(Math.max(0, (p.totales.total||0) - Math.max(pag, fact))), com:C.coms[p.comunidadId], cita:cita ? cita.fecha : null, hecho: t && ["hecho","facturado","cobrado"].includes(t.estado)};
    }).filter(p => p.falta > 0.01 && pasaAdmin(p.com));
    // Anticipos: pagos apuntados en presupuestos que aún no tienen factura (cuando se facture, el cobro ya lo trae la app de cobros y no se cuenta dos veces)
    const anticipos = []; P.filter(p => (p.pagosRecibidos||[]).length && !(p.facturas||[]).length).forEach(p => { const com = C.coms[p.comunidadId]; if(!pasaAdmin(com)) return;
      p.pagosRecibidos.forEach(x => anticipos.push({fecha:x.fecha, importe:Number(x.importe)||0, numero:p.numero, forma:x.forma, cliente:p.nombre, com, anticipo:true})); });
    const antTotal = r2(anticipos.reduce((n,x) => n + x.importe, 0));
    // 2) Pendiente de cobrar
    const pend = F.filter(f => f.estado !== "Payed" && !f.rectificativa && (f.pendiente||0) > 0.01).map(f => ({...f, com:comDe(f.clienteId)})).filter(f => pasaAdmin(f.com))
      .sort((a,b) => (a.fecha||"").localeCompare(b.fecha||""));
    // 3) Cobrado en el mes
    const cobr = []; F.forEach(f => (f.pagos||[]).forEach(p => { if((p.fecha||"").slice(0,7) === mes){ const com = comDe(f.clienteId); if(pasaAdmin(com)) cobr.push({...p, numero:f.numero, cliente:f.cliente, com}); } }));
    anticipos.filter(x => (x.fecha||"").slice(0,7) === mes).forEach(x => cobr.push(x));
    cobr.sort((a,b) => (b.fecha||"").localeCompare(a.fecha||""));
    const nSin = pend.filter(f => f.sinCobros).length, tSin = r2(pend.filter(f => f.sinCobros).reduce((n,f) => n + (f.pendiente||0), 0));
    const tBanco = r2(F.filter(f => !f.rectificativa && pasaAdmin(comDe(f.clienteId))).reduce((n,f) => n + (f.importeBanco||0), 0));
    const suma = (L, k) => r2(L.reduce((n,x) => n + (Number(x[k])||0), 0));
    // Previsión por meses de lo aceptado (según la fecha de su intervención)
    const prev = {}; acept.forEach(p => { const k = p.cita ? p.cita.slice(0,7) : "sin fecha"; prev[k] = r2((prev[k]||0) + p.falta); });
    const nomMes = k => k === "sin fecha" ? "Sin programar" : new Date(k + "-15").toLocaleDateString("es-ES", {month:"long", year:"numeric"});

    el.innerHTML = `
      <div class="panel">
        <div class="cab-lista"><h2>Economía</h2>
          <select id="fAdm"><option value="">Todas las administraciones</option>${Object.entries(C.admins).sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre)).map(([k,a]) => `<option value="${esc(k)}" ${adminF===k?"selected":""}>${esc(a.nombre)}</option>`).join("")}<option value="-" ${adminF==="-"?"selected":""}>Sin administración</option></select>
          <button class="btn sec" id="btnRec">⟳ Actualizar</button></div>
        <p class="vacio">Pendiente de cobrar con el mismo criterio que la app de cobros (pendientes, devueltas y en la hoja del viernes; lo cargado en el banco no cuenta).${nSin ? ` Incluye ${nSin} factura${nSin===1?"":"s"} nueva${nSin===1?"":"s"} que aún no ha${nSin===1?"":"n"} pasado a cobros (${eur(tSin)}).` : ""}${tBanco ? ` En el banco, pendiente de confirmar: ${eur(tBanco)}.` : ""}</p>
        <div class="eco-cajas">
          <a class="eco-caja c1" href="#" data-ir="acept"><span>Aceptado, pendiente de cobrar</span><b>${eur(suma(acept,"falta"))}</b><i>${acept.length} presupuesto${acept.length===1?"":"s"}${antTotal ? " · ya cobrado de anticipo " + eur(antTotal) : ""}</i></a>
          <a class="eco-caja c2" href="#" data-ir="pend"><span>Hecho, pendiente de cobrar</span><b>${eur(suma(pend,"pendiente"))}</b><i>${pend.length} factura${pend.length===1?"":"s"}</i></a>
          <a class="eco-caja c3" href="#" data-ir="cobr"><span>Cobrado en <input type="month" id="mesC" value="${mes}"></span><b>${eur(suma(cobr,"importe"))}</b><i>${cobr.length} cobro${cobr.length===1?"":"s"}</i></a>
        </div>
        ${PROV ? (() => { const porPagar = r2(PROV.reduce((n,f) => n + (Number(f.total)||0), 0)), porCobrar = r2(suma(acept,"falta") + suma(pend,"pendiente"));
          return `<div class="eco-balance"><div><span>Por cobrar (aceptado + facturado)</span><b>${eur(porCobrar)}</b></div><div class="menos"><span>Por pagar a proveedores</span><b>− ${eur(porPagar)}</b><a href="#proveedores">ver</a></div><div class="${porCobrar - porPagar >= 0 ? "ok" : "mal"}"><span>Queda</span><b>${eur(r2(porCobrar - porPagar))}</b></div></div>`; })() : ""}
        ${Object.keys(prev).length ? `<div class="eco-prev"><b>Previsión de lo aceptado:</b> ${Object.keys(prev).sort().map(k => `${esc(nomMes(k))} <b>${eur(prev[k])}</b>`).join(" · ")}</div>` : ""}

        <h3 id="acept" style="margin-top:16px">✅ Aceptado, pendiente de hacer</h3>
        <table class="tabla-fi"><thead><tr><th>Comunidad</th><th>Presupuesto</th><th>Aceptado</th><th>Forma de pago</th><th>Intervención</th><th>Total</th><th>Anticipo cobrado</th><th>Falta por cobrar</th></tr></thead><tbody>
          ${acept.map(p => `<tr><td><a href="#comunidad/${encodeURIComponent(p.comunidadId)}">${esc(p.nombre)}</a></td><td>${esc(p.numero)}${p.estado === "parcial" ? ` <span class="tag">entrada facturada</span>` : ""}</td><td>${fch(p.aceptadoEl)}</td><td>${esc(p.formaPago||"")}</td>
            <td>${p.intervencionId ? (p.hecho ? "✅ hecha" : (p.cita ? "📅 " + fch(p.cita) : "sin fecha")) : `<span class="tag aviso">sin programar</span>`}</td><td>${eur(p.totales.total)}</td><td>${p.pagado ? `<span class="tag est-p-aceptado">💶 ${eur(p.pagado)}</span>` : `<span class="vacio">—</span>`}</td><td><b>${eur(p.falta)}</b></td></tr>`).join("") || `<tr><td colspan="8" class="vacio">Nada.</td></tr>`}
        </tbody></table>

        <h3 id="pend" style="margin-top:16px">🧾 Hecho, pendiente de cobrar</h3>
        <table class="tabla-fi"><thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Administración</th><th>Pendiente</th><th></th></tr></thead><tbody>
          ${pend.map(f => `<tr class="${dias(f.fecha) > 60 ? "fi-mal" : ""}"><td>${esc(f.numero)}${f.manual ? ` <span class="tag gris">manual</span>` : ""}</td><td>${fch(f.fecha)} <span class="vacio">(${dias(f.fecha)} d)</span></td>
            <td>${f.com ? `<a href="#comunidad/${encodeURIComponent(porCs[String(f.clienteId)])}">${esc(f.com.nombre)}</a>` : esc(f.cliente)}</td><td>${esc(adminDe(f.com))}</td>
            <td><b>${eur(f.pendiente)}</b>${f.estado === "Incomplete" ? ` <span class="vacio">de ${eur(f.total)}</span>` : ""}</td>
            <td>${f.devuelto ? `<span class="tag aviso">devuelto</span>` : ""}${f.enHoja ? `<span class="tag azul">en la hoja del viernes</span>` : ""}${f.enBanco ? `<span class="tag azul">${eur(f.importeBanco)} en el banco</span>` : ""}${f.sinCobros ? `<span class="tag gris">aún no está en cobros</span>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="vacio">Nada pendiente.</td></tr>`}
        </tbody></table>

        <h3 id="cobr" style="margin-top:16px">💶 Cobrado en ${esc(nomMes(mes))}</h3>
        <table class="tabla-fi"><thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Importe</th></tr></thead><tbody>
          ${cobr.map(c => `<tr><td>${fch(c.fecha)}</td><td>${esc(c.numero)}${c.anticipo ? ` <span class="tag est-p-aceptado">anticipo${c.forma ? " · " + esc(c.forma) : ""}</span>` : ""}</td><td>${esc(c.com ? c.com.nombre : c.cliente)}</td><td>${eur(c.importe)}</td></tr>`).join("") || `<tr><td colspan="4" class="vacio">Nada.</td></tr>`}
        </tbody></table>
        <div id="ecoCam"></div>
      </div>`;
    if(window.DHS_CAMS) window.DHS_CAMS.resumen(el.querySelector("#ecoCam"));
    el.querySelector("#fAdm").onchange = e => { adminF = e.target.value; vista(el); };
    el.querySelector("#btnRec").onclick = () => vista(el, true);
    const mC = el.querySelector("#mesC"); mC.onclick = e => e.stopPropagation(); mC.onchange = e => { mes = e.target.value || mes; vista(el); };
    el.querySelectorAll("[data-ir]").forEach(a => a.onclick = ev => { if(ev.target.tagName === "INPUT") return; ev.preventDefault(); el.querySelector("#" + a.dataset.ir).scrollIntoView({behavior:"smooth"}); });
  }

  // Facturas de una comunidad (para la pestaña de su ficha)
  async function deComunidad(csId){
    if(!csId) return [];
    const F = await facturas();
    return F.filter(f => String(f.clienteId) === String(csId)).sort((a,b) => (b.fecha||"").localeCompare(a.fecha||""));
  }

  window.DHS_ECO = { vista, deComunidad, facturas };
})();
