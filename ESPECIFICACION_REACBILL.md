# ESPECIFICACIÓN FUNCIONAL EXHAUSTIVA — REACBILL

> **Documento de trabajo para reconstrucción por IA.**
> Describe el comportamiento REAL del código en el commit `e560d44` (versión mostrada en UI: `v2.2.4-main`).
> No es un resumen para humanos. No propone mejoras. Describe lo que la app HACE hoy.
> Todo lo dudoso está aislado en las secciones 7 y 8, no mezclado con la descripción del comportamiento oficial.

---

## 1. Resumen ejecutivo

### Qué es

REACBILL es una **aplicación web de un solo archivo** (`index.html`, 3208 líneas, ~163 KB) que reemplaza una planilla Excel llamada `Seguimiento_Auto.xlsx`. Su dominio es el **seguimiento semanal de billeteros (validadores de billetes) de máquinas tragamonedas** en un casino.

El usuario sube planillas Excel semanales exportadas del sistema del casino. La app las parsea en el navegador, calcula porcentajes de aceptación de billetes y un "puntaje de gravedad" por máquina, y presenta 11 vistas para analizar, comparar semanas, detectar máquinas problemáticas, y planificar intercambios físicos de billeteros entre posiciones.

### Quién la usa

- **Un único rol.** No hay autenticación, no hay usuarios, no hay permisos, no hay backend. Todo el que abre la URL ve y puede hacer exactamente lo mismo.
- Del código se infiere **un solo operador** (un técnico/supervisor de sala). Evidencia: no hay ningún mecanismo de sincronización, merge, ni resolución de conflictos; toda la persistencia es local al navegador (IndexedDB + localStorage).
- Escala de datos observada en el código y en capturas: **~650 máquinas** (`state.master`), **varias semanas** de historial (con archivado automático a los 3 meses).

### Cómo se despliega

- **Sitio estático puro.** Sin build step, sin bundler, sin transpilación, sin `package.json`. El archivo `index.html` se sirve tal cual.
- **Hosting: GitHub Pages**, repositorio `iskyhigh00/REACBILL`, rama `main`, workflow clásico `pages build and deployment` (disparado por push a `main`). Existe un `.nojekyll` vacío en la raíz para desactivar el procesamiento Jekyll.
- URL de producción: `https://iskyhigh00.github.io/REACBILL/`
- **Backend: NINGUNO.** Cero llamadas a API propias. Las únicas peticiones de red salientes son a CDNs de terceros (ver §2).
- **PWA instalable** (manifest + service worker). Funciona offline tras la primera carga.
- También funciona abriendo `index.html` directamente con `file://` — y ese modo **desbloquea una funcionalidad extra** (ver §5.9, persistencia del historial de intercambios).

### Archivos del repositorio (lista completa)

| Archivo | Rol |
|---|---|
| `index.html` | **La aplicación entera**: HTML + CSS + JS en un solo archivo. Único archivo con lógica. |
| `sw.js` | Service worker (estrategia de caché). |
| `manifest.json` | Manifiesto PWA. |
| `logo.png` | Logo mostrado en el header (2.1 MB, 1024×1536 RGBA). |
| `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `favicon-32.png` | Íconos PWA/favicon generados a partir de `logo.png` sobre fondo `#080c14`. |
| `.nojekyll` | Vacío. Desactiva Jekyll en GitHub Pages. |
| `cn` | **Archivo de datos de ejemplo** (7 líneas, CSV con `;`). Muestra el formato del "archivo cn" de ubicaciones. No lo consume la app automáticamente; es una muestra para subir a mano. |
| `README.md` | **DESACTUALIZADO.** Dice "v1.0.0" y describe 9 pestañas incluyendo Tendencias/Modelos/Denominaciones, que ya no existen. Ver §8. |
| `PROJECT_CONTEXT.md` | Briefing original del proyecto (el Excel de origen y qué debía preservarse). Histórico, no normativo hoy. |

No hay carpetas de código, sub-apps, migraciones, tests ni CI más allá del deploy de Pages.

---

## 2. Stack técnico exacto

### Lenguajes
- HTML5, CSS3 (CSS custom properties), JavaScript ES2020+ (usa `?.`, `??`, spread, `Intl.Collator`, `async/await`, template literals).
- **Sin TypeScript, sin JSX, sin módulos ES.** Todo el JS vive en un único `<script>` clásico sin `type="module"`, por lo que **todas las funciones y variables comparten el scope global de `window`** — esto es intencional y necesario: los handlers están escritos como atributos `onclick="funcion()"` en HTML generado por template literals, y esos atributos sólo pueden resolver identificadores globales. **No convertir a módulos ES sin reescribir todos los handlers.**

### Dependencias externas (CDN, cargadas por `<script src>`/`<link>` en el `<head>`)

| Librería | URL exacta | Versión | Uso |
|---|---|---|---|
| SheetJS (xlsx) | `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` | **0.20.3 (fijada)** | Parseo de `.xlsx/.xls/.xlsm/.xlsb`. Se usa `XLSX.read(arrayBuffer,{type:"array"})` y `XLSX.utils.sheet_to_json(ws,{header:1,defval:null})`. |
| JSZip | `https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js` | **3.x (rango, no fijada)** | Descomprimir ZIPs subidos y extraer los Excel de adentro. |
| Google Fonts — Inter | `https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap` | — | Tipografía. Con `preconnect` a `fonts.googleapis.com` y `fonts.gstatic.com`. |

**Chart.js fue eliminado** en el commit `a21863e` junto con las pestañas de gráficos. No debe reintroducirse: no queda ningún `<canvas>` ni llamada `new Chart(...)` en el código.

### Decisiones de arquitectura no obvias — IMPORTANTES, no "corregir"

1. **Scope global compartido a propósito.** (Ver arriba.) Todos los `onclick` inline dependen de ello.

2. **`esCollator` — un único `Intl.Collator` reutilizado.** Declarado como `const esCollator = new Intl.Collator("es",{numeric:true})`. El comentario en el código explica el motivo: `localeCompare(str,"es",{numeric:true})` reconstruye un Collator en **cada** llamada, y ordenar miles de máquinas así (O(n log n) llamadas) bloquea el hilo principal varios segundos. **No sustituir por `localeCompare` con opciones.**

3. **Caché de cálculos con invalidación manual.** `allCalcs()` memoiza en `calcCache`; `invalidate()` la limpia poniéndola a `null`. Toda mutación de `state.weeks`, `state.master` o `state.params` debe ir seguida de `invalidate()` o los cálculos quedan obsoletos. Este patrón se repite en todo el código.

4. **Archivado de semanas antiguas fuera del estado activo.** `state.weeks` sólo contiene los últimos 3 meses. Lo más viejo se mueve a otra clave de IndexedDB (`archivedWeeks`) que **no se carga en memoria para calcular**. Motivo declarado en comentario: mantener `saveState()`/`loadState()` rápidos sin importar cuánto histórico se haya subido. Los datos archivados **no se borran nunca** y se pueden exportar a JSON.

5. **Paginación del Editor de máquinas (Admin).** `MACH_PAGE_SIZE = 200`. Comentario en código: cada fila tiene varios `<input>`/`<select>` interactivos, mucho más costosos que celdas de texto, así que renderizar todas las filas a la vez (aunque sea por tandas) sigue siendo pesado. El filtro actúa **sobre el arreglo en memoria, no sobre el DOM**, y reinicia a página 0. Las ediciones pendientes viven en `machPendingEdits` para sobrevivir cambios de página/filtro.

6. **Service worker con estrategia mixta deliberada** (`sw.js`, caché `"reacbill-shell-v1"`):
   - **Navegación y cualquier GET cuya URL contenga `index.html`: RED PRIMERO**, con la copia cacheada sólo como respaldo si falla la red. Comentario explícito: *"para no quedar pegado en una versión vieja"*. **No cambiar a cache-first.**
   - **Todo el resto de GET (íconos, manifest, librerías CDN): CACHE PRIMERO**, con red de respaldo.
   - `install` hace `skipWaiting()`; `activate` borra toda caché cuyo nombre no sea el actual y hace `clients.claim()`.
   - SHELL precacheado: `["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"]`.

7. **Persistencia condicionada al origen.** `isLocal()` devuelve true si `location.protocol==="file:"` o el hostname es `localhost`/`127.0.0.1`. **El historial de intercambios sólo se guarda y sólo ofrece exportación cuando `isLocal()` es true.** En producción (GitHub Pages) el historial existe en memoria durante la sesión pero **no persiste**, y la UI lo advierte explícitamente. Esto es intencional, no un bug.

8. **Renderizado por reemplazo total de `innerHTML`.** No hay framework ni diff de DOM. Cada `renderX()` reconstruye el HTML completo de su pestaña. Consecuencias que el código maneja explícitamente:
   - El estado de la UI (selección de semana, sector, isla, filtros) se guarda en variables globales o en `<input type="hidden">` que se releen al re-renderizar.
   - `renderSectores()` y `renderTarjetas()` **capturan `window.scrollY` al inicio y lo restauran al final** (dos veces: síncrono y dentro de `requestAnimationFrame`) para que expandir/colapsar no salte la vista.
   - El orden de columnas se re-aplica manualmente con `reapplySort()` tras cada render.

9. **PWA:** `manifest.json` con `display:"standalone"`, `start_url:"./index.html"`, `scope:"./"`, `background_color`/`theme_color` = `#080c14`. Registro del SW dentro de `window.addEventListener("load", ...)` con `.catch(()=>{})` silencioso.

---

## 3. Modelo de datos completo

**No hay base de datos.** Todo es estructura en memoria + serialización JSON a IndexedDB/localStorage.

### 3.1 `state` — objeto global principal

Valor inicial exacto:

```js
let state = {
  weeks:{}, weekOrder:[],
  master:{},
  params:{thrOk:0.85,thrMid:0.90,thrCrit:0.40,multMid:3,multCrit:30,sevMid:10,sevHigh:50,sevCrit:150}
};
```

#### `state.weeks` — `{ [dateKey: string]: { rows: RawRow[] } }`

`dateKey` tiene formato **`"YYYY-MM-DD"`**. Es la clave de una semana.

`RawRow` (producido por `parseDataSheet`, forma exacta):

```js
{
  mda: string,        // ID de máquina, sólo dígitos (validado con /^\d+$/)
  tarjAc: number,     // tarjetas aceptadas (0 si falta la columna)
  tarjRe: number,     // tarjetas rechazadas (0 si falta)
  sesiones: number,   // 0 si falta.  ← PARSEADO PERO NUNCA USADO EN NINGUNA VISTA
  acc: { [deno: string]: number },  // billetes aceptados por denominación
  rej: { [deno: string]: number },  // billetes rechazados por denominación
  pctTarj: number,    // % aceptación de tarjeta leído del Excel; puede ser NaN si la celda está vacía
  pctBill: number|null // % aceptación de billetes leído del Excel; null si vacío/no numérico
}
```

Las claves de `acc`/`rej` salen del texto del encabezado del Excel (ver §5.1), y en la práctica coinciden con la constante:

```js
const DENOS = ["20000","10000","5000","2000","1000","SIN_DENO"];
```

`DENOS` es el orden fijo usado para **sumar** (`toAc`/`toRe`) y para **renderizar** las columnas por denominación en la pestaña Por Fecha. Si el Excel trae una denominación fuera de esta lista, se guarda en `acc`/`rej` pero **no se suma ni se muestra**.

#### `state.weekOrder` — `string[]`

Claves de `state.weeks` ordenadas ascendentemente con `a.localeCompare(b)` (orden lexicográfico, que para `YYYY-MM-DD` equivale a cronológico). Se recalcula con `sortWeeks()`. **El último elemento es siempre la semana más reciente** y muchísima lógica depende de eso.

#### `state.master` — `{ [mda: string]: MasterEntry }`

Datos maestros por máquina, acumulados desde múltiples fuentes de importación. Forma exacta al crearse (todas las claves string, inicializadas a `""`):

```js
{
  isla: "",          // posición, SÓLO DÍGITOS (ej "64101"). Ver §3.6
  fabricante: "",    // ej "EGT", "IGT", "AINSWORTH"
  modelmaq: "",      // modelo/gabinete de la máquina, ej "A560", "OXYGEN"
  juego: "",         // título del juego, ej "BUSTA BUCKS"
  modelo: "",        // modelo de BILLETERO: "Advance" | "Cashflow" | ""
  modeloFuente: "",  // "import" | "manual" | "" — procedencia de `modelo`
  firm: "",          // firmware, ej "403", "255"
  area: "",
  serial: "",
  category: "",
  deno: ""
}
```

Campo adicional que aparece sólo si la fuente lo aporta (no está en el inicializador):

```js
  locname: string    // posición cruda tal como venía del archivo, sin normalizar
```

**`modeloFuente`** controla el badge `imp` del Editor de máquinas: vale `"import"` cuando `modelo` fue cargado automáticamente desde un Excel y nunca confirmado a mano; pasa a `"manual"` al guardar desde el Editor, el Levantamiento o la Corrección masiva.

#### `state.params` — parámetros de la fórmula de gravedad

| Campo | Default | Significado |
|---|---|---|
| `thrOk` | `0.85` | % mínimo sin alerta. `pct >= thrOk` ⇒ puntaje 0. |
| `thrMid` | `0.90` | Umbral zona verde (sólo afecta color y multiplicador). |
| `thrCrit` | `0.40` | Umbral zona crítica. |
| `multMid` | `3` | Multiplicador zona media. |
| `multCrit` | `30` | Multiplicador zona crítica. |
| `sevMid` | `10` | Puntaje ≥ ⇒ badge "Medio". |
| `sevHigh` | `50` | Puntaje ≥ ⇒ badge "Alto". |
| `sevCrit` | `150` | Puntaje ≥ ⇒ badge "Urgente". |

`resetParams()` restaura **exactamente** estos mismos valores.

### 3.2 Objeto calculado por semana (`weekCalc` → `allCalcs()[dateKey]`)

```js
{
  rows: CalcRow[],   // RawRow + campos calculados
  avgT: number,      // promedio de `total` entre filas con total>0 (1 si no hay ninguna)
  avgPct: number,    // promedio ARITMÉTICO simple de pct entre filas con pct>0 && total>0
  avgAdv: number,    // promedio aritmético de pct de máquinas con modelo "Advance" (0 si ninguna)
  avgCf: number,     // idem "Cashflow"
  cntAdv: number,    // cantidad de máquinas Advance con pct>0 && total>0
  cntCf: number,     // idem Cashflow
  avgByMod: { [modelo: string]: number },  // ← RETORNADO PERO NO CONSUMIDO POR NINGUNA VISTA
  modMap:   { [modelo: string]: number[] },// ← RETORNADO PERO NO CONSUMIDO POR NINGUNA VISTA
  totBill: number,   // suma de `total` de TODAS las filas
  totAc:   number,   // suma de `toAc` de TODAS las filas
  totRe:   number    // suma de `toRe` de TODAS las filas
}
```

`CalcRow` = todos los campos de `RawRow` **más**:

```js
{
  toAc:  number,       // Σ acc[d] para d en DENOS
  toRe:  number,       // Σ rej[d] para d en DENOS
  total: number,       // toAc + toRe
  pct:   number|null,  // ver fórmula en §5.2
  score: number        // puntaje de gravedad, ver §5.2
}
```

### 3.3 Listas de selección (persistidas en localStorage)

Dos familias **independientes** de listas, cada una con 3 listas:

**Familia 1 — "Lista general"** (botones presentes en casi todas las vistas):

```js
const SEL_LIST_DEFS={
  a:{label:"Lista A", icon:"🅰️", color:"#2ecc71", key:"reacbill_selA_v1"},
  b:{label:"Lista B", icon:"🅱️", color:"#3b82f6", key:"reacbill_selB_v1"},
  c:{label:"Lista C", icon:"🇨",  color:"#a855f7", key:"reacbill_selC_v1"}
};
let selLists={a:new Set(), b:new Set(), c:new Set()};   // Sets de strings mda
const SEL_LEGACY_KEY="reacbill_sel_v1";                  // clave vieja, sólo para migración
```

**Familia 2 — "Listas de Tarjetas"** (botones sólo dentro de la pestaña Tarjetas):

```js
const TARJ_LIST_DEFS={
  rechazo:{label:"Rechazo de tarjetas", icon:"🚫", color:"#e67e22", key:"reacbill_tarjsel_v1"},
  b:      {label:"Lista B",             icon:"🅱️", color:"#3b82f6", key:"reacbill_tarjselb_v1"},
  c:      {label:"Lista C",             icon:"🇨",  color:"#a855f7", key:"reacbill_tarjselc_v1"}
};
let tarjLists={rechazo:new Set(), b:new Set(), c:new Set()};
let tarjListsExpanded={rechazo:false, b:false, c:false};  // NO persistido, se reinicia al recargar
```

Serialización: `JSON.stringify([...set])` → array de strings. Toda lectura/escritura va envuelta en `try/catch` vacío.

### 3.4 `swapHistory` — historial de intercambios

`Array` de objetos; forma exacta al insertar (`intConfirmar`):

```js
{
  id: number,      // Date.now() al momento de confirmar — ES LA CLAVE de deduplicación y borrado
  fecha: string,   // "YYYY-MM-DD", editable por el usuario, default = hoy
  nota: string,    // texto libre, puede ser ""
  mdaA: string, locA: string, pctA: number, totA: number, modA: string, firmA: string,
  mdaB: string, locB: string, pctB: number, totB: number, modB: string, firmB: string,
  gain: number     // ganancia estimada redondeada
}
```

Persistido **sólo si `isLocal()`**, en IndexedDB bajo `HIST_KEY`, ofuscado con XOR+base64.

### 3.5 Claves de almacenamiento — inventario completo

**IndexedDB** — base `"reacbill"`, **versión 2**, object store `"kv"` (creado en `onupgradeneeded` dentro de `try/catch`):

| Clave (constante) | Valor | Cifrado |
|---|---|---|
| `LS_KEY = "reacbill_v1"` | `JSON.stringify(state)` completo | No |
| `HIST_KEY = "reacbill_hist_v1"` | `xorEnc(JSON.stringify(swapHistory))` | XOR+base64 |
| `ARCHIVE_KEY = "reacbill_archive_v1"` | `JSON.stringify({weeks:archivedWeeks, weekOrder:archivedWeekOrder})` | No |

**localStorage:**

| Clave | Valor |
|---|---|
| `reacbill_selA_v1` / `reacbill_selB_v1` / `reacbill_selC_v1` | arrays de mda (Lista general A/B/C) |
| `reacbill_sel_v1` | **legacy**, se migra a Lista A y se elimina (§5.10) |
| `reacbill_tarjsel_v1` / `reacbill_tarjselb_v1` / `reacbill_tarjselc_v1` | arrays de mda (listas de Tarjetas) |
| `reacbill_tarjfilt_v1` | `{groupBy:string, subBy:string}` — filtros de agrupación de Tarjetas |

**Ofuscación XOR** (el propio código la etiqueta como *"ofuscación, no criptografía fuerte"*):

```js
const _K = "REACBILL_SWAP_2026";
function xorEnc(str){ return btoa(unescape(encodeURIComponent(
  [...str].map((c,i)=>String.fromCharCode(c.charCodeAt(0)^_K.charCodeAt(i%_K.length))).join("")))); }
function xorDec(enc){ try{ return decodeURIComponent(escape(
  [...atob(enc)].map((c,i)=>String.fromCharCode(c.charCodeAt(0)^_K.charCodeAt(i%_K.length))).join(""))); }
  catch(e){ return "[]"; } }
```

`xorDec` devuelve la cadena `"[]"` ante cualquier error, de modo que el `JSON.parse` posterior produzca un array vacío en vez de romper.

### 3.6 Normalización de la posición ("isla") — regla central

**La posición se almacena y se compara SIEMPRE como dígitos puros, sin guión.** Ej: `641-01` ⇒ `"64101"`.

```js
function normIsla(s){ return String(s??"").replace(/[^0-9]/g,""); }
function islaPrefix(isla){
  if(!isla) return "";
  const s = normIsla(isla);
  return s.length>2 ? s.slice(0,-2) : s;   // quita los 2 últimos dígitos = nº de isla
}
function islaSector(isla){ const p=islaPrefix(isla); return p ? p[0] : ""; }  // primer dígito
function fmtLocname(loc){ return normIsla(loc); }
```

Semántica del dominio:
- **Posición completa** = isla + 2 dígitos de posición dentro de la isla. `"64101"` = isla `641`, posición `01`.
- **Isla** = `islaPrefix()` = todo menos los últimos 2 dígitos. `"64101"` → `"641"`.
- **Sector** = `islaSector()` = **primer dígito** de la isla. `"641"` → `"6"`.
- Si la cadena tiene ≤2 dígitos, `islaPrefix` la devuelve entera (no recorta).

