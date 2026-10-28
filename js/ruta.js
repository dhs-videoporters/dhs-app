// DHS App — 🚐 Ruta de visitas rápidas (Ángel y Joel 26/10/2026): las «chorraditas» (cosa pequeña, visita para presupuesto)
// pendientes se ven en un mapa, se eligen 5-8 y la app las ordena por cercanía saliendo de la nave, para no ir de una punta
// a otra. Luego: abrir la ruta en Google Maps, mandarla por WhatsApp al técnico y ponerlas seguidas en su agenda.
// Coordenadas: OpenStreetMap (Nominatim, gratis), una vez por dirección; se guardan en la comunidad (campo geo).
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  const BASE = {nombre:"Nave DHS", direccion:"Carrer de Pau Marsal 77, Terrassa", lat:null, lon:null};
  const RAPIDAS = ["pequeno", "presupuesto"];
  const TIPOS = {pequeno:"Cosa pequeña", presupuesto:"Visita para presupuesto", reparacion:"Reparación", mantenimiento:"Mantenimiento", instalacion:"Instalación"};
  const CERRADOS = ["hecho","esperando","facturado","cobrado","cancelado","encurso"];
  let leaflet = null, GEO = {};
  try{ GEO = JSON.parse(localStorage.getItem("dhs_geo") || "{}"); }catch(e){ GEO = {}; }
  const guardaGeoLocal = () => { try{ localStorage.setItem("dhs_geo", JSON.stringify(GEO)); }catch(e){} };

  function cargarLeaflet(){
    if(window.L && window.L.map) return Promise.resolve(window.L);
    if(!leaflet) leaflet = new Promise((ok, ko) => {
      const css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(css);
      const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      s.onload = () => ok(window.L); s.onerror = () => { leaflet = null; ko(new Error("No se ha podido cargar el mapa")); }; document.head.appendChild(s);
    });
    return leaflet;
  }
  const textoDir = (dir, pob) => [dir, pob || "Terrassa", "Barcelona", "España"].filter(Boolean).join(", ");
  const espera = ms => new Promise(r => setTimeout(r, ms));
  let ultima = 0;
  async function geocodificar(q){
    if(GEO[q]) return GEO[q];
    const falta = 1100 - (Date.now() - ultima); if(falta > 0) await espera(falta);   // Nominatim: 1 petición por segundo
    ultima = Date.now();
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=es&q=" + encodeURIComponent(q), {headers:{"Accept-Language":"es"}});
    const j = await r.json();
    const g = j && j[0] ? {lat:Number(j[0].lat), lon:Number(j[0].lon)} : {nada:true};
    GEO[q] = g; guardaGeoLocal(); return g;
  }
  const km = (a, b) => { const R = 6371, dLa = (b.lat - a.lat) * Math.PI/180, dLo = (b.lon - a.lon) * Math.PI/180;
    const x = Math.sin(dLa/2)**2 + Math.cos(a.lat*Math.PI/180) * Math.cos(b.lat*Math.PI/180) * Math.sin(dLo/2)**2; return 2 * R * Math.asin(Math.sqrt(x)); };
  // Orden: el más cercano cada vez desde la nave, y luego mejora 2-opt (quita cruces)
  function ordenar(paradas){
    let resto = paradas.slice(), act = BASE, orden = [];
    while(resto.length){ resto.sort((a,b) => km(act, a.geo) - km(act, b.geo)); act = resto.shift(); orden.push(act); act = act.geo; }
    const largo = L => L.reduce((n, p, i) => n + km(i ? L[i-1].geo : BASE, p.geo), 0);
    let mejora = true;
    while(mejora){ mejora = false;
      for(let i = 0; i < orden.length - 1; i++) for(let k = i + 1; k < orden.length; k++){
        const nuevo = orden.slice(0, i).concat(orden.slice(i, k + 1).reverse(), orden.slice(k + 1));
        if(largo(nuevo) + 0.01 < largo(orden)){ orden = nuevo; mejora = true; }
      }
    }
    return {orden, km:Math.round(largo(orden) * 10) / 10};
  }

  async function vista(el){
    const {db, S} = D();
    if(!S.puede("trabajos","todo")){ el.innerHTML = `<div class="panel">Sin permiso.</div>`; return; }
    el.innerHTML = `<div class="panel">Cargando…</div>`;
    let T = [], P = {}, C;
    try{
      (await db.collection("dhs_trabajos").get()).forEach(d => T.push({id:d.id, ...d.data()}));
      (await db.collection("dhs_personal").get()).forEach(d => P[d.id] = d.data());
      C = await window.DHS_COM.datos();
    }catch(e){ el.innerHTML = `<div class="panel">No se ha podido cargar (${esc(e.code||e)}).</div>`; return; }
    let soloRapidas = true;
    const candidatas = () => T.filter(t => !CERRADOS.includes(t.estado) && (!soloRapidas || t.ruta || RAPIDAS.includes(t.tipo)) && !(t.citas||[]).length)
      .map(t => { const c = t.comunidadId ? C.coms[t.comunidadId] : null; const dir = (c && c.direccion) || t.direccion || (c && c.nombre) || t.nombre || "", pob = (c && c.poblacion) || t.poblacion || "";
        return {t, c, dir, pob, q:textoDir(dir, pob), geo:(c && c.geo && c.geo.lat) ? c.geo : null}; })
      .sort((a,b) => (a.t.urgencia === "urgente" ? 0 : 1) - (b.t.urgencia === "urgente" ? 0 : 1) || (a.pob||"").localeCompare(b.pob||"") || a.dir.localeCompare(b.dir));
    let L = candidatas(), elegidas = new Set(), mapa = null, capa = null, resultado = null;
    const activos = Object.entries(P).filter(([k,p]) => p.activo !== false && p.tipo !== "otros");
    el.innerHTML = `
      <div class="panel">
        <div class="cab-lista"><h2>🚐 Ruta de visitas rápidas</h2><a class="btn sec" href="#intervenciones">‹ Intervenciones</a></div>
        <p class="vacio">Pendientes sin fecha. Marca las que quieras hacer (5-8 para una mañana) y pulsa <b>Ordenar ruta</b>: salen en el orden más corto desde la nave (Pau Marsal 77).</p>
        <label class="chk"><input type="checkbox" id="chRap" checked> Solo visitas rápidas (marcadas «para la ruta», cosa pequeña y visita para presupuesto)</label>
        <div class="ruta-grid">
          <div><div id="listaRuta" class="lista"></div></div>
          <div><div id="mapaRuta" class="mapa-ruta"></div><p id="msgRuta" class="vacio" style="margin-top:6px"></p></div>
        </div>
        <p style="margin-top:10px"><button class="btn" id="bOrdenar">🧭 Ordenar ruta</button> <span class="vacio" id="cuentaRuta"></span></p>
        <div id="resRuta"></div>
      </div>`;
    const m = t => el.querySelector("#msgRuta").textContent = t;
    const pintaLista = () => {
      el.querySelector("#listaRuta").innerHTML = L.map((x, i) => `<label class="fila-ruta"><input type="checkbox" data-i="${i}" ${elegidas.has(x.t.id) ? "checked" : ""}>
        <span><b>${x.t.urgencia === "urgente" ? "🔴 " : ""}${esc(x.dir)}</b>${x.pob ? " · " + esc(x.pob) : ""}${x.geo && x.geo.nada ? ` <span class="tag aviso">sin ubicar</span>` : ""}<br>
        <span class="vacio">${esc(TIPOS[x.t.tipo] || "")} · ${esc((x.t.descripcion||"").slice(0,80))}</span></span></label>`).join("") || `<p class="vacio">No hay visitas pendientes sin fecha.</p>`;
      el.querySelector("#cuentaRuta").textContent = elegidas.size + " elegida" + (elegidas.size === 1 ? "" : "s");
      el.querySelectorAll("#listaRuta input").forEach(c => c.onchange = () => { const x = L[c.dataset.i]; c.checked ? elegidas.add(x.t.id) : elegidas.delete(x.t.id); el.querySelector("#cuentaRuta").textContent = elegidas.size + " elegida" + (elegidas.size === 1 ? "" : "s"); });
    };
    pintaLista();
    el.querySelector("#chRap").onchange = e => { soloRapidas = e.target.checked; L = candidatas(); pintaLista(); pintaMapa(); };

    // Mapa con todas las candidatas (las ubica poco a poco la primera vez)
    let Lf;
    try{ Lf = await cargarLeaflet(); }catch(e){ m(e.message); }
    const pintaMapa = () => {
      if(!Lf) return;
      if(!mapa){ mapa = Lf.map(el.querySelector("#mapaRuta")).setView([41.56, 2.01], 12);
        Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:"© OpenStreetMap"}).addTo(mapa); }
      if(capa) capa.remove(); capa = Lf.layerGroup().addTo(mapa);
      const pts = [];
      if(BASE.lat){ Lf.marker([BASE.lat, BASE.lon], {icon:Lf.divIcon({className:"pin-ruta base", html:"🏠"})}).addTo(capa).bindPopup("Nave DHS"); pts.push([BASE.lat, BASE.lon]); }
      const orden = resultado ? resultado.orden : null;
      L.forEach(x => { if(!x.geo || x.geo.nada) return;
        const n = orden ? orden.indexOf(x) : -1;
        Lf.marker([x.geo.lat, x.geo.lon], {icon:Lf.divIcon({className:"pin-ruta" + (n >= 0 ? " sel" : (x.t.urgencia === "urgente" ? " urg" : "")), html:n >= 0 ? String(n + 1) : "•"})}).addTo(capa)
          .bindPopup(`<b>${esc(x.dir)}</b><br>${esc(TIPOS[x.t.tipo]||"")}<br>${esc((x.t.descripcion||"").slice(0,80))}`)
          .on("click", () => { elegidas.has(x.t.id) ? elegidas.delete(x.t.id) : elegidas.add(x.t.id); pintaLista(); });
        if(!orden || n >= 0) pts.push([x.geo.lat, x.geo.lon]); });
      if(orden && BASE.lat) Lf.polyline([[BASE.lat, BASE.lon]].concat(orden.map(x => [x.geo.lat, x.geo.lon])), {weight:4, opacity:.7}).addTo(capa);
      if(pts.length) mapa.fitBounds(pts, {padding:[30,30], maxZoom:15});
    };
    const yo = S.usuario.email.toLowerCase(), en = () => firebase.firestore.FieldValue.serverTimestamp();
    const ubicar = async lista => {
      if(!BASE.lat){ try{ const g = await geocodificar(textoDir("Carrer de Pau Marsal 77", "Terrassa")); if(g.lat){ BASE.lat = g.lat; BASE.lon = g.lon; } }catch(e){} }
      const faltan = lista.filter(x => !x.geo);
      for(let i = 0; i < faltan.length; i++){
        const x = faltan[i]; m("Situando direcciones en el mapa… " + (i + 1) + " de " + faltan.length);
        try{ x.geo = await geocodificar(x.q);
          if(x.c && x.geo.lat && x.t.comunidadId){ x.c.geo = {lat:x.geo.lat, lon:x.geo.lon}; db.collection("dhs_comunidades").doc(x.t.comunidadId).update({geo:x.c.geo, modificado:{por:yo, en:en()}}).catch(() => {}); }
        }catch(e){ x.geo = null; }
        if(i % 5 === 4) pintaMapa();
      }
      m(faltan.length ? "" : ""); pintaMapa();
    };
    ubicar(L);

    el.querySelector("#bOrdenar").onclick = async () => {
      const sel = L.filter(x => elegidas.has(x.t.id));
      if(sel.length < 2) return m("Marca al menos 2 visitas.");
      await ubicar(sel);
      const ok = sel.filter(x => x.geo && x.geo.lat), mal = sel.filter(x => !(x.geo && x.geo.lat));
      if(!BASE.lat || ok.length < 2) return m("No se han podido situar las direcciones en el mapa.");
      resultado = ordenar(ok); pintaMapa();
      const O = resultado.orden;
      const gm = "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" + encodeURIComponent(BASE.direccion)
        + "&destination=" + encodeURIComponent(textoDir(O[O.length-1].dir, O[O.length-1].pob))
        + (O.length > 1 ? "&waypoints=" + encodeURIComponent(O.slice(0, -1).slice(0, 9).map(x => textoDir(x.dir, x.pob)).join("|")) : "");
      const txt = "🚐 *Ruta de visitas DHS*\n\n" + O.map((x, i) => `${i + 1}. *${x.dir}${x.pob ? ", " + x.pob : ""}*\n   ${TIPOS[x.t.tipo] || ""}: ${(x.t.descripcion||"").slice(0,120)}${x.t.avisa && x.t.avisa.telefono ? "\n   📞 " + [x.t.avisa.nombre, x.t.avisa.telefono].filter(Boolean).join(" ") : ""}`).join("\n\n")
        + "\n\n🗺️ Ruta en el mapa: " + gm;
      el.querySelector("#resRuta").innerHTML = `<div class="bloque" style="margin-top:12px">
        <h3>Orden de la ruta · ${O.length} paradas · unos ${resultado.km} km</h3>
        ${mal.length ? `<p class="aviso-cal">No se han podido situar: ${mal.map(x => esc(x.dir)).join(", ")}. No entran en la ruta (corrige la dirección en la ficha).</p>` : ""}
        ${O.length > 10 ? `<p class="aviso-cal">Google Maps solo admite 10 paradas en un enlace: el resto, en el orden de la lista.</p>` : ""}
        <ol class="orden-ruta">${O.map(x => `<li><b>${esc(x.dir)}</b>${x.pob ? " · " + esc(x.pob) : ""} <span class="vacio">— ${esc((x.t.descripcion||"").slice(0,70))}</span> <a href="#intervencion/${esc(x.t.id)}">abrir</a></li>`).join("")}</ol>
        <p><a class="btn" href="${esc(gm)}" target="_blank" rel="noopener">🗺️ Abrir en Google Maps</a>
          <a class="btn sec" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">📲 Mandar por WhatsApp</a>
          <button class="btn sec" id="bCopiaR">📋 Copiar texto</button></p>
        <h4 style="margin-top:12px">📅 Poner en la agenda</h4>
        <div class="fila-form">
          <label class="campo"><span>Quién va</span><select id="rQuien">${activos.map(([k,p]) => `<option value="${esc(k)}">${esc(p.nombre)}</option>`).join("")}</select></label>
          <label class="campo"><span>Día</span><input id="rDia" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
          <label class="campo"><span>Empieza a las</span><input id="rHora" type="time" value="09:00" step="1800"></label>
          <label class="campo"><span>Cada visita</span><select id="rDur"><option value="30">30 min</option><option value="60">1 hora</option></select></label>
          <label class="campo"><span>Trayecto entre visitas</span><select id="rTray"><option value="0">0</option><option value="15" selected>15 min</option><option value="30">30 min</option></select></label>
        </div>
        <p><button class="btn btn-ok" id="bAgenda">Poner las ${O.length} visitas en la agenda</button> <span id="msgAg" class="vacio"></span></p></div>`;
      el.querySelector("#bCopiaR").onclick = async () => { try{ await navigator.clipboard.writeText(txt); el.querySelector("#bCopiaR").textContent = "✅ Copiado"; }catch(e){} };
      el.querySelector("#bAgenda").onclick = async () => {
        const quien = el.querySelector("#rQuien").value, dia = el.querySelector("#rDia").value, dur = Number(el.querySelector("#rDur").value), tray = Number(el.querySelector("#rTray").value);
        let [h, mi] = el.querySelector("#rHora").value.split(":").map(Number); let min = h * 60 + (mi||0);
        if(!quien || !dia) return;
        if(!await DHS_PREGUNTA("¿Poner las " + O.length + " visitas el " + new Date(dia + "T12:00").toLocaleDateString("es-ES") + " a " + (P[quien] ? P[quien].nombre : "") + ", seguidas desde las " + el.querySelector("#rHora").value + "?", "Sí, ponerlas", "No")) return;
        const ma = x => el.querySelector("#msgAg").textContent = x;
        try{
          for(let i = 0; i < O.length; i++){
            const x = O[i], hora = String(Math.floor(min/60)).padStart(2,"0") + ":" + String(min%60).padStart(2,"0");
            await db.collection("dhs_trabajos").doc(x.t.id).update({citas:[{fecha:dia, hora, duracion:dur, personal:[quien]}], asignados:[quien], estado:["nuevo","presupuesto"].includes(x.t.estado) ? "agendado" : x.t.estado, rutaOrden:i + 1, ruta:false, modificado:{por:yo, en:en()}});
            await db.collection("dhs_trabajos").doc(x.t.id).collection("notas").add({tipo:"cita", texto:"Ruta del " + dia + ": parada " + (i + 1) + " a las " + hora + " · " + (P[quien] ? P[quien].nombre : ""), por:yo, en:en()});
            ma("Guardando " + (i + 1) + " de " + O.length + "…");
            min += dur + tray;
          }
          await db.collection("dhs_registro").add({por:yo, en:en(), accion:"ruta de " + O.length + " visitas puesta en la agenda (" + dia + ")", coleccion:"dhs_trabajos"});
          ma("✅ Puestas en la agenda. Mira el calendario del " + new Date(dia + "T12:00").toLocaleDateString("es-ES") + ".");
        }catch(e){ ma("No se ha podido guardar (" + (e.code||e) + ")."); }
      };
      el.querySelector("#resRuta").scrollIntoView({behavior:"smooth"});
    };
  }
  window.DHS_RUTA = { vista };
})();
