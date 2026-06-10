# PROJECT_CONTEXT.md

## Objetivo

Convertir esta planilla Excel en una aplicación HTML que mantenga exactamente la lógica de negocio y resultados actuales, pero con mejor rendimiento y sin depender de duplicar hojas ni automatizaciones manuales.

NO rediseñar el proceso sin antes entender el Excel.

---

## Cómo funciona actualmente

Cada fin de semana llega una planilla nueva.

Proceso actual:

1. Se sube el archivo semanal a una carpeta de OneDrive.
2. Se abre la planilla principal (repositorio histórico).
3. Se duplica una hoja existente que ya contiene el formato.
4. La nueva hoja se renombra usando la fecha del archivo recibido.
5. Automatizaciones limpian el contenido anterior.
6. En A1 se coloca el nombre del archivo nuevo.
7. Fórmulas y llamadas se expanden automáticamente (aprox A1:Z670).
8. La hoja trae datos desde el archivo semanal.
9. Se ejecutan cálculos adicionales.

---

## Cálculos existentes (preservar)

La aplicación debe identificar y reconstruir automáticamente todas las fórmulas existentes en Excel.

Ejemplos conocidos:

* Conteo de rechazos
* Conteo de aceptaciones
* Total de intentos
* Porcentaje real
* Puntaje de gravedad
* Ponderación usando funciones logarítmicas para detectar rechazo alto considerando volumen de intentos
* Métricas derivadas existentes

No reemplazar fórmulas por aproximaciones.

---

## Estructura funcional requerida

### Vista 1 — Fecha

Vista equivalente a cada hoja semanal.

Debe permitir:

* seleccionar fecha
* ver datos originales
* ver métricas calculadas

---

### Vista 2 — Seguimiento

Resumen histórico equivalente a la hoja "Seguimiento".

Debe consolidar todas las fechas.

Debe incluir:

* comparación temporal
* tendencias
* indicadores relevantes

---

### Vista 3 — Admin

Configuración editable.

Debe permitir:

* modificar ponderaciones
* modificar fórmula o parámetros de gravedad
* mostrar claramente configuración activa

La configuración debe persistir.

---

## Pestañas adicionales (crear automáticamente)

Agregar 5 vistas útiles según los datos encontrados.

Ejemplos:

* Dashboard
* Alertas
* Ranking gravedad
* Comparación entre semanas
* Calidad de datos
* Tendencias

Claude puede proponer mejores opciones.

---

## Requisitos técnicos

* Aplicación HTML
* Optimizada para rendimiento
* Importación múltiple de archivos
* Arrastrar y soltar permitido
* Procesamiento local si es posible
* No depender de fórmulas distribuidas por cientos de hojas
* Mantener resultados equivalentes al Excel
* Evitar llamadas innecesarias a nube

---

## Flujo esperado

Subir múltiples archivos →
Procesar →
Calcular →
Guardar →
Visualizar →
Comparar

---

## Restricciones

* Trabajar SIEMPRE sobre branch: main
* Mantener compatibilidad con futuras planillas del mismo formato
* No eliminar funcionalidades existentes
* Si alguna fórmula no se entiende, inspeccionar referencias antes de asumir

---

## Entregables

1. Explicación del modelo encontrado
2. Arquitectura propuesta
3. Lista de fórmulas detectadas
4. App funcional
5. Número de versión visible

Formato de versión:

vX.Y.Z-main

Entregar versión en cada iteración para comparación.
