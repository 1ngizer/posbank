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

## Hecho Recientemente (2026-09-11)

- [x] **Fix de seguridad crítico:** `/api/v1/alexa/intent` no verificaba nada (ni firma de Amazon, ni applicationId, ni auth) — cualquiera con un `alexa_user_id` podía llamar el endpoint directamente y mover datos reales (facturar, marcar pagos, leer caja). Se agregó `alexa.verify.ts`: verificación de firma RSA-SHA256 + cadena de certificado de Amazon + `applicationId` contra `ALEXA_SKILL_ID` + tolerancia de timestamp (anti-replay). Desplegado a producción y verificado: peticiones sin `applicationId` correcto ahora responden 403. **Pendiente validar con un intent real desde el simulador/Echo** para confirmar que la verificación de firma no rompe el flujo legítimo.
- [x] `ALEXA_SKILL_ID` configurado en Railway (posbank-api) — antes existía en el schema de env pero nunca se usaba en el código.
- [x] 6 tests nuevos para la verificación (38/38 tests pasando en total).

## Hecho Recientemente (2026-09-09)

- [x] Corregida dirección en Business Info del portfolio PosBank: Cra 80 Bis No. 7A - 15, Bogotá D.C., 110931 (idéntica al RUT)
- [x] Reintentada verificación de organización Ingizer SAS: método "Verify an organisation", NIT 902021430-6, RUT subido como documento DIAN, confirmado por código a admin@ingizer.com (no por teléfono)
- [x] Estado actual en Meta: **"Verification in progress"** — respuesta esperada en pocas horas

## Tareas en Progreso

### Seguridad (Alta Prioridad)
- [ ] Validar en el simulador de Alexa o un Echo real que un intent legítimo sigue funcionando tras el fix de verificación de firma
- [ ] `npm audit fix` — vulnerabilidades moderadas en dependencias (qs vía express, uuid vía node-cron)
- [ ] Agregar rate limiting en `/scan/invoice` (cada llamada cuesta ~USD 0.014 vía Claude)
- [ ] Implementar recuperación de contraseña (no existe hoy en frontend ni backend)

### Verificación WhatsApp (Alta Prioridad)
- [ ] Esperar decisión de Meta sobre la verificación de organización
- [ ] Cuando quede "Verified": conectar la app (developer.facebook.com/apps/1841875777196124) al portfolio PosBank y confirmar que "Add Product" muestra WhatsApp
- [ ] Completar `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN` en Railway (posbank-api) una vez conectado
- [ ] Plan B si vuelve a fallar: crear la WABA de PosBank bajo el portafolio "Ingizer SAS" (sin tocar el WhatsApp de prueba del asistente gizer que ya vive ahí)

### Alexa (Media Prioridad)
- [ ] Probar nombre invocación "pos bank" en Echo físico
- [ ] Invitar testers vía app móvil Alexa (Beta Test activo hasta 2026-11-15)

### Decisiones Pendientes
- [ ] Definir si construir facturación POS por voz

## Bloqueos Activos

- **Meta:** verificación de organización de Ingizer SAS en revisión ("Verification in progress", reintentada 2026-09-09 con datos corregidos). Restricción de portfolio activa desde 2026-07-30 por sospecha de automatización sigue siendo la causa de fondo del bloqueo de WhatsApp.

## Estrategia Comercial

- **Target:** Pymes colombianas
- **Propuesta:** "Radar de caja inteligente" consultable vía app, Alexa o WhatsApp
- **Features:** POS, escaneo facturas IA, panel monitoreo centralizado
- **KPIs:** Flujo caja, cuentas por pagar, inventario, ventas diarias al instante
