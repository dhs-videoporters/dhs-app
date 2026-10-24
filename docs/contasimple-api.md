# Contasimple API v2 — lo que usará la DHS App (consultado 24/10/2026 en api.contasimple.com/docs/v2)

- Base: `https://api.contasimple.com/api/v2`
- Acceso: `POST /oauth/token` con `grant_type=authentication_key&key=<clave>` → `access_token` (Bearer). Es lo que ya usa la app de cobros (AngelChiva/dhs-cobros), llamando desde el navegador.
- La clave se crea en Contasimple › Configuración › Otras opciones › Aplicaciones externas (tipo «API Rest»). **Comprobar que la clave tiene permiso de escritura** (la de cobros solo lee). La clave NO va en el código ni en el repositorio.

## Productos (catálogo)
- `GET /products?startIndex=&numRows=&includeInactive=` · `GET /products/search` · `GET/PUT /products/{id}` · categorías `/products/categories`

## Presupuestos (estimates)
- `GET /accounting/estimates/nextEstimateNumber/{numberingFormatId}`
- `POST /accounting/estimates` (CreateEstimateApiModel): targetEntityId (cliente), numberingFormatId, number, status (Creado|Enviado|Aceptado|Rechazado|Parcial|Facturado|…|Cerrado), date, expirationDate, notes, footer, retentionPercentage, lines[] (concept, quantity, unitTaxableAmount, vatPercentage, discountPercentage, detailedDescription, productId…)
- `GET/PUT/DELETE /accounting/estimates/{id}` · `PUT /accounting/estimates/{id}/status` (aceptado/rechazado…)
- `GET /accounting/estimates/{id}/pdf` · `POST /accounting/estimates/{id}/send` (to, replyTo, blindCopy, subject, body)
- `GET/POST /accounting/estimates/{id}/relatedInvoices` (unir presupuesto ↔ facturas: sirve para pagos fraccionados)

## Facturas emitidas
- `GET /accounting/{period}/invoices/issued/nextInvoiceNumber/{numberingFormatId}`
- `POST /accounting/{period}/invoices/issued` · `GET/PUT/DELETE …/issued/{id}`
- `GET …/issued/{id}/pdf` · `POST …/issued/{id}/send`
- `GET/POST …/issued/{id}/payments` (cobros) · `POST …/issued/{id}/relatedEstimate/{estimateId}`
- Listado: `GET /accounting/invoices/issued/from?date=&startIndex=&numRows=` (lo usa cobros)

## Clientes
- `/entities/…` (cobros usa `/entities/{id}/bankaccounts`)
