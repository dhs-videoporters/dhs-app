# Modelo de datos — App DHS (v1, 22/10/2026 — confirmado por Ángel)

Todo vive en Firebase (Firestore). Oficial: proyecto `dhs-camaras` (el mismo de cobros y cámaras, para compartir la lista maestra). Pruebas: proyecto `dhs-pruebas`, con la misma estructura y datos de prueba.

Regla general: cada documento guarda `creado` y `modificado` = `{por: correo, en: fecha}`. Los cambios importantes se apuntan además en `dhs_registro`.

## Colecciones nuevas

### `dhs_admins` — Administraciones de fincas (lista maestra)
| Campo | Ejemplo | Nota |
|---|---|---|
| id | `a_a3-assessoria` | a partir del nombre |
| nombre | A3 Assessoria | nombre oficial, el que sale en el desplegable |
| alias | ["A3", "A3 ASSESSORIA"] | cómo aparece escrito en las apps antiguas; sirve para unificar |
| emails | ["a3@a3assessoria.es"] | a donde van resúmenes y actas |
| telefono, web, direccion, notas | | |
| personas | [{nombre, cargo, telefono, movil, email, nota}] | las personas con las que hablamos en cada administración; se rellenan desde el botón **Administradores** de la web |
| activo | true | se desactiva, nunca se borra |

### `dhs_comunidades` — Clientes: comunidades, particulares y empresas (lista maestra)
| Campo | Ejemplo | Nota |
|---|---|---|
| id | `c_H61745162` | **el NIF**, igual que en cobros. Sin NIF: `c_` + nombre |
| tipo | comunidad / particular / empresa | |
| nombre | CP Ausiàs March 22 | |
| direccion, poblacion, cp | Ausiàs March 22 · Barberà del Vallès | población en desplegable |
| nif, csId | H61745162 · 130770813 | enlace con Contasimple |
| adminId | `a_a3-assessoria` | vacío si es particular |
| presidente | {nombre, piso, telefono} | |
| vecinos | 24 | |
| videoportero | {marca, modelo, año, monitores} | |
| tv | {antena, multibanda: sí/no, parabolica: sí/no} | |
| camaras | {tiene: sí/no, instalacionId} | enlace con la app de cámaras |
| acceso | "Llave en portería" | |
| notas, activo | | |

Subcolección `contactos` (vecinos por piso): {piso, nombre, telefono, nota}.

### `dhs_personal` — Quién hace los trabajos (columnas del calendario)
| Campo | Ejemplo | Nota |
|---|---|---|
| nombre | Pedro | |
| tipo | plantilla / subcontrata / otros | |
| color | azul | Pedro azul, Alberto naranja, electricistas verde, otros morado |
| email | (si tiene usuario) | las subcontratas no tienen |
| activo | true | |

### `dhs_trabajos`
| Campo | Ejemplo | Nota |
|---|---|---|
| numero | 2026-0001 | correlativo por año. Presupuestos: P2026-0001. Facturas: el número lo pone Contasimple (hoy 2026-0001; para usar la F, cambiar serie en Contasimple tras consultar al gestor) |
| comunidadId | `c_H61745162` | |
| origen | administracion / particular | |
| tipo | reparacion / instalacion / tv / mantenimiento / pequeño / visita-presupuesto | |
| urgencia | urgente / normal / puede esperar | |
| estado | ver lista abajo | |
| descripcion | Poner cerradura puerta vestíbulo | |
| avisa | {nombre, piso, telefono} | quien da el aviso |
| citas | [{fecha, hora, duracion, personalId}] | una por día si dura varios días |
| duracionEstimada | 90 (min) | |
| hechoPor | [personalId] | |
| material | [{texto o productoId, cantidad}] | |
| tiempoReal | 120 (min) | |
| precio, presupuestoId, factura {csId, numero} | | fase 6 |
| resumen | {enviado: sí/no, fecha, a} | resumen al administrador |
| cobro | {forma: efectivo/TPV/transferencia, entregado: sí/no} | particulares |

Subcolección `notas`: {texto, por, en} (las observaciones que se van añadiendo).

**Estados:** Nuevo → Pendiente de presupuesto → Esperando respuesta → Agendado → A medias → Hecho → Facturado → Cobrado (+ Cancelado).

### `dhs_ausencias`
{personalId, desde, hasta, motivo: vacaciones / médico / otro}.

### `dhs_registro` — Registro de cambios (protección de datos y control)
{coleccion, docId, accion: alta/cambio/baja, por, en, cambios}.

### Más adelante (fase 6)
`dhs_catalogo` (productos y servicios con precio) y `dhs_presupuestos`.

## Colecciones que ya existen

- **`dhs_usuarios`** (de cámaras): se reutiliza. Documento = correo. Se mantiene `rol: admin / tecnico` para no romper cámaras (admin = oficina) y se añaden `nombre`, `personalId`, `activo`.
- **`dhs_cobros`**: no se toca hasta la fase 7. Sus clientes `c_NIF` se copian a `dhs_comunidades` con el mismo id.
- **`dhs_instalaciones`, `dhs_economia`, `dhs_revisiones`** (cámaras): no se tocan hasta la fase 8; entonces cada instalación apuntará a su `comunidadId` en vez de llevar la finca escrita a mano.

## Quién puede qué (se impone en las reglas de Firestore)

| | Oficina (admin) | Técnico |
|---|---|---|
| Administraciones y comunidades | ver, crear, cambiar | ver; añadir contactos y notas |
| Trabajos | todo | ver; **crear trabajos nuevos** (avisos en la calle; quedan en su agenda y la oficina los ve como "Nuevo · creado por …"); en los suyos: notas, material, tiempo, fotos, estado (A medias / Hecho) |
| Precios | ver y cambiar | ver |
| Personal, usuarios, ausencias | todo | ver |
| Registro de cambios | ver | — |
| Borrar | solo oficina | nunca |
| Sin cuenta autorizada | nada | nada |