`islaPrefix` normaliza internamente, por lo que sigue funcionando con datos legacy que aún tengan guión.

**Migración automática** (`migrateIslaFormat`, ejecutada dentro de `loadState()` tras cargar el estado):

```js
function migrateIslaFormat(){
  for(const ms of Object.values(state.master)){
    if(ms.isla && ms.isla.includes("-")) ms.isla = normIsla(ms.isla);
  }
}
```

Nótese: **no llama a `saveState()`**. La normalización se persiste recién en el siguiente guardado por otra causa.

---

## 4. Constantes, formateadores y utilidades transversales

### 4.1 Formateadores

```js
const fmtP = v => v==null||isNaN(v)||v<=0 ? "—" : (v*100).toFixed(2)+"%";   // 2 decimales
const fmtN = v => v==null||isNaN(v) ? "—" : Math.round(v).toLocaleString("es-CL"); // miles con punto
const fmt1 = v => v==null||isNaN(v) ? "—" : v.toFixed(1);
```

**Importante:** `fmtP` devuelve `"—"` también para `0` y negativos (por el `v<=0`), no sólo para null/NaN.
`fmtN` usa locale **`"es-CL"`** ⇒ separador de miles `.` (ej `93.061`).

Fechas:

```js
function fmtKey(k){     // "2026-07-12" → "12-07"   (día-mes, para encabezados compactos)
  const m=k.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?`${m[3]}-${m[2]}`:k; }
function fmtKeyFull(k){ // "2026-07-12" → "12/07/2026"
  const m=k.match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?`${m[3]}/${m[2]}/${m[1]}`:k; }
```
Ambas devuelven la clave sin tocar si no matchea el patrón.

### 4.2 Clasificación por color de porcentaje

```js
function pctClass(p){
  if(!p||p<=0) return "";
  const pr=state.params;
  if(p<pr.thrCrit) return "c-cr";   // rojo    (<0.40)
  if(p<pr.thrOk)   return "c-hi";   // naranja (<0.85)
  if(p<pr.thrMid)  return "c-mid";  // amarillo(<0.90)
  return "c-ok";                    // verde   (>=0.90)
}
```

Clases CSS correspondientes: `.c-ok` `#34d399` / `.c-mid` `#fbbf24` / `.c-hi` `#fb923c` / `.c-cr` `#f87171`, cada una con fondo translúcido del mismo tono y `font-weight:600`.

### 4.3 Barra de porcentaje

```js
function pctBar(p,w=60){
  if(!p||p<=0) return `<span class="pctbar-track" style="width:${w}px"></span>`;  // track vacío
  const col = {"c-ok":"var(--ok)","c-mid":"var(--mid)","c-hi":"var(--high)","c-cr":"var(--crit)"}[pctClass(p)] || "var(--muted)";
  const fillPct = Math.max(2, Math.min(100, Math.round(p*100)));  // clamp 2–100
  return `<span class="pctbar-track" style="width:${w}px"><span class="pctbar-fill" style="width:${fillPct}%;background:${col}"></span></span>`;
}
```
Se usa **en un solo lugar**: la columna "Barra" de la tabla de islas en Sectores, con `w=50`.
El relleno tiene `transition:width .35s ease`.

### 4.4 Badges de gravedad

```js
function sevClass(sc,p){
  if(sc<=0)          return "ok";
  if(sc>=p.sevCrit)  return "cr";
  if(sc>=p.sevHigh)  return "hi";
  if(sc>=p.sevMid)   return "mid";
  return "ok";
}
const SEVLBL={ok:"OK",mid:"Medio",hi:"Alto",cr:"Urgente"};
```
Nota: un puntaje `>0` pero `< sevMid` cae en `"ok"` ⇒ badge verde con texto "OK".

### 4.5 Sistema de ordenamiento genérico de tablas

Estado global: `const sortStates={}` — `{ [tableId]: {col:number, dir:1|-1} }`.

**`thColIndex(th)`** — calcula el índice de columna REAL de un `<th>` construyendo una grilla que respeta `colspan` y `rowspan` de todas las filas del `<thead>`. Esto permite que tablas con encabezados de dos niveles (Resumen, Por Fecha) ordenen la columna correcta. Fallback: `th.cellIndex`.

**`sortVal(s)`** — convierte texto de celda a número para comparar:
1. `""` o `"—"` ⇒ `null`.
2. Contiene `%` ⇒ `parseFloat` quitando `+` y `%`.
3. Matchea `/^(\d+)-0*(\d+)$/` (formato isla legacy con guión) ⇒ `parseInt(g1)*1000+parseInt(g2)`.
4. Matchea `/^-?\d{1,3}(\.\d{3})+$/` (miles con punto) ⇒ `parseFloat` quitando los puntos.
5. Si no, `parseFloat(s.replace(",","."))`; `NaN` ⇒ `null`.

**`attachSort(tableId)`** — engancha click en cada `th.sortable`, **salvo los que ya tienen atributo `onclick`** (así convive con el sort propio de Resumen). Comportamiento del click:
- Alterna dirección si es la misma columna, si no arranca en `dir=1` (ascendente).
- Limpia `s-asc`/`s-desc` de todos los th y marca el actual (flecha ↑/↓ vía `::after`).
- **Selecciona sólo filas HIJAS DIRECTAS del tbody** y excluye `.no-sort`:
  ```js
  const rows=[...tbody.children].filter(tr=>tr.tagName==="TR"&&!tr.classList.contains("no-sort"));
  ```
  El comentario explica el motivo: `querySelectorAll` también capturaría filas de **tablas anidadas** (el detalle de isla en Sectores), corrompiéndolas al ordenar. **Crítico: no volver a `querySelectorAll`.**
- Extracción de texto por celda (`cellText`), en orden de prioridad:
  1. Si hay `input`/`select` dentro ⇒ su `.value`.
  2. Si la celda tiene atributo `data-sort` ⇒ ese valor.
  3. Sólo los **nodos de texto directos** (ignora elementos anidados, ej el `<span class="muted">` con el volumen debajo del %).
  4. Si eso queda vacío ⇒ `cell.textContent.trim()` completo.
- Comparación: si ambos son numéricos ⇒ diferencia numérica × dir; si sólo uno es numérico, el numérico va primero (retorna `-1`/`1` **sin aplicar `dir`**); si ninguno ⇒ `esCollator.compare(av,bv)*dir`.

**`reapplySort(tableId)`** — tras un re-render, restaura el orden previo: busca el `th` cuyo `thColIndex` coincide con el guardado, **invierte `dir` en `sortStates`** y dispara `th.click()` (el handler vuelve a invertirlo, quedando la dirección original).

### 4.6 Scrollbar superior espejo

`syncTopScroll(topId, wrapId, tblId)` — usado sólo en Resumen. Fija el ancho del div interno del scroller superior a `tbl.offsetWidth` y sincroniza `scrollLeft` en ambos sentidos con una bandera `skip` para evitar el bucle de eventos.

### 4.7 Variables CSS referenciadas pero NO definidas en `:root`

Se usan siempre con fallback, así que el fallback es lo que aplica siempre:

| Variable | Referencias | Fallback efectivo |
|---|---|---|
| `--crit-bg` | 3 (resaltado de campos vacíos en Editor de máquinas) | `#3a1a1a` |
| `--bg2` | 1 (fondo de la fila de detalle de isla) | `#0d1626` |
| `--tsc` | 6 (color del botón de lista) | se **inyecta inline** por botón (`style="--tsc:#..."`), el fallback casi nunca aplica |
| `--sc-accent` | 1 (línea superior de tarjeta de sector) | se inyecta inline; fallback `var(--accent)` |
| `--fg` | 1 | **no definida y sin fallback** en `.med-inp`… (definida en `:root` como `--fg:#e2e8f4`) |

*(`--fg` sí está definida en `:root`; las otras cuatro no.)*

---

## 5. Funcionalidades, una por una

Estructura de navegación (`TABS`, orden exacto en pantalla):

```js
const TABS=[
  ["carga","📂 Carga"],["resumen","📊 Resumen"],["fecha","📅 Por Fecha"],
  ["ranking","🎯 Gravedad"],["sectores","🗺 Sectores"],["maquinas","🎰 Máquinas"],
  ["intercambios","🔄 Intercambios"],
  ["buscador","🔎 Buscador"],
  ["tarjetas","💳 Tarjetas"],
  ["lista","📋 Lista"],["admin","⚙️ Admin"]
];
let activeTab="carga";
```

`buildShells()` crea un `<div class="tab" id="tab-${id}">` por pestaña dentro de `<main id="main">`; sólo `.tab.active` tiene `display:block`.

`showTab(id)`:
1. `activeTab=id`
2. Marca el botón de nav activo y el panel activo (toggle de clase `active`).
3. Despacha al render correspondiente vía objeto literal; si el id no está en el mapa, no hace nada (`carga` no tiene render — su HTML se construye una sola vez en `buildShells`).
4. Llama `updateStatsBar()` **siempre al final** (por eso el header cambia al entrar a Tarjetas).

### 5.0 Arranque de la aplicación (IIFE final)

Orden **exacto** de inicialización:

```js
(async function(){
  document.getElementById("verSpan").textContent="v"+VERSION;
  selLoad();          // listas generales A/B/C + migración legacy
  tarjListsLoad();    // listas de Tarjetas
  tarjFiltLoad();     // filtros de agrupación de Tarjetas
  buildNav(); buildShells();
  updateSelBadge();
  await loadState();       // ← incluye migrateIslaFormat()
  await loadHistory();     // no-op si !isLocal()
  await loadArchiveMeta();
  sortWeeks();
  await archiveOldWeeks(); // puede archivar y guardar
  renderAll();
  if(state.weekOrder.length) showTab("resumen"); else showTab("carga");
})();
```

Luego, fuera de la IIFE:

```js
if("serviceWorker" in navigator){
  window.addEventListener("load",()=>{ navigator.serviceWorker.register("sw.js").catch(()=>{}); });
}
```

`renderAll()` = `renderLoadedInfo(); showTab(activeTab);`

**Pestaña inicial:** `resumen` si hay al menos una semana cargada, si no `carga`.

### 5.1 Pestaña **Carga** — importación de archivos

UI: una zona `#dropzone` (click abre el selector de archivos; también acepta drag&drop, con clase `.over` mientras se arrastra), un `<input type="file" multiple>` oculto, un bloque de ayuda estático, un `#uplog` donde se escribe el log de importación, y una tarjeta "Datos cargados" con el botón **Borrar todo**.

`handleFiles(files)` procesa **secuencialmente** cada archivo. Todo el cuerpo por archivo va en `try/catch`; ante excepción registra `` `${f.name}: ERROR — ${e.message}` `` y sigue con el siguiente.

#### Ruteo por extensión

`ext` = extensión en minúsculas.

**A) `zip`** — Se abre con `JSZip.loadAsync`. Se recorren todas las entradas no-directorio y se conservan sólo las de extensión `xlsx|xls|xlsm|xlsb`, convertidas a `File`. Si no hay ninguna: log `"ZIP sin archivos Excel dentro"` y continúa. Si hay: log `` `${f.name}: ${n} Excel encontrados en el ZIP` `` y **cada Excel interno se procesa con la misma lógica que un Excel suelto** (código duplicado, ver §8), con log indentado `"  └ ..."`.

**B) `json`** — `JSON.parse`. Se acepta si es un **array** o si es un objeto con `.master` array ⇒ `importMasterJSON(data)`; log `` `${n} máquinas importadas (maestro JSON)` ``; hace `saveState()` + `renderAll()` + actualiza `#uplog` **inmediatamente** y continúa. Si no matchea ⇒ `"JSON no reconocido"`. Si el parse falla ⇒ `` `JSON inválido — ${e.message}` ``.

**C) Archivo de texto tipo `cn`** — Si NO es Excel y el texto contiene `"SMDBID"` **o** `"LOCNAME"` **y además** contiene `";"` ⇒ `parseCnText(text)`. Si devuelve >0, log `` `${n} ubicaciones cargadas (cn)` ``, guarda, re-renderiza y continúa.

**D) Rechazo temprano** — Si NO es Excel, tiene extensión, y esa extensión no está en `["csv","txt","tsv"]` ⇒ `"formato no reconocido"` y continúa.
Consecuencia: un archivo **sin extensión** (como el `cn` del repo) que no cumplió (C) **cae al parser de Excel**.

**E) Excel** (o lo que haya llegado hasta acá) — `XLSX.read(arrayBuffer,{type:"array"})`, y luego dos ramas:

- **E1. Planilla histórica**: si hay hojas cuyo nombre matchea **`/^\d{2}-\d{2}$/`** (formato `dd-mm`). Para cada una se llama `parseDataSheet`; si devuelve filas, se calcula la clave de fecha así:
  ```js
  const [dd,mm]=sn.split("-").map(Number);
  const now=new Date(); let yr=now.getFullYear();
  if(mm > now.getMonth()+1) yr--;              // ← inferencia de año
  const key=`${yr}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
  state.weeks[key]=wk;
  ```
  **Regla de año:** si el mes de la hoja es **mayor** que el mes actual, se asume el año anterior. Es una heurística sin más contexto.
  Además, si existen las hojas `"Contadores"` y/o `"Seguimiento"`, se parsean (§5.1.3, §5.1.4).
  Log: `` `${f.name}: ${imp} semanas históricas importadas` `` (y `"Contadores: N máquinas"` si aplicó).

- **E2. Planilla semanal suelta**: elección de hoja, en este orden:
  1. Primera hoja cuyo nombre matchee `/ultima/i`.
  2. Si no, primera que matchee `/semana/i`.
  3. Si no, **iterando desde la hoja índice 1** (`wb.SheetNames.slice(1)`, es decir **omitiendo la primera hoja**), la primera para la que `parseDataSheet` devuelva algo. El comentario explica: la hoja 0 es un reporte mensual con la misma estructura y no debe confundirse con la semanal.

  Si se obtuvo `wk`: clave = `dateKeyFromName(f.name)`; `state.weeks[key]=wk`; log `` `${f.name} → ${fmtKeyFull(key)} (${wk.rows.length} máq., hoja: ${sn})` ``.
  Si NO: se intenta `parseMasterReference(wb)` (log `"N máquinas actualizadas (referencia maestra)"`), y si eso da 0, `parseTipoBilletero(wb)` (log `"N modelos de billetero actualizados"`), y si eso también da 0 ⇒ `"formato de datos no reconocido"`.
  En ambos casos también se parsean `"Contadores"` y `"Seguimiento"` si existen.

#### Cierre de `handleFiles` (siempre, tras el bucle)

```js
sortWeeks(); invalidate(); await archiveOldWeeks(); await saveState(); renderAll();
document.getElementById("uplog").innerHTML = log.map(l=>"• "+l).join("<br>");
```

#### 5.1.1 `dateKeyFromName(name)`

1. `/(\d{4})[-_.](\d{2})[-_.](\d{2})/` ⇒ `YYYY-MM-DD`.
2. `/(\d{2})[-_.](\d{2})[-_.](\d{4})/` ⇒ reordena a `YYYY-MM-DD`.
3. Fallback: nombre sin extensión, **cortado a 10 caracteres** (`.slice(0,10)`). Produce claves no-fecha que rompen `fmtKey`/`fmtKeyFull` (devuelven la cadena cruda) y ordenan lexicográficamente.

#### 5.1.2 `parseDataSheet(ws)` — parser de la hoja semanal

Lee con `sheet_to_json(ws,{header:1,defval:null})`. **La fila 0 es el encabezado.** Detección de columnas por texto de encabezado:

| Campo | Condición sobre el encabezado `h` |
|---|---|
| `idx.maq` | `h.toLowerCase()` ∈ `{"maquina","máquina","mda","smdbid"}` |
| `idx.tA` | `/^tarjeta acepta/i` |
| `idx.tR` | `/^tarjeta rechaza/i` |
| `idx.ses` | `/sesion/i` |
| `idx.pT` | `/aceptaci[oó]n tarjeta/i` |
| `idx.pB` | `/aceptaci[oó]n billetes?/i` |
| `idx.acc[deno]` | `/billete aceptado/i` → la denominación es el resto del encabezado tras quitar ese texto y hacer `trim()`; si queda vacío ⇒ `"SIN_DENO"` |
| `idx.rej[deno]` | `/billete rechazado/i` → idem |

**El orden del `if/else if` importa**: `"maquina"` se evalúa primero, luego tarjetas, luego sesión, luego los porcentajes, y por último las denominaciones.

**Condiciones de rechazo (devuelve `null`):**
- No se encontró columna de máquina (`idx.maq<0`).
- **No hay ninguna columna de datos de aceptación**: `idx.tA<0 && idx.tR<0 && Object.keys(idx.acc).length===0 && idx.pB<0`. Esto es lo que impide que una hoja cualquiera se confunda con una planilla semanal.
- No quedó ninguna fila válida (`rows.length===0` ⇒ devuelve `null`).

**Filtrado de filas:** se descarta la fila si el valor de la columna máquina, tras `String(...).trim()`, es vacío, `"0"`, `"err"`, o **no matchea `/^\d+$/`**.

**Conversión de valores:**
```js
const num  = i => i>=0 && row[i]!=null ? Number(row[i])||0 : 0;      // NaN → 0
const pNum = i => i>=0 && row[i]!=null && row[i]!=="" ? Number(row[i]) : NaN;
```
`pctBill` se guarda como `isNaN(pB) ? null : pB`. `pctTarj` **se guarda tal cual, pudiendo ser `NaN`**.

**Efecto secundario:** por cada MDA nuevo se crea la entrada vacía en `state.master` con todos los campos en `""`.

#### 5.1.3 `parseContadores(ws)`

Encabezado en fila 0, comparado en MAYÚSCULAS. Busca `"SMDBID"` (obligatorio; si falta devuelve 0), `"LOCNAME"`, el primero que empiece con `"MANUF"`, y `"JUEGO"`.
Por cada fila con `SMDBID` no nulo hace **merge** sobre `state.master[mda]` escribiendo `locname`, `isla` (= `fmtLocname(loc)`, o `""` si no hay loc), `fabricante` y `juego`.
**Atención:** escribe `fabricante` y `juego` **incondicionalmente** — si la columna no existe, los sobrescribe con `""`, borrando datos previos.

#### 5.1.4 `parseSeguimientoModelos(ws)`

**Empieza a leer en la fila índice 4** (`for(let r=4; ...)`) — las primeras 4 filas son encabezados/títulos en el Excel original.
Columnas **por posición fija**: `0`=mda, `1`=fabricante, `2`=modelo billetero, `3`=firmware, `4`=isla (pasado por `normIsla`).
Salta filas cuyo mda no matchee `/^\d+$/`.
El merge usa el patrón `nuevo || anterior || ""` (sólo pisa si el nuevo valor es truthy).
`modeloFuente` se pone en `"import"` **sólo si vino un `modelo`**; si no, conserva el anterior.
Devuelve la cantidad de filas **que traían modelo**.

#### 5.1.5 `parseMasterReference(wb)` — planilla maestra de referencia

Recorre **todas** las hojas del libro. Normalizador: `trim().toUpperCase().normalize("NFD")` quitando diacríticos.
Busca la fila de encabezado **entre las primeras 5 filas**: debe contener una celda que incluya `"MACHINE ID"` **y** otra que incluya `"MANUFACTURER"`.
Columnas detectadas por `includes`: `MACHINE ID`, `POSITION`, `AREA`, `TITLE GAME`, `MANUFACTURER`, `CABINET MODEL`, `SERIAL`, `CATEGORY`, `DENO`. Requiere sí o sí `MACHINE ID` y `MANUFACTURER`.
Por fila (desde `hi+1`), con mda `/^\d+$/`: crea la entrada si no existe y luego **sólo pisa cada campo si el valor nuevo es truthy** (`ms.x = get(...) || ms.x`). `isla` se normaliza con `fmtLocname` y además guarda `locname` crudo.
**Devuelve en la primera hoja que produzca `n>0`** (no sigue buscando en las demás).

#### 5.1.6 `parseTipoBilletero(wb)` — planilla de tipo de billetero

Recorre todas las hojas. Encabezado en las primeras 5 filas: una celda que incluya `"MAQUINA"` y otra que incluya `"BILLETERO"` (comparación normalizada sin acentos).
Por fila: mda `/^\d+$/`; el valor de la columna billetero se normaliza y se mapea:
- contiene `"CASHFLOW"` ⇒ `"Cashflow"`
- contiene `"ADVANCE"` ⇒ `"Advance"`
- cualquier otra cosa ⇒ se **salta la fila**.
Asigna `modelo` y `modeloFuente="import"`. Devuelve en la primera hoja con `n>0`.

#### 5.1.7 `parseCnText(text)` — archivo de ubicaciones

Separador: `";"` si la primera línea lo contiene, si no TAB.
Encabezado (línea 0) en MAYÚSCULAS; requiere `SMDBID` y `LOCNAME` (si falta alguno ⇒ 0).
Salta filas con menos columnas de las necesarias, o con mda/loc vacíos, **o con `loc === "err"`** (el archivo de ejemplo `cn` del repo contiene filas con `err`).
Merge: escribe `locname` y `isla` (= `fmtLocname(loc)`).

#### 5.1.8 `importMasterJSON(payload)`

Acepta **array plano** (formato antiguo) o **objeto `{master:[...], hist:"..."}`** (formato nuevo).
Por fila requiere `row.mda`. Merge campo a campo con `nuevo || anterior || ""` para: `isla, locname, fabricante, modelmaq, juego, modelo, firm, area, serial, category, deno`.
**No importa `modeloFuente`** — se conserva el que hubiera.
Si viene `payload.hist`: lo desencripta, y si es array no vacío hace **merge por `id`** — agrega sólo las entradas cuyo `id` no exista ya en `swapHistory`; si agregó al menos una, llama `saveHistory()`.
Devuelve la cantidad de máquinas procesadas.

#### 5.1.9 `renderLoadedInfo()` y **Borrar todo**

`renderLoadedInfo()`: si no hay semanas, muestra `"Sin datos. Sube archivos."`, vacía `#statsBar` y `#dataInfo`. Si hay, muestra número de semanas, número de MDAs únicos (unión de todas las semanas) y cuántos tienen ubicación, más la lista completa de fechas; y escribe en `#dataInfo` (junto al título) `" · N sem · M máq"`. Termina llamando `updateStatsBar()`.

