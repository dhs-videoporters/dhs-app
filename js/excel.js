// DHS App — Excel: descargar y leer hojas (.xlsx, .xls, .csv) para cualquier apartado.
// La librería (SheetJS) solo se carga la primera vez que hace falta.
(function(){
  let carga = null;
  function lib(){
    if(window.XLSX) return Promise.resolve(window.XLSX);
    if(!carga) carga = new Promise((ok, ko) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
      s.onload = () => ok(window.XLSX); s.onerror = () => { carga = null; ko(new Error("No se ha podido cargar el lector de Excel (¿sin conexión?).")); };
      document.head.appendChild(s);
    });
    return carga;
  }
  // Descargar: filas = [{Columna: valor, ...}]
  async function descargar(nombre, filas, hoja){
    const X = await lib();
    const ws = X.utils.json_to_sheet(filas);
    const cols = Object.keys(filas[0] || {});
    ws["!cols"] = cols.map(k => ({wch: Math.min(50, Math.max(k.length, ...filas.map(f => String(f[k] ?? "").length)) + 2)}));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, hoja || "Datos");
    X.writeFile(wb, nombre.endsWith(".xlsx") ? nombre : nombre + ".xlsx");
  }
  // Leer: devuelve las filas de la primera hoja como objetos {cabecera: valor}
  async function leer(file){
    const nombre = (file.name || "").toLowerCase();
    if(nombre.endsWith(".json")){
      const j = JSON.parse(await file.text());
      if(Array.isArray(j)) return j;
      if(j && j.docs) return Object.entries(j.docs).map(([id, d]) => ({_id:id, ...d}));
      throw new Error("Este JSON no tiene una lista de filas.");
    }
    const X = await lib();
    const wb = X.read(await file.arrayBuffer(), {type:"array"});
    const ws = wb.Sheets[wb.SheetNames[0]];
    return X.utils.sheet_to_json(ws, {defval:"", raw:false});
  }
  // Busca el valor de una fila por varios posibles nombres de columna (sin acentos ni mayúsculas)
  const clave = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
  function campo(fila, ...nombres){
    const k = Object.keys(fila), want = nombres.map(clave);
    for(const w of want){ const h = k.find(x => clave(x) === w); if(h !== undefined && fila[h] !== null && fila[h] !== "") return fila[h]; }
    return "";
  }
  window.DHS_XLS = { descargar, leer, campo };
})();

// Pregunta de confirmación dentro de la página (en vez de la ventanita del navegador): tapa toda la pantalla,
// así un clic de más no cae en el menú de detrás. Devuelve una promesa con true / false.
window.DHS_PREGUNTA = function(texto, si, no){
  return new Promise(ok => {
    const fondo = document.createElement("div");
    fondo.className = "preg-fondo";
    fondo.innerHTML = `<div class="preg-caja" role="dialog" aria-modal="true"><p></p><div class="preg-bot"><button class="btn sec" data-r="0"></button><button class="btn" data-r="1"></button></div></div>`;
    fondo.querySelector("p").textContent = texto;
    fondo.querySelector('[data-r="1"]').textContent = si || "Aceptar";
    fondo.querySelector('[data-r="0"]').textContent = no || "Cancelar";
    const fin = r => { document.removeEventListener("keydown", tecla, true); fondo.remove(); ok(r); };
    const tecla = e => { if(e.key === "Escape"){ e.preventDefault(); e.stopPropagation(); fin(false); } else if(e.key === "Enter"){ e.preventDefault(); e.stopPropagation(); fin(true); } };
    fondo.addEventListener("click", e => { e.stopPropagation(); const b = e.target.closest("[data-r]"); if(b) fin(b.dataset.r === "1"); });
    document.addEventListener("keydown", tecla, true);
    document.body.appendChild(fondo);
    fondo.querySelector('[data-r="1"]').focus();
  });
};
