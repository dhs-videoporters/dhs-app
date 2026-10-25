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