**`borrarTodo()`** — protección por clave:
```js
const now=new Date();
const clave = String(now.getMonth()+1).padStart(2,"0") + String(now.getDate()).padStart(2,"0"); // "MMDD" de HOY
```
Pide la clave con `prompt`. Si el usuario cancela (`null`) ⇒ no hace nada. Si no coincide ⇒ `alert("Clave incorrecta.")`. Si coincide, pide además un `confirm`. Sólo entonces:
```js
state.weeks={}; state.weekOrder=[]; state.master={}; invalidate(); saveState(); renderAll();
```
**No borra**: `state.params`, las listas de selección (localStorage), el historial de intercambios, ni el archivo de semanas antiguas.

### 5.2 Motor de cálculo — `weekCalc(week, params)`

Se ejecuta por semana, memoizado en `allCalcs()`.

**Paso 1 — por fila:**
```js
toAc  = Σ (acc[d] || 0) para d en DENOS
toRe  = Σ (rej[d] || 0) para d en DENOS
total = toAc + toRe
pct   = (pctBill != null && pctBill > 0) ? pctBill : (total > 0 ? toAc/total : null)
```
**Regla clave:** si el Excel trae la columna "% aceptación billetes" con valor > 0, **ese valor manda** sobre el porcentaje calculado. El calculado es sólo fallback.

**Paso 2 — promedio de volumen:**
```js
avgT = (Σ total de filas con total>0) / (cantidad de filas con total>0)   // 1 si no hay ninguna
```

**Paso 3 — puntaje de gravedad, por fila:**
```js
if (!pct || pct >= thrOk) {
  score = 0;
} else {
  mult = pct < thrCrit ? multCrit : (pct < thrMid ? multMid : 1);
  score = total * (1 + Math.log10(total)) * ((thrOk - pct)/thrOk) * (total/avgT) * mult;
}
```

Notas exactas:
- `pct` nulo o 0 ⇒ score 0.
- La rama `mult = 1` es **inalcanzable con los defaults**: para llegar ahí haría falta `pct >= thrMid (0.90)` y a la vez `pct < thrOk (0.85)`, imposible mientras `thrMid > thrOk`. Sólo se alcanza si el usuario configura `thrMid < thrOk` en Admin.
- `Math.log10(total)` con `total` entre 0 y 1 daría negativo, y `total=0` daría `-Infinity`; en la práctica no ocurre porque `pct` sería null y el score sería 0 antes de llegar.
- El score **no está acotado**: crece con el cuadrado del volumen (`total × total/avgT`).

**Paso 4 — agregados de la semana:** ver §3.2. `avgPct` es un **promedio aritmético simple** de los `pct` (no ponderado por volumen), calculado sobre las filas con `pct>0 && total>0`.

### 5.3 Barra de estadísticas del header — `updateStatsBar()`

Se llama desde `showTab()` (siempre) y desde `renderLoadedInfo()`.

Sin semanas ⇒ deja `#statsBar` vacío.

Define:
```js
lastD      = state.weekOrder[state.weekOrder.length-1];   // SIEMPRE la última semana cargada
idx        = state.weekOrder.indexOf(lastD);
monthWeeks = state.weekOrder.slice(Math.max(0,idx-3), idx+1);  // hasta 4 semanas: la última y 3 previas
```

**Importante:** usa **siempre la última semana cargada**, **ignorando** el selector de semana de cualquier pestaña. El header no cambia al mover el selector de Sectores/Tarjetas/etc.

**Rama A — `activeTab === "tarjetas"`:**
```js
pctWeek  = ΣtarjAc(lastD) / (ΣtarjAc(lastD)+ΣtarjRe(lastD))     // ponderado
pctMonth = ΣtarjAc(monthWeeks) / (ΣtarjAc+ΣtarjRe de monthWeeks) // ponderado sobre las 4 semanas juntas
```
Muestra 4 métricas: `% tarjeta semana DD-MM` (grande, 30px, azul), `% prom. último mes` (19px), `tarj. aceptadas` (verde) y `tarj. rechazadas` (rojo).

**Rama B — cualquier otra pestaña:**
```js
pctWeek  = lastC.totAc / lastC.totBill
pctMonth = Σ totAc(monthWeeks) / Σ totBill(monthWeeks)
```
Etiquetas: `% semana DD-MM`, `% prom. último mes`, `aceptados`, `rechazados`.

En ambas ramas el "promedio del último mes" es un **cociente de sumas (ponderado por volumen)**, no un promedio de porcentajes.

### 5.4 Pestaña **Resumen** — matriz máquina × semana

Estado propio: `resSortState` (`{wk,field,dir}` o `null`) y `resFiltroVal` (string).

`renderResumen()` arma la tarjeta con: input de filtro (`#resFiltro`, `oninput` asigna `resFiltroVal` y llama `resApplyFilter()`), la pista "Click en % o Total para ordenar por semana", y si hay semanas ocultas por antigüedad, el texto `· mostrando últimos 3 meses (N semana(s) más antigua(s) oculta(s))` con pluralización condicional. Luego el scroller espejo y el contenedor de tabla (`max-height:75vh`). Delega en `renderResBody()`.

`renderResBody()`:
- Usa **`visibleWeeks()`** (últimos 3 meses), no todas las semanas.
- Construye `mdaMap: Map<mda, {[dateKey]: CalcRow}>` recorriendo todas las semanas visibles.
- **Encabezado de 2 filas:** fila 1 = `<th></th>` + MDA/ISLA/Modelo/Firm (columnas sticky `s1..s4`) + un `<th colspan="2">DD-MM</th>` por semana. Fila 2 = celdas vacías para las 5 primeras + `%` y `Total` por semana, ambos con `onclick="resSort('fecha','pct'|'tot')"`.
- **Orden:** si `resSortState` está activo, ordena los MDA por el valor de esa semana/campo; las máquinas sin dato en esa semana reciben `-1` si `dir===1` (van al final ascendente) o `Infinity` si `dir===-1`. Si no hay sort activo ⇒ `mdaList.sort()` (orden lexicográfico por defecto de JS).
- Cada fila lleva `data-search` = `(mda+isla+modelo+firm).toLowerCase()`.
- Celdas por semana: si hay dato con `pct>0` ⇒ `<td class="c-...">%</td><td>total</td>`; si no ⇒ dos `<td></td>` vacíos.
- Al final: `attachSort("tblResumen")`, `resApplyFilter()` y, en `requestAnimationFrame`, `syncTopScroll(...)`.

`resSort(wk,field)`: si ya estaba ordenando por esa misma semana+campo, invierte `dir`; si no, arranca con `dir = (field==="pct" ? 1 : -1)` — es decir **porcentaje ascendente** (peores primero) y **total descendente** (mayor volumen primero).

`resApplyFilter()`: filtra **ocultando filas del DOM** (`tr.style.display`) según `data-search`, sin re-renderizar.

**Sticky columns:** `.s1` (left 0, 76px), `.s2` (left 76px, 70px), `.s3` (left 146px, 82px), `.s4` (left 228px, 58px); en `thead` con `z-index:6`, en `tbody` con `4`.

### 5.5 Pestaña **Por Fecha** — detalle semanal

Selector `#fechaSel` con **todas** las semanas; por defecto la última (si el valor guardado ya no existe, cae a la última).

**KPIs (6):** `% prom.` (`c.avgPct`), `Advance (n)` (verde `#2ecc71`), `Cashflow (n)` (amarillo `#f1c40f`), `Total billetes`, `Rechazos`, `Con alerta` (cantidad de filas con `score>0`, color naranja).

**Tabla `#tblFecha`**, filas ordenadas por `score` descendente. Encabezado de 2 niveles: fila 1 con `<th></th>`, MDA, ISLA, Modelo, Firm, `<th colspan="6">Bill. Aceptado</th>`, `<th colspan="6">Bill. Rechazado</th>`, ToAc, ToRe, Total, %Acep, Puntaje, Gravedad; fila 2 con las 6 denominaciones (`DENOS`) repetidas dos veces, todas `sortable`.

Cuerpo por fila: botones de lista (3), MDA, `getLoc(mda)`, `ms.modelo`, `ms.firm`, 6 valores `acc`, 6 valores `rej`, `toAc`, `toRe`, `total`, `%Acep` coloreado, `score` con 1 decimal, y el badge de gravedad.

### 5.6 Pestaña **Gravedad** (id `ranking`) — ranking de puntaje

Controles: selector de semana `#rankSel` (todas las semanas) y selector `#rankModeloSel` con `todas` / `advance` / `cashflow`.

Lógica:
```js
prevD  = state.weekOrder[ indexOf(d) - 1 ];   // semana inmediatamente anterior (undefined si es la primera)
rows   = calcs[d].rows.filter(m => m.score > 0);
if (modeloFil !== "todas")
  rows = rows.filter(m => (state.master[m.mda]?.modelo||"").toLowerCase() === modeloFil);
rows.sort((a,b) => b.score - a.score);
```
**Sólo se listan máquinas con `score>0`.** El filtro de modelo compara en minúsculas contra `"advance"`/`"cashflow"`.

`Δ%` = `m.pct - prevMap[m.mda].pct`, mostrado como `+X.X%`/`-X.X%` con clase `up`/`down`; `"—"` si no hay semana previa o la máquina no tenía dato con `total>0`.

KPIs: conteo de `cr` (Urgentes), `hi` (Altas), `mid` (Medias) según `sevClass` **sobre las filas ya filtradas**.

Cierra con `attachSort("tblRank"); reapplySort("tblRank");`

> ⚠ Esta tabla tiene un **desalineamiento confirmado entre encabezado y cuerpo**. Ver §8.

### 5.7 Pestaña **Sectores** — la vista principal del usuario

Estado: `secSummaryData` (array para copiar), `secSummaryDate` (string), `secFlatOpen` (bool). Selecciones vivas en `<input type="hidden">`: `#secSel` (sector) y `#secIslaSel` (isla), más `#secWeekSel` y `#secModSel`.

`renderSectores()` paso a paso:

1. **Captura `window.scrollY`** al inicio.
2. **Semana activa:** `weekOptions = state.weekOrder.slice(-4)` (**últimas 4 semanas**). Si el valor del selector está en esa lista se usa; si no, la última cargada. `prevD` = la semana inmediatamente anterior **en `state.weekOrder` completo** (puede quedar fuera de `weekOptions`), y `prevCAll` sus cálculos. Si la semana activa es la primera de todas, `prevD` es `null` y no hay comparación.
3. **Agrupación:** recorre `state.master` (no las filas de la semana). Salta máquinas sin `isla`. Si hay filtro de modelo billetero, salta las que no coincidan. Construye `sectorMap[sector][islaPrefix] = [mda,...]`.
4. **`islaStats(mdas, c)`** — calcula sobre las filas de esa semana cuyo mda esté en `mdas` **y** `total>0`:
   ```js
   { pct: totAc/totAll (0 si totAll=0),   // PONDERADO por volumen
     tot: totAll,
     alerts: cantidad de filas con score>0,
     n: cantidad de filas }
   ```
5. **Tarjetas de sector** (grid de 3 columnas, 1 en <900px): número del sector (30px) coloreado según `pctClass`, el `%` ponderado, y una flecha de tendencia `▲`/`▼` con la diferencia absoluta en puntos porcentuales a 1 decimal contra `prevCAll` (se omite si no hay semana previa o si `prevSt.pct` no es >0). Debajo: `N islas · M máq · K alertas` — donde **M es la cantidad de máquinas en `state.master`**, no las que tuvieron datos esa semana.
   La tarjeta activa lleva clase `.active`; el click llama `secSelSector(sec)`, que fija el sector y **limpia la isla seleccionada**.
6. **Detalle del sector** (sólo si hay sector seleccionado): tabla `#tblSecIslas` con una fila por isla, ordenada alfabéticamente por prefijo. Columnas: `[botones de isla]`, ISLA, Máq., % prom., Barra, Total bill., Δ%, Alertas. La fila entera es clickeable (`secSelIsla`), salvo la celda de botones que hace `event.stopPropagation()`.
7. **Expansión de isla** (si `prefix === selIsla`): se inserta una fila `<tr class="no-sort">` con `colspan="8"` que contiene una **tabla real anidada** (`.isla-mtable`) con: botones, MDA, Modelo máq., Billetero, Firm, Juego, y una columna por cada una de las **últimas 4 semanas** (`state.weekOrder.slice(-4)`) mostrando `%` coloreado con el volumen debajo en gris. La clase `.isla-detail` aplica la animación `islaDetailIn` (0.22s, opacidad + `translateY(-4px)`).
   Comentario del código: se usa tabla real (y no divs flex con anchos fijos) para que quede alineada con la tabla contenedora y se abra prolijamente hacia abajo.
8. **Listado plano opcional:** botón que alterna `secFlatOpen`. Cuando está abierto se agrega una segunda tarjeta con `#tblSecFlat`: todas las máquinas del sector en una sola tabla ordenable, columnas: botones, MDA, Isla, Modelo máq., Billetero, Firm, Juego + últimas 4 semanas.
9. **Post-render:**
   ```js
   if(!sortStates["tblSecIslas"]) sortStates["tblSecIslas"]={col:2,dir:1};   // ← ver §8
   attachSort("tblSecIslas");
   // si hay isla abierta, se engancha un handler extra a cada th.sortable que
   // re-ancla la fila .no-sort justo después de su fila dueña tras cada ordenamiento
   reapplySort("tblSecIslas");
   if(secFlatOpen && #tblSecFlat) { attachSort("tblSecFlat"); reapplySort("tblSecFlat"); }
   window.scrollTo(0,scrollY);
   requestAnimationFrame(()=>window.scrollTo(0,scrollY));
   ```
   El "pinDetail" es necesario porque al ordenar, la fila de detalle (excluida del sort) quedaría flotando fuera de lugar.

**Navegación de semanas:** `secShiftWeek(delta)` mueve el `<select>` una posición dentro de sus opciones (sin envolver: si se sale del rango, no hace nada) y re-renderiza. Los botones `◀`/`▶` se deshabilitan en los extremos.

**Botones de lista a nivel de isla completa:**
```js
secIslaMdas(prefix)  // máquinas de esa isla en state.master, respetando el filtro de modelo billetero
secIslaBtnGroup(prefix)  // 3 botones; cada uno "on" (✓) sólo si TODAS las máquinas ya están en esa lista
secIslaToggle(id,prefix) // si todas estaban → las quita todas; si no → agrega las que faltaban
```
Tras aplicar: guarda, actualiza el badge de nav, re-renderiza Lista si es la pestaña activa, **re-renderiza Sectores**, y escribe en `#secAddMsg` un mensaje del tipo `✓ N máquinas de la isla 641 agregadas a la Lista A.` que **se borra a los 2500 ms** (`setTimeout`).

**`secCopiarResumen()`** — copia al portapapeles texto plano:
```
Vista por sectores — semana DD/MM/YYYY
SECTOR<TAB>% PROM.<TAB>ISLAS<TAB>MÁQUINAS<TAB>ALERTAS
...
```
Usa `secSummaryData`/`secSummaryDate`, que se rellenan durante el render.

### 5.8 Pestaña **Máquinas** — jerarquía fabricante → modelo → juego → isla

Estado: `maqSelFab`, `maqSelJuego` (que en realidad guarda el **modelo de máquina**, ver nombre engañoso en §8), `maqSelGameTitle`.

Construye `fabMap[fabricante][modelmaq][juego][islaPrefix] = [mda,...]` recorriendo `state.master`, **incluyendo sólo máquinas con datos y `total>0` en la semana seleccionada**. Valores por defecto cuando falta el dato: `"(sin dato)"` para fabricante y juego, `"(sin modelo)"` para modelo de máquina, y para la isla `islaPrefix(isla) || isla || "—"`.

**Auto-limpieza de selección inválida:** si el fabricante/modelo/juego seleccionado ya no existe en el mapa (por cambio de semana o de datos), se resetea a `""` en cascada.

Render por niveles:
- **Nivel 1 (fabricante):** tarjeta `.fab-card` con flecha ▶/▼, nombre, `%` **ponderado** (`Σ toAc / Σ total`), cantidad de máquinas y, si hay alguna con `score>0`, `⚠ N` en naranja. Click ⇒ `maqToggleFab` (abre/cierra; al cambiar de fabricante limpia los niveles inferiores).
- **Nivel 2 (modelo de máquina):** botones-chip con `%` ponderado y conteo. Click ⇒ `maqToggleJuego`.
- **Nivel 3 (juego):** botones-chip con `%` y conteo, sangrados 36px. Click ⇒ `maqToggleGame`.
- **Nivel 4 (islas):** por cada isla un bloque con título `Isla NNN %` y una tabla con encabezados (botones, MDA, Isla, Modelo, %Acep, Total, ⚠). El modelo de billetero se colorea inline: `Advance` ⇒ `#2ecc71`, `Cashflow` ⇒ `#f1c40f`, otro ⇒ `var(--muted)`.

Escapado de comillas para los `onclick`: `s.replace(/\\/g,"\\\\").replace(/'/g,"\\'")`.

### 5.9 Pestaña **Intercambios** — optimizador de swaps

**Fórmula documentada en el propio código:**
```
A = billetero bueno (pct alta) en posición de poco flujo
B = billetero malo  (pct baja) en posición de mucho flujo
Actual:      totA*pctA + totB*pctB
Tras swap:   totA*pctB + totB*pctA
Ganancia = (pctA - pctB) * (totB - totA)
```
Positiva sólo si `pctA > pctB` **y** `totB > totA`.

**Estado global de filtros:**
```js
let intFiltroModA="", intFiltroModB="", intFiltroMinVol=0,
    intFabLeft=new Set(), intFabRight=new Set(),
    intUsarPromedio=false, intPendiente=null;   // intPendiente NUNCA SE USA
let intSectorLeft=new Set(), intSectorRight=new Set();
let intSectorExclude=new Set();
```
Ninguno de estos filtros se persiste: se reinician al recargar.

**Modo promedio:** si `intUsarPromedio` **y** hay más de una semana, las filas de entrada no son las de la semana `d` sino `buildAvgRows(calcs,d)`:
```js
window4 = state.weekOrder.slice(Math.max(0,idx-3), idx+1);   // hasta 4 semanas
// por mda, acumulando sólo filas con total>0:
avgTot = Math.round( (Σ totals) / totals.length )
avgAc  = Math.round( (Σ toAc)  / n )
=> { mda, pct: avgTot>0 ? avgAc/avgTot : 0, total: avgTot, nWeeks: n }
```
La etiqueta muestra `(usando N sem.)` con `N = Math.min(4, indexOf(d)+1)`.

**`calcSwaps(rows)` — filtros en orden exacto:**

