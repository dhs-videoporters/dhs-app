// Configuración PÚBLICA del proyecto Firebase de PRUEBAS (dhs-pruebas).
// Estas claves no son secretas: la seguridad la ponen las reglas de Firestore.
window.DHS_CONFIG = {
  fichaje: true,   // Ángel 31/10: los técnicos fichan entrada (a menos de 3 km de Viladecavalls) y salida
  entorno: "pruebas",
  firebase: {
    apiKey: "AIzaSyA8RF2qbRo5b89OHkTClQLMZxzeHqXdKNc",
    authDomain: "dhs-pruebas.firebaseapp.com",
    projectId: "dhs-pruebas",
    storageBucket: "dhs-pruebas.firebasestorage.app",
    messagingSenderId: "564284457863",
    appId: "1:564284457863:web:a22f9ca96bb889c4c54922"
  },
  puenteUrl:"https://script.google.com/macros/s/AKfycbxt95UOhBi3SGu8lnjC0OZkkgWUpnnKUKVt1em6bymdprECRnznCWJGG7eIlL6Z9qjk/exec",
  googleClientId: "564284457863-brbfrs1kq8limfe0cdpa2m8jtvu0me1h.apps.googleusercontent.com"
};
window.DHS_COL_USU = "dhs_usuarios";
