// Configuración PÚBLICA del proyecto Firebase OFICIAL (dhs-camaras), el mismo de las apps de cámaras y de cobros.
// Estas claves no son secretas: la seguridad la ponen las reglas de Firestore y de Storage.
window.DHS_CONFIG = {
  entorno: "oficial",
  firebase: {
    apiKey: "AIzaSyDqcZncea3Wo9HE4x3KZuVt2Veha3CPCdE",
    authDomain: "dhs-camaras.firebaseapp.com",
    projectId: "dhs-camaras",
    storageBucket: "dhs-camaras.firebasestorage.app",
    messagingSenderId: "827499700905",
    appId: "1:827499700905:web:c6487b4ef23a861e86ffb8"
  },
  puenteUrl:"https://script.google.com/macros/s/AKfycbxt95UOhBi3SGu8lnjC0OZkkgWUpnnKUKVt1em6bymdprECRnznCWJGG7eIlL6Z9qjk/exec",
  googleClientId: "827499700905-3a01dotf0dtl007rmfhoqepl1771r89a.apps.googleusercontent.com"
};
// En el proyecto oficial la app de cámaras ya usa "dhs_usuarios" (con otro formato): esta app guarda sus accesos aparte.
window.DHS_COL_USU = "dhs_app_usuarios";