Pre-filtro: `rows.filter(m => m.pct>0 && m.total>0)`.

Bucle externo sobre A:
1. `if (A.pct < thrOk) continue;` — **A debe estar en o sobre el umbral OK** (billetero sano).
2. `if (intSectorExclude.has(secA)) continue;` — sectores protegidos: nunca se saca un billetero de ahí.
3. `if (intSectorLeft.size>0 && !intSectorLeft.has(secA)) continue;`

Bucle interno sobre B (`i===j` se salta):
4. `if (B.pct >= thrOk) continue;` — **B debe estar bajo el umbral** (billetero problemático).
5. `if (B.total <= A.total) continue;` — **B debe tener más flujo que A**.
6. `if (intSectorRight.size>0 && !intSectorRight.has(secB)) continue;`
7. `if (!swapFabOk(fabA,fabB)) continue;` — regla física de marcas.
8. Filtro manual de fabricantes por paneles: si hay algo seleccionado en cualquiera de los dos paneles, se acepta el par si cumple **dir1 O dir2** (es decir, la compatibilidad de los paneles se evalúa de forma **simétrica**):
   ```js
   dir1 = (izq vacío || izq.has(fA)) && (der vacío || der.has(fB));
   dir2 = (izq vacío || izq.has(fB)) && (der vacío || der.has(fA));
   if(!dir1 && !dir2) continue;
   ```
9. Filtros de modelo de billetero, **independientes por lado**:
   ```js
   if (intFiltroModA && msA.modelo !== intFiltroModA) continue;
   if (intFiltroModB && msB.modelo !== intFiltroModB) continue;
   // si NINGUNO está fijado, se exige que ambos modelos coincidan (cuando ambos existen):
   if (!intFiltroModA && !intFiltroModB && msA.modelo && msB.modelo && msA.modelo !== msB.modelo) continue;
   ```
10. `if (B.total < intFiltroMinVol) continue;` — flujo mínimo del destino.

**Selección final (greedy):** se ordena todo por `gain` descendente y se recorre quedándose con la mejor sugerencia por máquina:
```js
const usedA=new Set(), usedB=new Set(), picked=[];
for(const r of results){
  if(usedA.has(r.mdaA) || usedB.has(r.mdaB)) continue;
  usedA.add(r.mdaA); usedB.add(r.mdaB);
  picked.push(r);
  if(picked.length >= 50) break;     // TOPE DURO: 50 sugerencias
}
```
**Nota exacta:** `usedA` y `usedB` son conjuntos **separados**. Una misma MDA puede aparecer en una fila como A y en otra como B.

**Regla de marcas incompatibles:**
```js
const RESTRICTED_BRANDS = new Set(["IGT"]);
function swapFabOk(fabA,fabB){
  if(RESTRICTED_BRANDS.has(fabA) || RESTRICTED_BRANDS.has(fabB)) return fabA === fabB;
  return true;
}
```
Es decir: **IGT sólo intercambia con IGT**; el resto de marcas intercambia libremente entre sí.

**UI de paneles:** dos paneles de fabricante (Origen/Destino) con chips; los chips incompatibles con la selección del otro panel se atenúan (`opacity:.3;cursor:not-allowed`) y **quedan sin `onclick`** (no se pueden activar), salvo que ya estén seleccionados. Tres paneles de sector: Origen, Destino y "Nunca sacar billeteros de estos sectores".

**Registro de intercambios:**
- `intRegistrar(i)` lee `window._lastSwaps[i]` (guardado al final del render) y despliega un formulario en `#intFormWrap` con fecha (default hoy, `<input type="date">`) y nota libre, y hace `scrollIntoView({behavior:"smooth"})`.
- `intConfirmar(s)` agrega la entrada a `swapHistory` con `id: Date.now()`, hace `await saveHistory()` y re-renderiza.
- `intEliminar(id)` pide `confirm`, filtra por id, guarda y re-renderiza.
- `intExportarJSON()` descarga `reacbill_intercambios_YYYY-MM-DD.json` — **el botón sólo se renderiza si `isLocal()`**.
- El historial se muestra **invertido** (`[...swapHistory].reverse()`), o sea el más reciente arriba.

**Aviso de modo:** si `!isLocal()` la tarjeta muestra en naranja `⚠ App abierta en modo online — el historial no se guarda.`; si es local, en verde `✓ Modo local — historial cifrado y guardado.` Y el título del historial agrega `(sólo lectura — sin persistencia online)`.

### 5.10 Pestaña **Buscador**

Dos campos **mutuamente excluyentes**: `busOnInput('mda',v)` limpia `busIslaVal` y viceversa. Tras cada tecla se re-renderiza toda la pestaña y se **restaura el foco y el cursor al final** del campo correspondiente:
```js
const inp=document.getElementById(focusField==="isla"?"busIsla":"busMDA");
if(inp){ const v=inp.value.length; inp.focus(); inp.setSelectionRange(v,v); }
```

**Búsqueda por MDA:** substring (`m.includes(q)`) sobre el conjunto de MDAs de todas las semanas; **máximo 20 resultados** (`.slice(0,20)`). Por cada uno: tarjeta con 5 KPIs (ISLA, Modelo billetero, Firmware, Juego, Fabricante) y una fila de historial con una columna por semana visible (`visibleWeeks()`), mostrando `%` y volumen. Si no hay resultados: `"Sin resultados para MDA."`

**Búsqueda por ISLA:** matchea contra la posición completa **o** contra el prefijo (ambos en minúsculas, `includes`). Agrupa por prefijo único. Por cada isla: una mini-tabla con el **promedio aritmético** (`avg()` de los pct, no ponderado) por semana visible más el conteo de máquinas, y debajo la tabla de máquinas de la isla (con `attachSort` diferido vía `setTimeout(...,0)` sobre `tblIsla_${prefix}`).

### 5.11 Pestaña **Tarjetas** — lectura de tarjetas

Independiente del modelo de billetero. Estado:
```js
let tarjGroupBy="sector", tarjSubBy="isla", tarjOpenPaths=new Set(), tarjSortTables=[];
const TARJ_LBL={isla:"Isla",sector:"Sector",modelmaq:"Modelo de máquina",ninguna:"(sin subdividir)"};
```
`tarjGroupBy`/`tarjSubBy` **se persisten** en `localStorage["reacbill_tarjfilt_v1"]` y se recargan al arrancar. `tarjOpenPaths` **no** se persiste.

**Controles:** selector de semana (todas las semanas), "Agrupar por" (`isla|sector|modelmaq|todas`) y "Subdividir por" (`isla|sector|modelmaq|ninguna`, **excluyendo el valor elegido en "Agrupar por"**). Si el subnivel coincidiera con el nivel principal se fuerza a `"ninguna"`. Cada cambio guarda los filtros.

**Filtro de filas:** `rows = c.rows.filter(m => (m.tarjAc||0)>0 || (m.tarjRe||0)>0)` — sólo máquinas con actividad de tarjeta.

**Ventana de semanas:** `tarjLastWeeks(d,4)` = hasta 4 semanas terminando en la seleccionada. `tarjWeeksData(weeks)` construye `{ [mda]: { [dateKey]: {pct, ac, re} } }` saltando las entradas sin actividad.

**Claves de agrupación** (`tarjKeyFor`):
- `todas` ⇒ `"Todas las máquinas"`
- `sector` ⇒ `"Sector " + (islaSector(isla) || "—")`
- `modelmaq` ⇒ `ms.modelmaq || "(sin modelo)"`
- `isla` ⇒ `"Isla " + islaPrefix(isla)`; si no hay isla ⇒ `"(sin isla)"`

**Render recursivo** (`tarjRenderLevel`): por cada grupo (ordenado con `esCollator`) dibuja una `.fab-card` con:
- flecha ▶/▼ según si el `path` está en `tarjOpenPaths`;
- el nombre del grupo;
- **una insignia por semana** con la fecha `DD-MM` arriba y el `%` **ponderado del grupo** debajo, calculado sumando `ac`/`re` de todas sus máquinas en esa semana (`null` ⇒ `"—"`);
- `N máq. · Ac X · Re Y` (totales de la semana seleccionada).

El `path` acumulado usa `"||"` como separador (`padre||hijo`), y el escapado para el `onclick` es `tarjEsc()` (backslashes y comillas simples). Los subniveles llevan `margin-left:16px`.

**Tabla hoja** (`tarjRenderMachTable`): ordenada por MDA (`esCollator`). Columnas: 3 botones de lista (rechazo/b/c), MDA, ISLA, Modelo máq., Tarj. Ac, Tarj. Re, y **una columna por semana** con el `%` (`wv.pct`, que es `m.pctTarj` del Excel).
El id de tabla se genera como `` `tblTarj_${(path||"root").replace(/[^a-zA-Z0-9]/g,"_")}_${tarjSortTables.length}` `` y se acumula en `tarjSortTables`.

**Post-render:** por cada tabla registrada, `setTimeout(()=>{attachSort(id); reapplySort(id);},0)`; luego restauración de scroll (síncrona + `requestAnimationFrame`).

**Listas de Tarjetas (3):** se renderizan **encima** de la tabla agrupada, en el orden `rechazo`, `b`, `c`.
- Si la lista está vacía: una tarjeta gris con el texto `«{label}: lista vacía. Agregá máquinas con el botón "+" (color #xxxxxx) en la tabla de abajo.»` — **muestra el código hexadecimal crudo**, no un nombre de color.
- Si tiene elementos: encabezado colapsable (click en el título alterna `tarjListsExpanded[id]`), botones Copiar/Exportar CSV/Vaciar (cada uno con `event.stopPropagation()` para no plegar la tarjeta), y **si está expandida**, una tabla con **sólo las 3 últimas agregadas** (`tarjListRecentRows(id,3)`: `slice(-3).reverse()`, o sea orden de inserción invertido). Si el total supera 3, aparece la nota `Mostrando las últimas 3 agregadas de N. Copiar/Exportar incluye la lista completa.`
  Este diseño (colapsable + tope de 3) existe para que la lista no crezca empujando la tabla de máquinas hacia abajo al ir agregando.
- `tarjListRows(id)` (usada para copiar/exportar) devuelve **la lista completa ordenada por isla DESCENDENTE** (`esCollator.compare(b.isla, a.isla)`) y **siempre calculada sobre la última semana cargada**, no sobre la seleccionada en el selector.
- Exportación CSV: separador `;`, nombre `reacbill_{label en minúsculas con _}_{YYYY-MM-DD}.csv`. Copiar: mismo contenido separado por TAB.

### 5.12 Pestaña **Lista** — las 3 listas generales

`renderLista()` = concatenación de `selListCardHtml("a") + ("b") + ("c")`.

Por lista: si está vacía, tarjeta gris con el aviso (también con el hexadecimal crudo). Si tiene datos: título coloreado con ícono y conteo, botones Copiar tabla / Exportar CSV / Vaciar lista, y una tabla con MDA, ISLA, Modelo máquina, Modelo billetero, Firmware, Último %, y un botón `✕` por fila que quita esa máquina.

`selRows(id)` toma los datos de la **última semana cargada** (`selLastCalcRows()`) y ordena por **isla descendente**.

**Botón de lista (`selBtn(mda)`)** — presente en Resumen, Por Fecha, Gravedad, Sectores (isla y listado plano), Máquinas y Buscador. Genera 3 botones circulares de 18px con el color de cada lista inyectado como `--tsc`. `selToggle(id,mda)`:
1. Agrega o quita del `Set`.
2. Persiste esa lista.
3. **Actualiza en el DOM todos los botones de esa lista y ese MDA sin re-renderizar** (`document.querySelectorAll('[data-sellist][data-selmda]')`), cambiando clase, texto (`✓`/`+`) y `title`.
4. Actualiza el badge del nav.
5. Sólo si `activeTab==="lista"` re-renderiza la pestaña Lista.

`updateSelBadge()` escribe en el botón de nav `📋 Lista` + un `<span class="selBadge">` con **la suma de los tamaños de las 3 listas** (se omite si es 0).

**Vaciar** pide `confirm` con el texto `¿Vaciar la "Lista X"?`.

**Migración legacy** (dentro de `selLoad()`), se ejecuta una sola vez:
```js
const legacy = localStorage.getItem("reacbill_sel_v1");
if (legacy && selLists.a.size === 0) {
  const arr = JSON.parse(legacy);
  if (arr && arr.length) { selLists.a = new Set(arr); selSave("a"); }
  localStorage.removeItem("reacbill_sel_v1");
}
```
Condición exacta: sólo migra **si la Lista A está vacía**. La clave legacy se elimina **aunque el array estuviera vacío**.

### 5.13 Pestaña **Admin**

Cuatro tarjetas, en este orden: **Levantamiento** (`#levCard`), **Corrección masiva** (`#bulkEditCard`), **Parámetros de gravedad**, **Editor de máquinas**, **Archivo de semanas antiguas**.

#### 5.13.1 Levantamiento de modelos de billetero (`renderLevTable`)

Trabaja sobre **una isla a la vez** (selector por prefijo; por defecto el primero de la lista ordenada). Muestra conteos: total de máquinas, cuántas Advance, cuántas Cashflow y cuántas **sin asignar** (en naranja).

Cada fila tiene: checkbox de selección (`.lev-chk`), MDA, isla, un `<input>` para modelo de máquina (`#modelmaq_{mda}`), el juego, un `<select>` de firmware con opciones fijas `["", "403", "255"]` (`#firm_{mda}`), y **3 radios** (`Advance` / `Cashflow` / `—`) con `name="lev_{mda}"`.

Acciones por lote (**operan sobre el DOM, no sobre el estado**; no persisten hasta pulsar Guardar):
- `levAllAdm(mod)` — marca ese modelo en **todos** los radios visibles.
- `levSelAdm(mod)` — sólo en las filas con checkbox marcado.
- `levChkNone()` — marca los checkboxes de las máquinas **sin modelo asignado**.
- `levToggleAll(chk)` — marca/desmarca todos.
- `levGuardarAdm()` — recorre **todos los radios marcados de la página**, y por cada uno escribe en `state.master[mda]`: `modelo` (el valor del radio, que puede ser `""`), `modeloFuente="manual"`, `firm` (del select) y `modelmaq` (del input, con `trim()`). Luego `invalidate(); saveState();` y muestra `"✓ Guardado."` durante **2000 ms**.
- `exportMasterJSON()` — descarga `reacbill_master.json` con `{ master:[{mda,...campos}], hist: xorEnc(JSON.stringify(swapHistory)) }`.

#### 5.13.2 Corrección masiva (`renderBulkEditCard` / `bulkEditApply`)

Filtros: **Sector**, **Fabricante** y **Modelo de máquina**. La lista de modelos de máquina se recalcula dinámicamente según el sector y fabricante ya elegidos.
Campos a actualizar, cada uno con su checkbox: **Modelo billetero** (`Advance` / `Cashflow` / `— desconocido —` que es `""`) y **Firmware** (texto libre).
Estado inicial de los checkboxes: `chkModelo` arranca **activado** (`?.checked !== false`), `chkFirm` **desactivado**.

El botón muestra `Aplicar a N máquinas` y está **deshabilitado** salvo que haya al menos un filtro de sector o fabricante **y** al menos un campo tildado:
```js
${!hasFilter || (!chkModelo && !chkFirm) ? "disabled" : ""}   // hasFilter = selSec || selFab
```
`bulkEditApply()` repite esa guarda y luego recorre `state.master` aplicando los tres filtros (el de modelo de máquina es opcional) y escribiendo los campos tildados. `modeloFuente` pasa a `"manual"` si se tocó el modelo. Termina con `invalidate(); saveState();` y un mensaje de resultado en `#bulkMsg` (que **no se auto-borra**).

#### 5.13.3 Parámetros de gravedad

8 inputs numéricos (`p_thrOk`, `p_thrMid`, `p_thrCrit`, `p_multMid`, `p_multCrit`, `p_sevMid`, `p_sevHigh`, `p_sevCrit`) con textos explicativos largos. Los tres primeros son `step="0.01" min="0" max="1"`; los multiplicadores `step="1" min="1"`; los cortes de badge `step="1"` sin límites.

`saveParams()` lee los 8 con `Number(...)` (**sin validación alguna**: acepta vacío ⇒ `0`, valores fuera de rango, o incoherentes como `thrMid < thrOk`), reemplaza `state.params` entero, `invalidate(); saveState();` y escribe `"✓ Guardado."` en `#adminMsg` (**permanente, no se borra**).

`resetParams()` restaura los defaults exactos y llama `renderAdmin()`.

#### 5.13.4 Editor de máquinas (paginado)

Estado: `machEditFilter` (string), `machEditPage` (int), `MACH_PAGE_SIZE=200`, `machPendingEdits` (`{mda:{campo:valor}}`), `machSortCol="mda"`, `machSortDir=1`.

- `machGetFiltered()` filtra sobre el arreglo completo por substring en `[mda, isla, juego, fabricante, modelmaq].join(" ").toLowerCase()`, y luego ordena usando `sortVal` + `esCollator` según `machSortCol`/`machSortDir`.
- `renderMachEditorRows()` construye **sólo la página actual**, clampeando `machEditPage` al rango válido. Columnas editables: ISLA (62px), Fabricante (80), Modelo máq. (90), Juego (140), Modelo bill. (`<select>` 80px), Firm (`<select>` 52px), Área (40), Deno (50). El MDA no es editable.
- **Los campos vacíos se resaltan** con `background:var(--crit-bg,#3a1a1a);border-color:var(--high)`.
- Badge `imp` (amarillo): se muestra si `modelo` existe **y** `modeloFuente === "import"` **y** no hay una edición pendiente sobre `modelo`.
- Captura de ediciones: un único handler delegado en el `tbody` (`oninput` y `onchange`) que guarda en `machPendingEdits[mda][campo]` sin tocar el estado real.
- Cada celda editable lleva `data-sort` con el valor, para que el sort genérico use el valor y no el HTML del input.
- Paginador: se oculta si hay ≤200 resultados; si no, muestra `‹ Anterior`, `Página X de Y (N máquinas)`, `Siguiente ›`.
- `#machMsg` muestra `N / M máquinas` (filtradas / totales).
- `machSave()` vuelca `machPendingEdits` a `state.master`, aplicando `normIsla()` al campo `isla` y `trim()` a los demás; pone `modeloFuente="manual"` si se tocó `modelo`; limpia las pendientes; `invalidate(); saveState();` y muestra `"✓ Guardado."`, restaurando la tabla a los **2000 ms** vía `machApplyFilter()`.

#### 5.13.5 Archivo de semanas antiguas

Muestra la cantidad de semanas archivadas y el rango (primera a última). Botón `⬇ Exportar archivo JSON` ⇒ `intExportarArchivo()`, que descarga `reacbill_archivo_YYYY-MM-DD.json` con `{weeks, weekOrder}`; si no hay nada archivado, `alert("No hay semanas archivadas.")`.

### 5.14 Exportación transversal (barra bajo la navegación)

Visible en **todas** las pestañas.

- **`exportActiveTabPrint()`** = `window.print()`. El CSS `@media print` oculta todo (`body *{visibility:hidden}`) excepto `.tab.active` y sus descendientes, posiciona la pestaña activa en `position:absolute;left:0;top:0;width:100%`, y aplica `display:none !important` a `header, nav, .exportBar, button, select, input, .selBtn, .tarjSelBtn`.
- **`exportActiveTabCopy()`**:
  1. Clona el nodo de la pestaña activa.
  2. **Elimina del clon** todos los `button, select, input, .selBtn, .tarjSelBtn`.
  3. Si no hay ninguna `<table>` ⇒ `alert("Esta pestaña no tiene tablas para copiar.")`.
  4. Arma dos representaciones: HTML (concatenación de los `outerHTML` de las tablas separados por `<br>`) y texto plano (celdas separadas por TAB, filas por `\n`, tablas por una línea en blanco).
  5. Si existe `window.ClipboardItem`, escribe **ambos formatos** al portapapeles (`text/html` + `text/plain`) ⇒ `alert("Copiado al portapapeles (como tabla).")`; ante fallo cae a sólo texto. Si no existe `ClipboardItem`, va directo a texto ⇒ `alert("Copiado al portapapeles.")`.

---

## 6. Reglas de negocio y edge cases no obvios

Todo lo que un reconstructor puede pasar por alto:

1. **El `%` del Excel gana sobre el calculado.** Si la hoja trae "% aceptación billetes" > 0, ese valor se usa como `pct` aunque no cuadre con `toAc/total`.

