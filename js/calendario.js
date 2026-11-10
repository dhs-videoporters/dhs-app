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
  const MOTIVOS = ["Mantenimientos de cámaras","Vacaciones","Médico","Asuntos propios","Formación","Otro"];   // "Mantenimientos": días reservados para revisar cámaras (Ángel 02/11)
  const esMant = a => /manten/i.test(a.motivo || "");

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
                  ${aus.map(a => { const txt = (esMant(a) ? "🔧 " : "") + a.motivo + (a.horaIni ? " " + a.horaIni + "–" + a.horaFin : "");
                    if(!a.horaIni) return `<div class="cal-aus ${esMant(a) ? "mant" : ""}" style="--c:${esc(p.color||"#2f6fd6")}" data-aus="${a.id}" title="${esc(p.nombre)}: ${esc(txt)}">${esc(txt)}</div>`;
                    const i0 = Math.max(aMin(a.horaIni), H_INI*60), i1 = Math.min(aMin(a.horaFin), H_FIN*60);   // ausencia de unas horas (médico…), Ángel 02/11
                    return i1 <= i0 ? "" : `<div class="cal-aus parcial ${esMant(a) ? "mant" : ""}" data-aus="${a.id}" style="--c:${esc(p.color||"#2f6fd6")};top:${(i0 - H_INI*60) / 60 * PX_H}px;height:${(i1 - i0) / 60 * PX_H}px" title="${esc(p.nombre)}: ${esc(txt)}">${esc(txt)}</div>`; }).join("")}
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
          ${S.direccion ? `<button class="btn sec" id="btnFurgo">🚐 Furgoneta</button>` : ""}
        </div>
        ${window.DHS_PREPARA ? window.DHS_PREPARA.aviso(trabajos) : ""}
        ${puedeCrear && tecnicos.length ? `<p class="vacio cal-ayuda-movil" style="margin-top:6px">Toca la hora en la columna del técnico para apuntar una intervención.</p><p class="vacio cal-ayuda" style="margin-top:6px">Para apuntar una intervención: <b>arrastra</b> en la columna del técnico desde la hora de inicio hasta la de fin (en el móvil, <b>toca</b> la hora).${puedeMover ? " Para <b>mover</b> una cita, arrástrala a otro día, hora o técnico; para cambiar lo que dura, <b>estira</b> su borde de abajo." : ""}</p>` : ""}
        ${!tecnicos.length ? `<p class="vacio" style="margin-top:10px">Da de alta al equipo (Pedro, Alberto…) en Ajustes › Equipo para que salgan sus columnas.</p>` : ""}
        <form id="fAus" class="oculto bloque" style="margin-top:10px">
          <h3>Nueva ausencia</h3>
          <div class="fila-form">
            <label class="campo"><span>Quién</span><select name="personalId">${Object.entries(P).filter(([k,p]) => p.activo !== false).map(([k,p]) => `<option value="${esc(k)}">${esc(p.nombre)}</option>`).join("")}</select></label>
            <label class="campo"><span>Desde</span><input type="date" name="desde" value="${hoy}"></label>
            <label class="campo"><span>Hasta</span><input type="date" name="hasta" value="${hoy}"></label>
            <label class="campo"><span>Motivo</span><select name="motivo">${MOTIVOS.map(m => `<option>${m}</option>`).join("")}</select></label>
            <label class="campo"><span>Horas</span><select name="horas" id="ausHoras"><option value="todo">Todo el día</option><option value="parte">Solo unas horas</option></select></label>
            <label class="campo aus-h oculto"><span>De</span><input type="time" name="horaIni" value="12:00" step="900"></label>
            <label class="campo aus-h oculto"><span>A</span><input type="time" name="horaFin" value="18:00" step="900"></label>
          </div>
          <p class="vacio aus-h oculto" style="margin:4px 0 8px">Ej.: médico a la 1 → de 12:00 a 18:00. Por la mañana puede trabajar; esas horas quedan cerradas en su agenda.</p>
          <button class="btn" type="submit">Guardar ausencia</button> <span id="msgAus" class="vacio"></span>
        </form>
        <div class="cal-cuerpo">
          <div class="cal-semanas">${modo === "dia"
            ? `<div class="cal-tira">${[0,1,2,3,4,7,8,9,10,11].map(i => masDias(inicio, i)).map(d => { const f = iso(d), n = citas.filter(x => x.c.fecha === f).length; return `<button class="${f === diaSel ? "on" : ""} ${f === hoy ? "hoy" : ""}" data-dia="${f}"><span>${DIAS[(d.getDay()+6)%7]}</span><b>${d.getDate()}</b><i>${n ? n : ""}</i></button>`; }).join("")}</div>` + rejilla([new Date(diaSel + "T12:00")])
            : semana(inicio) + semana(masDias(inicio, 7))}</div>
          ${S.puede("trabajos","ver") ? `<aside class="cal-sinfecha"><h3>Sin fecha (${sinFecha.length})</h3>
            ${sinFecha.map(t => `<a href="#intervencion/${t.id}" class="sf-item"><b>${PRIOR[t.urgencia]||""} ${ESPEC[t.especialidad]||""} ${esc(t.direccion || t.nombre)}</b>${t.encargo && window.DHS_EMP ? window.DHS_EMP.chip(t.encargo) : ""}<span>${esc((t.descripcion||"").slice(0,70))}</span></a>`).join("") || `<p class="vacio">Todo agendado.</p>`}
            <p class="vacio" style="margin-top:6px">Arrástrala al hueco del técnico en el calendario (o ábrela y pulsa "Poner cita").</p></aside>` : ""}
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
    // Ángel 02/11: arrastrar una de "Sin fecha" al hueco de un técnico → queda agendada ahí (sin crear otra)
    if(puedeMover) el.querySelectorAll(".sf-item").forEach(a => {
      a.addEventListener("pointerdown", ev => {
        if(ev.button > 0 || ev.pointerType !== "mouse") return;
        const id = (a.getAttribute("href")||"").split("/")[1], t = trabajos.find(x => x.id === id); if(!t) return;
        const x0 = ev.clientX, y0 = ev.clientY, dur = Number(t.duracionEstimada) || 60;
        let moviendo = false, fantasma = null, destino = null, chip = null;
        const mover = e => {
          if(!moviendo && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < 6) return;
          if(!moviendo){ moviendo = true; chip = document.createElement("div"); chip.className = "sf-chip"; chip.textContent = t.direccion || t.nombre; document.body.appendChild(chip); }
          chip.style.left = e.clientX + 10 + "px"; chip.style.top = e.clientY + 10 + "px";
          chip.style.display = "none"; const c = document.elementFromPoint(e.clientX, e.clientY); chip.style.display = "";
          const col = c && c.closest(".cal-col.crea");
          if(!col || col.dataset.k === "_sin"){ if(fantasma) fantasma.remove(); fantasma = null; destino = null; return; }
          const r = col.getBoundingClientRect();
          let m = H_INI*60 + Math.floor((e.clientY - r.top) / PX_H * 2) * 30; m = Math.min(Math.max(m, H_INI*60), H_FIN*60 - 30);
          destino = {fecha:col.dataset.f, hora:hhmm(m), k:col.dataset.k};
          if(!fantasma || fantasma.parentNode !== col){ if(fantasma) fantasma.remove(); fantasma = document.createElement("div"); fantasma.className = "cal-sel"; col.appendChild(fantasma); }
          fantasma.style.top = (m - H_INI*60) / 60 * PX_H + "px"; fantasma.style.height = Math.min(dur, H_FIN*60 - m) / 60 * PX_H + "px";
          fantasma.textContent = hhmm(m) + " · " + ((P[destino.k]||{}).nombre || "");
        };
        const soltar = async () => {
          document.removeEventListener("pointermove", mover); document.removeEventListener("pointerup", soltar);
          if(chip) chip.remove(); if(fantasma) fantasma.remove();
          if(!moviendo) return;
          a.addEventListener("click", e => e.preventDefault(), {once:true});
          if(!destino) return;
          const cita = {fecha:destino.fecha, hora:destino.hora, duracion:dur, personal:[destino.k]};
          const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
          const texto = new Date(destino.fecha + "T12:00").toLocaleDateString("es-ES",{weekday:"short", day:"numeric", month:"short"}) + " " + destino.hora + " · " + (dur/60) + " h · " + ((P[destino.k]||{}).nombre || "");
          try{
            const ref = db.collection("dhs_trabajos").doc(t.id);
            await ref.update({citas:[cita], asignados:[destino.k], ...(["nuevo","presupuesto"].includes(t.estado) ? {estado:"agendado"} : {}), modificado:{por:yo, en}});
            await ref.collection("notas").add({tipo:"cita", texto, por:yo, en});
            await db.collection("dhs_registro").add({por:yo, en, accion:"cita: " + texto, coleccion:"dhs_trabajos", docId:t.id, nombre:(t.numero||"") + " · " + (t.nombre||"")});
            vista(el, true);
          }catch(e){ alert("No se ha podido agendar (" + (e.code||e) + ")."); }
        };
        document.addEventListener("pointermove", mover); document.addEventListener("pointerup", soltar);
      });
      a.addEventListener("dragstart", e => e.preventDefault());
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
        const nueva = () => { window.DHS_TRAB.prefijar({fecha:col.dataset.f, hora:hhmm(de), duracion:a - de, personal:[col.dataset.k]}); location.hash = "nueva-intervencion"; };
        if(!puedeAus || col.dataset.k === "_sin") return nueva();
        // Ángel 02/11: al marcar un hueco, elegir si es una intervención o una ausencia (médico, día libre…)
        const nom = (P[col.dataset.k]||{}).nombre || "", diaTxt = new Date(col.dataset.f + "T12:00").toLocaleDateString("es-ES", {weekday:"short", day:"numeric", month:"short"});
        const fondo = document.createElement("div"); fondo.className = "preg-fondo";
        fondo.innerHTML = `<div class="preg-caja aus-elegir" role="dialog" aria-modal="true">
          <p><b>${esc(nom)}</b> · ${esc(diaTxt)} · ${hhmm(de)}–${hhmm(a)}</p>
          <button class="btn" data-x="int">📅 Nueva intervención</button>
          <p style="margin:14px 0 6px"><b>o reservar / marcar ausencia:</b></p>
          <div class="aus-mot">${MOTIVOS.map(m => `<button class="btn sec ${/manten/i.test(m) ? "mot-mant" : ""}" data-m="${esc(m)}">${/manten/i.test(m) ? "🔧 " : ""}${esc(m)}</button>`).join("")}</div>
          <label class="aus-todo"><input type="checkbox" id="ausTodo"> Todo el día (no solo de ${hhmm(de)} a ${hhmm(a)})</label>
          <p class="vacio" id="ausMsg"></p>
          <div class="preg-bot"><button class="btn sec" data-x="no">Cancelar</button></div></div>`;
        const cerrar = () => { fondo.remove(); if(sel){ sel.remove(); sel = null; } };
        fondo.addEventListener("click", async e => {
          const b = e.target.closest("button"); if(!b){ if(e.target === fondo) cerrar(); return; }
          if(b.dataset.x === "no") return cerrar();
          if(b.dataset.x === "int"){ fondo.remove(); return nueva(); }
          if(!b.dataset.m) return;
          const todo = fondo.querySelector("#ausTodo").checked;
          const d = {personalId:col.dataset.k, desde:col.dataset.f, hasta:col.dataset.f, motivo:b.dataset.m, ...(todo ? {} : {horaIni:hhmm(de), horaFin:hhmm(a)})};
          const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
          fondo.querySelectorAll("button").forEach(x => x.disabled = true); fondo.querySelector("#ausMsg").textContent = "Guardando…";
          try{
            const r = await db.collection("dhs_ausencias").add({...d, modificado:{por:yo, en}});
            await db.collection("dhs_registro").add({por:yo, en, accion:"alta", coleccion:"dhs_ausencias", docId:r.id, nombre:nom + " · " + d.motivo + " " + d.desde + (d.horaIni ? " (" + d.horaIni + "–" + d.horaFin + ")" : " (todo el día)")});
            fondo.remove(); vista(el);
          }catch(err){ fondo.querySelector("#ausMsg").textContent = "No se ha podido guardar (" + (err.code||err) + ")."; fondo.querySelectorAll("button").forEach(x => x.disabled = false); }
        });
        document.body.appendChild(fondo);
      });
    });

    if(puedeAus){
      const f = el.querySelector("#fAus");
      el.querySelector("#btnAus").onclick = () => f.classList.toggle("oculto");
      const bF = el.querySelector("#btnFurgo"); if(bF) bF.onclick = () => verFurgoneta(trabajos);
      f.querySelector("#ausHoras").onchange = e => f.querySelectorAll(".aus-h").forEach(x => x.classList.toggle("oculto", e.target.value !== "parte"));
      f.onsubmit = async ev => {
        ev.preventDefault();
        const fd = new FormData(f), d = {personalId:fd.get("personalId"), desde:fd.get("desde"), hasta:fd.get("hasta"), motivo:fd.get("motivo")};
        if(d.hasta < d.desde) return el.querySelector("#msgAus").textContent = "La fecha final es anterior a la inicial.";
        if(fd.get("horas") === "parte"){
          d.horaIni = fd.get("horaIni"); d.horaFin = fd.get("horaFin");
          if(!d.horaIni || !d.horaFin || d.horaFin <= d.horaIni) return el.querySelector("#msgAus").textContent = "Pon bien las horas (la de fin, después de la de inicio).";
        }
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        try{
          const r = await db.collection("dhs_ausencias").add({...d, modificado:{por:yo, en}});
          await db.collection("dhs_registro").add({por:yo, en, accion:"alta", coleccion:"dhs_ausencias", docId:r.id, nombre:(P[d.personalId]||{}).nombre + " · " + d.motivo + " " + d.desde + "→" + d.hasta + (d.horaIni ? " (" + d.horaIni + "–" + d.horaFin + ")" : "")});
          vista(el);
        }catch(e){ el.querySelector("#msgAus").textContent = "No se ha podido guardar (" + (e.code||e) + ")."; }
      };
      el.querySelectorAll(".cal-aus").forEach(a => a.onclick = async () => {
        const au = ausencias.find(x => x.id === a.dataset.aus); if(!au) return;
        if(!confirm("¿Borrar la ausencia de " + ((P[au.personalId]||{}).nombre||"") + " (" + au.motivo + ", " + au.desde + " a " + au.hasta + (au.horaIni ? ", de " + au.horaIni + " a " + au.horaFin : "") + ")?")) return;
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        try{
          await db.collection("dhs_ausencias").doc(au.id).delete();
          await db.collection("dhs_registro").add({por:yo, en, accion:"baja", coleccion:"dhs_ausencias", docId:au.id, nombre:(P[au.personalId]||{}).nombre + " · " + au.motivo + " " + au.desde + "→" + au.hasta});
          vista(el);
        }catch(e){ alert("No se ha podido borrar (" + (e.code||e) + ")."); }
      });
    }
  }

  // ---------- 🚐 Dónde está la furgoneta (GPS de Localiza, a través del puente) — Ángel 10/11 ----------
  async function verFurgoneta(trabajos){
    const fondo = document.createElement("div"); fondo.className = "preg-fondo";
    fondo.innerHTML = `<div class="preg-caja furgo-caja" role="dialog" aria-modal="true"><h3>🚐 Furgoneta</h3><div id="furgoTxt"><p class="vacio">Preguntando a Localiza…</p></div>
      <div class="furgo-rec"><label>🗺️ Recorrido del día <input type="date" id="furgoDia" value="${new Date().toLocaleDateString("sv-SE")}"></label> <button class="btn sec" id="furgoRec">Ver recorrido</button></div>
      <div class="preg-bot"><button class="btn sec" id="furgoAct">⟳ Actualizar</button> <button class="btn" id="furgoX">Cerrar</button></div></div>`;
    document.body.appendChild(fondo);
    const cerrar = () => fondo.remove();
    fondo.querySelector("#furgoX").onclick = cerrar; fondo.addEventListener("click", e => { if(e.target === fondo) cerrar(); });
    const km = (a, b) => { const R = 6371, dLa = (b.lat - a.lat) * Math.PI/180, dLo = (b.lon - a.lon) * Math.PI/180;
      const x = Math.sin(dLa/2)**2 + Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180) * Math.sin(dLo/2)**2; return 2 * R * Math.asin(Math.sqrt(x)); };
    const pintar = async () => {
      const caja = fondo.querySelector("#furgoTxt"); caja.innerHTML = `<p class="vacio">Preguntando a Localiza…</p>`;
      let L;
      try{ L = await window.DHS_PRES.llamar("furgoneta", {}); }
      catch(e){ caja.innerHTML = `<p>No se ha podido saber dónde está: ${esc(e.message || e)}</p>`; return; }
      if(!L || !L.length){ caja.innerHTML = `<p>Localiza no devuelve ninguna furgoneta.</p>`; return; }
      // Citas de hoy con coordenadas, para decir "cerca de…"
      const hoy = new Date().toLocaleDateString("sv-SE");
      let C = null; try{ C = await window.DHS_COM.datos(); }catch(e){}
      const citasHoy = trabajos.filter(t => (t.citas||[]).some(c => c.fecha === hoy) && t.comunidadId && C && C.coms[t.comunidadId] && C.coms[t.comunidadId].geo && C.coms[t.comunidadId].geo.lat)
        .map(t => ({t, geo:C.coms[t.comunidadId].geo, hora:((t.citas||[]).find(c => c.fecha === hoy)||{}).hora || ""}));
      // Localiza da la posición en radianes (0,725 = 41,55°): se pasa a grados
      L.forEach(v => { if(Math.abs(v.lat) <= Math.PI && Math.abs(v.lon) <= Math.PI){ v.lat = v.lat * 180 / Math.PI; v.lon = v.lon * 180 / Math.PI; } });
      // Calle donde está (OpenStreetMap)
      await Promise.all(L.map(async v => { try{ const j = await (await fetch("https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=" + v.lat + "&lon=" + v.lon, {headers:{"Accept-Language":"es"}})).json();
        const a = j.address || {}; v.calle = [[a.road, a.house_number].filter(Boolean).join(" "), a.town || a.city || a.village || a.suburb].filter(Boolean).join(", "); }catch(e){} }));
      caja.innerHTML = L.map(v => {
        const ok = isFinite(v.lat) && isFinite(v.lon) && (v.lat || v.lon);
        const cerca = ok ? citasHoy.map(x => ({...x, d:km({lat:v.lat, lon:v.lon}, {lat:Number(x.geo.lat), lon:Number(x.geo.lon)})})).sort((a,b) => a.d - b.d)[0] : null;
        const bb = ok ? [v.lon - 0.006, v.lat - 0.004, v.lon + 0.006, v.lat + 0.004].join(",") : "";
        return `<div class="furgo-item"><p><b>${esc(v.nombre)}</b> · ${v.velocidad > 3 ? `🚗 en marcha, ${Math.round(v.velocidad)} km/h` : "🅿️ parada"} · GPS de las ${esc(String(v.fecha||"").split(" ")[1] || v.fecha || "")}</p>
          ${v.calle ? `<p>📍 <b>${esc(v.calle)}</b></p>` : ""}
          ${cerca && cerca.d < 0.3 ? `<p class="tv-bien">📍 Está en <b>${esc(cerca.t.direccion || cerca.t.nombre)}</b> (cita de las ${esc(cerca.hora)})</p>`
            : cerca ? `<p class="vacio">La cita de hoy más cercana: ${esc(cerca.t.direccion || cerca.t.nombre)} (${esc(cerca.hora)}), a ${cerca.d < 1 ? Math.round(cerca.d * 1000) + " m" : cerca.d.toFixed(1).replace(".", ",") + " km"}.</p>` : ""}
          ${ok ? `<iframe class="furgo-mapa" loading="lazy" src="https://www.openstreetmap.org/export/embed.html?bbox=${bb}&layer=mapnik&marker=${v.lat},${v.lon}"></iframe>
          <p><a class="btn sec btn-mini" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${v.lat},${v.lon}">Abrir en Google Maps</a></p>` : `<p class="vacio">Sin posición GPS ahora mismo.</p>`}</div>`;
      }).join("");
    };
    fondo.querySelector("#furgoAct").onclick = pintar;
    fondo.querySelector("#furgoRec").onclick = () => { const dia = fondo.querySelector("#furgoDia").value; cerrar(); verRecorrido(dia, trabajos); };
    pintar();
  }

  // ---------- 🗺️ Recorrido de un día y paradas (para saber cuánto ha estado en cada sitio) ----------
  let leaflet = null;
  const cargarLeaflet = () => leaflet || (leaflet = new Promise((ok, ko) => {
    if(window.L && window.L.map) return ok(window.L);
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
    const sc = document.createElement("script"); sc.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    sc.onload = () => ok(window.L); sc.onerror = () => { leaflet = null; ko(new Error("No se ha podido cargar el mapa")); }; document.head.appendChild(sc); }));
  async function verRecorrido(dia, trabajos){
    const fondo = document.createElement("div"); fondo.className = "preg-fondo";
    const diaTxt = new Date(dia + "T12:00").toLocaleDateString("es-ES", {weekday:"long", day:"numeric", month:"long"});
    fondo.innerHTML = `<div class="preg-caja rec-caja" role="dialog" aria-modal="true"><h3>🗺️ Recorrido · ${esc(diaTxt)}</h3><div id="recTxt"><p class="vacio">Pidiendo el recorrido a Localiza…</p></div>
      <div class="preg-bot"><button class="btn" id="recX">Cerrar</button></div></div>`;
    document.body.appendChild(fondo);
    fondo.querySelector("#recX").onclick = () => fondo.remove(); fondo.addEventListener("click", e => { if(e.target === fondo) fondo.remove(); });
    const caja = fondo.querySelector("#recTxt");
    let V, Lf, C = null;
    try{ [V, Lf] = await Promise.all([window.DHS_PRES.llamar("recorrido", {fecha:dia}), cargarLeaflet()]); }
    catch(e){ caja.innerHTML = `<p>No se ha podido sacar el recorrido: ${esc(e.message || e)}</p>`; return; }
    try{ C = await window.DHS_COM.datos(); }catch(e){}
    const km = (a, b) => { const R = 6371, dLa = (b[0] - a[0]) * Math.PI/180, dLo = (b[1] - a[1]) * Math.PI/180;
      const x = Math.sin(dLa/2)**2 + Math.cos(a[0]*Math.PI/180) * Math.cos(b[0]*Math.PI/180) * Math.sin(dLo/2)**2; return 2 * R * Math.asin(Math.sqrt(x)); };
    const hm = f => { const m = String(f).match(/(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
    const hh = m => String(Math.floor(m/60)).padStart(2,"0") + ":" + String(m % 60).padStart(2,"0");
    const durT = m => m < 60 ? m + " min" : Math.floor(m/60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "");
    // Comunidades con coordenadas y las citas de ese día
    const COMS = C ? Object.entries(C.coms).filter(([k,c]) => c.geo && c.geo.lat).map(([k,c]) => ({k, n:c.nombre || c.direccion, d:c.direccion, p:[Number(c.geo.lat), Number(c.geo.lon)]})) : [];
    const citaDe = k => { const t = trabajos.find(t => t.comunidadId === k && (t.citas||[]).some(c => c.fecha === dia)); return t ? ((t.citas||[]).find(c => c.fecha === dia)||{}).hora || "" : null; };
    caja.innerHTML = "";
    V.forEach((v, n) => {
      const P = (v.puntos||[]).filter(p => isFinite(p[0]) && isFinite(p[1]) && p[0]).map(p => ({p:[p[0], p[1]], m:hm(p[2]), vel:p[3], kms:p[4]})).filter(x => x.m != null).sort((a,b) => a.m - b.m);
      const bloque = document.createElement("div"); bloque.className = "rec-veh"; caja.appendChild(bloque);
      if(!P.length){ bloque.innerHTML = `<p><b>${esc(v.nombre)}</b>: sin recorrido ese día.</p>`; return; }
      // Paradas: puntos seguidos a menos de 150 m, parado o sin señal, durante 5 minutos o más
      const par = []; let cur = null;
      for(let i = 1; i < P.length; i++){ const a = P[i-1], b = P[i];
        if(km(a.p, b.p) < 0.15 && (b.vel < 3 || b.m - a.m >= 5)){ if(!cur) cur = {ini:a.m, fin:b.m, p:a.p}; else cur.fin = b.m; }
        else if(cur){ par.push(cur); cur = null; } }
      if(cur) par.push(cur);
      const paradas = par.filter(x => x.fin - x.ini >= 5).map(x => { const c = COMS.map(c => ({...c, d2:km(x.p, c.p)})).sort((a,b) => a.d2 - b.d2)[0];
        return {...x, dur:x.fin - x.ini, com:c && c.d2 < 0.2 ? c : null}; });
      const kms = P[P.length-1].kms && P[0].kms ? Math.round(P[P.length-1].kms - P[0].kms) : Math.round(P.slice(1).reduce((s,x,i) => s + km(P[i].p, x.p), 0));
      bloque.innerHTML = `<p><b>${esc(v.nombre)}</b> · de ${hh(P[0].m)} a ${hh(P[P.length-1].m)} · ${kms} km · ${paradas.length} parada${paradas.length===1?"":"s"}</p>
        <div class="rec-mapa" id="recMapa${n}"></div>
        <table class="tabla-fi rec-tabla"><thead><tr><th>#</th><th>Llega</th><th>Se va</th><th>Tiempo</th><th>Dónde</th></tr></thead><tbody>
        ${paradas.map((x,i) => `<tr><td>${i+1}</td><td>${hh(x.ini)}</td><td>${hh(x.fin)}</td><td><b>${durT(x.dur)}</b></td><td class="rec-donde" data-i="${i}">${x.com ? `<b>${esc(x.com.n)}</b>${citaDe(x.com.k) != null ? ` <span class="tag">cita ${esc(citaDe(x.com.k))}</span>` : ""}` : `<span class="vacio">buscando calle…</span>`}</td></tr>`).join("") || `<tr><td colspan="5" class="vacio">Sin paradas de 5 minutos o más.</td></tr>`}</tbody></table>`;
      const mapa = Lf.map(bloque.querySelector(".rec-mapa"));
      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:"© OpenStreetMap"}).addTo(mapa);
      const linea = Lf.polyline(P.map(x => x.p), {color:"#2f6fd6", weight:4}).addTo(mapa);
      paradas.forEach((x,i) => Lf.marker(x.p, {icon:Lf.divIcon({className:"pin-parada", html:String(i+1)})}).addTo(mapa).bindPopup(`${hh(x.ini)}–${hh(x.fin)} · ${durT(x.dur)}${x.com ? "<br>" + esc(x.com.n) : ""}`));
      Lf.circleMarker(P[0].p, {radius:7, color:"#1f7a3d", fillOpacity:1}).addTo(mapa).bindPopup("Sale " + hh(P[0].m));
      Lf.circleMarker(P[P.length-1].p, {radius:7, color:"#b03a2e", fillOpacity:1}).addTo(mapa).bindPopup("Última posición " + hh(P[P.length-1].m));
      mapa.fitBounds(linea.getBounds(), {padding:[20,20]});
      // Calle de las paradas que no están en una comunidad conocida (de una en una, como pide OpenStreetMap)
      (async () => { for(let i = 0; i < paradas.length && i < 12; i++){ const x = paradas[i]; if(x.com) continue;
        try{ const j = await (await fetch("https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=" + x.p[0] + "&lon=" + x.p[1], {headers:{"Accept-Language":"es"}})).json();
          const a = j.address || {}; const td = bloque.querySelector(`.rec-donde[data-i="${i}"]`); if(td) td.textContent = [[a.road, a.house_number].filter(Boolean).join(" "), a.town || a.city || a.village || a.suburb].filter(Boolean).join(", ") || "—"; }catch(e){}
        await new Promise(r => setTimeout(r, 1100)); } })();
    });
  }

  window.DHS_CAL = { vista };
})();
