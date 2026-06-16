# Bitácora de Incidencias — Contexto y Estructura

## ¿Qué es?

La "Bitácora de Incidencias" es un libro Excel mensual (un archivo por mes) que registra turnos diarios de técnicos de mantenimiento de máquinas tragamonedas. Es **un sistema separado de REACBILL**; mientras REACBILL trackea aceptación de billetes, la Bitácora trackea qué técnico estuvo de turno, qué tareas realizó y qué contingencias ocurrieron.

Autor del Excel: **Ricardo Obrist Acuña**

Archivos analizados: Enero–Mayo 2026
- `01_Enero__Bitácora_de_Incidencias.xlsx`
- `02_Febrero__Bitácora_de_Incidencias.xlsx`
- `03_Marzo__Bitácora_de_Incidencias.xlsx`
- `04_Abril__Bitácora_de_Incidencias.xlsx`
- `05_Mayo__Bitácora_de_Incidencias.xlsx`

---

## Estructura del Libro

Cada libro tiene estas hojas:

| Hoja | Descripción |
|------|-------------|
| `Pendientes` | Lista de actividades pendientes y realizadas |
| `Horario` | Planilla de horarios del personal (columnas = días, filas = técnicos) |
| `HorarioVisual` | Versión visual del horario (desde Febrero) |
| `0000` | Plantilla/resumen del día 0 |
| `01`–`31` | Una hoja por día del mes |
| `Consolidación Datos` | Registro plano de todos los turnos del mes (LA MÁS ÚTIL) |
| `BILLETERO/BILLETE` | Hojas de seguimiento de billeteros (aparecen desde Marzo, formato variable) |

---

## Hoja de Día (`01`–`31`)

Cada hoja de día tiene la misma estructura básica (8 columnas × 12–13 filas):

```
Fila 1: Número de día
Fila 2: Alerta de cobertura (ej: "⚠ FALTA COBERTURA") o vacío
Fila 3: Encabezado de versión/autor
Fila 4: "Jornada:" | <Fecha completa>
Fila 5: Encabezados columnas: Técnico en turno | Tareas Programadas | Contingencias | (vacío) | Pendientes
Filas 6–8: Hasta 3 turnos del día
  - Col D: Nombre técnico + horario (ej: "Daniel Lagos 08:30-16:00")
  - Col E: Tareas programadas
  - Col F: Contingencias (incidentes)
  - Col H: Observaciones/Pendientes
Filas 9–10: Vacías
Fila 11: "Repuestos"
Fila 12: Repuestos usados
```

**Turnos por día:** Normalmente 2–3 técnicos por día, uno por turno (Mañana, Tarde, Noche).

---

## Hoja "Consolidación Datos"

La hoja más confiable para parsing. **Estructura consistente en todos los meses:**

```
Columna A: Número de día ("01", "02", ...)
Columna B: Fecha (ej: "1/1/26")
Columna C: Técnico + horario (ej: "Daniel Lagos 08:30-16:00")
Columna D: Contingencia (texto libre de incidente)
```

Aproximadamente 93 filas de datos por mes (3 turnos × ~31 días).

---

## Personal (Técnicos)

Identificados en hojas Horario y días:

- Oscar Díaz
- Sergio Escalona
- Marcelo Gatica
- Irma Heise
- Claudio Huenuqueo
- Daniel Lagos
- Carlos Olivera
- Ricardo Obrist (supervisor, cubre ausencias)

---

## Diferencias Entre Meses

| Característica | Enero | Febrero | Marzo | Abril | Mayo |
|---|---|---|---|---|---|
| Ref. hoja día | A1:H12 | A1:H12 | A1:H13 | A1:H13 | A1:H13 |
| Hoja HorarioVisual | No | Sí | Sí | Sí | Sí |
| Hojas BILLETERO | 0 | 0 | 1 | 5 | 4 |
| Columnas Pendientes | 7 | 7 | 12 | 12 | 12 |
| Tareas recurrentes (días semana) | No | No | Sí | Sí | Sí |
| Conteo máquinas en hoja día | No | No | No | Sí | Sí |
| Hoja "0000" usable | Sí | Sí | Sí | No* | No* |

*En Abril y Mayo la hoja "0000" está sobreescrita con 2942 filas de "Ricardo Obrist Acuña" (mecanismo de protección/marca de agua).

### Detalle: Hoja "Pendientes" expandida (Marzo–Mayo)

Desde Marzo, Pendientes se expande de 7 a 12 columnas agregando columnas por día de semana:

```
Col A: #
Col B: Actividades pendientes
Col C: (vacío)
Col D: Observación y Pendientes (Marzo/Abril) / Pendientes (Mayo)
Col E: (vacío)
Col F: Lunes
Col G: Martes
Col H: Miércoles
Col I: Jueves
Col J: Viernes
Col K: Sábado
Col L: Domingo
```

### Detalle: Hojas BILLETERO/BILLETE (Marzo–Mayo)

Hojas de seguimiento de billeteros intercaladas entre las hojas de día. Formato **muy inconsistente** entre meses:

- Marzo: 1 hoja "BILLETEROS" (A1:P16)
- Abril: 5 hojas BILLETERO–BILLETERO5 (tamaños: B3:H16, B3:H22, A5:Q17, A4:G35, B5:K16)
- Mayo: 4 hojas BILLETE1–BILLETE4 (tamaños: B6:E9, B4:F12, A1:U27, E1:J17)

Nota: Mayo tiene " BILLETE4" con espacio al inicio en el nombre de hoja.

---

## El Problema: "Los Horarios Están Mal"

El usuario indicó que los horarios mostrados en la app (Bitácora de Incidencias) están incorrectos. En la screenshot visible se mostraban estos horarios:

```
Daniel Lagos:   08:30–16:00
Carlos Olivera: 08:00–15:30
Irma Heise:     12:00–19:30
Marcelo Gatica: 15:00–22:30
```

Los horarios correctos deben venir de la hoja **"Horario"** del Excel de cada mes. El campo "Técnico en turno" en cada hoja de día contiene nombre + horario concatenados (ej: `"Daniel Lagos 08:30-16:00"`), y la hoja **"Consolidación Datos"** también los incluye en la columna C.

**El problema específico** no fue completamente especificado por el usuario antes de terminar la sesión. Puede ser:
1. Los horarios hardcodeados en la app no coinciden con los del Excel
2. Los turnos (Mañana/Tarde/Noche) están asignados a horarios incorrectos
3. Los horarios varían por técnico/día y la app los muestra estáticos

**Siguiente paso:** Confirmar con el usuario cuáles son los horarios correctos para cada técnico/turno.