2. **Dos formas distintas de promediar conviven a propósito:**
   - `avgPct` (usado en el KPI "% prom." de Por Fecha y en el promedio por isla del Buscador) es **promedio aritmético simple** de porcentajes.
   - El header (`updateStatsBar`), las tarjetas de sector, las filas de isla y los niveles de Máquinas usan **cociente de sumas (ponderado por volumen)**.
   Producen números distintos sobre los mismos datos. No unificar.

3. **La ventana "último mes" son 4 semanas por índice, no por fecha.** `slice(Math.max(0,idx-3), idx+1)`. Si faltan semanas intermedias, la ventana abarca más de un mes calendario.

4. **`visibleWeeks()` (3 meses) sólo afecta a Resumen y Buscador.** Sectores y Tarjetas usan `slice(-4)` / `tarjLastWeeks(d,4)`; Por Fecha, Gravedad, Máquinas e Intercambios usan la semana seleccionada.

5. **Archivado automático a los 3 meses** (`archiveOldWeeks(3)`), ejecutado al arrancar y después de cada importación. Corta contra `weeksCutoffKey(3)`, que se calcula **restando 3 meses a la última semana cargada** (con `Date.setMonth`, que puede desbordar de mes: 31 de marzo − 3 meses ⇒ 31 de diciembre; restar meses a un día 31 produce el desborde habitual de JS). Devuelve `null` si hay **1 semana o menos**, en cuyo caso no se archiva ni se filtra nada.

6. **Los datos archivados salen de los cálculos.** Una vez archivada, la semana desaparece de `state.weekOrder` y por tanto de todas las vistas; sólo se recupera exportando el JSON. No hay UI para reimportarlo (el JSON de archivo no es el formato que acepta la carga de maestro).

7. **La app nunca borra semanas.** Ni `borrarTodo()` toca el archivo (`reacbill_archive_v1`).

8. **Inferencia de año en hojas `dd-mm`:** si el mes de la hoja > mes actual ⇒ año anterior. Al importar en enero una hoja `15-12`, se asigna al diciembre del año pasado. No hay más contexto disponible.

9. **La clave de "Borrar todo" es `MMDD` del día en curso** — protección contra clicks accidentales, no seguridad real. Es una limitación aceptada a propósito (todo el estado es local al navegador y accesible por DevTools de todos modos).

10. **El "cifrado" del historial es XOR con clave fija en el código fuente.** El propio comentario lo declara: *"ofuscación, no criptografía fuerte"*. Limitación conocida y aceptada.

11. **El historial de intercambios no persiste en producción** (`isLocal()` false). Se pierde al recargar. La UI lo advierte. Intencional.

12. **`sectorMap` se construye desde `state.master`, no desde las filas de la semana.** Por eso el conteo "M máq" de una tarjeta de sector puede ser mayor que las máquinas con datos esa semana (`islaStats.n`). Las máquinas sin datos simplemente no aportan al `%`.

13. **En Máquinas ocurre lo contrario:** el árbol se construye sólo con máquinas que tienen `total>0` en la semana elegida; el resto no aparece.

14. **La tendencia de Sectores compara contra la semana inmediatamente anterior en `weekOrder` completo**, que puede no estar entre las 4 opciones del selector.

15. **Máquinas nuevas aparecen en `state.master` automáticamente** al parsear cualquier hoja semanal, con todos los campos en `""`.

16. **`parseContadores` pisa `fabricante` y `juego` con `""`** si esas columnas no existen en el archivo. Los otros parsers usan `nuevo || anterior`, que no pisa. Es una asimetría real del código.

17. **Los parsers de libro completo (`parseMasterReference`, `parseTipoBilletero`) se detienen en la primera hoja con resultados**; no acumulan entre hojas.

18. **Filas descartadas al parsear:** mda vacío, `"0"`, `"err"`, o no numérico. En `parseCnText` además se descarta `LOCNAME === "err"`.

19. **`selToggle` actualiza el DOM sin re-renderizar** salvo que estés en la pestaña Lista. `tarjListToggle`, en cambio, **sí re-renderiza toda la pestaña Tarjetas** si estás en ella (por eso hizo falta la restauración de scroll y el `reapplySort`).

20. **`reapplySort` invierte `dir` antes de disparar el click** porque el handler lo vuelve a invertir. Alterar una de las dos mitades rompe la restauración de orden.

21. **`attachSort` ignora los `th` que ya tienen `onclick`** — así el sort por semana de Resumen (`resSort`) convive con el genérico sin pisarse.

22. **Las filas `.no-sort` quedan fuera del ordenamiento** y se re-anclan a mano tras cada click (`pinDetail` en Sectores).

23. **Restauración de scroll doble** (síncrona + `requestAnimationFrame`) en Sectores y Tarjetas. Ambas son necesarias en la práctica.

24. **Tope de 50 sugerencias** en Intercambios, con selección greedy; `usedA` y `usedB` son sets separados (una MDA puede salir como A en una fila y como B en otra).

25. **Máximo 20 resultados** en la búsqueda por MDA.

26. **Sólo 3 filas visibles** en la vista previa de cada lista de Tarjetas, y son las **últimas agregadas** (orden de inserción invertido), no las peores. Exportar/copiar sí incluye todo.

27. **Las listas de Tarjetas y las listas generales son independientes.** Una máquina puede estar en `selLists.b` y no en `tarjLists.b`; son claves de localStorage distintas.

28. **Concurrencia:** no existe. Un solo usuario, sin sincronización. Si se abren dos pestañas del navegador, ambas escriben sobre las mismas claves de IndexedDB/localStorage y **la última en guardar gana, sin merge ni detección de conflicto** (excepto el merge por `id` del historial al importar un JSON de maestro). No hay debounce ni autosave por temporizador: **todo guardado es explícito**, disparado por una acción (importar, guardar en Admin, togglear una lista).

29. **No hay debounce en ningún input.** El filtro de Resumen y el Buscador re-renderizan en cada tecla. El Editor de máquinas evita el problema paginando.

30. **Errores de red:** la app no hace peticiones propias. Si fallan los CDN en la primera visita, `XLSX`/`JSZip` quedan indefinidos y la importación lanza excepción, capturada por el `try/catch` de `handleFiles` y registrada en el log de la pestaña Carga. Tras la primera visita, el service worker sirve esos scripts desde caché.

31. **Datos corruptos en almacenamiento:** `loadState` envuelve todo en `try/catch`; si el JSON está corrupto se arranca con el estado por defecto silenciosamente. Las lecturas de localStorage también van en `try/catch` vacíos. `xorDec` devuelve `"[]"` ante fallo.

32. **`fmtP` muestra `"—"` para 0**, así que un 0% real y un dato faltante se ven igual.

---

## 7. Convenciones de desarrollo a replicar

### Versionado

- Constante única: `const VERSION = "2.2.4-main";` — se muestra en el header (`#verSpan`, con prefijo `v`).
- Formato: **`X.Y.Z-main`**.
- **Regla vigente (impuesta explícitamente por el usuario del proyecto): un solo dígito por número, tope `9.9.9`.** Se incrementa el patch en cada cambio; al llegar a 9 se acarrea al siguiente nivel (`1.9.9` → `2.1.1`, reiniciando los inferiores a 1, no a 0 — así se hizo al pasar de `1.9.15` a `2.1.1` y de `2.1.1` a `2.2.1`).
- Históricamente se usó un esquema laxo (`1.8.40`), abandonado. El sufijo `-main` alude a la rama.
- **Se bumpea la versión en cada entrega**, para poder verificar visualmente qué versión está desplegada.

### Commits

Formato observado: `tipo: descripción en español, en minúsculas`, con `feat:`, `fix:` y `chore:`. Los cambios no triviales llevan cuerpo multilínea explicando **qué se cambió y por qué**, con especial cuidado en señalar cuándo algo era un bug real y qué lo causaba.

### Flujo de trabajo

1. Desarrollar en la rama de trabajo, **mergear siempre a `main`** (`--ff-only`) y pushear ambas, manteniéndolas idénticas. `PROJECT_CONTEXT.md` lo fija: *"Trabajar SIEMPRE sobre branch: main"*.
2. **Verificar la sintaxis del JS antes de commitear**: extraer el contenido del `<script>` a un archivo temporal y correr `node --check`. Es el único "test" del proyecto.
3. Para cambios de comportamiento no triviales, **probar con un navegador headless** (Playwright + Chromium en `/opt/pw-browsers/chromium`) sirviendo el archivo por HTTP local, inyectando `state`/`allCalcs` sintéticos y verificando el DOM resultante. Así se detectaron regresiones reales (p. ej. el sort que vaciaba tablas anidadas).
4. Tras pushear, **verificar que el deploy de GitHub Pages haya terminado en `success`** antes de dar el cambio por publicado; el workflow ha fallado de forma intermitente y a veces hay que reintentar con un commit vacío.

### Estilo de código

- Español en comentarios, textos de UI, mensajes de commit y nombres de dominio (`isla`, `sector`, `maquina`, `billetero`).
- Inglés en primitivas técnicas (`render`, `parse`, `sort`, `attach`).
- Prefijos de namespace por pestaña: `sec*` (Sectores), `tarj*` (Tarjetas), `int*` (Intercambios), `maq*` (Máquinas), `bus*` (Buscador), `mach*` (Editor de máquinas), `lev*` (Levantamiento), `sel*` (listas generales), `res*` (Resumen), `bulk*` (corrección masiva).
- Estilo compacto: sin punto y coma opcional omitido, llaves en la misma línea, funciones flecha de una línea, template literals multilínea para el HTML.
- **Los comentarios explican el "por qué", no el "qué"** — y varios documentan decisiones anti-intuitivas que no deben revertirse (§2). Respetarlos y mantenerlos.

---

## 8. Ambigüedades encontradas y posibles bugs (NO confirmados como intencionales)

> Esta sección describe lo que **no** pude resolver leyendo el código, y comportamientos que parecen no intencionales. **No están "corregidos" en las secciones anteriores**: allí se describe lo que el código hace hoy.

### 8.1 Posibles bugs

**(a) Desalineamiento de columnas en la pestaña Gravedad — CONFIRMADO por lectura y por capturas.**
El encabezado de `#tblRank` es: `[vacío] # MDA ISLA Modelo "Modelo máq." Firm %Acep Total Rechazos Δ% Puntaje Gravedad` (13 columnas), pero el cuerpo emite: `[número i+1] [botones de lista] MDA ISLA ...` (13 celdas). Es decir, el `<th>` vacío queda sobre la columna del **número de ranking**, y el `<th>#</th>` queda sobre la columna de **botones**. Consecuencia adicional: hacer click en "#" ordena por el texto de los botones (`"+++"`, `"✓++"`, …), no por el número. Las demás tablas de la app (Por Fecha, Resumen, Sectores, Tarjetas, Máquinas, Buscador) **sí** están alineadas correctamente.

**(b) El orden por defecto de la tabla de islas en Sectores no es el que dice el commit que lo introdujo.**
```js
if(!sortStates["tblSecIslas"]) sortStates["tblSecIslas"]={col:2,dir:1};
```
Las columnas de `#tblSecIslas` son `0=[botones] 1=ISLA 2=Máq. 3=% prom. 4=Barra 5=Total bill. 6=Δ% 7=Alertas`. Por lo tanto `col:2` ordena por **"Máq." ascendente**. El commit que lo agregó (`c035bfd`) se llama *"islas de un sector ordenadas por % prom. ascendente por defecto"*, y en ese momento la tabla no tenía la columna de botones al inicio, así que `col:2` sí era "% prom.". Al agregarse después la columna de botones (commit `5025c67`), el índice quedó desfasado. Las capturas de prueba confirman la flecha `↑` sobre **MÁQ.**, no sobre % prom. **No lo corrijo aquí**: el comportamiento actual es ordenar por Máq. ascendente.

**(c) Discrepancia entre el % de grupo y el % de máquina en Tarjetas.**
La insignia por semana del encabezado de grupo se calcula **ponderando** `ac`/`re` (`wAc/(wAc+wRe)`), mientras que la celda de cada máquina muestra `wv.pct`, que es `m.pctTarj` **leído del Excel**. Si la columna "% aceptación tarjeta" del Excel no coincide exactamente con `tarjAc/(tarjAc+tarjRe)`, el total del grupo y el detalle mostrarán números inconsistentes. No pude determinar desde el código si el Excel garantiza esa coincidencia.

**(d) Las listas de Tarjetas ignoran el selector de semana.**
`tarjListRows` y `tarjListRecentRows` usan siempre `state.weekOrder[length-1]`, mientras que la tabla principal usa la semana elegida en `#tarjSel`. Con una semana anterior seleccionada, la tabla y las listas muestran datos de semanas distintas sin indicarlo.

**(e) `intConfirmar` recibe el objeto serializado dentro de un atributo `onclick`:**
```js
onclick="intConfirmar(${JSON.stringify(s).replace(/"/g,'&quot;')})"
```
Sólo se escapan las comillas dobles. Un valor con comilla simple, `<`, `>` o backslash en `locA`/`modA`/`firmA` (que provienen de datos del Excel) podría romper el atributo o inyectar HTML. No encontré datos reales que lo disparen, pero la construcción es frágil. Lo mismo aplica, en menor medida, a los `onclick` construidos con `escape()`/`tarjEsc()` en Máquinas y Tarjetas, que sólo escapan backslash y comilla simple.

**(f) `migrateIslaFormat()` no persiste.** Normaliza `state.master` en memoria pero no llama a `saveState()`. Si el usuario abre la app y la cierra sin realizar ninguna acción que guarde, la migración se repite en la siguiente sesión. No es destructivo (es idempotente), pero probablemente no sea lo pretendido.

**(g) `parseContadores` borra `fabricante` y `juego`** cuando el archivo no trae esas columnas (escribe `""` incondicionalmente), a diferencia del resto de parsers que usan `nuevo || anterior`. Puede perderse información maestra al reimportar un archivo de contadores reducido.

**(h) La rama `mult = 1` de la fórmula de gravedad es inalcanzable** con los parámetros por defecto (requiere `thrMid < thrOk`). Puede ser residuo de una versión anterior de la fórmula o una salvaguarda para configuraciones manuales; el código no lo aclara.

**(i) Comentario de versión obsoleto:** la línea 486 dice `/* ===== REACBILL v1.8.19-main ===== */` mientras `VERSION` vale `"2.2.4-main"`. Sólo cosmético.

**(j) `README.md` está desactualizado**: declara "v1.0.0" y documenta las pestañas Tendencias, Fabricantes y Denominaciones, que fueron eliminadas. También describe la fórmula de gravedad con `mult = 3 si % < 0.90`, redacción que no refleja el `if/else` real.

### 8.2 Código muerto (presente, sin efecto)

- **`intPendiente`** — declarada (`let ... intPendiente=null`), nunca leída ni escrita en ningún otro lugar.
- **`pairs`/`pairsSet`** en `renderIntercambios` — se calcula el conjunto completo de pares de fabricantes compatibles y se ordena, pero **el resultado nunca se usa** para renderizar nada.
- **`sameF`** en el bucle de filas de intercambios — `const sameF = s.fabA===s.fabB;` nunca se lee.
- **`avgByMod` y `modMap`** — `weekCalc` los devuelve, pero ningún consumidor los usa (quedaron huérfanos al eliminarse la pestaña Modelos). Sí se usan internamente para derivar `avgAdv`/`avgCf`/`cntAdv`/`cntCf`, que sí se muestran.
- **`sesiones`** — se parsea de la columna "sesión" y se guarda en cada fila, pero **no se muestra ni se usa en ningún cálculo**.
- **Variables CSS `--crit-bg`, `--bg2`, `--sc-accent` no están definidas en `:root`** (ver §4.7); siempre aplica el fallback o el valor inline.
- **Código duplicado**: la rama ZIP de `handleFiles` reimplementa casi literalmente la lógica de procesamiento de Excel de la rama principal (con logs indentados). Cualquier cambio en el ruteo de formatos debe hacerse **en los dos lugares**.

### 8.3 Preguntas que el código no responde

1. **¿La columna "% aceptación billetes" del Excel es siempre coherente con `toAc/total`?** El código la prioriza; no pude verificar si difieren en la práctica ni por qué se prefiere.
2. **¿El listado `DENOS` es cerrado?** Está hardcodeado con 6 valores. El parser acepta cualquier denominación que aparezca en el encabezado, pero los totales y las tablas **sólo consideran esas 6**. No sé si pueden aparecer otras denominaciones en planillas futuras.
3. **¿Por qué `RESTRICTED_BRANDS` contiene sólo `"IGT"`?** El código dice "incompatibilidad física" sin más detalle, y no hay fuente de datos que lo determine dinámicamente.
4. **¿Las opciones de firmware `["", "403", "255"]` son exhaustivas?** Están hardcodeadas en dos lugares (Levantamiento y Editor de máquinas), mientras que la Corrección masiva acepta **texto libre** para el mismo campo. Esa inconsistencia puede introducir valores de firmware fuera de la lista de los `<select>`, que entonces se mostrarían como "—".
5. **¿Qué debe pasar con las semanas archivadas?** Se pueden exportar, pero no hay ruta de reimportación en la UI. No sé si es una carencia o una decisión.
6. **Formato de fecha en nombres de archivo:** el fallback de `dateKeyFromName` (nombre cortado a 10 caracteres) produce claves que no son fechas. No sé si en la práctica llega a ocurrir.
7. **El archivo `cn` de la raíz** parece una muestra de datos; no lo consume ningún código automáticamente. No sé si está versionado a propósito como plantilla o si quedó por accidente.

---

## 9. Instrucción final para quien reconstruya

**Dirigido a la IA que use este documento para reconstruir REACBILL:**

Tu tarea es replicar el comportamiento **exacto** descrito en este documento. Concretamente:

- **No inventes funcionalidades nuevas ni "mejores".** Si algo no está descrito aquí, no existe en la app. No agregues gráficos, ni login, ni backend, ni sincronización, ni tests, ni un framework, ni un build step, ni validaciones que hoy no existen — salvo que se te pida explícitamente.
- **Prioriza la fidelidad de comportamiento por encima de la elegancia y de la modernización del código.** Este proyecto tiene decisiones deliberadamente poco convencionales — un solo archivo, scope global compartido, `onclick` inline, `innerHTML` completo en cada render, un `Intl.Collator` reutilizado, caché con invalidación manual, service worker con estrategia mixta, persistencia condicionada a `file://` — y **todas están ahí por una razón documentada en la §2**. Si las "arreglas", romperás la app. No conviertas a módulos ES. No introduzcas React/Vue/Svelte. No dividas en archivos sin que te lo pidan.
- **Respeta los números exactos.** Umbrales (`0.85`, `0.90`, `0.40`), multiplicadores (`3`, `30`), cortes de badge (`10`, `50`, `150`), topes (50 sugerencias, 20 resultados de búsqueda, 200 filas por página, 3 filas de vista previa), ventanas (4 semanas, 3 meses) y tiempos (2000 ms, 2500 ms) son parte de la especificación, no sugerencias.
- **Los bugs de la §8 son bugs, no especificación.** No los "documentes como comportamiento correcto" ni los repliques deliberadamente si tu tarea es construir una versión sana; pero **tampoco los corrijas por tu cuenta si tu tarea es replicar fielmente**. Si no está claro cuál de las dos cosas se te pide, **pregunta antes de decidir**.
- **Ante cualquier ambigüedad o insuficiencia de este documento al momento de implementar, pregunta antes de asumir.** No rellenes huecos con tu criterio. La §8.3 lista las preguntas que yo mismo no pude responder leyendo el código; si te topás con alguna de ellas, o con una nueva, **escalá la pregunta en vez de inventar una respuesta plausible**.
- **Si detectas una contradicción entre este documento y el código fuente original, manda el código fuente**, y reportá la discrepancia.

---

# ANEXO A — Diseño visual, geometría y textos de UI

> **Alcance de este anexo.** Complementa las secciones 1–9 para que el documento sea autosuficiente también en apariencia y microcopy.
>
> **Se OMITE deliberadamente la paleta de colores** (el bloque `:root` de variables cromáticas y los valores hexadecimales/rgba). Quien reconstruya debe aportar su propia paleta. Las reglas de abajo **conservan las referencias `var(--x)` tal como están en el código**, para que se vea *dónde* se aplica cada rol de color sin fijar cuál es.
>
> Donde un color cumple una función y no es decorativo (estados de porcentaje, colores de cada lista, Advance/Cashflow), esa función ya está documentada en §3.3, §4.2 y §5.8 como **dato**, no como estilo.

## A.1 Sistema de geometría

Variables no cromáticas del `:root` (estas SÍ se incluyen: son geometría, no paleta):

