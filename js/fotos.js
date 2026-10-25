// DHS App — Fotos (sesión 20): se hacen desde la ficha de trabajo o la Galería de la comunidad.
// Se reducen en el móvil antes de subir (grande ~1600 px y miniatura 400 px) para que ocupen poco.
// Se guardan en Firebase Storage (carpeta fotos/) y su referencia en Firestore:
//   - de una intervención → campo `fotos` de dhs_trabajos/<id>
//   - de la finca (placa, cuarto de antenas, grabador…) → dhs_comunidades/<id>/fotos
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const D = () => window.DHS;
  const ETIQUETAS = ["Placa de calle", "Monitor / teléfono de vivienda", "Cuarto de antenas", "Grabador / cámaras", "Cuadro eléctrico", "Centralita / fuente", "Otra"];
  const AVISO_SIN_STORAGE = "Las fotos todavía no están activadas (falta activar el almacenamiento en Firebase).";

  const storage = () => { try{ return firebase.storage(); }catch(e){ return null; } };
  const URLS = {};
  async function url(ruta){
    if(!URLS[ruta]) URLS[ruta] = await storage().ref(ruta).getDownloadURL();
    return URLS[ruta];
  }

  // Reduce la imagen en el propio móvil.
  function reducir(file, max, calidad){
    return new Promise((ok, ko) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const r = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        c.toBlob(b => b ? ok(b) : ko("no se ha podido leer la foto"), "image/jpeg", calidad);
      };
      img.onerror = () => { URL.revokeObjectURL(u); ko("no es una imagen"); };
      img.src = u;
    });
  }

  // Sube una foto y devuelve {ruta, mini, en, por}
  async function subir(file, carpeta){
    const st = storage(); if(!st) throw AVISO_SIN_STORAGE;
    const {S} = D(), yo = S.usuario.email.toLowerCase();
    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    const [grande, mini] = await Promise.all([reducir(file, 1600, 0.78), reducir(file, 400, 0.7)]);
    const meta = {contentType:"image/jpeg", customMetadata:{por:yo}};
    const ruta = "fotos/" + carpeta + "/" + id + ".jpg", rutaMini = "fotos/" + carpeta + "/" + id + "_mini.jpg";
    try{
      await st.ref(ruta).put(grande, meta);
      await st.ref(rutaMini).put(mini, meta);
    }catch(e){
      if(["storage/unknown","storage/bucket-not-found","storage/project-not-found","storage/retry-limit-exceeded"].includes(e.code)) throw AVISO_SIN_STORAGE;
      throw e.code || e;
    }
    return {ruta, mini:rutaMini, en:Date.now(), por:yo};
  }

  // Pinta miniaturas (cada una abre la foto grande)
  async function pintarMinis(caja, fotos){
    caja.innerHTML = fotos.length ? fotos.map((f, i) => `<a class="mini" data-i="${i}" target="_blank" rel="noopener"><span class="mini-cargando"></span>${f.etiqueta || f.pie ? `<em>${esc(f.etiqueta || f.pie)}</em>` : ""}</a>`).join("") : `<p class="vacio">Sin fotos.</p>`;
    const as = caja.querySelectorAll(".mini");
    await Promise.all(fotos.map(async (f, i) => {
      try{
        const [g, m] = await Promise.all([url(f.ruta), url(f.mini || f.ruta)]);
        as[i].href = g; as[i].style.backgroundImage = `url("${m}")`; as[i].querySelector(".mini-cargando").remove();
      }catch(e){ as[i].querySelector(".mini-cargando").textContent = "⚠️"; }
    }));
  }

  // Botón de cámara: en el móvil abre la cámara; en el ordenador, elegir archivo. Permite varias.
  function botonCamara(texto, alElegir){
    const w = document.createElement("label");
    w.className = "btn sec btn-foto";
    w.innerHTML = `${texto}<input type="file" accept="image/*" capture="environment" multiple hidden>`;
    w.querySelector("input").onchange = e => { const fs = [...e.target.files]; e.target.value = ""; if(fs.length) alElegir(fs); };
    return w;
  }

  // ---------- Fotos de una intervención (ficha de trabajo y ficha de la intervención) ----------
  async function bloqueTrabajo(el, id, t, puedeSubir){
    el.innerHTML = `<h3>Fotos</h3><div class="minis"></div><p class="msg-foto vacio"></p>`;
    const caja = el.querySelector(".minis"), msg = x => el.querySelector(".msg-foto").textContent = x;
    let fotos = (t.fotos || []).slice();
    pintarMinis(caja, fotos);
    if(!puedeSubir) return;
    const carpeta = t.comunidadId ? "comunidades/" + t.comunidadId + "/" + id : "particulares/" + id;
    el.querySelector("h3").after(botonCamara("📷 Hacer / subir foto", async files => {
      const {db, S} = D(), yo = S.usuario.email.toLowerCase();
      for(let i = 0; i < files.length; i++){
        msg("Subiendo foto " + (i+1) + " de " + files.length + "…");
        try{
          const f = await subir(files[i], carpeta);
          await db.collection("dhs_trabajos").doc(id).update({fotos:firebase.firestore.FieldValue.arrayUnion(f), modificado:{por:yo, en:firebase.firestore.FieldValue.serverTimestamp()}});
          fotos.push(f); pintarMinis(caja, fotos);
        }catch(e){ msg("No se ha podido subir: " + e); return; }
      }
      msg(files.length === 1 ? "Foto guardada." : files.length + " fotos guardadas.");
    }));
  }

  // ---------- Galería de la comunidad: fotos de la finca + fotos de todas sus intervenciones ----------
  async function galeriaComunidad(el, comId){
    const {db, S} = D();
    el.innerHTML = `<p class="vacio">Cargando…</p>`;
    const ref = db.collection("dhs_comunidades").doc(comId).collection("fotos");
    let finca = [], deTrabajos = [];
    try{ (await ref.get()).forEach(d => finca.push({id:d.id, ...d.data()})); }catch(e){}
    if(S.puede("trabajos","ver")){
      try{ (await db.collection("dhs_trabajos").where("comunidadId", "==", comId).get()).forEach(d => {
        const t = d.data(); (t.fotos||[]).forEach(f => deTrabajos.push({...f, pie:(t.fechaHecho || "") + " · " + t.numero, trabajoId:d.id}));
      }); }catch(e){}
    }
    finca.sort((a,b) => (a.en||0) - (b.en||0)); deTrabajos.sort((a,b) => (b.en||0) - (a.en||0));
    const puedeSubir = S.puede("trabajos","editar") || S.puede("comunidades","editar");
    el.innerHTML = `
      <h3>Galería</h3>
      <div class="bloque" style="margin-top:8px"><h3>La finca</h3>
        <p class="vacio">Placa de calle, monitor de vivienda, cuarto de antenas, grabador, cuadro… para reconocerlo antes de ir.</p>
        ${puedeSubir ? `<div class="sube-finca"><select id="etqFoto">${ETIQUETAS.map(e => `<option>${e}</option>`).join("")}</select><span id="hueco"></span></div>` : ""}
        <div class="minis" id="mFinca"></div><p class="msg-foto vacio" id="msgFinca"></p></div>
      ${S.puede("trabajos","ver") ? `<div class="bloque" style="margin-top:12px"><h3>De las intervenciones</h3><div class="minis" id="mTrab"></div></div>` : ""}`;
    pintarMinis(el.querySelector("#mFinca"), finca);
    if(el.querySelector("#mTrab")) pintarMinis(el.querySelector("#mTrab"), deTrabajos);
    if(!puedeSubir) return;
    const msg = x => el.querySelector("#msgFinca").textContent = x;
    el.querySelector("#hueco").replaceWith(botonCamara("📷 Añadir foto", async files => {
      const yo = S.usuario.email.toLowerCase(), etiqueta = el.querySelector("#etqFoto").value;
      for(let i = 0; i < files.length; i++){
        msg("Subiendo foto " + (i+1) + " de " + files.length + "…");
        try{
          const f = await subir(files[i], "comunidades/" + comId + "/finca");
          const d = {...f, etiqueta, modificado:{por:yo, en:firebase.firestore.FieldValue.serverTimestamp()}};
          const r = await ref.add(d); finca.push({id:r.id, ...d});
          pintarMinis(el.querySelector("#mFinca"), finca);
        }catch(e){ msg("No se ha podido subir: " + e); return; }
      }
      msg("Guardado.");
    }));
  }

  window.DHS_FOTOS = { subir, bloqueTrabajo, galeriaComunidad };
})();
