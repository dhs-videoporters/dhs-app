// DHS App — esqueleto: entrada con Google, permisos y menú.
// Necesita window.DHS_CONFIG (config-pruebas.js o config-oficial.js) cargado antes.
(function(){
  const C = window.DHS_CONFIG;
  firebase.initializeApp(C.firebase);
  const auth = firebase.auth(), db = firebase.firestore();
  const DIRECCION = ["herrerazarzoso@gmail.com", "dhsvideoporters@gmail.com"]; // Ángel y Joel
  const $ = s => document.querySelector(s);

  // Secciones del menú. "soloOficina": no aparece a los técnicos.
  const SECCIONES = [
    {id:"calendario",     nombre:"Calendario",      ico:"📅"},
    {id:"comunidades",    nombre:"Comunidades",     ico:"🏢"},
    {id:"trabajos",       nombre:"Trabajos",        ico:"🛠️"},
    {id:"administradores",nombre:"Administradores", ico:"👥", soloOficina:true}
  ];

  const S = { usuario:null, rol:null, nombre:"" };
  window.DHS = { db, auth, S };

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
    if(DIRECCION.includes(email)) return {rol:"oficina", nombre: email.startsWith("herrera") ? "Ángel" : "Joel"};
    try{
      const d = await db.collection("dhs_usuarios").doc(email).get();
      if(!d.exists) return null;
      const f = d.data();
      if(f.activo === false) return null;
      if(f.rol === "admin") return {rol:"oficina", nombre:f.nombre || email};
      if(f.rol === "tecnico") return {rol:"tecnico", nombre:f.nombre || email};
      return null;
    }catch(e){ return null; }
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
    Object.assign(S, {usuario:u, rol:q.rol, nombre:q.nombre});
    montarMenu();
    window.DHS_COM.buscadorGlobal(document.querySelector("#buscaGlobal"), document.querySelector("#resGlobal"));
    mostrar("app");
    irA(location.hash.slice(1) || "calendario");
  });

  function mostrar(cual){
    $("#pantallaEntrada").classList.toggle("oculto", cual !== "entrada");
    $("#pantallaApp").classList.toggle("oculto", cual !== "app");
  }

  // ---------- Menú ----------
  function secciones(){ return SECCIONES.filter(s => !s.soloOficina || S.rol === "oficina"); }
  function montarMenu(){
    $("#menu").innerHTML = secciones().map(s => `<a href="#${s.id}" data-id="${s.id}">${s.nombre}</a>`).join("");
    $("#menuMovil").innerHTML = secciones().map(s => `<a href="#${s.id}" data-id="${s.id}"><span class="ico">${s.ico}</span>${s.nombre}</a>`).join("");
    $("#nombreUsuario").textContent = S.nombre + (S.rol === "oficina" ? " · Oficina" : " · Técnico");
  }
  window.addEventListener("hashchange", () => S.usuario && irA(location.hash.slice(1)));

  function irA(ruta){
    const [id0, arg] = decodeURIComponent(ruta||"").split("/");
    let id = id0 === "comunidad" ? "comunidades" : id0;
    if(!secciones().some(s => s.id === id)) id = "calendario";
    document.querySelectorAll("#menu a, #menuMovil a").forEach(a => a.classList.toggle("on", a.dataset.id === id));
    const sec = SECCIONES.find(s => s.id === id);
    document.title = sec.nombre + " · DHS App" + (C.entorno === "pruebas" ? " (pruebas)" : "");
    if(id0 === "comunidad" && arg) return window.DHS_COM.ficha($("#contenido"), arg);
    (VISTAS[id] || (()=>{}))($("#contenido"));
  }

  // ---------- Vistas (se irán rellenando en las próximas sesiones) ----------
  const panel = (titulo, texto, extra="") => `<div class="panel"><h2>${titulo}</h2><p class="vacio">${texto}</p>${extra}</div>`;
  const VISTAS = {
    calendario: el => el.innerHTML = panel("Calendario", "Aquí irá el calendario a 15 días vista (fase 4)."),
    trabajos:   el => el.innerHTML = panel("Trabajos", "Aquí irán los trabajos (fase 3)."),
    comunidades: el => window.DHS_COM.lista(el),
    administradores: async el => {
      el.innerHTML = panel("Administradores", "Cargando…");
      try{
        const s = await db.collection("dhs_admins").get();
        const sinCorreo = s.docs.filter(d => !(d.data().emails||[]).length).length;
        el.innerHTML = panel("Administradores", "Las fichas con personas de contacto se podrán editar en la sesión 11.",
          `<div class="cifras"><div class="cifra"><b>${s.size}</b><span>administraciones</span></div><div class="cifra"><b>${sinCorreo}</b><span>sin correo todavía</span></div></div>`);
      }catch(e){ el.innerHTML = panel("Administradores", "No se han podido leer los datos ("+e.code+")."); }
    }
  };

  // ---------- Arranque ----------
  document.addEventListener("DOMContentLoaded", () => {
    if(C.entorno === "pruebas") document.querySelectorAll(".entorno").forEach(e => e.classList.remove("oculto"));
    $("#btnSalir").onclick = () => auth.signOut();
    $("#btnOtraCuenta").onclick = () => auth.signOut().then(() => location.reload());
    pintarBotonGoogle();
  });
})();