```css
--r:8px; --r-sm:5px; --r-lg:12px;                 /* radios */
--shadow-sm:0 1px 3px rgba(0,0,0,.4);
--shadow:0 4px 16px rgba(0,0,0,.5);
--shadow-lg:0 8px 32px rgba(0,0,0,.6);            /* profundidad, negro con alfa */
```

Uso de los radios: `--r-lg` (12px) en tarjetas, KPIs, dropzone, sector-card, fab-card; `--r` (8px) en `.tblWrap` y `.param-block`; `--r-sm` (5px) en inputs, selects y botones; `4px` fijo en `.med-inp`.

## A.2 Reset, tipografía base y scrollbars

```css
*{box-sizing:border-box;margin:0;padding:0}

body{
  font:13px/1.5 'Inter',system-ui,sans-serif;
  cursor:default;
  -webkit-font-smoothing:antialiased;
  background-attachment:fixed;
  /* dos radial-gradients decorativos: elipse 80%x60% en 50% -20%, y 60%x40% en 80% 110% */
}

::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{border-radius:4px}
*{scrollbar-width:thin}                            /* Firefox */
```

Fuente: **Inter** (Google Fonts, pesos 300/400/500/600/700, `display=swap`), con fallback `system-ui, sans-serif`.

## A.3 Header

```css
header{
  position:sticky; top:0; z-index:50;
  backdrop-filter:blur(20px) saturate(180%);
  -webkit-backdrop-filter:blur(20px) saturate(180%);
  border-bottom:1px solid var(--border);
  padding:10px 20px 0;
  box-shadow:0 1px 0 rgba(<accent>,.1), var(--shadow);
}
header h1{
  font-size:15px; font-weight:700; letter-spacing:.5px;
  -webkit-background-clip:text; background-clip:text;   /* título con degradado */
  -webkit-text-fill-color:transparent;
  display:inline-block; margin-right:8px;
}
.ver{font-size:10px; font-weight:400}
```

Estructura del header, en orden: fila flex (`gap:10px`, `align-items:center`) con `<img src="logo.png">` de **`height:34px;width:auto`**, el `<h1>` con el `<span id="verSpan">`, y `<span id="dataInfo">` (10px); luego `#statsBar`, luego `<nav id="nav">`, y por último `#exportBar`.

### Barra de estadísticas

```css
#statsBar{font-size:11.5px; margin-top:6px; display:flex; flex-wrap:wrap; gap:26px; align-items:baseline}
#statsBar .stat{display:flex; flex-direction:column; align-items:flex-start; gap:1px}
#statsBar .sv{font-weight:700}
#statsBar .sv-big{font-size:30px; font-weight:700; letter-spacing:-.5px; line-height:1}
#statsBar .sv-mid{font-size:19px; font-weight:700; line-height:1}
#statsBar .sv-num{font-size:19px; font-weight:700; line-height:1}
#statsBar .sl{font-size:10.5px; text-transform:uppercase; letter-spacing:.4px; margin-top:2px}
```
La jerarquía visual es deliberada: la métrica principal a **30px**, las otras tres a **19px**, y todas las etiquetas a 10.5px en mayúsculas.

## A.4 Navegación por pestañas

```css
nav{
  display:flex; flex-wrap:nowrap; gap:0; margin-top:10px;
  overflow-x:auto; overflow-y:hidden;
  scrollbar-width:none; -ms-overflow-style:none;
  border-bottom:none; padding-bottom:0;
}
nav::-webkit-scrollbar{display:none}               /* scroll horizontal sin barra visible */
nav button{
  background:transparent; border:none;
  border-bottom:2px solid transparent; border-radius:0;
  padding:7px 14px; cursor:pointer;
  font:11.5px/1 'Inter',sans-serif; font-weight:500;
  white-space:nowrap; letter-spacing:.2px;
  transition:color .2s, border-color .2s;
}
nav button:hover{border-bottom-color:var(--border2)}
nav button.active{border-bottom-color:var(--accent); font-weight:600}
```
Patrón: pestañas subrayadas, **sin fondo**, con scroll horizontal invisible cuando no caben (clave en móvil: son 11 pestañas).

```css
main{padding:18px 20px}
.tab{display:none}
.tab.active{display:block}
.exportBar{display:flex; gap:8px; padding:6px 0 2px}
```

## A.5 Tarjetas y KPIs

```css
.card{
  border:1px solid var(--border); border-radius:var(--r-lg);
  padding:16px 18px; margin-bottom:14px;
  box-shadow:var(--shadow-sm); transition:border-color .2s;
}
.card h2{
  font-size:12px; font-weight:600; margin-bottom:12px;
  text-transform:uppercase; letter-spacing:.8px;
  display:flex; align-items:center; gap:7px;
}
.card h2::before{                                   /* barrita vertical antes del título */
  content:''; display:inline-block;
  width:3px; height:13px; border-radius:2px;
  background:linear-gradient(180deg,var(--accent),var(--accent2));
}
```

```css
.kpis{display:flex; flex-wrap:wrap; gap:12px}
.kpi{
  border:1px solid var(--border); border-radius:var(--r-lg);
  padding:14px 18px; min-width:120px;
  position:relative; overflow:hidden;
  transition:all .2s; box-shadow:var(--shadow-sm);
}
.kpi::before{                                       /* línea superior de 2px */
  content:''; position:absolute; top:0; left:0; right:0; height:2px;
  background:linear-gradient(90deg,var(--accent),var(--accent2)); opacity:.6;
}
.kpi:hover{transform:translateY(-1px); box-shadow:var(--shadow)}
.kpi .v{font-size:22px; font-weight:700; letter-spacing:-.5px}
.kpi .l{font-size:10px; margin-top:2px; font-weight:500; text-transform:uppercase; letter-spacing:.5px}
```

## A.6 Tablas — el componente más importante

```css
table{border-collapse:collapse; font-size:11px; width:100%}

th,td{
  border:none; border-bottom:1px solid var(--border);
  padding:6px 8px;
  text-align:right;                                 /* alineación por defecto: DERECHA */
  white-space:nowrap;
}
th{
  position:sticky; top:0; z-index:3;                /* encabezado fijo al hacer scroll */
  user-select:none;
  font-size:10px; font-weight:600;
  text-transform:uppercase; letter-spacing:.5px;
  padding:8px 8px;
}
th:first-child{border-radius:var(--r-sm) 0 0 0}
th:last-child{border-radius:0 var(--r-sm) 0 0}
td.left,th.left{text-align:left}                    /* se opta explícitamente a la izquierda */

.tblWrap{overflow:auto; border:1px solid var(--border); border-radius:var(--r)}
tbody tr{transition:background .1s}
tbody tr:hover td{background:<acento translúcido ~6%>}
tbody tr:last-child td{border-bottom:none}
```

**Regla de oro:** los números van a la derecha por defecto; los textos (MDA, isla, modelo, juego) llevan `class="left"` explícito.

### Columnas fijas (sticky) — sólo en Resumen

```css
.s1{position:sticky; left:0px;   z-index:4; min-width:76px; width:76px}
.s2{position:sticky; left:76px;  z-index:4; min-width:70px; width:70px}
.s3{position:sticky; left:146px; z-index:4; min-width:82px; width:82px}
.s4{position:sticky; left:228px; z-index:4; min-width:58px; width:58px}
thead .s1,thead .s2,thead .s3,thead .s4{z-index:6}
tbody tr:hover .s1,…{background:<acento translúcido ~6%>}   /* mantiene el hover al congelarse */
```
Los `left` son **acumulativos y deben coincidir exactamente** con los anchos: 0 → 76 → 76+70=146 → 146+82=228. Cambiar un ancho obliga a recalcular los siguientes.

### Indicadores de ordenamiento

```css
th.sortable{cursor:pointer}
th.sortable:hover{background:<acento translúcido ~10%>}
th.s-asc::after {content:" ↑"; font-size:9px}
th.s-desc::after{content:" ↓"; font-size:9px}
```

### Scrollbar superior espejo (Resumen)

```css
.tbl-scroll-top{overflow-x:auto; overflow-y:hidden; border:1px solid var(--border);
                border-bottom:none; border-radius:var(--r) var(--r) 0 0}
.tbl-scroll-top>div{height:6px}
.tbl-scroll-top+.tblWrap{border-radius:0 0 var(--r) var(--r)}
```
Los radios se reparten para que el scroller y la tabla se vean como una sola pieza.

### Tabla anidada del detalle de isla

```css
.isla-mtable{width:100%; font-size:12px; border-collapse:collapse}
.isla-mtable th{position:static; font-size:9px; padding:6px 8px}   /* anula el sticky heredado */
.isla-mtable td{padding:6px 8px; border-bottom:1px solid var(--border)}
.isla-mtable tbody tr:last-child td{border-bottom:none}
.isla-mtable tbody tr:hover td{background:<acento translúcido ~6%>}
```
`position:static` en el `th` es **necesario**: sin él, el sticky heredado de `th` global hace que el encabezado anidado flote mal dentro de la fila expandida.

## A.7 Badges

```css
.badge{
  display:inline-flex; align-items:center;
  border-radius:20px; padding:2px 8px;
  font-size:10px; font-weight:600; letter-spacing:.3px;
}
.b-ok,.b-mid,.b-hi,.b-cr{ /* fondo del color de estado al 15% + borde 1px del mismo al 30% */ }
```
Las cuatro variantes se aplican dinámicamente como `class="badge b-${sc}"` con `sc ∈ {ok,mid,hi,cr}`; además `b-mid` se usa literalmente para el badge `imp` del Editor de máquinas.

## A.8 Formularios

```css
input,select{
  border:1px solid var(--border); border-radius:var(--r-sm);
  padding:6px 10px; font:13px 'Inter',sans-serif;
  transition:border-color .15s, box-shadow .15s; outline:none;
}
input:focus,select:focus{border-color:var(--accent); box-shadow:0 0 0 3px var(--accent-glow)}
select{cursor:pointer}
input[type=file]{cursor:pointer; padding:5px 8px}
input[type=radio],input[type=checkbox]{cursor:pointer; width:auto; accent-color:var(--accent)}

label.fld{display:flex; flex-direction:column; gap:3px; font-size:11px; font-weight:500}
```
`label.fld` es el patrón estándar: etiqueta chica arriba, control abajo. Varias veces se le sobreescribe `flex-direction:row` inline para checkboxes.

**Input compacto del Editor de máquinas:**
```css
.med-inp{border:1px solid var(--border); border-radius:4px; padding:3px 6px; font-size:11px;
         transition:border-color .15s}
.med-inp:focus{border-color:var(--accent); outline:none; box-shadow:0 0 0 2px var(--accent-glow)}
```
Anchos por columna aplicados inline: isla 62px, fabricante 80, modelmaq 90, juego 140, modelo `<select>` 80, firm `<select>` 52, área 40, deno 50.

## A.9 Botones

```css
button.btn{
  border:none; border-radius:var(--r-sm);
  padding:7px 15px; cursor:pointer;
  font:12px/1 'Inter',sans-serif; font-weight:600; letter-spacing:.2px;
  transition:all .15s;
}
button.btn:hover{transform:translateY(-1px); filter:brightness(1.1)}
button.btn:active{transform:translateY(0); filter:brightness(.95)}
button.btn.sec{border:1px solid var(--border); box-shadow:none}   /* variante secundaria, plana */
button.btn.sec:hover{box-shadow:none}
button.btn.sm{padding:4px 10px; font-size:11px}
```
Tres variantes: primaria (degradado + sombra), `.danger` (degradado rojo) y `.sec` (plana con borde). El modificador `.sm` se combina con cualquiera.

### Botones circulares de lista

```css
.selBtn{                                            /* listas generales A/B/C */
  width:18px; height:18px; min-width:18px;
  border-radius:50%; border:1.5px solid var(--tsc);
  background:rgba(<bg>,.55);                        /* fondo de la app, semitransparente */
  cursor:pointer; font-size:11px; line-height:1; padding:0;
  display:inline-flex; align-items:center; justify-content:center; font-weight:700;
  box-shadow:0 0 0 1px rgba(255,255,255,.08);
}
.selBtn.on{box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.selBtnGroup{display:inline-flex; gap:3px; align-items:center}

.tarjSelBtn{ /* idéntico pero 20px y font-size:12px */ }
```
**Detalle importante:** el color de cada lista se inyecta **inline por botón** como `style="--tsc:#xxxxxx"`. El fondo oscuro semitransparente y el anillo blanco al 8% existen para que el botón siga siendo legible **sobre la fila de isla seleccionada**, que tiene fondo de acento sólido.

```css
.selBadge{border-radius:10px; padding:0 6px; font-size:10px; font-weight:700; margin-left:4px}
```

## A.10 Layout auxiliar

```css
.row{display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:10px}
.hint{font-size:11px; margin-top:4px; font-style:italic}
.grid2{display:grid; grid-template-columns:1fr 1fr; gap:14px}
.grid3{display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px}
@media(max-width:900px){ .grid2,.grid3{grid-template-columns:1fr} }
```
**Único breakpoint de toda la app: 900px.** Por debajo, las grillas de 2 y 3 columnas colapsan a una. No hay más adaptaciones responsive: el resto se resuelve con `flex-wrap` y scroll horizontal.

## A.11 Dropzone (pestaña Carga)

```css
#dropzone{
  border:2px dashed var(--border); border-radius:var(--r-lg);
  padding:32px 20px; text-align:center; cursor:pointer;
  transition:all .2s;
}
#dropzone:hover,#dropzone.over{
  border-color:var(--accent);
  box-shadow:0 0 0 4px var(--accent-glow);
}
```
La clase `.over` se agrega en `dragover` y se quita en `dragleave`/`drop`, dando el mismo realce que el hover.

## A.12 Barra de porcentaje

```css
.pctbar-track{
  display:inline-block; height:6px; border-radius:3px;
  vertical-align:middle; margin-left:8px;
  overflow:hidden; position:relative;
}
.pctbar-fill{display:block; height:100%; border-radius:3px; transition:width .35s ease}
```
El ancho del track se fija inline (50px en Sectores); el relleno se anima al cambiar de semana.

## A.13 Tarjetas de sector

```css
.sector-card{
  border:1px solid var(--border); border-radius:var(--r-lg);
  padding:16px 14px 14px;                            /* más padding arriba por la barra superior */
  cursor:pointer; position:relative; overflow:hidden;
  transition:transform .18s ease, border-color .18s ease, box-shadow .18s ease;
}
.sector-card::before{                                /* barra superior de 2px, color del estado */
  content:''; position:absolute; top:0; left:0; right:0; height:2px;
  background:var(--sc-accent,var(--accent)); opacity:.7;
}
.sector-card::after{                                 /* velo diagonal que aparece al pasar el mouse */
  content:''; position:absolute; inset:0;
  background:linear-gradient(135deg,rgba(<accent>,.05),transparent);
  opacity:0; transition:opacity .2s;
}
.sector-card:hover{transform:translateY(-2px); box-shadow:var(--shadow)}
.sector-card:hover::after{opacity:1}
.sector-card.active{box-shadow:0 0 0 1px var(--accent) inset, var(--shadow)}

.sector-card .sc-num{font-size:30px; font-weight:700; letter-spacing:-1px; line-height:1.1}
.sector-card .sc-pct{font-size:15px; font-weight:700; margin:4px 0 2px; letter-spacing:-.2px}
.sector-card .sc-lbl{font-size:10px; text-transform:uppercase; letter-spacing:.5px; margin-top:2px}
```
`--sc-accent` se inyecta inline por tarjeta según el estado del porcentaje. El estado activo usa un **anillo interior** (`inset`), no un borde más grueso, para no descuadrar el layout.

## A.14 Expansión del detalle de isla

```css
.isla-detail{animation:islaDetailIn .22s ease}
@keyframes islaDetailIn{
  from{opacity:0; transform:translateY(-4px)}
  to  {opacity:1; transform:translateY(0)}
}
.isla-detail-hd{
  font-size:12px; font-weight:600; margin-bottom:8px;
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
}
.isla-detail-hd .muted{font-weight:400}
```
Animación corta (220 ms) y sutil (4px), pensada para que la expansión no se sienta un salto.

## A.15 Tarjetas de agrupación (Máquinas y Tarjetas)

```css
.fab-card{
  border:1px solid var(--border); border-radius:var(--r-lg);
  padding:14px; transition:border-color .2s;
}
.fab-card h3{font-size:11px; margin-bottom:8px; font-weight:600;
             text-transform:uppercase; letter-spacing:.5px}
```
Los subniveles anidados llevan `margin-left:16px` inline. El `<h3>` está definido pero **el JS actual no lo emite** (usa `<span>` con estilos inline).

## A.16 Levantamiento y parámetros (Admin)

```css
.lev-radio label{margin-right:8px; cursor:pointer; display:inline-flex; align-items:center;
                 gap:4px; font-size:11px}

.param-block{
  border:1px solid var(--border); border-radius:var(--r);
  padding:14px 16px; margin-bottom:10px; transition:border-color .2s;
}
.param-block .param-title{font-weight:600; font-size:12px; margin-bottom:5px}
.param-block .param-desc {font-size:11px; line-height:1.6; margin-bottom:8px}
.param-block .param-input{display:flex; align-items:center; gap:10px}
.param-block input{width:90px}
```
`line-height:1.6` en las descripciones: son textos largos y necesitan respiro.

## A.17 Inventario de transiciones y animaciones

| Elemento | Propiedad | Duración / curva |
|---|---|---|
| `.card`, `.kpi`, `.fab-card`, `.param-block` | `border-color` / `all` | `.2s` |
| `nav button` | `color`, `border-color` | `.2s` |
| `button.btn` | `all` | `.15s` |
| `input`, `select`, `.med-inp` | `border-color`, `box-shadow` | `.15s` |
| `tbody tr` | `background` | `.1s` |
| `.sector-card` | `transform`, `border-color`, `box-shadow` | `.18s ease` |
| `.sector-card::after` | `opacity` | `.2s` |
| `#dropzone` | `all` | `.2s` |
| `.pctbar-fill` | `width` | `.35s ease` |
| `.isla-detail` | `@keyframes islaDetailIn` | `.22s ease` |

**No hay ninguna otra animación.** Nada de spinners, skeletons ni toasts: los mensajes se muestran como texto plano que a veces se auto-borra con `setTimeout`.

## A.18 Impresión

Ya descrito en §5.14. Regla completa:

```css
@media print{
  body *{visibility:hidden}
  .tab.active, .tab.active *{visibility:visible}
  .tab.active{position:absolute; left:0; top:0; width:100%}
  header, nav, .exportBar, button, select, input, .selBtn, .tarjSelBtn{display:none !important}
}
```
Técnica: `visibility:hidden` en todo + `visible` en la pestaña activa (conserva el espacio pero no pinta), y `position:absolute` para que la pestaña arranque arriba de la hoja.

## A.19 CSS muerto (definido, nunca usado)

Verificado buscando cada selector en el HTML y en todo el JS generador:

| Selector | Estado |
|---|---|
| `.section-title` (y su `::after`) | **Nunca usado.** |
| `.chip` / `.chip:hover` / `.chip.active` | **Nunca usado.** Los "chips" reales de Intercambios se hacen con `button.btn.sm`. |
| `.empty`, `.empty svg`, `.empty-icon` | **Nunca usado.** Los estados vacíos usan `<div class="card muted">`. |
| `canvas{max-height:320px}` | **Residuo** de Chart.js; no queda ningún `<canvas>`. |

`.b-ok`, `.b-hi`, `.b-cr` **NO son código muerto**: se aplican vía `class="badge b-${sc}"`.

## A.20 Inventario de textos de UI

### Placeholders
| Campo | Texto |
|---|---|
| Buscador MDA | `Ej: 100020` |
| Buscador ISLA | `Ej: 103 o 20208` |
| Firmware (corrección masiva) | `Ej: 403` |
| Nota de intercambio | `Ej: Intervención preventiva sector 3` |
| Filtro de Resumen | `Filtrar MDA / ISLA / Modelo` |
| Filtro del Editor de máquinas | `Filtrar por MDA, isla, juego, fabricante…` (con puntos suspensivos tipográficos `…`) |
| Modelo de máquina (Levantamiento) | `Modelo` |

