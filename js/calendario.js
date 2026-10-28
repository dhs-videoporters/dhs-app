// DHS App — Calendario (fase 4): 15 días (esta semana y la siguiente), 9:00–18:00, una columna por técnico
// dentro de cada día, alto según la duración. Al pulsar una cita se abre la ficha de la comunidad (petición de Ángel).
// Ausencias (vacaciones, médico…) en gris en la columna de esa persona.
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  const H_INI = 9, H_FIN = 18, PX_H = 44;           // 44 px por hora
  const DIAS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  const ESPEC = {videoportero:"🔔", antena:"📡", electricidad:"⚡", camaras:"📹", otros:"🔧"};
  const PRIOR = {urgente:"🔴"};
  const CERRADOS = ["esperando","facturado","cobrado","cancelado"];   // "hecho" se sigue viendo (tachado suave)
  const MOTIVOS = ["Vacaciones","Médico","Asuntos propios","Formación","Otro"];

  const iso = d => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0");
  const lunesDe = d => { const x = new Date(d); x.setHours(12,0,0,0); x.setDate(x.getDate() - ((x.getDay()+6) % 7)); return x; };
  const masDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  // Citas que se pisan en la misma columna: una al lado de la otra y marcadas
  function carriles(L){
    const iv = x => [aMin(x.c.hora), aMin(x.c.hora) + (Number(x.c.duracion)||60)];
    L = L.slice().sort((a,b) => iv(a)[0] - iv(b)[0]);
    const finCarril = [];
    L.forEach(x => {
      const [i, f] = iv(x); let c = finCarril.findIndex(e => e <= i);
      if(c < 0){ c = finCarril.length; finCarril.push(f); } else finCarril[c] = f;
      x.carril = c;
      x.solapa = L.some(y => y !== x && iv(y)[0] < f && iv(y)[1] > i);
    });
    L.forEach(x => x.carriles = Math.max(1, finCarril.length));
    return L;
  }
  const hhmm = m => String(Math.floor(m/60)).padStart(2,"0") + ":" + String(m%60).padStart(2,"0");
  const aMin = h => { const [a,b] = (h||"09:00").split(":").map(Number); return a*60 + (b||0); };

  let inicio = null;   // lunes de la primera semana que se ve
  // Modo: "semanas" (15 días) o "dia" (un día, técnicos lado a lado; por defecto en el móvil)
  let modo = window.innerWidth < 760 ? "dia" : "semanas";
  let diaSel = null;   // "2026-10-27"
  const laborable = (d, paso) => { let x = d; do{ x = masDias(x, paso); }while([0,6].includes(x.getDay())); return x; };
  let ocultos = {};    // técnicos ocultados con el filtro

  // En vivo: el calendario escucha los cambios de las intervenciones (cuando Pedro marca "Hecho" en el móvil,
  // en el ordenador se ve al momento sin recargar).
  let VIVO = null;   // {unsub, trabajos}
  const enCalendario = () => { const h = location.hash.replace("#",""); return h === "" || h === "calendario"; };
  function escuchar(el){
    if(VIVO) return Promise.resolve(VIVO.trabajos);
    return new Promise((ok, ko) => {
      let primera = true, unsub = () => {};
      unsub = D().db.collection("dhs_trabajos").onSnapshot(q => {
        const L = []; q.forEach(d => L.push({id:d.id, ...d.data()}));
        if(VIVO) VIVO.trabajos = L;
        if(primera){ primera = false; VIVO = {unsub: () => unsub(), trabajos:L}; ok(L); return; }
        if(!enCalendario() || !el.isConnected || !el.querySelector(".cal")){ unsub(); VIVO = null; return; }
        vista(el, true);
      }, e => { VIVO = null; ko(e); });
    });
  }
  window.addEventListener("hashchange", () => { if(VIVO && !enCalendario()){ VIVO.unsub(); VIVO = null; } });

  async function vista(el, refresco){
    const {db, S} = D();
    if(!inicio) inicio = lunesDe(new Date());
    if(!diaSel){ const h = new Date(); diaSel = iso([0,6].includes(h.getDay()) ? laborable(h, 1) : h); }
    if(modo === "dia"){ const dS = new Date(diaSel + "T12:00"); if(dS < inicio || dS > masDias(inicio, 13)) inicio = lunesDe(dS); }
    if(!refresco) el.innerHTML = `<div class="panel">Cargando…</div>`;
    const scroll = [...el.querySelectorAll(".cal-semanas")].map(x => x.scrollLeft);
    let P = {}, trabajos = [], ausencias = [];
    try{
      (await db.collection("dhs_personal").get()).forEach(d => P[d.id] = d.data());
      if(window.DHS_EMP) await window.DHS_EMP.cargar();
      if(S.puede("trabajos","ver")) trabajos = await escuchar(el);
      (await db.collection("dhs_ausencias").get()).forEach(d => ausencias.push({id:d.id, ...d.data()}));
    }catch(e){ el.innerHTML = `<div class="panel">No se ha podido leer el calendario (${esc(e.code)}).</div>`; return; }

    const ahoraMin = new Date().getHours()*60 + new Date().getMinutes();
    const fin = masDias(inicio, 13), dIni = iso(inicio), dFin = iso(fin), hoy = iso(new Date());
    // Citas del periodo: una entrada por persona de cada cita
    const citas = [];
    trabajos.filter(t => !CERRADOS.includes(t.estado)).forEach(t => (t.citas||[]).forEach((c, ci) => {
      if(!c.fecha || c.fecha < dIni || c.fecha > dFin) return;
      const quien = (c.personal && c.personal.length) ? c.personal : ((t.asignados||[]).length ? t.asignados : ["_sin"]);
      quien.forEach(k => citas.push({t, c, k, ci}));
    }));
    const sinFecha = trabajos.filter(t => !CERRADOS.includes(t.estado) && t.estado !== "hecho" && !(t.citas||[]).length)
      .sort((a,b) => ((a.urgencia === "urgente" ? 0 : 1) - (b.urgencia === "urgente" ? 0 : 1)) || (a.numero||"").localeCompare(b.numero||""));

    // Técnicos que salen: plantilla y subcontratas activos + cualquiera con citas en el periodo
    const conCita = new Set(citas.map(x => x.k));
    const tecnicos = Object.entries(P).filter(([k,p]) => (p.activo !== false && ["plantilla","subcontrata"].includes(p.tipo)) || conCita.has(k))
      .sort((a,b) => (a[1].tipo === "plantilla" ? 0 : 1) - (b[1].tipo === "plantilla" ? 0 : 1) || a[1].nombre.localeCompare(b[1].nombre));
    if(conCita.has("_sin")) tecnicos.push(["_sin", {nombre:"Sin asignar", color:"#9aa5b5"}]);
    const visibles = tecnicos.filter(([k]) => !ocultos[k]);
    const puedeAus = S.puede("calendario","editar");
    const puedeCrear = S.puede("trabajos","editar");
    const puedeMover = S.puede("trabajos","todo");   // mover citas: Dirección y Oficina

    const semana = lunes => {
      const dias = [0,1,2,3,4,5,6].map(i => masDias(lunes, i));
      const finde = [5,6].filter(i => citas.some(x => x.c.fecha === iso(dias[i])));
      return rejilla(dias.filter((d, i) => i < 5 || finde.includes(i)));
    };
    const rejilla = verDias => {
      return `<div class="cal-semana ${verDias.length === 1 ? "un-dia" : ""}" style="--ncol:${verDias.length}">
        <div class="cal-horas"><div class="cal-cabdia"></div><div class="cal-quien"></div>${Array.from({length:H_FIN-H_INI}, (_,i) => `<div class="cal-hora" style="height:${PX_H}px">${H_INI+i}:00</div>`).join("")}</div>
        ${verDias.map(d => {
          const f = iso(d);
          return `<div class="cal-dia ${f === hoy ? "hoy" : ""} ${f < hoy ? "pasado" : ""}">
            <div class="cal-cabdia"><b>${DIAS[(d.getDay()+6)%7]} ${d.getDate()}</b>${d.getDate() === 1 || d === verDias[0] ? ` <span>${d.toLocaleDateString("es-ES",{month:"short"})}</span>` : ""}</div>
            <div class="cal-quien">${visibles.map(([k,p]) => `<span style="--c:${esc(p.color||"#9aa5b5")}" title="${esc(p.nombre)}">${esc((p.nombre||"").slice(0,3))}</span>`).join("")}</div>
            <div class="cal-cols" style="height:${(H_FIN-H_INI)*PX_H}px">
              ${f === hoy && ahoraMin >= H_INI*60 && ahoraMin <= H_FIN*60 ? `<div class="cal-ahora" style="top:${(ahoraMin - H_INI*60) / 60 * PX_H}px"></div>` : ""}
              ${visibles.map(([k,p]) => {
                const aus = ausencias.filter(a => a.personalId === k && a.desde <= f && a.hasta >= f);
                const mias = carriles(citas.filter(x => x.k === k && x.c.fecha === f));
                return `<div class="cal-col ${puedeCrear && k !== "_sin" ? "crea" : ""}" data-k="${esc(k)}" data-f="${f}" title="${esc(p.nombre)}">
                  ${aus.map(a => `<div class="cal-aus" data-aus="${a.id}" title="${esc(p.nombre)}: ${esc(a.motivo)}">${esc(a.motivo)}</div>`).join("")}
                  ${mias.map(x => {
                    const ini = Math.max(aMin(x.c.hora), H_INI*60), dur = Math.max(Number(x.c.duracion)||60, 30);
                    const top = (ini - H_INI*60) / 60 * PX_H, alto = Math.min(dur, H_FIN*60 - ini) / 60 * PX_H;
                    return `<a class="cal-cita ${x.solapa ? "solapa" : ""} ${x.t.estado === "hecho" ? "hecha" : ""} ${x.t.estado === "amedias" ? "medias" : ""} ${x.t.estado === "encurso" ? "encurso" : ""}" data-id="${x.t.id}" data-com="${esc(x.t.comunidadId||"")}" data-ci="${x.ci}" data-k="${esc(x.k)}"
                      style="top:${top}px;height:${Math.max(alto, 18)}px;--c:${esc(p.color||"#9aa5b5")};left:calc(${x.carril / x.carriles * 100}% + 2px);right:auto;width:calc(${100 / x.carriles}% - 4px)"
                      title="${esc(x.c.hora)} · ${esc(p.nombre)} · ${esc(x.t.direccion || x.t.nombre)} — ${esc(x.t.descripcion||"")}">
                      ${x.t.encargo && window.DHS_EMP ? `<i class="cal-emp" style="--emp:${esc(window.DHS_EMP.color(x.t.encargo))}"></i>` : ""}<b>${x.t.estado === "amedias" ? "🔧 " : ""}${x.t.estado === "encurso" ? "▶️ " : ""}${esc(x.t.direccion || x.t.nombre)}</b>${x.t.encargo && window.DHS_EMP ? window.DHS_EMP.chip(x.t.encargo, true) : ""}<span>${PRIOR[x.t.urgencia]||""}${ESPEC[x.t.especialidad]||""} ${esc(x.c.hora)}</span>${puedeMover && x.t.estado !== "hecho" ? `<i class="cal-tirador" title="Estirar para cambiar la duración"></i>` : ""}</a>`;
                  }).join("")}
                </div>`;
              }).join("")}
            </div></div>`;
        }).join("")}
      </div>`;
    };

    const rango = inicio.toLocaleDateString("es-ES",{day:"numeric", month:"short"}) + " – " + fin.toLocaleDateString("es-ES",{day:"numeric", month:"short", year:"numeric"});
    el.innerHTML = `
      <div class="panel cal">
        <div class="cal-barra">
          <h2>Calendario</h2>
          <div class="cal-nav"><button class="btn sec" data-mov="-1">‹</button><button class="btn sec" data-mov="0">Hoy</button><button class="btn sec" data-mov="1">›</button></div>
          <div class="cal-modo"><button class="${modo==="dia"?"on":""}" data-modo="dia">Día</button><button class="${modo==="semanas"?"on":""}" data-modo="semanas">2 semanas</button></div>
          <span class="vacio">${modo === "dia" ? new Date(diaSel + "T12:00").toLocaleDateString("es-ES",{weekday:"long", day:"numeric", month:"long"}) : rango}</span>
          <div class="cal-leyenda">${tecnicos.map(([k,p]) => `<label class="${ocultos[k] ? "off" : ""}"><input type="checkbox" data-k="${esc(k)}" ${ocultos[k] ? "" : "checked"}><i style="background:${esc(p.color||"#9aa5b5")}"></i>${esc(p.nombre)}</label>`).join("")}</div>
          ${S.puede("trabajos","editar") ? `<a class="btn" href="#nueva-intervencion">+ Intervención</a>` : ""}
          ${puedeAus ? `<button class="btn sec" id="btnAus">+ Ausencia</button>` : ""}
        </div>
        ${puedeCrear && tecnicos.length ? `<p class="vacio cal-ayuda-movil" style="margin-top:6px">Toca la hora en la columna del técnico para apuntar una intervención.</p><p class="vacio cal-ayuda" style="margin-top:6px">Para apuntar una intervención: <b>arrastra</b> en la columna del técnico desde la hora de inicio hasta la de fin (en el móvil, <b>toca</b> la hora).${puedeMover ? " Para <b>mover</b> una cita, arrástrala a otro día, hora o técnico; para cambiar lo que dura, <b>estira</b> su borde de abajo." : ""}</p>` : ""}
        ${!tecnicos.length ? `<p class="vacio" style="margin-top:10px">Da de alta al equipo (Pedro, Alberto…) en Ajustes › Equipo para que salgan sus columnas.</p>` : ""}
        <form id="fAus" class="oculto bloque" style="margin-top:10px">
          <h3>Nueva ausencia</h3>
          <div class="fila-form">
            <label class="campo"><span>Quién</span><select name="personalId">${Object.entries(P).filter(([k,p]) => p.activo !== false).map(([k,p]) => `<option value="${esc(k)}">${esc(p.nombre)}</option>`).join("")}</select></label>
            <label class="campo"><span>Desde</span><input type="date" name="desde" value="${hoy}"></label>
            <label class="campo"><span>Hasta</span><input type="date" name="hasta" value="${hoy}"></label>
            <label class="campo"><span>Motivo</span><select name="motivo">${MOTIVOS.map(m => `<option>${m}</option>`).join("")}</select></label>
          </div>
          <button class="btn" type="submit">Guardar ausencia</button> <span id="msgAus" class="vacio"></span>
        </form>
        <div class="cal-cuerpo">
          <div class="cal-semanas">${modo === "dia"
            ? `<div class="cal-tira">${[0,1,2,3,4,7,8,9,10,11].map(i => masDias(inicio, i)).map(d => { const f = iso(d), n = citas.filter(x => x.c.fecha === f).length; return `<button class="${f === diaSel ? "on" : ""} ${f === hoy ? "hoy" : ""}" data-dia="${f}"><span>${DIAS[(d.getDay()+6)%7]}</span><b>${d.getDate()}</b><i>${n ? n : ""}</i></button>`; }).join("")}</div>` + rejilla([new Date(diaSel + "T12:00")])
            : semana(inicio) + semana(masDias(inicio, 7))}</div>
          ${S.puede("trabajos","ver") ? `<aside class="cal-sinfecha"><h3>Sin fecha (${sinFecha.length})</h3>
            ${sinFecha.map(t => `<a href="#intervencion/${t.id}" class="sf-item"><b>${PRIOR[t.urgencia]||""} ${ESPEC[t.especialidad]||""} ${esc(t.direccion || t.nombre)}</b>${t.encargo && window.DHS_EMP ? window.DHS_EMP.chip(t.encargo) : ""}<span>${esc((t.descripcion||"").slice(0,70))}</span></a>`).join("") || `<p class="vacio">Todo agendado.</p>`}
            <p class="vacio" style="margin-top:6px">Ábrela y pulsa "Poner cita".</p></aside>` : ""}
        </div>
      </div>`;

    el.querySelectorAll(".cal-semanas").forEach((x, i) => { if(scroll[i]) x.scrollLeft = scroll[i]; });
    el.querySelectorAll("[data-mov]").forEach(b => b.onclick = () => {
      const n = Number(b.dataset.mov);
      if(modo === "dia"){ diaSel = n ? iso(laborable(new Date(diaSel + "T12:00"), n)) : null; if(!n) inicio = null; }
      else inicio = n ? masDias(inicio, n * 7) : lunesDe(new Date());
      vista(el);
    });
    el.querySelectorAll("[data-modo]").forEach(b => b.onclick = () => { modo = b.dataset.modo; vista(el); });
    el.querySelectorAll("[data-dia]").forEach(b => b.onclick = () => { diaSel = b.dataset.dia; vista(el); });
    el.querySelectorAll(".cal-leyenda input").forEach(i => i.onchange = () => { ocultos[i.dataset.k] = !i.checked; vista(el); });
    // Pulsar una cita → ficha de la comunidad, pestaña Intervenciones (si es particular, la intervención)
    // ---------- Mover (arrastrar a otro día, hora o técnico) y estirar (duración) — sesión 26 ----------
    let arrastrado = false;
    if(puedeMover) el.querySelectorAll(".cal-cita").forEach(a => {
      if(a.classList.contains("hecha")) return;
      a.addEventListener("pointerdown", ev => {
        if(ev.pointerType !== "mouse" || ev.button > 0) return;   // en el móvil no se arrastra (se cambia desde la ficha)
        ev.preventDefault();
        const estirar = ev.target.classList.contains("cal-tirador");
        const t = trabajos.find(x => x.id === a.dataset.id), ci = Number(a.dataset.ci), c0 = t.citas[ci];
        const y0 = ev.clientY, x0 = ev.clientX, ini0 = aMin(c0.hora), dur0 = Number(c0.duracion) || 60;
        let destino = null, fantasma = null; arrastrado = false;
        const colEn = (x, y) => { a.style.pointerEvents = "none"; const c = document.elementFromPoint(x, y); a.style.pointerEvents = ""; return c && c.closest(".cal-col.crea"); };
        const mover = e => {
          if(!arrastrado && Math.abs(e.clientY - y0) + Math.abs(e.clientX - x0) < 6) return;
          arrastrado = true; a.classList.add("moviendo");
          if(estirar){
            const dur = Math.max(30, Math.round((dur0 + (e.clientY - y0) / PX_H * 60) / 30) * 30);
            const d2 = Math.min(dur, H_FIN*60 - ini0);
            a.style.height = d2 / 60 * PX_H + "px"; a.querySelector("span").textContent = hhmm(ini0) + "–" + hhmm(ini0 + d2);
            destino = {fecha:c0.fecha, hora:c0.hora, k:a.dataset.k, duracion:d2};
            return;
          }
          const col = colEn(e.clientX, e.clientY - (y0 - a.getBoundingClientRect().top));
          if(!col){ if(fantasma) fantasma.remove(); fantasma = null; destino = null; return; }
          const r = col.getBoundingClientRect();
          let m = H_INI*60 + Math.round((e.clientY - (y0 - a.getBoundingClientRect().top) - r.top) / PX_H * 2) * 30;
          m = Math.min(Math.max(m, H_INI*60), H_FIN*60 - 30);
          destino = {fecha:col.dataset.f, hora:hhmm(m), k:col.dataset.k, duracion:dur0};
          if(!fantasma || fantasma.parentNode !== col){ if(fantasma) fantasma.remove(); fantasma = document.createElement("div"); fantasma.className = "cal-sel"; col.appendChild(fantasma); }
          fantasma.style.top = (m - H_INI*60) / 60 * PX_H + "px"; fantasma.style.height = Math.min(dur0, H_FIN*60 - m) / 60 * PX_H + "px";
          fantasma.textContent = hhmm(m) + " · " + ((P[destino.k]||{}).nombre || "");
        };
        const soltar = async () => {
          document.removeEventListener("pointermove", mover); document.removeEventListener("pointerup", soltar);
          if(fantasma) fantasma.remove(); a.classList.remove("moviendo");
          if(!arrastrado || !destino) return;
          if(destino.fecha === c0.fecha && destino.hora === c0.hora && destino.k === a.dataset.k && destino.duracion === dur0) return;
          // Nueva cita: cambia día/hora/duración; si cambia de técnico, se sustituye solo esa persona
          const pers = (c0.personal && c0.personal.length ? c0.personal : (t.asignados||[])).filter(k => k !== "_sin");
          const nuevaPers = destino.k === a.dataset.k ? pers : [...new Set(pers.map(k => k === a.dataset.k ? destino.k : k).concat(a.dataset.k === "_sin" ? [destino.k] : []))];
          const citas2 = t.citas.map((c, i) => i === ci ? {...c, fecha:destino.fecha, hora:destino.hora, duracion:destino.duracion, personal:nuevaPers} : c);
          const asign2 = [...new Set(citas2.flatMap(c => c.personal || []))];
          const quien = nuevaPers.map(k => (P[k]||{}).nombre || "").join(", ");
          const texto = (estirar ? "Duración: " : "Movida a ") + (estirar ? "" : new Date(destino.fecha + "T12:00").toLocaleDateString("es-ES",{weekday:"short", day:"numeric", month:"short"}) + " " + destino.hora + " · ") + (destino.duracion/60) + " h · " + quien;
          const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
          try{
            const ref = db.collection("dhs_trabajos").doc(t.id);
            await ref.update({citas:citas2, asignados:asign2, modificado:{por:yo, en}});
            await ref.collection("notas").add({tipo:"cita", texto, por:yo, en});
            await db.collection("dhs_registro").add({por:yo, en, accion:"cita: " + texto, coleccion:"dhs_trabajos", docId:t.id, nombre:(t.numero||"") + " · " + (t.nombre||"")});
          }catch(e){ alert("No se ha podido mover (" + (e.code||e) + ")."); vista(el, true); }
        };
        document.addEventListener("pointermove", mover); document.addEventListener("pointerup", soltar);
      });
    });

    el.querySelectorAll(".cal-cita").forEach(a => a.onclick = ev => {
      ev.preventDefault();
      if(arrastrado){ arrastrado = false; return; }
      if(a.dataset.com && S.puede("comunidades")){ window.DHS_COM.abrirPestana("intervenciones"); location.hash = "comunidad/" + encodeURIComponent(a.dataset.com); }
      else location.hash = "intervencion/" + a.dataset.id;
    });
    // Arrastrar (o tocar) en el hueco de un técnico → nueva intervención con día, hora, duración y técnico ya puestos
    if(puedeCrear) el.querySelectorAll(".cal-col.crea").forEach(col => {
      let ini = null, sel = null;
      const minDe = ev => { const r = col.getBoundingClientRect(); const m = H_INI*60 + Math.floor((ev.clientY - r.top) / PX_H * 2) * 30; return Math.min(Math.max(m, H_INI*60), H_FIN*60 - 30); };
      const pintar = (a, b) => {
        const de = Math.min(a, b), a2 = Math.max(a, b) + 30;
        if(!sel){ sel = document.createElement("div"); sel.className = "cal-sel"; col.appendChild(sel); }
        sel.style.top = (de - H_INI*60) / 60 * PX_H + "px"; sel.style.height = (a2 - de) / 60 * PX_H + "px";
        sel.textContent = hhmm(de) + "–" + hhmm(a2);
        return [de, a2];
      };
      col.addEventListener("pointerdown", ev => {
        if(ev.target.closest(".cal-cita, .cal-aus, .cal-sel") || ev.button > 0) return;
        ini = minDe(ev); pintar(ini, ini);
        if(ev.pointerType === "mouse") col.setPointerCapture(ev.pointerId);
      });
      col.addEventListener("pointermove", ev => { if(ini !== null && ev.pointerType === "mouse") pintar(ini, minDe(ev)); });
      col.addEventListener("pointercancel", () => { ini = null; if(sel){ sel.remove(); sel = null; } });
      col.addEventListener("pointerup", ev => {
        if(ini === null) return;
        const fin = ev.pointerType === "mouse" ? minDe(ev) : ini + 30;   // tocando: 1 hora
        const [de, a] = pintar(ini, fin); ini = null;
        window.DHS_TRAB.prefijar({fecha:col.dataset.f, hora:hhmm(de), duracion:a - de, personal:[col.dataset.k]});
        location.hash = "nueva-intervencion";
      });
    });

    if(puedeAus){
      const f = el.querySelector("#fAus");
      el.querySelector("#btnAus").onclick = () => f.classList.toggle("oculto");
      f.onsubmit = async ev => {
        ev.preventDefault();
        const fd = new FormData(f), d = {personalId:fd.get("personalId"), desde:fd.get("desde"), hasta:fd.get("hasta"), motivo:fd.get("motivo")};
        if(d.hasta < d.desde) return el.querySelector("#msgAus").textContent = "La fecha final es anterior a la inicial.";
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        try{
          const r = await db.collection("dhs_ausencias").add({...d, modificado:{por:yo, en}});
          await db.collection("dhs_registro").add({por:yo, en, accion:"alta", coleccion:"dhs_ausencias", docId:r.id, nombre:(P[d.personalId]||{}).nombre + " · " + d.motivo + " " + d.desde + "→" + d.hasta});
          vista(el);
        }catch(e){ el.querySelector("#msgAus").textContent = "No se ha podido guardar (" + (e.code||e) + ")."; }
      };
      el.querySelectorAll(".cal-aus").forEach(a => a.onclick = async () => {
        const au = ausencias.find(x => x.id === a.dataset.aus); if(!au) return;
        if(!confirm("¿Borrar la ausencia de " + ((P[au.personalId]||{}).nombre||"") + " (" + au.motivo + ", " + au.desde + " a " + au.hasta + ")?")) return;
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        try{
          await db.collection("dhs_ausencias").doc(au.id).delete();
          await db.collection("dhs_registro").add({por:yo, en, accion:"baja", coleccion:"dhs_ausencias", docId:au.id, nombre:(P[au.personalId]||{}).nombre + " · " + au.motivo + " " + au.desde + "→" + au.hasta});
          vista(el);
        }catch(e){ alert("No se ha podido borrar (" + (e.code||e) + ")."); }
      });
    }
  }

  window.DHS_CAL = { vista };
})();
