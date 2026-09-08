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
1. Resolver verificación WhatsApp con Meta (dirección RUT, email admin@ingizer.com)
2. Plan B: crear WABA bajo portafolio Ingizer SAS
3. Probar skill Alexa en Echo físico e invitar testers
4. Decidir si implementar facturación POS por voz

## Arquitectura
- Multi-tenant con Row Level Security en Supabase
- Escaneo de facturas con Anthropic API (~$0.014/lectura)
- Alexa Skill con 32/32 tests, timeout resuelto con paralelización

## Convenciones
- TypeScript para backend
- React 19 + Vite para frontend
- Panel de tareas centralizado: https://claude.ai/code/artifact/096d4e8a-4a2b-449b-be95-6597f62dd70f