### Tooltips (`title`)
| Elemento | Texto |
|---|---|
| ISLA (tabla de islas) | `Código de isla (3 dígitos)` |
| Máq. | `Número de máquinas en la isla` |
| % prom. | `Promedio de % de aceptación de billetes en la última semana` |
| Barra | `Barra visual del % de aceptación (verde=bueno, rojo=malo)` |
| Total bill. | `Total de billetes procesados en la última semana` |
| Δ% | `Variación del % de aceptación respecto a la semana anterior (positivo = mejoró)` |
| Alertas | `Número de máquinas con alertas (% bajo el umbral crítico)` |
| ◀ / ▶ | `Semana anterior` / `Semana siguiente` |
| Checkbox promedio 4 semanas | `Promedia % y volumen de las últimas 4 semanas disponibles para mayor robustez. Si solo hay una semana, usa ese dato igual.` |
| Badge `imp` | `Modelo cargado automáticamente desde un Excel importado, nunca confirmado manualmente. Revisa que sea correcto y vuelve a guardar para marcarlo como verificado.` |
| Exportar JSON (Levantamiento) | `Descarga un JSON con todos los datos de las máquinas (juego, isla, modelo, firmware, fabricante)` |
| Botones de lista | `Agregar a {label}` / `Quitar de {label}` (dinámico) |
| Botones de isla completa | `Agregar isla a {label}` / `Quitar isla de {label}` (dinámico) |

### Diálogos nativos
| Función | Texto |
|---|---|
| `borrarTodo` (prompt) | `Ingresa la clave para borrar todos los datos:` |
| `borrarTodo` (clave errónea) | `Clave incorrecta.` |
| `borrarTodo` (confirm) | `¿Confirmas que quieres borrar TODOS los datos?` |
| `selVaciar` | `¿Vaciar la "{label}"?` |
| `tarjListVaciar` | `¿Vaciar la lista "{label}"?` |
| `intEliminar` | `¿Eliminar este registro del historial?` |
| Copiar OK (texto) | `Copiado al portapapeles.` |
| Copiar OK (tabla) | `Copiado al portapapeles (como tabla).` |
| Copiar error | `No se pudo copiar.` |
| Exportar tab sin tablas | `Esta pestaña no tiene tablas para copiar.` |
| Exportar tab inexistente | `No hay nada que copiar.` |
| Exportar archivo vacío | `No hay semanas archivadas.` |

### Textos largos — pestaña Carga

Dropzone:
> `Arrastra aquí archivos Excel semanales, la planilla histórica, el archivo **cn** de ubicaciones o el **reacbill_master.json**`
> `Puedes subir varios a la vez · Excel, ZIP, cn, JSON` *(en `<small>`)*

Ayuda (5 viñetas, con `<b>` y `<code>` como se indica):
> • **Planillas semanales**: la fecha se lee del nombre (YYYY-MM-DD o DD-MM-YYYY).
> • **Seguimiento_Auto.xlsx**: importa todas las semanas + maestro de una vez.
> • **Archivo cn**: cualquier archivo con columnas `SMDBID;LOCNAME` separadas por `;`.
> • **Planilla de referencia**: Excel con columnas Machine ID, Position, Title Game, Manufacturer, Cabinet Model, Deno, etc. → actualiza todos los datos maestros.
> • **reacbill_master.json**: exportado desde Admin → restaura datos de máquinas y el historial de intercambios (cifrado).

### Textos largos — Admin

Fórmula de gravedad:
> La **fórmula de gravedad** cuantifica cuánto afecta un billetero al negocio:
> `Puntaje = Total × (1 + log₁₀(Total)) × ((UmbralOK − %) / UmbralOK) × (Total / PromedioTotal) × Multiplicador`
> A mayor volumen y menor aceptación → mayor puntaje. El multiplicador amplifica casos extremos.

Los 6 bloques de parámetros (título + descripción + sufijo del input):

| Título | Descripción | Sufijo |
|---|---|---|
| `% mínimo sin alerta (UmbralOK)` | `Si la aceptación es mayor o igual a este valor, el billetero no genera alerta ni puntaje de gravedad. Es el umbral de "todo bien". Valor típico: 85%. Por debajo de este porcentaje el billetero empieza a acumular puntaje.` | `Ej: 0.85 = 85%` |
| `% zona amarilla / medio (UmbralMedio)` | `Por encima de este umbral la celda aparece verde (óptimo). Entre UmbralOK y este valor aparece amarilla (aceptable pero bajo). Valor típico: 90%. Define la banda "aceptable" entre 85-90%.` | `Ej: 0.90 = 90%` |
| `% zona crítica (UmbralCrítico)` | `Si la aceptación cae por debajo de este valor, se aplica el multiplicador máximo (×Crítico). Indica un billetero con problemas graves que requiere intervención urgente. Valor típico: 40%.` | `Ej: 0.40 = 40%` |
| `Multiplicador zona media (×Medio)` | `Factor que amplifica el puntaje cuando el billetero está en alerta pero no en zona crítica (entre UmbralCrítico y UmbralOK). Aumenta la visibilidad de problemas moderados. Valor típico: 3.` | `Sin dimensiones (factor)` |
| `Multiplicador zona crítica (×Crítico)` | `Factor que amplifica fuertemente el puntaje cuando la aceptación está por debajo del UmbralCrítico. Garantiza que los casos más graves escalen al tope del ranking incluso con poco volumen. Valor típico: 30.` | `Sin dimensiones (factor)` |
| `Cortes del badge de gravedad` | `Rangos de puntaje para clasificar el badge: **Medio** (amarillo): puntaje ≥ este valor. **Alto** (naranja): puntaje ≥ este valor. **Urgente** (rojo): puntaje ≥ este valor. Los rangos dependen de tus datos; ajusta según la distribución observada.` | labels `Medio ≥`, `Alto ≥`, `Urgente ≥` (inputs de 70px) |

Otros textos de Admin:
- Editor de máquinas: `El badge [imp] indica un modelo de billetero cargado automáticamente desde un Excel importado que nunca fue revisado/confirmado a mano. Verifica esos casos y presiona "Guardar cambios" para marcarlos como confirmados.`
- Levantamiento: `Asigna el modelo (Advance/Cashflow) a las máquinas de cada isla. Selecciona la isla (por prefijo), usa los botones de lote o cambia individualmente.`
- Corrección masiva: `Filtrá por sector, fabricante y/o modelo de máquina (al menos uno), elegí qué campo(s) actualizar y aplicá a todas las coincidencias de una vez.`
- Archivo: `Para mantener la app rápida, las semanas de más de 3 meses se archivan automáticamente y se quitan del estado activo. Podés exportarlas a JSON en cualquier momento; nunca se borran.`

### Textos largos — otras pestañas

- **Resumen:** `Click en % o Total para ordenar por semana` · `· mostrando últimos 3 meses (N semana(s) más antigua(s) oculta(s))`
- **Sectores:** `Sector = primer dígito de la ISLA (ej: sector 6 = islas 6xx).` + `Comparado con DD/MM/YYYY.` (condicional) · botón `▸/▾ Ver|Ocultar listado completo del sector (sin separar por isla)` · `Todas las máquinas del sector en una sola tabla, sin agrupar por isla. Ordenable por columna.`
- **Tarjetas:** `Independiente del modelo de billetero (Advance/Cashflow). La tabla de máquinas muestra el % de cada una de las últimas semanas cargadas (hasta 4), no un promedio.`
- **Intercambios:** `**Fórmula:** Ganancia = (% billetero bueno − % billetero malo) × (volumen alto − volumen bajo)` / `Llevar un billetero de alto rendimiento a una posición de alto flujo maximiza los billetes aceptados globalmente.` · `⚠ App abierta en modo online — el historial no se guarda.` / `✓ Modo local — historial cifrado y guardado.` · encabezados de panel: `**Origen** — fabricante(s) del billetero bueno`, `**Destino** — fabricante(s) del billetero malo (IGT solo con IGT)`, `**Origen** — sector(es) de donde sacar el billetero bueno`, `**Destino** — sector(es) donde colocarlo`, `**Nunca sacar billeteros de estos sectores** (se respeta sin importar el filtro de Origen)` · `Ganancia estimada = billetes extra aceptados por semana si el billetero bueno ocupa la posición de alto flujo.` · vacío: `Sin sugerencias con estos filtros.` / `Sin historial`
- **Listas:** vacía ⇒ `{label}: lista vacía. Agregá máquinas con el botón "+" (color #xxxxxx) en cualquier vista.` (en Tarjetas: `…en la tabla de abajo.`) · `Agregadas con el botón "+" de color #xxxxxx en cualquier vista. Se mantiene aunque cambies de pestaña o recargues la página.` · `Mostrando las últimas 3 agregadas de N. Copiar/Exportar incluye la lista completa.`
- **Estado vacío general:** `Sin datos.` · Carga: `Sin datos. Sube archivos.` · Tarjetas: `Sin datos de lectura de tarjetas para esta semana.`

> **Nota:** los mensajes de lista muestran el **código hexadecimal crudo** del color (ej. `(color #xxxxxx)` → se imprime el hex literal) en vez de un nombre legible. Está señalado en §8 como comportamiento actual, no como intención confirmada.

### Emojis usados (parte de la identidad visual)

Pestañas: `📂 Carga`, `📊 Resumen`, `📅 Por Fecha`, `🎯 Gravedad`, `🗺 Sectores`, `🎰 Máquinas`, `🔄 Intercambios`, `🔎 Buscador`, `💳 Tarjetas`, `📋 Lista`, `⚙️ Admin`.
Listas: `🅰️` `🅱️` `🇨` (generales) y `🚫` `🅱️` `🇨` (Tarjetas).
Acciones: `📋` copiar, `⬇` exportar, `✕` vaciar/quitar, `💾` guardar, `🖨️` imprimir, `⚠` alerta, `✓` confirmado, `⇄` intercambio, `▶`/`▼`/`▸`/`▾` expandir, `◀`/`▶` navegar semanas, `▲`/`▼` tendencia, `‹`/`›` paginar.

## A.21 Assets binarios (no reconstruibles desde este documento)

| Archivo | Especificación |
|---|---|
| `logo.png` | 1024×1536 px, RGBA. Se muestra en el header a `height:34px`. **Debe aportarse aparte.** |
| `icon-192.png` | 192×192, `purpose:"any"` |
| `icon-512.png` | 512×512, `purpose:"any"` |
| `icon-512-maskable.png` | 512×512, `purpose:"maskable"` — el logo va **más chico** (más margen) para respetar la zona segura del recorte |
| `favicon-32.png` | 32×32, referenciado como `<link rel="icon" sizes="32x32">` |

Los cuatro íconos se generaron a partir de `logo.png` centrado sobre fondo sólido del color de fondo de la app, con padding del **12%** (los `any` y el favicon) y del **22%** (el maskable).

---

# ANEXO B — Inventario exhaustivo de código

> **Propósito.** Las secciones 1–9 describen *comportamiento*; el Anexo A describe *apariencia*. Este anexo cierra el último hueco: la **superficie exacta del código** — cada función con su firma, cada variable global, el cableado de eventos y los archivos auxiliares verbatim.
>
> Se incluye para que quien reconstruya pueda **verificar cobertura**: si implementó todo lo de esta lista, no le falta nada. Los números entre corchetes son la línea dentro del bloque `<script>` (que empieza en la línea 486 del archivo).

## B.1 Inventario completo de funciones (146)

### Detección de entorno y ofuscación

| # | Firma | Qué hace |
|---|---|---|
| [22] | `isLocal()` | `true` si `file:` / `localhost` / `127.0.0.1`. Gobierna la persistencia del historial (§2.7). |
| [28] | `xorEnc(str)` | XOR con `_K` + `btoa(unescape(encodeURIComponent(...)))`. |
| [29] | `xorDec(enc)` | Inverso; **devuelve `"[]"` ante cualquier excepción**. |

### Persistencia

| # | Firma | Qué hace |
|---|---|---|
| [56] | `idb()` | Abre IndexedDB `"reacbill"` v2; crea el store `"kv"` en `onupgradeneeded` dentro de `try/catch`. Devuelve Promise. |
| [61] | `async saveState()` | `put(JSON.stringify(state), LS_KEY)`. |
| [69] | `async loadState()` | Lee `LS_KEY`, hace merge preservando `params` por defecto, y llama `migrateIslaFormat()`. Todo en `try/catch`. |
| [85] | `migrateIslaFormat()` | Normaliza `isla` con guión a dígitos puros. **No persiste** (§8.1f). |
| [32] | `async saveHistory()` | **No-op si `!isLocal()`**. Guarda `swapHistory` cifrado. |
| [41] | `async loadHistory()` | **No-op si `!isLocal()`**. |
| [98] | `async loadArchiveMeta()` | Lee `ARCHIVE_KEY` a `archivedWeeks`/`archivedWeekOrder`. |
| [111] | `async saveArchive()` | Guarda `{weeks,weekOrder}` del archivo. |
| [121] | `async archiveOldWeeks(months=3)` | Mueve semanas anteriores al corte fuera de `state.weeks`. Devuelve `true` si archivó. |
| [137] | `intExportarArchivo()` | Descarga `reacbill_archivo_YYYY-MM-DD.json`; `alert` si no hay nada. |

### Helpers de isla/sector

| # | Firma | Qué hace |
|---|---|---|
| [149] | `normIsla(s)` | Deja sólo dígitos. |
| [150] | `islaPrefix(isla)` | Quita los 2 últimos dígitos (si `length>2`). |
| [155] | `islaSector(isla)` | Primer dígito del prefijo. |
| [304] | `fmtLocname(loc)` | Alias de `normIsla`. |
| [307] | `getLoc(mda)` | `master.isla` o, si falta, `fmtLocname(locname)`. `""` si no existe la máquina. |
| [308] | `getMod(mda)` | `master.modelo` con `trim()`. |
| [309] | `getFirm(mda)` | `master.firm` con `trim()`. |

### Cálculo

| # | Firma | Qué hace |
|---|---|---|
| [158] | `weekCalc(week,params)` | **El motor.** Ver §5.2 para las fórmulas exactas. |
| [198] | `sevClass(sc,p)` | `"ok"\|"mid"\|"hi"\|"cr"`. |
| [202] | `allCalcs()` | Memoiza en `calcCache` el `weekCalc` de todas las semanas. |
| [208] | `invalidate()` | `calcCache=null`. **Obligatorio tras mutar `weeks`/`master`/`params`.** |
| — | `avg(a)` *(arrow)* | Promedio aritmético; `0` si el array está vacío. |

### Formato y presentación

| # | Firma | Qué hace |
|---|---|---|
| — | `fmtP(v)` `fmtN(v)` `fmt1(v)` *(arrows)* | Ver §4.1. |
| [214] | `pctClass(p)` | Clase de color por umbral. |
| [219] | `pctBar(p,w=60)` | Track + fill; clamp 2–100%. |
| [317] | `fmtKey(k)` | `YYYY-MM-DD` → `DD-MM`. |
| [318] | `fmtKeyFull(k)` | `YYYY-MM-DD` → `DD/MM/YYYY`. |
| [310] | `dateKeyFromName(name)` | 3 estrategias; fallback = nombre cortado a 10 chars. |
| [319] | `sortWeeks()` | Reordena `state.weekOrder` con `localeCompare`. |
| [323] | `weeksCutoffKey(months)` | Clave de corte N meses antes de la última semana. `null` si hay ≤1 semana. |
| [334] | `visibleWeeks()` | Semanas de los últimos **3 meses**. Sólo lo usan Resumen y Buscador. |

### Ordenamiento genérico

| # | Firma | Qué hace |
|---|---|---|
| [230] | `thColIndex(th)` | Índice real considerando `colspan`/`rowspan`. |
| [248] | `sortVal(s)` | Texto → número (5 estrategias, §4.5). |
| [258] | `attachSort(tableId)` | Engancha click; **salta los `th` con `onclick`**; **sólo filas hijas directas**, excluye `.no-sort`. |
| [294] | `reapplySort(tableId)` | Restaura el orden invirtiendo `dir` y disparando `click()`. |

### Parseo / importación

| # | Firma | Qué hace |
|---|---|---|
| [340] | `parseCnText(text)` | CSV `;`/TAB con `SMDBID`+`LOCNAME`. Descarta `loc==="err"`. |
| [358] | `parseDataSheet(ws)` | Hoja semanal. Detección de columnas por regex (§5.1.2). Devuelve `{rows}` o `null`. |
| [394] | `parseContadores(ws)` | Hoja `Contadores`. **Pisa `fabricante`/`juego` con `""`** si faltan (§8.1g). |
| [413] | `parseSeguimientoModelos(ws)` | Hoja `Seguimiento`. **Empieza en la fila 4**, columnas por posición fija 0–4. |
| [432] | `parseMasterReference(wb)` | Busca hoja con `MACHINE ID`+`MANUFACTURER`. Devuelve en la primera con `n>0`. |
| [472] | `parseTipoBilletero(wb)` | Busca hoja con `MAQUINA`+`BILLETERO`. Mapea a `Advance`/`Cashflow`. |
| [505] | `async handleFiles(files)` | **Orquestador.** Ruteo ZIP/JSON/cn/Excel (§5.1). |
| [2027] | `importMasterJSON(payload)` | Acepta array o `{master,hist}`. Merge `nuevo\|\|anterior`; historial por `id`. |
| [2020] | `exportMasterJSON()` | Descarga `reacbill_master.json`. |

### Shell de UI

| # | Firma | Qué hace |
|---|---|---|
| [640] | `buildNav()` | Genera los 11 botones de nav. |
| [644] | `showTab(id)` | Cambia pestaña, despacha el render y **siempre** llama `updateStatsBar()`. |
| [683] | `buildShells()` | Crea los 11 divs `.tab` y el HTML fijo de Carga; cablea el dropzone. |
| [711] | `renderLoadedInfo()` | Resumen de datos cargados + `#dataInfo`. |
| [728] | `updateStatsBar()` | 4 métricas del header; **rama especial si `activeTab==="tarjetas"`**. Usa siempre la última semana. |
| [763] | `syncTopScroll(topId,wrapId,tblId)` | Scrollbar espejo bidireccional con bandera `skip`. |
| [656] | `exportActiveTabPrint()` | `window.print()`. |
| [659] | `exportActiveTabCopy()` | Clona, quita controles, copia `text/html`+`text/plain`. |
| [2697] | `renderAll()` | `renderLoadedInfo()` + `showTab(activeTab)`. |

### Resumen

| # | Firma | Qué hace |
|---|---|---|
| [775] | `resSort(wk,field)` | Sort por semana/campo. Dir inicial: `1` para `pct`, `-1` para `tot`. |
| [780] | `renderResumen()` | Shell de la pestaña. |
| [795] | `renderResBody()` | Matriz máquina×semana, encabezado de 2 filas, columnas sticky. |
| [844] | `resApplyFilter()` | Oculta filas por `data-search` **sin re-renderizar**. |

### Por Fecha / Gravedad

| # | Firma | Qué hace |
|---|---|---|
| [854] | `renderFecha()` | Detalle semanal: 6 KPIs + tabla con 6+6 denominaciones. |
| [902] | `renderRanking()` | Ranking por puntaje; sólo `score>0`; filtro Advance/Cashflow; Δ% vs semana previa. **Tiene desalineamiento de columnas (§8.1a).** |

### Sectores

| # | Firma | Qué hace |
|---|---|---|
| [954] | `secToggleFlat()` | Alterna el listado plano del sector. |
| [955] | `secCopiarResumen()` | Copia el resumen de sectores como texto TAB. |
| [963] | `renderSectores()` | Vista principal. Captura/restaura scroll. |
| [994] | `islaStats(mdas,c)` *(anidada)* | `{pct,tot,alerts,n}` **ponderado**, sólo filas con `total>0`. |
| [1181] | `secShiftWeek(delta)` | Mueve el selector de semana ±1 sin envolver. |
| [1189] | `secSelSector(s)` | Selecciona sector y **limpia la isla**. |
| [1190] | `secSelIsla(p)` | Alterna isla (si ya estaba, la deselecciona). |
| [1191] | `secIslaMdas(prefix)` | Máquinas de la isla respetando el filtro de modelo. |
| [1201] | `secIslaBtnGroup(prefix)` | 3 botones; `on` sólo si **todas** están en la lista. |
| [1209] | `secIslaToggle(id,prefix)` | Agrega/quita la isla completa. Mensaje que se borra a los **2500 ms**. |

### Máquinas

| # | Firma | Qué hace |
|---|---|---|
| [1226] | `renderMaquinas()` | Árbol fabricante→modelo→juego→isla. Sólo máquinas con `total>0`. |
| [1353] | `maqToggleFab(fab)` | Abre/cierra fabricante; limpia niveles inferiores. |
| [1358] | `maqToggleJuego(mmq,fab)` | Nivel 2 (**modelo de máquina**, pese al nombre). |
| [1364] | `maqToggleGame(jue,mmq,fab)` | Nivel 3 (juego). |

### Buscador

