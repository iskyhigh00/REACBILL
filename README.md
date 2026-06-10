# REACBILL — Seguimiento de Billeteros

App HTML (un solo archivo, `index.html`) que reemplaza la planilla `Seguimiento_Auto.xlsx`.

**Versión actual: v1.0.0**

## Uso
1. Abrir `index.html` en el navegador (no necesita servidor).
2. En **Carga**, subir de una vez:
   - La planilla `Seguimiento_Auto.xlsx` completa → importa todas las hojas con fecha (dd-mm), Contadores y modelos.
   - Y/o las planillas semanales nuevas (hoja `Ultima_Semana`) → la fecha se toma del nombre del archivo (dd-mm).
3. Los datos quedan guardados en el navegador (IndexedDB).

## Pestañas
- **Resumen** — hoja Seguimiento: matriz máquina × semana (% y Total Bill), promedios y diferencias semanales.
- **Por Fecha** — hoja semanal: denominaciones, ToAc/ToRe/Total/%Acep y puntaje de gravedad.
- **Ranking Gravedad** — máquinas a intervenir, ordenadas por puntaje, con tendencia vs semana anterior.
- **Tendencias** — gráficos de % aceptación, volumen y alertas por semana.
- **Fabricantes** — comparativa por fabricante (MM) y modelo de billetero (Advance/Cashflow).
- **Denominaciones** — % aceptación por denominación y semana.
- **Buscador** — Busca Listado: MDA → isla, gabinete, juego e historial.
- **Admin** — ponderaciones de gravedad (umbrales y multiplicadores), visibles en la barra superior.

## Fórmula de gravedad (idéntica al Excel)
```
si %Acep >= UmbralOK (0.85) -> 0
si no: Total*(1+LOG10(Total)) * ((0.85-%)/0.85) * (Total/PromedioTotal) * mult
  mult = 30 si % < 0.40 ; 3 si % < 0.90 ; 1 en otro caso
```

## Historial de versiones
- **v1.0.0** (2026-06-10): versión inicial. Carga masiva, 9 pestañas, persistencia local, parámetros configurables.
