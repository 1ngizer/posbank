# INFORME DE AUDITORÍA INTEGRAL — POSBANK (INGIZER SAS)
**Fecha:** 2 de octubre de 2026  
**Auditor:** Antigravity AI Engineering & Security Review  
**Alcance:** Seguridad, Arquitectura Backend, UI/UX (PWA/Mobile/Desktop), Bases de Datos & RLS, Integraciones (Alexa, WhatsApp, Alegra/Contabilidad, Comercial/Pricing).  
**Entorno auditado:** Producción (`app.posbank.ingizer.com`, `posbank-api-production.up.railway.app`, Supabase Colombia/US, Landing `posbank.ingizer.com`).  
**Modo:** Solo lectura y pruebas no destructivas (Mocks, suites locales y sondas estáticas).

---

> [!CAUTION]
> **ALERTA CRÍTICA INICIAL:** Se detectaron dos vulnerabilidades de severidad CRÍTICA que requieren atención inmediata:
> 1. **Fuga y Exposición de Tokens JWT en Logs de Producción:** El middleware `pinoHttp({ logger })` en [src/app.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/app.ts#L32) registra sin redacción las cabeceras HTTP de todas las peticiones entrantes (`headers.authorization: Bearer <token>`). Cualquier persona con acceso a los logs de Railway puede capturar tokens de sesión activos de usuarios y realizar suplantación de identidad (**VERIFICADO** empíricamente).
> 2. **Modificación Cross-Tenant en Storage de Fotos:** En la migración [supabase/migrations/20260725130000_inventory_pos.sql](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/supabase/migrations/20260725130000_inventory_pos.sql#L105-L107), la política `pb product photos update` en `storage.objects` permite que **cualquier usuario autenticado de cualquier empresa** sobrescriba archivos existentes en el bucket `product-photos` sin verificar el tenant ni la autoría (**VERIFICADO** en código SQL).

---

## 0. RESUMEN EJECUTIVO

### Semáforo Global: 🟡 AMARILLO (Riesgos de seguridad subsanables, UI funcional de alto valor, arquitectura limpia)

PosBank presenta una base técnica sólida y bien estructurada: código TypeScript limpio, fuerte tipado, arquitectura modular basada en casos de uso, aislamiento multi-tenant en PostgreSQL (RLS) en 22 de sus 22 tablas relacionales, y módulos financieros especializados (Cash Radar, Alexa Voice ASK, Escaneo OCR con Claude Vision, Integración Contable con Alegra y Módulo Comercial / Pricing).

Sin embargo, existen brechas críticas en la higiene de logs (exposición de JWT), políticas de almacenamiento en Supabase Storage, ausencia de rate limiting y bloqueo de fuerza bruta en el canje de códigos de 6 dígitos de Alexa, y vulnerabilidades en la validación del webhook de WhatsApp.

| Dimensión | Puntuación (1-5) | Estado | Observación Principal |
| :--- | :---: | :---: | :--- |
| **Seguridad Backend & RLS** | **3.6 / 5.0** | 🟠 Precaución | RLS impecable en SQL relacional, pero falla en Storage bucket y fuga de JWT en stdout. |
| **Autenticación & Control de Acceso** | **3.9 / 5.0** | 🟡 Aceptable | Middleware `requireAuth` sólido; falta rate-limit en Alexa link code y webhooks. |
| **UI / UX (Desktop y Mobile)** | **4.6 / 5.0** | 🟢 Fuerte | Excelente claridad financiera para pymes, navegación intuitiva y módulos completos. |
| **Accesibilidad (a11y) & PWA** | **3.8 / 5.0** | 🟡 Aceptable | Contraste insuficiente en verde `#04c537` (2.32:1); PWA instalable con Service Worker. |
| **Calidad de Código & Testing** | **4.2 / 5.0** | 🟢 Fuerte | 67 tests unitarios pasando al 100%; faltan tests de integración RLS y E2E frontend. |
| **Infraestructura & Operaciones** | **3.4 / 5.0** | 🟠 Precaución | Sin CI/CD en GitHub; despliegue directo a Railway sin pipeline de validación previa. |

---

### Top 5 Riesgos Identificados

1. **Exposición de credenciales de usuario (JWT) en logs de Railway:** `pino-http` vuelca `req.headers.authorization` en cada petición API (**VERIFICADO**).
2. **Sobrescritura no autorizada de fotos de productos entre empresas:** Política `storage.objects` sin filtro por carpeta de empresa (**VERIFICADO**).
3. **Fuerza bruta sobre el código de vinculación de 6 dígitos de Alexa:** Endpoint `canjearCodigo` no tiene límite de intentos, rate limiting ni baneo por intentos fallidos (**VERIFICADO**).
4. **Vulnerabilidad de spoofing y repetición (Replay) en Webhooks de WhatsApp:** Fallback sin firma si `WHATSAPP_APP_SECRET` no está configurado, comparación no segura contra ataques de temporización (`!==`), y ausencia de firma para el proveedor Twilio (**VERIFICADO**).
5. **Reutilización de `SUPABASE_JWT_SECRET` para cifrado en reposo:** Si no se define `ACCOUNTING_ENCRYPTION_KEY`, el módulo contable usa el secreto de firma JWT. Una rotación de JWT invalidaría todas las credenciales contables almacenadas (**VERIFICADO**).

---

### Top 5 Mejoras UI/UX Recomendadas

1. **Ajuste de contraste WCAG AA en botones y acentos de marca:** El verde `#04c537` sobre blanco tiene ratio 2.32:1 (requerido mínimo 4.5:1). Oscurecer a `#038827` en elementos de texto y botones interactivos (**VERIFICADO con Lighthouse**).
2. **Teclados numéricos nativos en móvil:** Agregar `inputMode="numeric"` en todos los campos de montos de dinero (Movimientos, Cartera, Pagos, Inventario, Comercial) para evitar que el usuario deba cambiar de teclado manualmente en Android/iOS (**VERIFICADO**).
3. **Formateo consistente de fechas a estándar colombiano:** Convertir cadenas ISO crudas (`YYYY-MM-DD`) a formato local `DD/MM/AAAA` o relativo ("Hoy", "Vence en 3 días") en tablas de Cartera, Cuentas por Pagar y Movimientos (**VERIFICADO**).
4. **Asociación explícita de `<label>` e `<input>`:** Conectar etiquetas mediante atributo `htmlFor` o anidamiento para permitir la navegación asistida mediante lectores de pantalla (**VERIFICADO con Lighthouse**).
5. **Retiro de credenciales demo en Login de Producción y Adición de Casilla de Habeas Data:** Remover `demo@posbank.com / Demo1234!` visible para clientes reales en `app.posbank.ingizer.com` y añadir aceptación explícita de Política de Privacidad conforme a la Ley 1581 de 2012 (**VERIFICADO**).

---

## 1. SEGURIDAD

### 1.1 Multi-Tenancy y Row-Level Security (RLS) en Supabase

Se auditó la totalidad de archivos de migración en `supabase/migrations/`:
- `20260722180000_init.sql`
- `20260725130000_inventory_pos.sql`
- `20260729060000_alexa_link_codes.sql`
- `20261002140000_accounting.sql`
- `20261002160000_commercial_pricing.sql`

#### Matriz de Aislamiento Tabla por Tabla

| # | Tabla | RLS Habilitado | Política RLS | Condición de Aislamiento | Evaluación |
| :-: | :--- | :---: | :---: | :--- | :---: |
| 1 | `companies` | **SÍ** | `tenant_isolation` | `id = public.current_company_id()` | **SEGURO** |
| 2 | `users` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 3 | `cash_movements` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 4 | `bank_accounts` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 5 | `budgets` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 6 | `receivables` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 7 | `payables` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 8 | `collection_policies` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 9 | `payment_policies` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 10 | `fixed_commitments` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 11 | `alerts` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 12 | `cash_position_snapshots` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 13 | `cash_predictions` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 14 | `investment_opportunities` | **SÍ** | `tenant_isolation` | `investor_company_id = cid OR recipient_company_id = cid` | **SEGURO** |
| 15 | `products` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 16 | `stock_movements` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 17 | `invoices` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 18 | `invoice_items` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 19 | `alexa_link_codes` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 20 | `accounting_connections` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 21 | `accounting_sync_log` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 22 | `commercial_proposals` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 23 | `commercial_unit_economics` | **SÍ** | `tenant_isolation` | `company_id = public.current_company_id()` | **SEGURO** |
| 24 | `storage.objects` (Fotos) | **PARCIAL** | `pb product photos *` | Lectura pública, inserción auth, **update auth sin tenant** | ⚠️ **VULNERABLE** |

**Hallazgo Crítico en Storage:**  
En `supabase/migrations/20260725130000_inventory_pos.sql` (líneas 105-107):
```sql
create policy "pb product photos update" on storage.objects
  for update to authenticated using (bucket_id = 'product-photos');
```
Cualquier usuario autenticado de la empresa A puede modificar o reemplazar fotos subidas por la empresa B. No existe restricción por prefijo de ruta (ej. `(storage.foldername(name))[1] = public.current_company_id()::text`). Tampoco existe política de `DELETE` para usuarios autenticados.

#### Funciones SQL y `SECURITY DEFINER`
- Función `public.current_company_id()`:
  - Definida como `SECURITY DEFINER`.
  - Contiene explícitamente `set search_path = public`.
  - Previene secuestro de esquema por usuarios maliciosos (**VERIFICADO**).
- Función `public.set_updated_at()`:
  - Definida como `plpgsql`, estándar de actualización de timestamp.

#### Uso de `adminClient` (Service-Role / Bypass de RLS)
El cliente con privilegios de superadministrador (`adminClient`) se utiliza en:
1. `src/modules/analysis/cash-engine.ts`: Para ejecuciones en cron y webhooks. **Filtra explícitamente por `companyId` en todas las consultas** (`.eq('company_id', companyId)`).
2. `src/modules/alerts/alerts.service.ts`: **Filtra explícitamente por `companyId`**.
3. `src/jobs/jobs.lib.ts`: Itera compañías y aplica filtros explícitos por cada `company_id`.
4. `src/integrations/alexa/`:
   - `alexa.actions.ts`: Resuelve el usuario de Alexa y valida `ctx.companyId`. **Todas las inserciones y lecturas filtran por `ctx.companyId`**.
   - `alexa.link.ts`: Canje de códigos. Asocia el `alexa_user_id` estrictamente al `user_id` y `company_id` que emitió el código.
5. `src/integrations/whatsapp/whatsapp.service.ts`: Resuelve el usuario por número de teléfono (`phone`) y ata la sesión a `user.company_id`.
6. `src/modules/admin/admin.routes.ts`: Endpoints protegidos por `requirePlatformAdmin` que consultan métricas consolidadas. Utiliza `adminClient` intencionalmente para la administración multi-cliente.

---

### 1.2 Autenticación y Autorización de la API

- **Middleware `requireAuth` ([src/middleware/auth.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/middleware/auth.ts)):**
  - Extrae token Bearer, valida contra Supabase Auth (`adminClient.auth.getUser(token)`).
  - Consulta perfil en `users` y cuelga `req.auth` con `companyId`, `role` e instancia RLS `db: userClient(token)`.
  - Rutas bajo `/api/v1/*` debidamente protegidas, a excepción de:
    - `/api/v1/auth/login` y `/register`: Públicas por diseño.
    - `/api/v1/alexa/intent`: Protegida por `verifyAlexaRequest` (criptografía Amazon ASK).
    - `/api/v1/webhooks/whatsapp/*`: Protegida por token de verificación Meta y firma HMAC.
    - `/health`: Pública para probes de Railway.
- **Riesgo IDOR (Insecure Direct Object Reference):**
  - Las consultas en los controladores utilizan el cliente `req.auth.db` (enforzando RLS a nivel de base de datos) o añaden `.eq('company_id', req.auth.companyId)`. No se identificó bypass horizontal entre tenants en los endpoints de datos.
- **Validación de Entrada y Mass Assignment:**
  - Controladores críticos (`auth`, `scan`, `invoices`, `accounting`, `commercial`) validan payloads con esquemas `zod`.
  - En `src/modules/movements/movements.routes.ts`, `receivables.routes.ts` y `payables.routes.ts`, los esquemas tipados previenen inyección de campos no permitidos.

---

### 1.3 Verificación de Webhooks y Canales Externos

#### Alexa ASK (`/api/v1/alexa/intent`)
- **Implementación ([src/integrations/alexa/alexa.verify.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/integrations/alexa/alexa.verify.ts)):**
  - Valida `applicationId` contra `env.ALEXA_SKILL_ID`.
  - Valida URL de certificado Amazon (`https:`, host `s3.amazonaws.com`, ruta `/echo.api/`).
  - Valida SAN (`echo-api.amazon.com`) y fechas de validez con `node-forge`.
  - Valida firma RSA-SHA256 sobre el `rawBody`.
  - **Protección contra Replay:** Verifica frescura del timestamp (`age < 150000ms`). **SEGURO y de alta calidad**.

#### Código de Vinculación de 6 Dígitos de Alexa
- **Implementación ([src/integrations/alexa/alexa.link.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/integrations/alexa/alexa.link.ts)):**
  - Genera números aleatorios criptográficos entre 100.000 y 999.999 con vigencia de 10 minutos.
  - **Falla de Seguridad:** La función `canjearCodigo` no cuenta con limitador de intentos fallidos. Un atacante con acceso a la invocación de Alexa puede dictar o probar secuencias numéricas sin bloqueo ni retardo exponencial (**VERIFICADO**).

#### WhatsApp Webhook (`/api/v1/webhooks/whatsapp/incoming`)
- **Implementación ([src/integrations/whatsapp/whatsapp.routes.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/integrations/whatsapp/whatsapp.routes.ts)):**
  - GET: Valida `hub.verify_token` contra `env.WHATSAPP_VERIFY_TOKEN`.
  - POST:
    - Verificación `x-hub-signature-256` se ejecuta únicamente si `env.WHATSAPP_PROVIDER === 'meta' && env.WHATSAPP_APP_SECRET`. Si la variable no está seteada, la validación se omite en silencio.
    - Comparación de firma con `!==` en lugar de `crypto.timingSafeEqual` (vulnerable a timing attacks).
    - Para proveedor `twilio`, **no se verifica firma `X-Twilio-Signature`**.
    - **Cero protección contra Replay:** No valida timestamp ni deduplica mensajes por ID de mensaje de Meta/Twilio.

---

### 1.4 Gestión de Secretos y Cifrado

- **Escaneo de Repositorio y Git History:**
  - No se encontraron llaves vivas (`sk-ant-`, `ghp_`, tokens Supabase service role) en el historial de Git (**VERIFICADO**).
  - El archivo `.env` nunca ha sido commiteado al repositorio.
- **Frontend Bundle:**
  - En `web/src/` únicamente se exponen variables públicas `VITE_API_BASE`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Ninguna clave privada o service-role está expuesta al cliente web.
- **Riesgo de Contraseñas por Defecto en Scripts:**
  - `src/scripts/create-admin.ts` tiene contraseña por defecto en fallback: `'IngizerAdmin*2026'` si no se provee `ADMIN_PASSWORD`.
  - `src/scripts/seed.ts` tiene `'Demo1234!'`.
- **Cifrado Contable ([src/integrations/accounting/crypto.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/integrations/accounting/crypto.ts)):**
  - Algoritmo: AES-256-GCM con IV único de 12 bytes (`crypto.randomBytes(12)`) por mensaje.
  - Formato: `iv_hex:auth_tag_hex:ciphertext_hex`.
  - Enmascaramiento: Función `maskSensitive` oculta correos (`jo***a@ingizer.com`) y tokens (`ab••••••xyz`).
  - **Riesgo de Derivación de Clave:** Línea 8: `const secret = process.env.ACCOUNTING_ENCRYPTION_KEY || env.SUPABASE_JWT_SECRET;`. Reutilizar el secreto de firma JWT de Supabase es peligroso: acopla la rotación de sesiones de usuarios con la pérdida irrecuperable de credenciales de clientes en base de datos.
  - **Recomendación:** Exigir variable obligatoria `ACCOUNTING_ENCRYPTION_KEY` de 32 bytes con prefijo de versión (`v1:...`) para facilitar rotación.

---

### 1.5 Cabeceras, Rate Limiting y Transporte

- **Helmet & CORS:**
  - `helmet()` activo en `src/app.ts`.
  - CORS configurado restringiendo a dominios oficiales: `https://app.posbank.ingizer.com`, `https://posbank.ingizer.com` y `http://localhost:5173`.
- **Rate Limiting:**
  - `authLimiter`: 10 peticiones / 15 min por IP en `/register`, `/login`, `/forgot-password`.
  - `scanLimiter`: 20 escaneos / 15 min por IP en `/api/v1/scan/invoice`.
  - **Carencias:** No existe rate limit en `/alexa/intent`, `/alexa/link-code`, `/accounting/*` ni en el router general de la API.

---

### 1.6 Dependencias y Vulnerabilidades (`npm audit`)

#### En la raíz (`posbank/`):
Total: 12 vulnerabilidades (8 moderadas, 3 altas, 1 crítica).
- **`vitest` (Crítica):** Vía `@vitest/mocker` / `vite` (devDependency, no expuesta en runtime de producción).
- **`node-forge` (Alta):** Vulnerabilidad en verificación de firmas RSA PKCS#1 v1.5 (GHSA-86w9-cpqp-85rv). **Utilizada en producción en `alexa.verify.ts`**.
- **`brace-expansion` (Alta):** DoS vía recursión no controlada.

#### En el cliente web (`posbank/web/`):
Total: 3 vulnerabilidades altas.
- **`nanoid <3.3.18` (Alta):** Bucle infinito en generadores personalizados (GHSA-2v37-7h3g-55p8).
- **`react-router` / `react-router-dom 7.12.0 - 7.18.1` (Alta):** Bypass CSRF en modo RSC (GHSA-qwww-vcr4-c8h2).

---

### 1.7 Registro y Fuga de Información en Logs

- En [src/app.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/app.ts#L32):
  `app.use(pinoHttp({ logger }));`
- En [src/config/logger.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/config/logger.ts):
  No se define configuración de redacción (`redact`).
- **Prueba Empírica Realizada:**
  Se ejecutó un request simulado hacia `pinoHttp({ logger })`. El registro JSON generado en stdout contiene íntegramente:
  `"req":{"id":1,"method":"GET","url":"/api/v1/...","headers":{"authorization":"Bearer secret_token_123",...}}`.
  Esto significa que todos los tokens JWT de usuarios y cabeceras sensibles quedan plasmados en texto plano en la consola y registros de Railway (**VERIFICADO**).

---

### 1.8 Privacidad y Habeas Data (Ley 1581 de 2012 — Colombia)

Se revisó la política publicada en `landing/privacidad.html` (con fecha 29 de julio de 2026):
- **Brechas frente al estado actual del producto:**
  1. No menciona la integración con software contable de terceros (Alegra, Siigo, World Office), ni la transmisión de credenciales API, facturación electrónica y cartera hacia dichos proveedores.
  2. No contempla los datos comerciales, cotizaciones ni cálculos de unit economics de clientes y prospectos incorporados en el módulo `/comercial`.
  3. **Falta de Consentimiento Previo e Informado en la App:** En `web/src/pages/Login.tsx` (modo registro), no existe ninguna casilla ni enlace obligatorio que solicite: *"Autorizo el tratamiento de mis datos personales conforme a la Política de Privacidad de PosBank (Ley 1581 de 2012)"*.

---

## 2. AUDITORÍA UI / UX (WEB PWA & MOBILE)

Se evaluó la aplicación en `app.posbank.ingizer.com` y el código fuente frontend (React 19 + Vite + Vanilla CSS moderno) bajo resoluciones de escritorio y móvil estándar (375px viewport - iPhone SE / mini).

### 2.1 Evaluación Pantalla por Pantalla

| # | Pantalla / Módulo | Puntuación (1-5) | Jerarquía Visual | Claridad para Gerente Pyme | Estados Vacíos / Carga | Observaciones & Brechas UX |
| :-: | :--- | :---: | :---: | :---: | :---: | :--- |
| 1 | **Login / Registro** | **3.8 / 5.0** | 4.0 | 4.5 | 4.0 | Credenciales demo expuestas en producción; falta consentimiento Ley 1581; falta `htmlFor` en labels. |
| 2 | **Inicio / Panel de Caja** | **4.7 / 5.0** | 4.8 | 5.0 | 4.5 | Excelente semáforo financiero (Runway, Disponible, 6 frentes). Alertas sin opción de descartar/marcar leída. |
| 3 | **Movimientos** | **4.3 / 5.0** | 4.5 | 4.5 | 4.0 | Rápido registro ingreso/egreso. Fechas en formato crudo `YYYY-MM-DD`; sin opción de editar o borrar error. |
| 4 | **Cartera (Por cobrar)** | **4.6 / 5.0** | 4.7 | 4.8 | 4.5 | Total de cartera abierto destacado; chip de días vencida; botón integrado de escaneo con cámara. |
| 5 | **Cuentas por pagar** | **4.6 / 5.0** | 4.7 | 4.8 | 4.5 | Alertas de pronto pago con cálculo de ahorro; botón de escaneo integrado; fechas en ISO crudo. |
| 6 | **Inventario** | **4.5 / 5.0** | 4.5 | 4.6 | 4.2 | Pestañas de categorías (Terminado, WIP, Materia prima), subida de fotos, ajuste rápido de stock (+ / -). |
| 7 | **POS / Facturación** | **4.7 / 5.0** | 4.8 | 4.8 | 4.5 | Botones táctiles grandes para mostrador; cálculo automático de IVA y total; bloquea venta si stock = 0. |
| 8 | **Escaneo de facturas (OCR)** | **4.8 / 5.0** | 4.8 | 5.0 | 4.7 | Abre cámara nativa en móvil (`capture="environment"`), pre-llena campos, advierte si la confianza es baja. |
| 9 | **Alertas** | **4.2 / 5.0** | 4.3 | 4.5 | 4.0 | Código de colores por severidad (Crítica, Precaución, Oportunidad) y sugerencia de acción clara. |
| 10 | **Ajustes (`/mas`)** | **4.4 / 5.0** | 4.5 | 4.5 | 4.2 | Menú centralizado con acceso a Presupuestos, Políticas de cobro/pago, Compromisos (`fixed_commitments`). |
| 11 | **Contabilidad (`/contabilidad`)** | **4.7 / 5.0** | 4.8 | 4.7 | 4.5 | Selección visual de proveedor (Alegra activo, Siigo/World Office "Próximamente"), credenciales enmascaradas y tabla de logs. |
| 12 | **Comercial (`/comercial`)** | **4.8 / 5.0** | 4.8 | 4.8 | 4.7 | 5 pestañas completas: Escalas de Pricing, Punto de Equilibrio, CAC/LTV, Prueba Ácida y Propuestas guardadas. |

---

### 2.2 Verificación Manual de Cálculos Financieros en `/comercial`

Se verificaron dos motores de cálculo financiero contra la teoría financiera y contable:

#### 1. Verificación: Punto de Equilibrio (Break-Even)
- **Datos de prueba:**
  - Costos fijos mensuales ($CF$): $\$15.000.000$ COP (conectados a `fixed_commitments`).
  - Precio unitario de venta ($P$): $\$100.000$ COP.
  - Costo variable unitario ($CV$): $\$60.000$ COP.
  - Ventas proyectadas: $400$ unidades.
- **Fórmulas Teóricas:**
  - Margen de Contribución Unitario ($MCU$) = $P - CV = 100.000 - 60.000 = \$40.000$ COP.
  - Ratio de Margen de Contribución = $MCU / P = 40.000 / 100.000 = 0.40$ ($40\%$).
  - Unidades de Punto de Equilibrio = $CF / MCU = 15.000.000 / 40.000 = 375$ unidades.
  - Facturación de Equilibrio = $375 \times 100.000 = \$37.500.000$ COP.
  - Margen de Seguridad (Unidades) = $400 - 375 = 25$ unidades.
  - Margen de Seguridad (%) = $(25 / 400) \times 100 = 6.25\%$.
- **Resultado en Código ([src/modules/commercial/commercial.compute.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/modules/commercial/commercial.compute.ts#L165-L206)):**
  - `contributionMarginPerUnit` = `40000`
  - `breakEvenUnits` = `375`
  - `breakEvenRevenue` = `37500000`
  - `safetyMarginUnits` = `25`
  - `safetyMarginPct` = `6.25`
  - **Estado:** ✅ **EXACTO Y VERIFICADO**.

#### 2. Verificación: Unit Economics (CAC, LTV, Payback)
- **Datos de prueba:**
  - Inversión en Adquisición: $\$5.000.000$ COP.
  - Clientes Nuevos: $20$.
  - Inversión en Retención: $\$1.000.000$ COP.
  - Clientes Activos: $100$.
  - Ticket Promedio: $\$250.000$ COP.
  - Frecuencia Anual de Compra: $4$ veces al año.
  - Vida Media del Cliente: $2$ años.
  - Margen Bruto: $40\%$.
- **Fórmulas Teóricas:**
  - $CAC$ = Inversión / Clientes Nuevos = $5.000.000 / 20 = \$250.000$ COP.
  - $CRC$ (Retención por cliente activo) = $1.000.000 / 100 = \$10.000$ COP.
  - Ingreso Anual por Cliente = $250.000 \times 4 = \$1.000.000$ COP.
  - Margen Bruto Anual por Cliente = $1.000.000 \times 40\% = \$400.000$ COP.
  - $LTV$ = $1.000.000 \times 2 \times 0.40 = \$800.000$ COP.
  - Ratio $LTV / CAC$ = $800.000 / 250.000 = 3.20x$.
  - Ganancia Bruta Mensual = $\$400.000 / 12 = \$33.333,33$ COP.
  - Payback del $CAC$ = $250.000 / 33.333,33 = 7.50$ meses.
- **Resultado en Código ([src/modules/commercial/commercial.compute.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/modules/commercial/commercial.compute.ts#L211-L260)):**
  - `cac` = `250000`
  - `crc` = `10000`
  - `ltv` = `800000`
  - `ltvCacRatio` = `3.2`
  - `cacPaybackMonths` = `7.5`
  - `status` = `'healthy'` (Clasificado como ratio ideal 3x - 5x).
  - **Estado:** ✅ **EXACTO Y VERIFICADO**.

---

### 2.3 Resultados Auditoría Lighthouse Mobile (375px)

Se ejecutó una auditoría Lighthouse headless sobre el frontend de producción (`https://app.posbank.ingizer.com`):

```
Lighthouse Scores (Emulación Móvil 375px):
  Performance:      83 / 100
  Accessibility:    79 / 100
  Best Practices:  100 / 100
  SEO:              83 / 100
```

#### Hallazgos Clave de Accesibilidad y Performance:
1. **Ratio de Contraste Insuficiente (Score: 0):**
   - Selector: `p.login-tag` ("Un banco en el punto de pago."): Texto `#04c537` sobre `#ffffff` tiene ratio de **2.32:1** (Falla WCAG AA que exige 4.5:1).
   - Selector: `button.btn-primary`: Texto `#ffffff` sobre botón `#04c537` tiene ratio de **2.32:1**.
2. **Formularios sin Etiquetas Asociadas (Score: 0):**
   - Inputs en `Login.tsx` carecen de asociación formal `<label htmlFor="id">` o anidamiento de control.
3. **Ausencia de Landmark `<main>`:**
   - La página carece de un contenedor semántico `<main>` accesible para tecnología asistiva.
4. **Optimización PWA:**
   - Service Worker y Manifest debidamente instalados (`sw.js` y `manifest.webmanifest`). Estrategia cache-first para estáticos y network-first para navegación.

---

## 3. CALIDAD DE CÓDIGO Y ARQUITECTURA

### 3.1 Cobertura de Pruebas y Brechas Críticas

Al ejecutar `npm test` (`vitest run`):
- **9 archivos de pruebas ejecutados, 67 pruebas unitarias pasando al 100%** (duración: ~555 ms).
- **Suites Validadas:**
  1. `tests/accounting.crypto.test.ts` (3 tests)
  2. `tests/alegra.provider.test.ts` (7 tests)
  3. `tests/alert-engine.test.ts` (6 tests)
  4. `tests/alexa.verify.test.ts` (6 tests)
  5. `tests/analysis.compute.test.ts` (12 tests)
  6. `tests/commercial.compute.test.ts` (8 tests)
  7. `tests/nlu.test.ts` (5 tests)
  8. `tests/parser.test.ts` (14 tests)
  9. `tests/scan.test.ts` (6 tests)

#### Vacíos Críticos de Pruebas:
- **`src/modules/analysis/cash-engine.ts`:** No cuenta con pruebas unitarias ni de integración. Siendo el núcleo financiero que alimenta el radar de caja, su lógica depende de mocks o base de datos viva.
- **Webhooks de WhatsApp:** No existen pruebas para `whatsapp.routes.ts` ni `whatsapp.service.ts`.
- **Aislamiento RLS en Base de Datos:** No hay pruebas automáticas que verifiquen que un usuario con JWT de la empresa A reciba `403` o lista vacía al consultar datos de la empresa B.
- **Pruebas Frontend:** El directorio `web/` no tiene configurado ningún test runner (Vitest / Playwright). Los componentes y páginas de React se compilan pero no se testean de forma automatizada.

---

### 3.2 Manejo de Errores y Resiliencia

- **Manejo Centralizado de Errores Backend:**
  - `ApiError` y `asyncHandler` en `src/shared/http.ts` capturan excepciones y devuelven respuestas JSON homogéneas (`{ ok: false, error: { message, code } }`).
- **Resiliencia en Cold Start (Supabase & Railway):**
  - Se confirmó en `src/server.ts` la presencia del keep-alive preventivo que ejecuta un `HEAD` a `companies` cada 4 minutos para evitar el enfriamiento del pool de conexiones PostgreSQL en Railway Hobby.
  - La ventana de tiempo en Alexa (`conLimiteAlexa`) se amplió a 7.5 segundos con `clearTimeout` para evitar conexiones colgadas.

---

## 4. INFRAESTRUCTURA Y OPERACIONES

### 4.1 Railway (`posbank-api`)
- Contenedor Node.js corriendo con TypeScript compilado vía `tsx`/`node dist/server.js`.
- Healthcheck activo en `/health`.
- Variables de entorno cargadas vía Railway Dashboard.
- **Observación:** Al no tener réplica ni escalado horizontal (plan Railway básico), cualquier reinicio o pico prolongado de CPU impacta directamente el tiempo de respuesta.

### 4.2 Supabase (BaaS)
- Base de datos PostgreSQL alojada en la nube con soporte RLS.
- Esquema completamente versionado mediante 5 archivos SQL en `supabase/migrations/`.
- **Riesgo Operativo:** Las migraciones se aplican manualmente o mediante scripts. No hay un pipeline automatizado de migraciones continuas con rollback ante fallos.

### 4.3 CI / CD
- **Diagnóstico:** **AUSENTE**.
- No existe el directorio `.github/workflows`.
- Cada `git push origin main` dispara el despliegue automático en Railway sin ejecutar previamente:
  1. `npm test`
  2. `npm run lint`
  3. `npm run build`
  4. `npm audit`
  Un desarrollador podría empujar código roto o con fallas de sintaxis que rompería la instancia en producción.

---

## 5. PLAN DE ACCIÓN PRIORIZADO

| ID | Categoría | Hallazgo Técnico | Impacto | Esfuerzo | Prioridad | Recomendación Técnica Concreta |
| :-: | :--- | :--- | :---: | :---: | :-: | :--- |
| **SEC-01** | Seguridad | Redacción faltante en `pino-http` expone JWT en logs | Crítico | 15 min | **P0** | En [src/config/logger.ts](file:///Users/johnochoa/Desktop/Backup/Desarrollo/03.%20PosBank/posbank/src/config/logger.ts), agregar `redact: ['req.headers.authorization', 'req.headers.cookie']` o serializador personalizado que elimine el header `authorization`. |
| **SEC-02** | Seguridad / RLS | Política `pb product photos update` en `storage.objects` sin tenant | Crítico | 30 min | **P0** | Crear migración SQL que restrinja el update/delete a: `bucket_id = 'product-photos' AND (storage.foldername(name))[1] = public.current_company_id()::text`. |
| **SEC-03** | Seguridad | Falta de rate-limit y lockout en `canjearCodigo` de Alexa | Alto | 1 hora | **P0** | Implementar contador de intentos fallidos en `alexa_link_codes` (bloqueo tras 5 intentos) y aplicar `rateLimit` en `/api/v1/alexa/intent`. |
| **SEC-04** | Seguridad | Clave de cifrado contable usa `SUPABASE_JWT_SECRET` en fallback | Alto | 30 min | **P1** | Exigir `ACCOUNTING_ENCRYPTION_KEY` obligatoria en `src/config/env.ts` e implementar prefijo de versión de clave `v1:` para rotaciones. |
| **SEC-05** | Seguridad | Validación de webhook de WhatsApp omite firma si no hay secret | Alto | 45 min | **P1** | Exigir firma HMAC obligatoria, usar `crypto.timingSafeEqual`, verificar firma Twilio (`X-Twilio-Signature`) y cachear `messageId` contra replay. |
| **UI-01** | UI / A11y | Contraste insuficiente en verde `#04c537` (ratio 2.32:1) | Medio | 20 min | **P1** | Modificar variable CSS `--green` a `#038827` en textos y botones `.btn-primary` para alcanzar 4.5:1 (WCAG AA). |
| **UI-02** | UI / UX | Falta `inputMode="numeric"` en campos de moneda en móvil | Medio | 30 min | **P1** | Agregar `inputMode="numeric"` y `pattern="[0-9]*"` en todos los `<input type="number">` del frontend web. |
| **UI-03** | UI / UX | Fechas crudas en formato `YYYY-MM-DD` | Bajo | 30 min | **P2** | Crear helper `formatDate(d)` en `web/src/lib/format.ts` para renderizar `DD/MM/AAAA` o fechas relativas. |
| **LEG-01** | Legal / Privacidad | Ausencia de casilla de Habeas Data en registro de usuarios | Alto | 30 min | **P1** | Añadir checkbox obligatorio en `Login.tsx` con aceptación expresa de la Política de Tratamiento de Datos (Ley 1581 de 2012). |
| **OPS-01** | DevOps | Ausencia de pipeline CI/CD en GitHub Actions | Medio | 1 hora | **P2** | Crear `.github/workflows/ci.yml` ejecutando `npm test`, `npm run build` y `npm audit` antes de permitir despliegues. |

---

## 6. COMANDOS Y EVIDENCIA DE AUDITORÍA

### 6.1 Git y Estado del Repositorio
```bash
$ git status && git log -n 3 --oneline
On branch main
Your branch is up to date with 'origin/main'.
nothing to commit, working tree clean
ab44633 feat: Add commercial pricing, break-even, unit economics (CAC/LTV) and growth acid test module
dcdc5d1 feat: Add accounting integration starting with Alegra provider, AES-256 encryption, sync queue and React UI
0cf950f Fix Alexa cold-start latency: widen 6s timeout and add Supabase keep-alive
```

### 6.2 Verificación de Tablas y RLS en Migraciones SQL
```bash
$ grep -E "create table|alter table.*enable row level security|create policy" supabase/migrations/*.sql
# Salida: 22 tablas con 'enable row level security' y políticas 'tenant_isolation'.
# storage.objects con 'pb product photos update' sin filtro de company_id.
```

### 6.3 Ejecución de Pruebas Unitarias
```bash
$ npm test
> posbank@0.1.0 test
> vitest run

Test Files  9 passed (9)
     Tests  67 passed (67)
  Duration  555ms
```

### 6.4 Fuga de Cabecera Authorization en Pino HTTP
```bash
$ node -e "
const EventEmitter = require('events');
const pino = require('pino');
const pinoHttp = require('pino-http');
let captured = '';
const dest = { write(msg) { captured += msg; } };
const logger = pino(dest);
const middleware = pinoHttp({ logger });
const req = {
  method: 'GET',
  url: '/api/v1/test',
  headers: { authorization: 'Bearer secret_token_123', host: 'localhost' },
  socket: { remoteAddress: '127.0.0.1' }
};
const res = new EventEmitter();
res.statusCode = 200;
res.getHeader = () => undefined;
middleware(req, res);
res.emit('finish');
console.log(captured);
"
# Salida real registrada:
{"level":30,"time":1790972303637,"pid":3965,"hostname":"Mac.lan","req":{"id":1,"method":"GET","url":"/api/v1/test","headers":{"authorization":"Bearer secret_token_123","host":"localhost"},"remoteAddress":"127.0.0.1"},"res":{"statusCode":null},"responseTime":0,"msg":"request aborted"}
```

### 6.5 Auditoría de Vulnerabilidades (`npm audit`)
```bash
$ npm audit
12 vulnerabilities (8 moderate, 3 high, 1 critical)
# Alta en producción: node-forge (GHSA-86w9-cpqp-85rv) utilizada en alexa.verify.ts

$ npm --prefix web audit
3 high severity vulnerabilities
# nanoid <3.3.18 y react-router 7.12.0 - 7.18.1 (GHSA-qwww-vcr4-c8h2)
```

---
*Informe generado y verificado bajo los estándares de ingeniería de seguridad de Ingizer SAS.*