| # | Firma | Qué hace |
|---|---|---|
| [1372] | `busOnInput(field,val)` | Campos mutuamente excluyentes. |
| [1377] | `renderBuscador(focusField)` | Busca por MDA (máx **20**) o por isla; restaura foco y cursor al final. |

### Tarjetas

| # | Firma | Qué hace |
|---|---|---|
| [1456] | `tarjFiltLoad()` | Carga `groupBy`/`subBy` de localStorage. |
| [1462] | `tarjFiltSave()` | Persiste ambos. |
| [1466] | `tarjKeyFor(level,ms)` | Clave de agrupación por nivel. |
| [1474] | `tarjEsc(s)` | Escapa `\` y `'` para los `onclick`. |
| [1478] | `tarjLastWeeks(d,n=4)` | Hasta 4 semanas terminando en `d`. |
| [1482] | `tarjWeeksData(weeks)` | `{mda:{fecha:{pct,ac,re}}}`, omite sin actividad. |
| [1496] | `tarjRenderLevel(rows,levels,path,weeks,wmap)` | **Recursiva.** Insignias por semana **ponderadas**. |
| [1534] | `tarjRenderMachTable(rows,path,weeks,wmap)` | Tabla hoja; usa `pctTarj` del Excel (§8.1c). |
| [1563] | `renderTarjetas()` | Orquesta; restaura scroll; `attachSort`+`reapplySort` diferidos. |
| [1601] | `tarjToggle(path)` | Alterna un nodo en `tarjOpenPaths`. |

### Admin

| # | Firma | Qué hace |
|---|---|---|
| [1607] | `renderAdmin()` | 5 tarjetas; llama a `renderLevTable`, `renderBulkEditCard`, `renderMachEditorRows`. |
| [1718] | `renderBulkEditCard()` | Corrección masiva; recalcula modelos según sector+fabricante. |
| [1785] | `bulkEditApply()` | Aplica a todas las coincidencias; guarda. |
| [1813] | `renderLevTable()` | Levantamiento por isla; radios + selects. |
| [1871] | `machGetFiltered()` | Filtra y ordena **en memoria**, sin tocar el DOM. |
| [1890] | `machSortClick(col)` | Alterna dirección; re-renderiza la página. |
| [1895] | `machGoPage(p)` | Cambia de página. |
| [1896] | `machEdit(mda,f,v)` | Guarda en `machPendingEdits` (no en el estado). |
| [1904] | `renderMachEditorRows()` | Construye **sólo** la página actual (200 filas). |
| [1966] | `machApplyFilter()` | Página a 0 + re-render. |
| [1970] | `machSave()` | Vuelca pendientes; `normIsla` en `isla`; `modeloFuente="manual"`. **2000 ms**. |
| [1984] | `levAllAdm(mod)` | Marca todos los radios visibles (**sólo DOM**). |
| [1987] | `levSelAdm(mod)` | Sólo las filas tildadas. |
| [1994] | `levChkNone()` | Tilda las máquinas sin modelo. |
| [2001] | `levToggleAll(masterChk)` | Tilda/destilda todo. |
| [2004] | `levGuardarAdm()` | Persiste radios + firm + modelmaq. **2000 ms**. |
| [2062] | `saveParams()` | Lee los 8 inputs con `Number()`, **sin validar**. |
| [2070] | `borrarTodo()` | Clave `MMDD` + `confirm`. No borra params/listas/historial/archivo. |
| [2079] | `resetParams()` | Restaura los 8 defaults. |

### Listas generales (A/B/C)

| # | Firma | Qué hace |
|---|---|---|
| [2125] | `selLoad()` | Carga las 3 + **migración legacy** (§5.12). |
| [2140] | `selSave(id)` | Persiste una lista. |
| [2143] | `selBtn(mda)` | Genera los 3 botones con `--tsc` inline. |
| [2149] | `selToggle(id,mda)` | Alterna y **parchea el DOM sin re-render** (salvo en la pestaña Lista). |
| [2161] | `updateSelBadge()` | Badge con la **suma de las 3** listas. |
| [2166] | `selLastCalcRows()` | Mapa `{mda:CalcRow}` de la **última** semana. |
| [2172] | `selRows(id)` | Filas ordenadas por **isla descendente**. |
| [2180] | `selListCardHtml(id)` | Tarjeta de una lista. |
| [2206] | `renderLista()` | Concatena las 3 tarjetas. |
| [2210] | `selVaciar(id)` | `confirm` + vaciar. |
| [2214] | `selToText(id)` | TSV con 6 columnas. |
| [2219] | `selCopiar(id)` | Copia el TSV. |
| [2224] | `selExportarCSV(id)` | CSV `;`, nombre `reacbill_{label}_{fecha}.csv`. |

### Listas de Tarjetas (rechazo/B/C)

| # | Firma | Qué hace |
|---|---|---|
| [2244] | `tarjListsLoad()` | Carga las 3 (sin migración legacy). |
| [2249] | `tarjListSave(id)` | Persiste una. |
| [2252] | `tarjListBtnHtml(id,mda)` | Botón de 20px. |
| [2256] | `tarjListToggle(id,mda)` | Parchea el DOM y **re-renderiza Tarjetas** si es la pestaña activa. |
| [2267] | `tarjListRowData(mda,pm,weeks,wmap)` | Fila con `weekCells[]`. |
| [2279] | `tarjListRows(id)` | **Completa**, ordenada por isla desc. Siempre última semana (§8.1d). |
| [2290] | `tarjListRecentRows(id,n)` | `slice(-n).reverse()` — últimas agregadas. |
| [2298] | `tarjListToggleExpand(id)` | Colapsa/expande (no persiste). |
| [2302] | `tarjListHtml(id)` | Tarjeta; muestra **máx. 3 filas**. |
| [2338] | `tarjListVaciar(id)` | `confirm` + vaciar. |
| [2342] | `tarjListToText(id)` | TSV con columnas de semana dinámicas. |
| [2349] | `tarjListCopiar(id)` | Copia el TSV. |
| [2354] | `tarjListExportarCSV(id)` | CSV `;`. |

### Intercambios

| # | Firma | Qué hace |
|---|---|---|
| [2369] | `swapFabOk(fabA,fabB)` | IGT sólo con IGT. |
| [2375] | `buildAvgRows(calcs,d)` | Promedio de hasta 4 semanas con `Math.round`. |
| [2394] | `calcSwaps(rows)` | **10 filtros en orden** + greedy, tope **50** (§5.9). |
| [2448] | `renderIntercambios()` | Vista completa; guarda `window._lastSwaps`. |
| [2473] | `fabPanelHtml(allFabs,selectedSet,otherSet,side)` *(anidada)* | Chips de fabricante; los incompatibles quedan **sin `onclick`**. |
| [2493] | `sectorPanelHtml(selectedSet,side)` *(anidada)* | Chips de sector. |
| [2619] | `intRegistrar(i)` | Formulario desde `window._lastSwaps[i]` + `scrollIntoView`. |
| [2647] | `async intConfirmar(s)` | Inserta con `id:Date.now()` y guarda. |
| [2658] | `intToggleFab(side,fab)` | Alterna fabricante. |
| [2663] | `intResetFab(side)` | Limpia un panel. |
| [2668] | `intSectorSet(side)` | Devuelve el Set (`left`/`right`/`exclude`). |
| [2671] | `intToggleSector(side,sec)` | Alterna sector. |
| [2676] | `intResetSector(side)` | Limpia. |
| [2681] | `async intEliminar(id)` | `confirm` + filtra por `id`. |
| [2688] | `intExportarJSON()` | Descarga el historial. |

## B.2 Inventario completo de variables globales (45)

### Constantes

```js
const VERSION="2.2.4-main";          // mostrada en #verSpan con prefijo "v"
const LS_KEY="reacbill_v1";
const HIST_KEY="reacbill_hist_v1";
const ARCHIVE_KEY="reacbill_archive_v1";
const TARJFILT_KEY="reacbill_tarjfilt_v1";   // ← filtros de agrupación de Tarjetas
const SEL_LEGACY_KEY="reacbill_sel_v1";
const _K="REACBILL_SWAP_2026";
const esCollator=new Intl.Collator("es",{numeric:true});
const DENOS=["20000","10000","5000","2000","1000","SIN_DENO"];
const SEVLBL={ok:"OK",mid:"Medio",hi:"Alto",cr:"Urgente"};
const TABS=[...];                    // 11 pares [id,label]
const TARJ_LBL={isla,sector,modelmaq,ninguna};
const SEL_LIST_DEFS={a,b,c};
const TARJ_LIST_DEFS={rechazo,b,c};
const RESTRICTED_BRANDS=new Set(["IGT"]);
const MACH_PAGE_SIZE=200;
const sortStates={};                 // {tableId:{col,dir}} — mutado, declarado const
```

### Estado mutable

```js
let state={weeks,weekOrder,master,params};
let swapHistory=[];
let calcCache=null;
let archivedWeeks={}, archivedWeekOrder=[];
let activeTab="carga";

// Resumen
let resSortState=null, resFiltroVal="";

// Sectores
let secSummaryData=[], secSummaryDate="", secFlatOpen=false;

// Máquinas
let maqSelFab="", maqSelJuego="", maqSelGameTitle="";

// Buscador
let busMDAVal="", busIslaVal="";     // ← mutuamente excluyentes

// Tarjetas
let tarjGroupBy="sector", tarjSubBy="isla",
    tarjOpenPaths=new Set(), tarjSortTables=[];
let tarjLists={rechazo,b,c}, tarjListsExpanded={rechazo:false,b:false,c:false};

// Listas generales
let selLists={a:new Set(),b:new Set(),c:new Set()};

// Editor de máquinas (Admin)
let machEditFilter="", machEditPage=0, machPendingEdits={},
    machSortCol="mda", machSortDir=1,
    machEditAllMdas=[];              // ← snapshot de Object.entries(state.master) ordenado

// Intercambios
let intFiltroModA="", intFiltroModB="", intFiltroMinVol=0,
    intFabLeft=new Set(), intFabRight=new Set(),
    intUsarPromedio=false, intPendiente=null;        // intPendiente: MUERTA (§8.2)
let intSectorLeft=new Set(), intSectorRight=new Set(), intSectorExclude=new Set();
```

### Estado en el DOM (no en variables)

Estos valores viven **sólo en el HTML** y se releen en cada render — si se re-renderiza sin preservarlos, se pierden:

| Elemento | Pestaña | Qué guarda |
|---|---|---|
| `#secSel` (hidden) | Sectores | Sector seleccionado |
| `#secIslaSel` (hidden) | Sectores | Isla expandida |
| `#secWeekSel` / `#secModSel` | Sectores | Semana / filtro de modelo |
| `#fechaSel` / `#rankSel` / `#rankModeloSel` | Por Fecha / Gravedad | Semana / filtro |
| `#maqSel` / `#tarjSel` / `#intSel` | Máquinas / Tarjetas / Intercambios | Semana |
| `#tarjGroupSel` / `#tarjSubSel` | Tarjetas | Agrupación (además se persiste) |
| `#levIslaAdm` | Admin | Isla del Levantamiento |
| `#bulkSecSel` / `#bulkFabSel` / `#bulkModmaqSel` / `#bulkModeloSel` / `#bulkChkModelo` / `#bulkChkFirm` / `#bulkFirmVal` | Admin | Filtros y campos de corrección masiva |
| `#intModA` / `#intModB` / `#intMinVol` / `#intPromedio` | Intercambios | Filtros |
| `window._lastSwaps` | Intercambios | Array de sugerencias del último render (lo lee `intRegistrar`) |

## B.3 Cableado de eventos — inventario completo

La app usa **tres mecanismos** y sólo tres:

**1. Atributos `onclick`/`onchange`/`oninput` inline** — el mecanismo dominante. Todos los controles generados por template literals. **Requiere scope global** (§2.1).

**2. Asignación de propiedad `on*`** — 8 casos, todos en elementos persistentes:
```js
[705] dz.onclick      = ()=>fi.click();
[706] fi.onchange     = ()=>handleFiles([...fi.files]);
[707] dz.ondragover   = e=>{e.preventDefault(); dz.classList.add("over");};
[708] dz.ondragleave  = ()=>dz.classList.remove("over");
[709] dz.ondrop       = e=>{e.preventDefault(); dz.classList.remove("over"); handleFiles([...e.dataTransfer.files]);};
[768] top.onscroll    = ...   // scrollbar espejo
[769] wrap.onscroll   = ...
[1943] tbody.oninput = tbody.onchange = e=>{...}   // handler DELEGADO del Editor de máquinas
```

**3. `addEventListener`** — sólo 3 casos:
```js
[262]  th.addEventListener("click", ...)      // dentro de attachSort
[1171] th.addEventListener("click", pinDetail) // re-ancla la fila .no-sort en Sectores
[2717] window.addEventListener("load", ...)   // registro del service worker
```

**Consecuencia a respetar:** como `attachSort` usa `addEventListener` y el HTML se reconstruye entero en cada render, **hay que volver a llamar `attachSort()` después de cada render**; si no, la tabla queda sin ordenamiento. Por eso todos los `renderX()` terminan llamándolo.

### Temporizadores (`setTimeout`) — los 5 que existen

| Línea | Delay | Propósito |
|---|---|---|
| [1221] | **2500 ms** | Borra el mensaje de `#secAddMsg` (Sectores). |
| [1438] | **0 ms** | Difiere `attachSort` de las tablas de isla del Buscador (esperar a que el HTML esté en el DOM). |
| [1597] | **0 ms** | Difiere `attachSort`+`reapplySort` de cada tabla de Tarjetas. |
| [1982] | **2000 ms** | Tras `machSave()`, restaura la tabla vía `machApplyFilter()`. |
| [2018] | **2000 ms** | Borra `"✓ Guardado."` del Levantamiento. |

**No hay `setInterval`, ni debounce, ni autosave por temporizador.** Todo guardado es explícito.

## B.4 `<head>` exacto

```html
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>REACBILL — Seguimiento Billeteros</title>
<link rel="manifest" href="manifest.json">
<meta name="theme-color" content="#080c14">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="REACBILL">
<link rel="icon" href="favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="icon-192.png">
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jszip@3/dist/jszip.min.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```
*(`theme-color` es el único valor cromático que aparece aquí; es requisito del manifiesto PWA.)*

Estructura del `<body>`: `<header>` (logo + h1 + dataInfo, `#statsBar`, `<nav id="nav">`, `#exportBar`), `<main id="main">`, `<script>`.

## B.5 `sw.js` — verbatim

```js
const CACHE = "reacbill-shell-v1";
const SHELL = ["./","./index.html","./manifest.json","./icon-192.png","./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const req = e.request;
  // Navegación/HTML: RED PRIMERO (para no quedar pegado en una versión vieja)
  if (req.mode === "navigate" || (req.method === "GET" && req.url.includes("index.html"))) {
    e.respondWith(
      fetch(req).then(res => { caches.open(CACHE).then(c => c.put(req, res.clone())); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match("./index.html"))));
    return;
  }
  // Resto: CACHE PRIMERO, red de respaldo
  if (req.method === "GET") {
    e.respondWith(caches.match(req).then(cached =>
      cached || fetch(req).then(res => {
        if (res.ok) caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => cached)));
  }
});
```

**Al cambiar el shell hay que cambiar el nombre de la caché** (`reacbill-shell-v1` → `-v2`), porque `activate` borra sólo las que no coincidan con el nombre actual.

## B.6 `manifest.json` — verbatim

```json
{
  "name": "REACBILL",
  "short_name": "REACBILL",
  "description": "Seguimiento de billeteros de máquinas",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "orientation": "any",
  "background_color": "#080c14",
  "theme_color": "#080c14",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

> **Nota sobre el color en este bloque:** `background_color` y `theme_color` son los **únicos valores cromáticos que este documento sí fija**, pese a la regla de omitir la paleta. Son requisito del manifiesto PWA (definen el fondo de la pantalla de arranque y el tinte de la barra del sistema) y deben coincidir con el fondo real de la app. Si se adopta otra paleta, hay que cambiarlos aquí, en el `<meta name="theme-color">` del `<head>` y en el fondo con que se generan los íconos.

## B.7 Formato del archivo `cn` (muestra incluida en el repo)

CSV separado por `;`, 23 columnas. Encabezado real:

```
A;LOCNAME;SMDBID;Manuf.;Credits;DENOMINACION;Total-In;Total-Out;Games Played;Handpay;JP Meter;Bill-In;CLI;CLO;JUEGO;Audit;EGM IF;TI - TO;CI;CO;CLI - CLO;CTC;HO
```

Ejemplo de fila válida:
```
1;10301;  100383;ATRONIC;690; 5.00;28494724;...;TREASURE HUNT;-30;230;...
```

**El parser sólo usa `SMDBID` y `LOCNAME`**; el resto de columnas se ignora. Nótese que `SMDBID` viene con **espacios a la izquierda** (`"  100383"`) — de ahí el `trim()`. Las filas con `LOCNAME` vacío o `err` se descartan (el archivo de muestra tiene 2 de esas).

## B.8 Estructura DOM por pestaña (orden de tarjetas)

| Pestaña | Contenido, en orden |
|---|---|
| **Carga** | `.card` "Carga de archivos" (dropzone + input oculto + ayuda + `#uplog`) → `.card` "Datos cargados" (`#loadedInfo` + botón Borrar todo) |
| **Resumen** | `.card` única: filtro + hint + `#resTopScroll` + `#resTblWrap` |
| **Por Fecha** | `.card` única: selector + `.kpis` (6) + tabla |
| **Gravedad** | `.card` única: 2 selectores + `.kpis` (3) + tabla |
| **Sectores** | `.card` "Vista por sectores" (hint + controles + `.grid3` de sector-cards + 2 hidden) → `.card` "Sector N — islas" (`#secAddMsg` + tabla + botón de listado plano) → *[opcional]* `.card` "listado completo" |
| **Máquinas** | `.card` única: selector + N `.fab-card` anidadas |
| **Intercambios** | `.card` "Optimizador" (hint + fila de filtros + 2 paneles fabricante + 2 paneles sector + 1 panel exclusión + tabla) → `#intFormWrap` (vacío o formulario) → `.card` "Historial" |
| **Buscador** | `.card` "Buscador" (`.grid2` con 2 inputs) → N `.card` de resultados MDA → N `.card` de resultados isla |
| **Tarjetas** | `.card` "Lectura de tarjetas" (hint + 3 selectores) → 3 `.card` de listas (rechazo, b, c) → `.card` con el árbol agrupado |
| **Lista** | 3 `.card`, una por lista (a, b, c) |
| **Admin** | `#levCard` → `#bulkEditCard` → `.card` "Parámetros de gravedad" → `.card` "Editor de máquinas" → `.card` "Archivo de semanas antiguas" |

## B.9 Checklist de verificación para el reconstructor

Marcar cada punto contra la implementación:

- [ ] 11 pestañas en el orden de `TABS`; arranque en `resumen` si hay datos, si no `carga`.
- [ ] `weekCalc` reproduce §5.2 **incluida la precedencia de `pctBill` sobre el % calculado**.
- [ ] `avgPct` es promedio **aritmético**; el header, sectores, islas y Máquinas son **ponderados**.
- [ ] Las 6 denominaciones de `DENOS` en orden, para sumar y para renderizar.
- [ ] Los 6 parsers, con sus condiciones de rechazo y su orden de intento en `handleFiles`.
- [ ] Inferencia de año `if(mm > mesActual) yr--` en hojas `dd-mm`.
- [ ] Archivado a 3 meses; `visibleWeeks()` a 3 meses; ventanas de 4 semanas donde corresponde.
- [ ] `attachSort` con filas hijas directas y exclusión de `.no-sort`; `reapplySort` con la inversión de `dir`.
- [ ] Las 4 columnas sticky con offsets 0/76/146/228.
- [ ] Los 10 filtros de `calcSwaps` **en orden**, greedy con `usedA`/`usedB` separados, tope 50.
- [ ] `swapFabOk`: IGT sólo con IGT.
- [ ] 2 familias de listas × 3 listas, con claves de localStorage distintas.
- [ ] Migración `reacbill_sel_v1` → Lista A **sólo si A está vacía**.
- [ ] Migración de isla con guión → dígitos puros.
- [ ] Persistencia del historial **condicionada a `isLocal()`**.
- [ ] Clave `MMDD` en Borrar todo; no borra params/listas/historial/archivo.
- [ ] Restauración de scroll doble en Sectores y Tarjetas.
- [ ] Los 5 `setTimeout` con sus delays exactos.
- [ ] Service worker: red-primero para HTML, cache-primero para el resto.
- [ ] `invalidate()` tras **toda** mutación de `weeks`/`master`/`params`.
