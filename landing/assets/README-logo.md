# PosBank — Guía de logo para desarrollo web

Este paquete contiene el logo **definitivo** de PosBank (wordmark multicolor) y sus fuentes.
Úsalo tal cual: no recolorees, no cambies la tipografía ni la disposición.

## Archivos

| Archivo | Uso |
|---|---|
| `posbank-logo.svg` | Logo principal para fondos claros. |
| `posbank-logo-dark.svg` | Logo para fondos oscuros / modo dark. |
| `posbank-symbol.svg` | Símbolo (brújula) aislado — favicon, app icon, avatar. |
| `fonts/Poppins-Light.ttf` (300) | Peso de la palabra "pos". |
| `fonts/Poppins-Bold.ttf` (700) | Peso de la palabra "bank". |
| `fonts/OFL.txt` | Licencia de la fuente (Open Font License). |

## Anatomía del logo

- Wordmark en minúsculas: **posbank**, en una sola línea.
- **"pos"** → Poppins **Light (300)**, color navy `#081C2A` (o blanco en fondo oscuro).
- **"bank"** → Poppins **Bold (700)**, relleno con **degradado horizontal** de izquierda a derecha:
  `#FF2E27` (0%) → `#FF8F1B` (34%) → `#63AEF1` (67%) → `#04C537` (100%).
- Sin espacio entre "pos" y "bank" (van pegadas).
- **Brújula** sobre la "k", esquina superior derecha: anillo con aguja girada ~52°,
  punta norte **verde `#04C537`** (igual que el final del degradado), cola oscura.
- Tagline opcional debajo, centrado: **UN BANCO EN EL PUNTO DE PAGO**,
  Poppins SemiBold, mayúsculas, `letter-spacing` amplio, color `#8A97A8`.

## Paleta

| Rol | Hex |
|---|---|
| Navy (texto "pos", fondo dark) | `#081C2A` |
| Degradado bank (inicio) | `#FF2E27` |
| Degradado bank | `#FF8F1B` |
| Degradado bank | `#63AEF1` |
| Degradado bank (fin) / punta brújula | `#04C537` |
| Fucsia (acento alternativo) | `#F63562` |
| Tagline / texto sutil | `#8A97A8` |

## Prompt sugerido para el asistente de desarrollo

> Usa el logo de PosBank incluido en `assets/`. Es un wordmark: "pos" en Poppins Light 300
> color `#081C2A` y "bank" en Poppins Bold 700 con degradado horizontal
> `#FF2E27 → #FF8F1B → #63AEF1 → #04C537`, ambas palabras pegadas, con una brújula
> sobre la "k". Carga las fuentes Poppins 300 y 700 desde `fonts/` (o Google Fonts) —
> NO uses fuentes de sistema como fallback visual del logo. Para fondos oscuros usa
> `posbank-logo-dark.svg`. Para favicon/app icon usa `posbank-symbol.svg`. No modifiques
> colores, pesos ni proporciones del logo. Los SVG son vectoriales y escalan sin pérdida;
> insértalos como `<img>` o inline. Define el favicon con `posbank-symbol.svg`.

## Cargar las fuentes (CSS)

```css
/* Opción A: archivos locales */
@font-face { font-family:'Poppins'; font-weight:300; src:url('/fonts/Poppins-Light.ttf') format('truetype'); }
@font-face { font-family:'Poppins'; font-weight:700; src:url('/fonts/Poppins-Bold.ttf') format('truetype'); }

/* Opción B: Google Fonts */
/* <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;700&display=swap" rel="stylesheet"> */
```

Si necesitas el wordmark como **texto HTML** (no imagen), reprodúcelo así:

```html
<span style="font-family:Poppins;font-weight:300;color:#081C2A">pos</span><span
  style="font-family:Poppins;font-weight:700;
  background:linear-gradient(90deg,#FF2E27 0%,#FF8F1B 34%,#63AEF1 67%,#04C537 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent">bank</span>
```
(La brújula, en ese caso, se superpone como SVG absoluto sobre la "k".)
