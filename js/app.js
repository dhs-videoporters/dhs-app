// DHS App — esqueleto: entrada con Google, permisos y menú.
// Necesita window.DHS_CONFIG (config-pruebas.js o config-oficial.js) cargado antes.
(function(){
  const C = window.DHS_CONFIG;
  firebase.initializeApp(C.firebase);
  const auth = firebase.auth(), db = firebase.firestore();
  const DIRECCION = ["herrerazarzoso@gmail.com", "dhsvideoporters@gmail.com"]; // Ángel y Joel
  const $ = s => document.querySelector(s);

  // Apartados con permisos (los mismos que en las reglas y en Ajustes › Perfiles).
  const APARTADOS = [
    ["calendario",     "Calendario y ausencias",        ["no","ver","editar"]],
    ["trabajos",       "Intervenciones",                ["no","propios","ver","editar","todo"]],
    ["comunidades",    "Fichas de comunidad",           ["no","ver","editar"]],
    ["vecinos",        "Vecinos y teléfonos",           ["no","ver","editar"]],
    ["precios",        "Precios e importes",            ["no","ver","editar"]],
    ["cobros",         "Cobros",                        ["no","ver","editar"]],
    ["administradores","Administradores de fincas",     ["no","ver","editar"]],
    ["ajustes",        "Equipo, accesos y registro",    ["no","ver","editar"]]
  ];
  const NIVEL = {no:0, propios:0.5, ver:1, editar:2, todo:3};
  const PERFILES_BASE = {
    tecnico: {nombre:"Técnico", permisos:{calendario:"ver", trabajos:"editar", comunidades:"ver", vecinos:"editar", precios:"ver", cobros:"no", administradores:"no", ajustes:"no"}},
    subcontrata: {nombre:"Subcontrata", permisos:{calendario:"no", trabajos:"propios", comunidades:"no", vecinos:"no", precios:"no", cobros:"no", administradores:"no", ajustes:"no"}},
    oficina: {nombre:"Oficina", permisos:{calendario:"editar", trabajos:"todo", comunidades:"editar", vecinos:"editar", precios:"editar", cobros:"editar", administradores:"ver", ajustes:"editar"}}
  };

  // Secciones del menú y apartado que hay que poder "ver" para que salgan.
  const SECCIONES = [
    {id:"mitrabajo",      nombre:"Mi trabajo",      ico:"📋", ap:"trabajos", minimo:"propios", conPersonal:true},
    {id:"calendario",     nombre:"Calendario",      ico:"📅", ap:"calendario"},
    {id:"comunidades",    nombre:"Comunidades",     ico:"🏢", ap:"comunidades"},
    {id:"intervenciones", nombre:"Intervenciones",  ico:"🛠️", ap:"trabajos", minimo:"propios"},
    {id:"administradores",nombre:"Administradores", ico:"👥", ap:"administradores"},
    {id:"ajustes",        nombre:"Ajustes",         ico:"⚙️", ap:"ajustes"}
  ];

  const S = { usuario:null, nombre:"", direccion:false, perfil:"", permisos:{} };
  // S.puede("vecinos","editar") → true/false. Dirección siempre puede.
  S.puede = (ap, minimo="ver") => S.direccion || (NIVEL[S.permisos[ap]] || 0) >= NIVEL[minimo];
  window.DHS = { db, auth, S, APARTADOS, PERFILES_BASE };

  // ---------- Entrada ----------
  function alEntrar(resp){
    auth.signInWithCredential(firebase.auth.GoogleAuthProvider.credential(resp.credential))
      .catch(e => mensajeEntrada("No se ha podido entrar ("+e.code+").", true));
  }
  function mensajeEntrada(t, error){ const m=$("#msgEntrada"); m.textContent=t; m.style.color = error ? "var(--ko)" : "var(--gris)"; }
  function pintarBotonGoogle(){
    if(!window.google || !google.accounts){ return setTimeout(pintarBotonGoogle, 200); }
    google.accounts.id.initialize({client_id:C.googleClientId, callback:alEntrar});
    google.accounts.id.renderButton($("#btnGoogle"), {theme:"filled_blue", size:"large", text:"signin_with", locale:"es", shape:"pill"});
  }

  async function quienEs(u){
    const email = u.email.toLowerCase();
    if(DIRECCION.includes(email)) return {nombre: email.startsWith("herrera") ? "Ángel" : "Joel", direccion:true, perfil:"direccion", permisos:{}};
    try{
      const d = await db.collection("dhs_usuarios").doc(email).get();
      if(!d.exists) return null;
      const f = d.data();
      if(f.activo === false) return null;
      const perfil = f.perfil || ({admin:"oficina", tecnico:"tecnico", direccion:"direccion"}[f.rol] || "");
      if(perfil === "direccion") return {nombre:f.nombre || email, direccion:true, perfil, permisos:{}, personalId:f.personalId || ""};
      if(!perfil) return null;
      const p = await db.collection("dhs_perfiles").doc(perfil).get();
      if(!p.exists) return null;
      return {nombre:f.nombre || email, direccion:false, perfil, nombrePerfil:p.data().nombre, permisos:p.data().permisos || {}, personalId:f.personalId || ""};
    }catch(e){ return null; }
  }

  // Dirección: crea los perfiles básicos si todavía no existen.
  async function asegurarPerfiles(){
    try{
      for(const [id, p] of Object.entries(PERFILES_BASE)){
        const ref = db.collection("dhs_perfiles").doc(id);
        if(!(await ref.get()).exists) await ref.set({...p, base:true, modificado:{por:S.usuario.email.toLowerCase(), en:firebase.firestore.FieldValue.serverTimestamp()}});
      }
    }catch(e){ console.warn("Perfiles", e.code); }
  }

  auth.onAuthStateChanged(async u => {
    if(!u){ S.usuario=null; mostrar("entrada"); mensajeEntrada("Entra con tu cuenta de Google autorizada."); return; }
    mensajeEntrada("Comprobando acceso…");
    const q = await quienEs(u);
    if(!q){
      mensajeEntrada("La cuenta "+u.email+" no tiene acceso a la app. Pide acceso a la oficina.", true);
      $("#btnOtraCuenta").classList.remove("oculto");
      return;
    }
    Object.assign(S, {usuario:u, nombre:q.nombre, direccion:q.direccion, perfil:q.perfil, nombrePerfil:q.nombrePerfil || "", permisos:q.permisos, personalId:q.personalId || ""});
    if(S.direccion) await asegurarPerfiles();
    montarMenu();
    document.querySelector(".buscador").classList.toggle("oculto", !S.puede("comunidades"));
    if(S.puede("comunidades")) window.DHS_COM.buscadorGlobal(document.querySelector("#buscaGlobal"), document.querySelector("#resGlobal"));
    mostrar("app");
    irA(location.hash.slice(1) || (S.personalId && !S.puede("trabajos","todo") ? "mitrabajo" : "calendario"));
    window.DHS_COPIAS.avisoAlEntrar();
  });

  function mostrar(cual){
    $("#pantallaEntrada").classList.toggle("oculto", cual !== "entrada");
    $("#pantallaApp").classList.toggle("oculto", cual !== "app");
  }

  // ---------- Menú ----------
  function secciones(){ return SECCIONES.filter(s => S.puede(s.ap, s.minimo || "ver") && (!s.conPersonal || S.personalId)); }
  function montarMenu(){
    $("#menu").innerHTML = secciones().map(s => `<a href="#${s.id}" data-id="${s.id}">${s.nombre}</a>`).join("");
    $("#menuMovil").innerHTML = secciones().map(s => `<a href="#${s.id}" data-id="${s.id}"><span class="ico">${s.ico}</span>${s.nombre}</a>`).join("");
    $("#nombreUsuario").textContent = S.nombre + " · " + (S.direccion ? "Dirección" : (S.nombrePerfil || S.perfil));
  }
  window.addEventListener("hashchange", () => S.usuario && irA(location.hash.slice(1)));

  function irA(ruta){
    const [id0, arg] = decodeURIComponent(ruta||"").split("/");
    const ALIAS = {comunidad:"comunidades", administrador:"administradores", intervencion:"intervenciones", "nueva-intervencion":"intervenciones", trabajos:"intervenciones"};
    // La ficha de trabajo la abre el técnico (desde Mi trabajo) y también la oficina (desde la intervención).
    if(id0 === "trabajo" && arg && S.puede("trabajos","propios")){
      document.querySelectorAll("#menu a, #menuMovil a").forEach(a => a.classList.toggle("on", a.dataset.id === "mitrabajo"));
      return window.DHS_TRAB.fichaTrabajo($("#contenido"), arg);
    }
    let id = ALIAS[id0] || id0;
    if(!secciones().some(s => s.id === id)) id = (secciones()[0] || {}).id;
    if(!id){ $("#contenido").innerHTML = panel("Sin permisos", "Tu perfil no tiene ningún apartado visible. Habla con la oficina."); return; }
    document.querySelectorAll("#menu a, #menuMovil a").forEach(a => a.classList.toggle("on", a.dataset.id === id));
    const sec = SECCIONES.find(s => s.id === id);
    document.title = sec.nombre + " · DHS App" + (C.entorno === "pruebas" ? " (pruebas)" : "");
    if(id0 === "comunidad" && arg && S.puede("comunidades")) return window.DHS_COM.ficha($("#contenido"), arg);
    if(id0 === "administrador" && arg && S.puede("administradores")) return window.DHS_ADM.ficha($("#contenido"), arg);
    if(id0 === "intervencion" && arg) return window.DHS_TRAB.ficha($("#contenido"), arg);
    if(id0 === "nueva-intervencion" && S.puede("trabajos","editar")) return window.DHS_TRAB.nueva($("#contenido"), arg);
    if(id0 === "ajustes" && arg) return window.DHS_AJ.vista($("#contenido"), arg);
    (VISTAS[id] || (()=>{}))($("#contenido"));
  }

  // ---------- Vistas (se irán rellenando en las próximas sesiones) ----------
  const panel = (titulo, texto, extra="") => `<div class="panel"><h2>${titulo}</h2><p class="vacio">${texto}</p>${extra}</div>`;
  const VISTAS = {
    calendario: el => window.DHS_CAL.vista(el),
    intervenciones: el => window.DHS_TRAB.lista(el),
    mitrabajo: el => window.DHS_TRAB.miTrabajo(el),
    comunidades: el => window.DHS_COM.lista(el),
    administradores: el => window.DHS_ADM.lista(el),
    ajustes: el => window.DHS_AJ.vista(el)
  };

  // ---------- Arranque ----------
  document.addEventListener("DOMContentLoaded", () => {
    if(C.entorno === "pruebas") document.querySelectorAll(".entorno").forEach(e => e.classList.remove("oculto"));
    $("#btnSalir").onclick = () => auth.signOut();
    $("#btnOtraCuenta").onclick = () => auth.signOut().then(() => location.reload());
    pintarBotonGoogle();
  });
})();
