// DHS App — Empresas que nos encargan trabajos (Fachadas Álamo, Armengol…). Ángel 25/10: el trabajo se apunta en la
// comunidad (la dirección real), pero con el color de la empresa para saber de un vistazo de parte de quién viene.
// Son fichas de la lista de administraciones con tipo "empresa" y un color.
(function(){
  const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let A = {};
  async function cargar(){ try{ A = (await window.DHS_COM.datos()).admins || {}; }catch(e){} return A; }
  const esEmpresa = id => !!(A[id] && A[id].tipo === "empresa");
  const lista = () => Object.entries(A).filter(([k,a]) => a.tipo === "empresa" && a.activo !== false).sort((a,b) => a[1].nombre.localeCompare(b[1].nombre));
  const nombre = id => (A[id] && A[id].nombre) || "";
  const color = id => (A[id] && A[id].color) || "#8a5a00";
  // Etiqueta de color: "🏗️ Armengol"
  const chip = (id, corto) => !id || !A[id] ? "" : `<span class="emp-chip" style="--emp:${esc(color(id))}" title="De parte de ${esc(A[id].nombre)}">🏗️ ${esc(corto ? A[id].nombre.split(" ")[0] : A[id].nombre)}</span>`;
  const opciones = sel => `<option value="">— Directo / su administración —</option>` + lista().map(([k,a]) => `<option value="${esc(k)}" ${k === sel ? "selected" : ""}>🏗️ ${esc(a.nombre)}</option>`).join("");
  window.DHS_EMP = { cargar, esEmpresa, lista, color, nombre, chip, opciones };
})();
