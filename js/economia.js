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

  // Periodo para "Facturado" y "Cobrado": un mes o un año entero (Ángel 02/11)
  let mes = new Date().toISOString().slice(0,7), anyo = mes.slice(0,4), verAnyo = false, adminF = "";
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
    // 3) Cobrado y facturado en el periodo (mes o año)
    const enPer = fecha => verAnyo ? (fecha||"").slice(0,4) === anyo : (fecha||"").slice(0,7) === mes;
    const perTxt = verAnyo ? "todo " + anyo : new Date(mes + "-15").toLocaleDateString("es-ES", {month:"long", year:"numeric"});
    const cobr = []; F.forEach(f => (f.pagos||[]).forEach(p => { if(enPer(p.fecha)){ const com = comDe(f.clienteId); if(pasaAdmin(com)) cobr.push({...p, numero:f.numero, cliente:f.cliente, com}); } }));
    anticipos.filter(x => enPer(x.fecha)).forEach(x => cobr.push(x));
    const factP = F.filter(f => enPer(f.fecha)).map(f => ({...f, com:comDe(f.clienteId)})).filter(f => pasaAdmin(f.com)).sort((a,b) => (b.fecha||"").localeCompare(a.fecha||""));
    // Por meses, cuando se mira el año entero
    const porMes = {}; if(verAnyo){ factP.forEach(f => { const k = f.fecha.slice(0,7); porMes[k] = porMes[k] || {f:0, c:0}; porMes[k].f = r2(porMes[k].f + (Number(f.total)||0)); });
      cobr.forEach(c => { const k = (c.fecha||"").slice(0,7); porMes[k] = porMes[k] || {f:0, c:0}; porMes[k].c = r2(porMes[k].c + (Number(c.importe)||0)); }); }
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
          <select id="fAdm"><option value="">Todas las administraciones</option>${Object.entries(C.admins).filter(([k,a]) => a.activo !== false || adminF === k).sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre)).map(([k,a]) => `<option value="${esc(k)}" ${adminF===k?"selected":""}>${esc(a.nombre)}</option>`).join("")}<option value="-" ${adminF==="-"?"selected":""}>Sin administración</option></select>
          <span class="eco-per">Ver: <select id="perTipo"><option value="mes" ${verAnyo?"":"selected"}>Mes</option><option value="anyo" ${verAnyo?"selected":""}>Año entero</option></select>
            ${verAnyo ? `<select id="perAnyo">${Array.from({length:4}, (_,i) => String(new Date().getFullYear() - i)).map(y => `<option ${y===anyo?"selected":""}>${y}</option>`).join("")}</select>` : `<input type="month" id="mesC" value="${mes}">`}</span>
          <button class="btn sec" id="btnRec">⟳ Actualizar</button> <a class="btn" href="#produccion">👷 Producción por trabajador</a></div>
        <p class="vacio">Pendiente de cobrar con el mismo criterio que la app de cobros (pendientes, devueltas y en la hoja del viernes; lo cargado en el banco no cuenta).${nSin ? ` Incluye ${nSin} factura${nSin===1?"":"s"} nueva${nSin===1?"":"s"} que aún no ha${nSin===1?"":"n"} pasado a cobros (${eur(tSin)}).` : ""}${tBanco ? ` En el banco, pendiente de confirmar: ${eur(tBanco)}.` : ""}</p>
        <div class="eco-cajas">
          <a class="eco-caja c1" href="#" data-ir="acept"><span>Aceptado, pendiente de cobrar</span><b>${eur(suma(acept,"falta"))}</b><i>${acept.length} presupuesto${acept.length===1?"":"s"}${antTotal ? " · ya cobrado de anticipo " + eur(antTotal) : ""}</i></a>
          <a class="eco-caja c2" href="#" data-ir="pend"><span>Hecho, pendiente de cobrar</span><b>${eur(suma(pend,"pendiente"))}</b><i>${pend.length} factura${pend.length===1?"":"s"}</i></a>
          <a class="eco-caja c4" href="#" data-ir="fact"><span>Facturado en ${esc(perTxt)}</span><b>${eur(suma(factP,"total"))}</b><i>${factP.length} factura${factP.length===1?"":"s"} · IVA incluido</i></a>
          <a class="eco-caja c3" href="#" data-ir="cobr"><span>Cobrado en ${esc(perTxt)}</span><b>${eur(suma(cobr,"importe"))}</b><i>${cobr.length} cobro${cobr.length===1?"":"s"}</i></a>
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

        ${verAnyo ? `<h3 style="margin-top:16px">📊 ${esc(anyo)} mes a mes</h3>
        <table class="tabla-fi"><thead><tr><th>Mes</th><th>Facturado</th><th>Cobrado</th></tr></thead><tbody>
          ${Object.keys(porMes).sort().map(k => `<tr><td>${esc(nomMes(k))}</td><td>${eur(porMes[k].f)}</td><td>${eur(porMes[k].c)}</td></tr>`).join("") || `<tr><td colspan="3" class="vacio">Nada.</td></tr>`}
          <tr><td><b>Total</b></td><td><b>${eur(suma(factP,"total"))}</b></td><td><b>${eur(suma(cobr,"importe"))}</b></td></tr></tbody></table>` : ""}

        <details style="margin-top:16px"><summary><h3 id="fact" style="display:inline">🧾 Facturado en ${esc(perTxt)} (${factP.length})</h3></summary>
        <table class="tabla-fi"><thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Administración</th><th>Total</th><th>Estado</th></tr></thead><tbody>
          ${factP.map(f => `<tr><td>${esc(f.numero)}${f.rectificativa ? ` <span class="tag gris">rectificativa</span>` : ""}</td><td>${fch(f.fecha)}</td><td>${f.com ? `<a href="#comunidad/${encodeURIComponent(porCs[String(f.clienteId)])}">${esc(f.com.nombre)}</a>` : esc(f.cliente)}</td><td>${esc(adminDe(f.com))}</td><td>${eur(f.total)}</td><td>${f.estado === "Payed" || !(f.pendiente > 0.01) ? "✅ cobrada" : "pendiente " + eur(f.pendiente)}</td></tr>`).join("") || `<tr><td colspan="6" class="vacio">Nada.</td></tr>`}
        </tbody></table></details>

        <h3 id="cobr" style="margin-top:16px">💶 Cobrado en ${esc(perTxt)}</h3>
        <table class="tabla-fi"><thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Importe</th></tr></thead><tbody>
          ${cobr.map(c => `<tr><td>${fch(c.fecha)}</td><td>${esc(c.numero)}${c.anticipo ? ` <span class="tag est-p-aceptado">anticipo${c.forma ? " · " + esc(c.forma) : ""}</span>` : ""}</td><td>${esc(c.com ? c.com.nombre : c.cliente)}</td><td>${eur(c.importe)}</td></tr>`).join("") || `<tr><td colspan="4" class="vacio">Nada.</td></tr>`}
        </tbody></table>
        <div id="ecoCam"></div>
      </div>`;
    if(window.DHS_CAMS) window.DHS_CAMS.resumen(el.querySelector("#ecoCam"));
    el.querySelector("#fAdm").onchange = e => { adminF = e.target.value; vista(el); };
    el.querySelector("#btnRec").onclick = () => vista(el, true);
    const mC = el.querySelector("#mesC"); if(mC) mC.onchange = e => { mes = e.target.value || mes; vista(el); };
    const pA = el.querySelector("#perAnyo"); if(pA) pA.onchange = e => { anyo = e.target.value; vista(el); };
    el.querySelector("#perTipo").onchange = e => { verAnyo = e.target.value === "anyo"; if(verAnyo) anyo = mes.slice(0,4); vista(el); };
    el.querySelectorAll("[data-ir]").forEach(a => a.onclick = ev => { ev.preventDefault(); const d = el.querySelector("#" + a.dataset.ir); const det = d.closest("details"); if(det) det.open = true; d.scrollIntoView({behavior:"smooth"}); });
  }

  // Facturas de una comunidad (para la pestaña de su ficha)
  async function deComunidad(csId){
    if(!csId) return [];
    const F = await facturas();
    return F.filter(f => String(f.clienteId) === String(csId)).sort((a,b) => (b.fecha||"").localeCompare(a.fecha||""));
  }


  // ---------- PRODUCCIÓN POR TRABAJADOR (Ángel 10/11) ----------
  // Cada factura de Contasimple se une a la visita del calendario: 1) si sale de un presupuesto con intervención, esa;
  // 2) si es de Armengol/Álamo (la factura va a nombre de la empresa), las intervenciones de esa empresa desde su factura anterior;
  // 3) si no, la última visita a esa comunidad en los 90 días antes de la factura. Si fueron varios, se reparte por horas.
  // Las que no cuadran claras salen como "dudosas" o "sin asignar" para mirarlas a mano.
  const sinAc = x => String(x||"").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  async function produccion(el, forzar){
    const {db, S} = D();
    if(!S.puede("cobros","ver")){ el.innerHTML = `<div class="panel">Sin permiso.</div>`; return; }
    el.innerHTML = `<div class="panel">Cargando facturas y calendario…</div>`;
    let F, C, T = {}, P = [], PERS = {};
    try{
      [F, C] = await Promise.all([facturas(forzar), window.DHS_COM.datos()]);
      (await db.collection("dhs_trabajos").get()).forEach(d => T[d.id] = d.data());
      (await db.collection("dhs_presupuestos").get()).forEach(d => P.push(d.data()));
      (await db.collection("dhs_personal").get()).forEach(d => PERS[d.id] = d.data());
    }catch(e){ el.innerHTML = `<div class="panel">No se ha podido cargar: ${esc(e.message||e.code||e)}</div>`; return; }
    const porCs = {}; Object.entries(C.coms).forEach(([k,c]) => { if(c.csId) porCs[String(c.csId)] = k; });
    const enPer = fecha => verAnyo ? (fecha||"").slice(0,4) === anyo : (fecha||"").slice(0,7) === mes;
    const perTxt = verAnyo ? "todo " + anyo : new Date(mes + "-15").toLocaleDateString("es-ES", {month:"long", year:"numeric"});
    const menosDias = (f, n) => { const d = new Date(f + "T12:00"); d.setDate(d.getDate() - n); return d.toISOString().slice(0,10); };
    const nom = k => (PERS[k] && PERS[k].nombre) || "¿?";
    // Visitas del calendario
    const VIS = []; Object.entries(T).forEach(([id,t]) => { if(t.estado === "cancelado") return;
      (t.citas||[]).forEach(c => { if(c.fecha && (c.personal||[]).length) VIS.push({tid:id, fecha:c.fecha, personal:c.personal, dur:Number(c.duracion)||60}); }); });
    const visDe = tid => VIS.filter(v => v.tid === tid);
    // Reparto por minutos de cada técnico en esas intervenciones (hasta la fecha de la factura)
    const reparto = (tids, hasta) => { const m = {}; tids.forEach(tid => visDe(tid).filter(v => v.fecha <= hasta).forEach(v => v.personal.forEach(k => m[k] = (m[k]||0) + v.dur)));
      const tot = Object.values(m).reduce((a,b) => a + b, 0); const r = {}; Object.keys(m).forEach(k => r[k] = tot ? m[k] / tot : 1 / Object.keys(m).length); return r; };
    // Empresas (Armengol, Álamo…) por el nombre del cliente de la factura
    const EMP = Object.entries(C.admins).filter(([k,a]) => a.tipo === "empresa").map(([k,a]) => ({k, n:sinAc(a.nombre).replace(/^(fachadas|facanes|façanes)\s+/, "").trim(), nombre:a.nombre})).filter(e => e.n.length >= 4);
    const empDe = cliente => { const c = sinAc(cliente); return EMP.find(e => c.includes(e.n)); };
    const porNumPres = {}; P.forEach(p => (p.facturas||[]).forEach(x => { if(x.numero && p.intervencionId) porNumPres[x.numero] = p.intervencionId; }));
    const usadas = new Set();
    const FS = F.filter(f => f.fecha).sort((a,b) => a.fecha.localeCompare(b.fecha));
    const ultimaEmp = {};
    const asign = FS.map(f => {
      const r = {f, tids:[], rep:{}, como:"", duda:""};
      if(porNumPres[f.numero] && T[porNumPres[f.numero]]){ r.tids = [porNumPres[f.numero]]; r.como = "presupuesto"; }
      else { const e = empDe(f.cliente);
        if(e){ const desde = ultimaEmp[e.k] || menosDias(f.fecha, 45); ultimaEmp[e.k] = f.fecha;
          r.tids = [...new Set(VIS.filter(v => T[v.tid].encargo === e.k && v.fecha > desde && v.fecha <= f.fecha).map(v => v.tid))]; r.como = e.nombre;
          if(!r.tids.length) r.duda = "no hay visitas de " + e.nombre + " en el calendario antes de la factura"; }
        else { const ck = porCs[String(f.clienteId)];
          if(!ck) r.duda = "el cliente no está unido a ninguna comunidad";
          else { const cand = VIS.filter(v => T[v.tid].comunidadId === ck && v.fecha <= f.fecha && v.fecha >= menosDias(f.fecha, 90)).sort((a,b) => b.fecha.localeCompare(a.fecha));
            if(!cand.length) r.duda = "sin visitas a esa comunidad en los 90 días antes";
            else { r.tids = [cand[0].tid]; r.como = "visita del " + fch(cand[0].fecha);
              const otros = new Set(cand.filter(v => v.tid !== cand[0].tid).flatMap(v => v.personal)), este = new Set(visDe(cand[0].tid).flatMap(v => v.personal));
              if([...otros].some(k => !este.has(k))) r.duda = "esa comunidad tuvo varias visitas de técnicos distintos";
              else if(cand[0].fecha < menosDias(f.fecha, 45)) r.duda = "la visita es de hace más de 45 días"; } } } }
      if(r.tids.length){ r.rep = reparto(r.tids, f.fecha); r.tids.forEach(t => usadas.add(t)); }
      return r;
    });
    const enP = asign.filter(a => enPer(a.f.fecha));
    // Por técnico
    const R = {}; const fila = k => R[k] = R[k] || {fact:0, min:0, trabajos:new Set(), nF:0};
    enP.forEach(a => Object.entries(a.rep).forEach(([k,sh]) => { fila(k).fact = r2(R[k].fact + (Number(a.f.total)||0) * sh); R[k].nF++; }));
    VIS.filter(v => enPer(v.fecha)).forEach(v => v.personal.forEach(k => { fila(k).min += v.dur; R[k].trabajos.add(v.tid); }));
    const sinAsig = enP.filter(a => !a.tids.length), dudosas = enP.filter(a => a.tids.length && a.duda);
    // Hecho y sin facturar: cerradas por el técnico (última visita en el periodo) que no ha recogido ninguna factura
    const sinFact = Object.entries(T).filter(([id,t]) => ["hecho"].includes(t.estado) && !usadas.has(id)).map(([id,t]) => { const v = visDe(id).sort((a,b) => b.fecha.localeCompare(a.fecha))[0]; return {id, t, v}; })
      .filter(x => x.v && enPer(x.v.fecha)).sort((a,b) => a.v.fecha.localeCompare(b.v.fecha));
    sinFact.forEach(x => x.v.personal.forEach(k => fila(k).sinF = (R[k].sinF||0) + 1));
    const totF = r2(enP.reduce((n,a) => n + (Number(a.f.total)||0), 0)), totA = r2(Object.values(R).reduce((n,x) => n + x.fact, 0));
    const ks = Object.keys(R).sort((a,b) => R[b].fact - R[a].fact);
    const h = m => (Math.round(m / 6) / 10).toLocaleString("es-ES") + " h";
    const nombreT = t => esc(t.direccion || t.nombre || "");
    const lineaF = a => `<tr><td>${esc(a.f.numero)}</td><td>${fch(a.f.fecha)}</td><td>${esc(a.f.cliente)}</td><td>${eur(a.f.total)}</td><td>${a.tids.length ? Object.entries(a.rep).map(([k,sh]) => esc(nom(k)) + (sh < 0.999 ? " " + Math.round(sh*100) + "%" : "")).join(", ") + ` <span class="vacio">(${esc(a.como)})</span>` : "—"}</td><td class="vacio">${esc(a.duda)}</td></tr>`;
    el.innerHTML = `<div class="panel">
      <div class="eco-cab"><h2>👷 Producción por trabajador</h2>
        <span class="eco-per">Ver: <select id="perTipo"><option value="mes" ${verAnyo?"":"selected"}>Mes</option><option value="anyo" ${verAnyo?"selected":""}>Año entero</option></select>
          ${verAnyo ? `<select id="perAnyo">${Array.from({length:4}, (_,i) => String(new Date().getFullYear() - i)).map(y => `<option ${y===anyo?"selected":""}>${y}</option>`).join("")}</select>` : `<input type="month" id="mesC" value="${mes}">`}</span>
        <a class="btn sec" href="#economia">‹ Economía</a></div>
      <p class="vacio">Cada factura de ${esc(perTxt)} se une a quien fue según el calendario (si fueron varios, se reparte por horas). Es un cálculo automático: revisa las dudosas de abajo.</p>
      <table class="tabla-fi prod"><thead><tr><th>Trabajador</th><th>Facturado (IVA incl.)</th><th>≈ sin IVA</th><th>Intervenciones</th><th>Horas en calendario</th><th>€/hora (sin IVA)</th><th>Hecho y sin facturar</th></tr></thead><tbody>
        ${ks.map(k => `<tr><td><b>${esc(nom(k))}</b></td><td><b>${eur(R[k].fact)}</b></td><td>${eur(R[k].fact / 1.21)}</td><td>${R[k].trabajos.size}</td><td>${h(R[k].min)}</td><td>${R[k].min ? eur(R[k].fact / 1.21 / (R[k].min/60)) : "—"}</td><td>${R[k].sinF ? `<span class="tag aviso">${R[k].sinF}</span>` : "—"}</td></tr>`).join("") || `<tr><td colspan="7" class="vacio">Nada en este periodo.</td></tr>`}
      </tbody></table>
      <p style="margin-top:8px">Facturado en ${esc(perTxt)}: <b>${eur(totF)}</b> · asignado a trabajadores: <b>${eur(totA)}</b>${totF - totA > 0.5 ? ` · <span class="tag aviso">sin asignar ${eur(totF - totA)}</span>` : ""}</p>
      <details ${sinFact.length ? "open" : ""} style="margin-top:14px"><summary><h3 style="display:inline">⚠️ Hecho y sin facturar (${sinFact.length})</h3></summary>
        <p class="vacio">Cerradas por el técnico y sin ninguna factura después. Puede que falte facturarlas (o que se facturen juntas con otra).</p>
        <table class="tabla-fi"><thead><tr><th>Intervención</th><th>Última visita</th><th>Quién</th></tr></thead><tbody>
        ${sinFact.map(x => `<tr><td><a href="#intervencion/${esc(x.id)}">${esc(x.t.numero || "")} · ${nombreT(x.t)}</a>${x.t.encargoInfo ? ` <span class="tag">${esc(x.t.encargoInfo.nombre)}</span>` : ""}</td><td>${fch(x.v.fecha)}</td><td>${x.v.personal.map(k => esc(nom(k))).join(", ")}</td></tr>`).join("") || `<tr><td colspan="3" class="vacio">Nada.</td></tr>`}</tbody></table></details>
      <details style="margin-top:14px"><summary><h3 style="display:inline">🤔 Dudosas (${dudosas.length})</h3></summary>
        <table class="tabla-fi"><thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Asignada a</th><th>Por qué es dudosa</th></tr></thead><tbody>${dudosas.map(lineaF).join("") || `<tr><td colspan="6" class="vacio">Nada.</td></tr>`}</tbody></table></details>
      <details style="margin-top:14px"><summary><h3 style="display:inline">❔ Facturas sin asignar (${sinAsig.length})</h3></summary>
        <p class="vacio">No se ha encontrado ninguna visita en el calendario (mantenimientos de cámaras, material suelto, trabajos de antes de usar el calendario…).</p>
        <table class="tabla-fi"><thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Total</th><th></th><th>Motivo</th></tr></thead><tbody>${sinAsig.map(lineaF).join("") || `<tr><td colspan="6" class="vacio">Nada.</td></tr>`}</tbody></table></details>
      <details style="margin-top:14px"><summary><h3 style="display:inline">✅ Todas las facturas de ${esc(perTxt)} (${enP.length})</h3></summary>
        <table class="tabla-fi"><thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Asignada a</th><th>Nota</th></tr></thead><tbody>${enP.slice().reverse().map(lineaF).join("")}</tbody></table></details>
    </div>`;
    const mC = el.querySelector("#mesC"); if(mC) mC.onchange = e => { mes = e.target.value || mes; produccion(el); };
    const pA = el.querySelector("#perAnyo"); if(pA) pA.onchange = e => { anyo = e.target.value; produccion(el); };
    el.querySelector("#perTipo").onchange = e => { verAnyo = e.target.value === "anyo"; if(verAnyo) anyo = mes.slice(0,4); produccion(el); };
  }
  window.DHS_ECO = { vista, deComunidad, facturas, produccion };
})();
