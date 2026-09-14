# Landing de PosBank — `posbank.ingizer.com`

Sitio de marketing **estático y autocontenido** (sin build, sin CDN, sin
dependencias npm). Desplegado en **Railway**, igual que igeogo.

- 🟢 **En vivo:** https://posbank-production.up.railway.app
- 🔵 **Dominio final:** https://posbank.ingizer.com *(pendiente de los registros DNS)*

## Estructura

```
landing/
  index.html            ← la landing completa (HTML + CSS inline)
  server.js             ← servidor estático sin dependencias (Railway ejecuta esto)
  package.json          ← start: node server.js
  .railwayignore        ← excluye los README del sitio público
  robots.txt  sitemap.xml  site.webmanifest
  assets/
    posbank-logo.svg               ← lockup completo (wordmark + tagline). Fondos claros.
    posbank-logo-dark.svg          ← lockup completo. Fondos oscuros / footer.
    posbank-logo-wordmark.svg      ← DERIVADO: solo wordmark (viewBox recortado). Header.
    posbank-logo-dark-wordmark.svg ← DERIVADO: solo wordmark, fondo oscuro.
    posbank-symbol.svg             ← símbolo (brújula). Favicon / app icon.
    og-image.png                   ← banner social 1200×630 (generado)
    og-image.html                  ← plantilla del banner (fuente de verdad; re-exportable)
    README-logo.md                 ← guía de marca original
  fonts/
    Poppins-{Light,Regular,SemiBold,Bold}.woff2   ← las que se usan (201 KB total)
    Poppins-{...}.ttf                             ← respaldo para navegadores viejos
    OFL.txt
```

## Marca

### Variantes del logo

| Dónde | Archivo |
|---|---|
| Header / nav | `posbank-logo-wordmark.svg` |
| Barra del mock (fondo navy) | `posbank-logo-dark-wordmark.svg` |
| Footer (lockup completo con tagline) | `posbank-logo-dark.svg` |
| Favicon / apple-touch-icon | `posbank-symbol.svg` |
| Banner social | `og-image.png` |

Los logos oficiales traen el tagline **"UN BANCO EN EL PUNTO DE PAGO"** incrustado
(paths en `y 194–205`), ilegible a la altura de un header. Las variantes
`-wordmark.svg` son **el mismo archivo oficial** con el `viewBox` recortado a
`121 20 512 166`. **No se tocó el arte**: ni colores, ni pesos, ni proporciones,
ni se borró ningún path — el tagline solo queda fuera del encuadre.

> ⚠️ **Gotcha:** `posbank-logo-dark.svg` (y su derivado) incluyen un
> `<rect fill="#081C2A">` de fondo. Sobre superficies que **no** sean exactamente
> ese navy se ve un recuadro. Por eso el banner OG usa fondo navy plano. En la
> landing no se nota porque el footer y la barra del mock son `#081C2A`.

> ⚠️ Ambos SVG usan el mismo `id="bankGrad"`. **Insertarlos inline en la misma
> página hace colisionar los degradados** — por eso van siempre como `<img>`.

### Tipografía
Poppins autoalojada en **woff2** (con TTF de respaldo), 300/400/600/700.
Sin Google Fonts ni fuentes de sistema, para que el texto case con el logo.

### Paleta

| Rol | Hex |
|---|---|
| Navy (texto, fondos oscuros) | `#081C2A` |
| Verde (CTA, acción, éxito) | `#04C537` |
| Degradado wordmark / estados | `#FF2E27 → #FF8F1B → #63AEF1 → #04C537` |
| Texto sutil | `#8A97A8` |
| Fucsia (acento alternativo, sin usar) | `#F63562` |

El degradado del wordmark define los **estados del radar**:
`#FF2E27` crítico · `#FF8F1B` precaución · `#63AEF1` configurar · `#04C537` oportunidad.

### Narrativa
Se usa **`pos` = "punto de pago"**, alineada con el tagline del logo. La línea
del documento de producto original (`pos` = "después de" / "Después del banco,
la inteligencia") quedó descartada para no tener dos narrativas en conflicto.

## SEO

Implementado: `lang="es-CO"`, title (59 car.), description (143 car.), canonical,
robots, Open Graph completo + Twitter Card con banner 1200×630, un solo `<h1>`
con la keyword principal, jerarquía h1→h2→h3 sin saltos (1/8/22), `<main>`,
`alt` en todas las imágenes, `robots.txt`, `sitemap.xml`, `site.webmanifest`,
fuentes autoalojadas con `preload`, y **JSON-LD** con
`Organization · WebSite · SoftwareApplication · FAQPage`.

Keyword primaria: **flujo de caja para pymes**.

> **FAQPage:** el schema debe coincidir **literalmente** con el texto visible de
> la sección `#faq`. Si editas una pregunta en el HTML, actualiza también el
> JSON-LD del `<head>`.

**Carga inicial:** ~153 KB (HTML + 2 fuentes + logo).

## Despliegue

Railway — proyecto **`posbank`**, workspace *1ngizer's Projects*
(cuenta Admin@ingizer.com).

### Actualizar el sitio
```bash
cd "C:\Users\Johno\OneDrive\New Backup\Desktop\posbank\landing"
railway up --detach --service posbank
```
(El flag `--service` es necesario: el proyecto tiene el servicio sin enlazar.)

### DNS — pendiente del usuario
El DNS de `ingizer.com` vive en **Squarespace**. Hay que añadir, **de forma
aditiva y sin tocar nada más**:

| Tipo | Nombre | Valor |
|---|---|---|
| `CNAME` | `posbank` | `3qu9l9kd.up.railway.app` |
| `TXT` | `_railway-verify.posbank` | `railway-verify=3ed7fd205437844593477922522b095ceaec86c844009dce32f5f603e4c1e155` |

Registros existentes que **NO se deben tocar**: raíz + `www` → Netlify
(`75.2.60.5`), `app` → Bubble, `igeogo` → Railway, `MX` → Google.

### Regenerar el banner OG
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless=new --disable-gpu `
  --hide-scrollbars --window-size=1200,630 --virtual-time-budget=6000 `
  --screenshot="assets\og-image.png" "file:///<ruta>/assets/og-image.html"
```

## Pendientes
- **Formulario de demo:** hoy los CTA abren `mailto:Admin@ingizer.com`.
- **Analítica:** añadir el snippet antes de `</body>`.
- **Verificar tras el DNS:** SSL en `posbank.ingizer.com`, Rich Results Test,
  Search Console (enviar el sitemap) y el Sharing Debugger de Facebook.
