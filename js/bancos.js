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
        ${b && b.iban ? `<p class="iban">${esc(fmt(b.iban))} ${valido(b.iban) ? "" : `<span class="tag aviso">IBAN no válido</span>`}</p>${b.titular ? `<p class="vacio">Titular: ${esc(b.titular)}</p>` : ""}<p class="vacio">${b.origen ? "Origen: " + esc(b.origen) : ""}</p>` : `<p class="vacio">Sin número de cuenta.</p>`}
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

  // Ajustes › Cuentas: importar los números de cuenta desde la copia de la app de cobros (lo hace Dirección)
  async function vistaImportar(el){
    const {db, S} = D();
    if(!edita()){ el.innerHTML = `<p class="vacio">Solo Dirección.</p>`; return; }
    el.innerHTML = `<h3>Números de cuenta</h3>
      <p class="vacio" style="margin:4px 0 10px">Trae los números de cuenta de la app de <b>cobros</b>: en cobros, Ajustes › Copia de seguridad › descargar; aquí, elige ese archivo. Solo se guardan en la app nueva para Dirección; los técnicos no los ven.</p>
      <p><input type="file" id="fCob" accept=".json"> <button class="btn sec" id="bRev" disabled>Revisar</button></p>
      <div id="resCob"></div>`;
    const f = el.querySelector("#fCob"), bR = el.querySelector("#bRev"), res = el.querySelector("#resCob");
    f.onchange = () => { bR.disabled = !f.files.length; res.innerHTML = ""; };
    bR.onclick = async () => {
      let cop; try{ cop = JSON.parse(await f.files[0].text()); }catch(e){ res.innerHTML = `<p class="ko">No se puede leer el archivo.</p>`; return; }
      const docs = cop.docs || {};
      const C = await window.DHS_COM.datos();
      const porCs = {}, porNif = {};
      Object.entries(C.coms).forEach(([k,c]) => { if(c.csId) porCs[String(c.csId)] = k; if(c.nif) porNif[limpio(c.nif)] = k; });
      const L = [];
      Object.values(docs).forEach(d => {
        if(!d || !d.iban) return;
        const k = porCs[String(d.csId)] || porNif[limpio(d.nif)]; if(!k) return;
        L.push({comId:k, iban:limpio(d.iban), ok:valido(d.iban), nombre:C.coms[k].nombre});
      });
      res.innerHTML = `<p style="margin-top:8px"><b>${L.length}</b> comunidades/clientes con número de cuenta encontrados${L.filter(x => !x.ok).length ? " (" + L.filter(x => !x.ok).length + " con IBAN no válido: se guardan marcados)" : ""}.</p>
        ${L.length ? `<p><button class="btn" id="bImp">Guardar ${L.length} números de cuenta</button> <span id="msgImp" class="vacio"></span></p>` : ""}`;
      const bI = res.querySelector("#bImp"); if(!bI) return;
      bI.onclick = async () => {
        bI.disabled = true;
        const yo = S.usuario.email.toLowerCase(), en = firebase.firestore.FieldValue.serverTimestamp();
        try{
          for(let i = 0; i < L.length; i += 400){ const b = db.batch(); L.slice(i, i+400).forEach(x => b.set(db.collection("dhs_bancos").doc(x.comId), {iban:x.iban, origen:"app de cobros", modificado:{por:yo, en}}, {merge:true})); await b.commit(); }
          await db.collection("dhs_registro").add({por:yo, en, accion:"números de cuenta importados de cobros (" + L.length + ")", coleccion:"dhs_bancos"});
          res.querySelector("#msgImp").textContent = "Hecho.";
        }catch(e){ res.querySelector("#msgImp").textContent = "No se ha podido (" + (e.code||e) + ")."; bI.disabled = false; }
      };
    };
  }

  window.DHS_BANCO = { bloque, vistaImportar, valido };
})();
