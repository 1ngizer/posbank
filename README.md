# PosBank

Radar de caja inteligente para pymes colombianas. Consultable vía app, Alexa o WhatsApp.

## Stack Tecnológico

- **Backend:** Node.js / Express / TypeScript
- **BD:** Supabase (PostgreSQL con RLS multi-tenant)
- **Frontend:** React 19 + Vite (PWA instalable)
- **Hosting:** Railway (Plan Hobby, ~$2/mes)
- **Integraciones:** Anthropic API, Meta Cloud API, Twilio, Alexa Skills Kit

## Módulos Completados

- Backend completo, app, landing page
- Motor de caja, inventario, POS
- Escaneo de facturas con IA (~$0.014 por lectura)
- Skill Alexa (32/32 tests pasando, timeout resuelto con paralelización)
- Backend WhatsApp (enrutamiento, servicios, parsers)

## Tareas en Progreso

### Verificación WhatsApp (Alta Prioridad)
- [ ] Corregir dirección Meta Business para coincidir con RUT
- [ ] Reintentar verificación con email admin@ingizer.com
- [ ] Plan B: crear WABA bajo portafolio Ingizer SAS

### Alexa (Media Prioridad)
- [ ] Probar nombre invocación en Echo físico
- [ ] Invitar testers vía app móvil Alexa

### Decisiones Pendientes
- [ ] Definir si construir facturación POS por voz

## Bloqueos Activos

- **Meta:** Integración WhatsApp bloqueada por restricción activa (sospecha automatización) y problemas formato dirección/teléfono en RUT

## Estrategia Comercial

- **Target:** Pymes colombianas
- **Propuesta:** "Radar de caja inteligente" consultable vía app, Alexa o WhatsApp
- **Features:** POS, escaneo facturas IA, panel monitoreo centralizado
- **KPIs:** Flujo caja, cuentas por pagar, inventario, ventas diarias al instante
