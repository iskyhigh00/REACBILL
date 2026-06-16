# Bitácora de Incidencias — Requisitos para Nueva Sesión

## Contexto Rápido

- **REACBILL** (`index.html`): App HTML single-file que procesa planillas semanales de aceptación de billetes. v1.8.3-main. Branch: `claude/vibrant-wozniak-3xm3um`.
- **Bitácora de Incidencias**: App separada (o pestaña nueva dentro de REACBILL) para visualizar el registro diario de turnos técnicos, leída desde archivos Excel mensuales.

---

## Estado Actual

El usuario tiene una app "Bitácora de Incidencias" que muestra:
- Navegación por día (calendario)
- 3 turnos: Mañana / Tarde / Noche
- Por turno: nombre técnico + horario + tareas programadas + contingencias
- Columna "Tareas Programadas"
- Columna con MDAs / tareas completadas

**Problema reportado:** "los horarios están mal" — los horarios que muestra la app no son correctos.

---

## Fuente de Datos (Excel)

La fuente más confiable es la hoja **"Consolidación Datos"** de cada libro mensual.

### Parsing de "Consolidación Datos"
```
Col A (idx 0): Número de día ("01".."31")
Col B (idx 1): Fecha (serial Excel o string "1/1/26")
Col C (idx 2): Técnico + horario — formato: "Nombre Apellido HH:MM-HH:MM"
Col D (idx 3): Texto de contingencia (puede estar vacío)
```

### Parsing de hojas de día ("01"–"31")
```
Fila 4 (idx 3), Col D: "Jornada:" → Col E: fecha
Fila 5 (idx 4): headers — Col D="Técnico en turno", Col E="Tareas Programadas", Col F="Contingencias", Col H="Pendientes"
Filas 6–8 (idx 5–7): hasta 3 turnos
  Col D (idx 3): "Nombre HH:MM-HH:MM"
  Col E (idx 4): tareas programadas (texto)
  Col F (idx 5): contingencias (texto)
  Col H (idx 7): pendientes/observaciones
```

### Extracción de nombre y horario
El campo técnico tiene formato: `"Daniel Lagos 08:30-16:00"`
Regex para extraer: `/^(.+?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/`
- Grupo 1: nombre
- Grupo 2: hora inicio
- Grupo 3: hora fin

---

## Personal y Turnos

Técnicos identificados:
- Oscar Díaz
- Sergio Escalona
- Marcelo Gatica
- Irma Heise
- Claudio Huenuqueo
- Daniel Lagos
- Carlos Olivera
- Ricardo Obrist (supervisor, cobertura)

Los horarios NO son fijos — varían por día según la hoja "Horario". Deben leerse del Excel, no hardcodearse.

Clasificación de turno por horario de inicio (aproximado, **CONFIRMAR CON USUARIO**):
- Mañana: ~06:00–08:59
- Tarde: ~14:00–16:59  
- Noche: ~22:00–00:59

---

## Inconsistencias Entre Meses a Manejar

1. **Enero/Febrero**: hoja día A1:H12 (12 filas)
   **Marzo–Mayo**: hoja día A1:H13 (13 filas)
   → El cambio es una fila extra al final, no afecta parsing de turnos (filas 6–8)

2. **Hoja "0000" en Abril/Mayo**: sobreescrita con 2942 filas de texto watermark. No parsear.

3. **Nombre hojas BILLETERO**: muy inconsistente. No son necesarias para la Bitácora de turnos.
   - Marzo: "BILLETEROS"
   - Abril: "BILLETERO", "BILLETERO2"..."BILLETERO5"
   - Mayo: "BILLETE1"..."BILLETE4" (con "BILLETE4" teniendo espacio inicial " BILLETE4")

4. **"Pendientes" expandida desde Marzo**: de 7 a 12 columnas. Si se parsea Pendientes, detectar anchocontenido dinámicamente.

5. **Día "14" de Mayo**: ref A1:P13 (16 columnas), diferente al resto. Los datos de turno siguen en cols D–H.

6. **Hoja "HorarioVisual"**: solo desde Febrero. Ignorar para parsing de turnos.

---

## Lo Que Falta Confirmar Con el Usuario

1. **¿Cuáles son los horarios correctos?** El usuario dijo "los horarios están mal" pero no especificó los correctos. ¿Son los que están en la hoja "Horario" del Excel? ¿O hay una tabla de referencia distinta?

2. **¿Es la Bitácora una app separada o una pestaña dentro de REACBILL?** El screenshot mostrado parece una app diferente (distinto diseño visual).

3. **¿Qué datos quiere ver exactamente?**
   - ¿Solo turnos del día? ¿O también tareas programadas + contingencias?
   - ¿Necesita buscar por técnico, por fecha, por tipo de contingencia?

4. **¿Cómo se sube el archivo?** ¿Un Excel mensual a la vez? ¿O un ZIP con varios meses?

5. **¿Las hojas BILLETERO son parte de esta funcionalidad?** Parecen relacionadas con REACBILL (tracking de billeteros), no con la Bitácora de turnos.

---

## Sugerencia de Implementación

Si se integra en REACBILL como una nueva pestaña:

```javascript
// Nueva entrada en TABS array:
["bitacora", "📋 Bitácora"]

// Parsing de Consolidación Datos:
function parseBitacora(wb) {
  const ws = wb.Sheets["Consolidación Datos"];
  if (!ws) return null;
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:""});
  // rows[0] = headers, rows[1:] = data
  return rows.slice(1).filter(r => r[1]).map(r => ({
    dia: r[0],
    fecha: r[1],
    tecnico: parseTecnico(r[2]).nombre,
    horaInicio: parseTecnico(r[2]).inicio,
    horaFin: parseTecnico(r[2]).fin,
    contingencia: r[3] || ""
  }));
}

function parseTecnico(str) {
  const m = String(str).match(/^(.+?)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (!m) return { nombre: str, inicio: "", fin: "" };
  return { nombre: m[1].trim(), inicio: m[2], fin: m[3] };
}
```

---

## Archivos de Referencia

- App principal: `/home/user/REACBILL/index.html` (v1.8.3-main)
- Branch de desarrollo: `claude/vibrant-wozniak-3xm3um`
- Repo: `iskyhigh00/reacbill`
- Este archivo: `/home/user/REACBILL/BITACORA_REQUIREMENTS.md`
- Contexto completo: `/home/user/REACBILL/BITACORA_CONTEXT.md`
