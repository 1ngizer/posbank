# Contexto del Proyecto — PosBank

## Qué es
Radar de caja inteligente para pymes colombianas. App PWA + Skill Alexa + bot WhatsApp para monitorear caja, inventario y ventas.

## Stack
- Backend: Node.js / Express / TypeScript
- BD: Supabase (PostgreSQL con RLS multi-tenant)
- Frontend: React 19 + Vite (PWA instalable)
- Hosting: Railway (~$2/mes)
- Integraciones: Anthropic API, Meta Cloud API, Twilio, Alexa Skills Kit

## Prioridades actuales
1. Esperar decisión de Meta sobre verificación de organización (reintentada 2026-09-09, dirección/NIT/RUT/email corregidos, estado "Verification in progress")
2. Cuando quede "Verified": conectar la app al portfolio PosBank y completar credenciales de WhatsApp en Railway
3. Plan B si falla: crear WABA bajo portafolio Ingizer SAS
4. Probar skill Alexa en Echo físico e invitar testers
5. Decidir si implementar facturación POS por voz

## Arquitectura
- Multi-tenant con Row Level Security en Supabase
- Escaneo de facturas con Anthropic API (~$0.014/lectura)
- Alexa Skill con 32/32 tests, timeout resuelto con paralelización

## Convenciones
- TypeScript para backend
- React 19 + Vite para frontend
- Panel de tareas centralizado: https://claude.ai/code/artifact/096d4e8a-4a2b-449b-be95-6597f62dd70f
