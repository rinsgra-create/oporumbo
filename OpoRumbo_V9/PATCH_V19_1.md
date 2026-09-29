# OpoRumbo V19.1 — actualizar temas de academia

## Causa verificada

La base es la copia local V19 usada en el trabajo anterior. No se ha cotejado con una rama remota ni desplegado en producción.

En `app/main.py`, la ruta `/api/plan/today` devolvía el plan ya guardado del día cuando `replan` era falso, sin comparar los temas seleccionados con los que originaron las tareas. En `app/static/app.js`, guardar Perfil hacía primero un PUT de todo el estado y después un POST de reorganización. Si solo se completaba el PUT, quedaban la selección nueva y las tareas antiguas. Recargar reutilizaba esa combinación incorrecta.

Dos pruebas fallaron con V19 y pasan con V19.1: cambiar la selección sin forzar `replan`, y recargar después de guardar la selección sin completar la reorganización. La reorganización explícita de esta copia V19 ya conservaba solo las completadas: no se ha atribuido el fallo a una retención de pendientes que el código no realiza.

## Corrección

- El botón de Perfil «Aplicar y reorganizar Hoy» guarda ajustes, selección y tareas en una sola mutación con control de revisión. Después muestra Hoy. Un fallo no guarda media operación.
- El plan persiste `plan_selection`, con el modo y los dos temas prioritarios que lo originaron. Si no coincide, las pendientes se regeneran desde la selección y los repasos actualmente vencidos, incluso al recargar.
- Para tareas antiguas sin esa marca, se infiere la selección a partir de sus tareas académicas. No se confía únicamente en un perfil que podría estar ya actualizado.
- Las tareas completadas conservan íntegramente ID, check, nota, tiempo e historial. Se evita añadir el mismo bloque leído como academia/estudio y como repaso pendiente. El test conserva su función separada; no se confunde estudiar con realizar un test.
- Las nuevas tareas llevan `source`; los tests asociados a academia también indican esa procedencia. En V19 se distinguían por `kind`, tema y bloque; el test no identificaba su causa académica.
- Se mantienen los límites V19 de tiempo disponible, cinco tareas y hasta dos temas académicos prioritarios. Los repasos utilizan el tiempo restante. No se copian pendientes obsoletas del plan anterior.
- Se actualizan salud a `19.1` y caché estática a `v19-1`.

## Validación

62 pruebas backend aprobadas (54 anteriores y 8 nuevas), con SQLite aislada. Incluyen Tema 3 → Tema 4, completadas y notas, repaso vencido correctamente etiquetado, dos temas prioritarios, ausencia de duplicados, compatibilidad V19 sin procedencia, recarga/segunda sesión, tiempos y ritmo, deshacer, modo libre y conflictos reales de escritura concurrente.

Dos flujos de navegador Edge/Chromium aprobados, sin errores JavaScript: academia y regresión general. Se comprobó una sola petición al aplicar, fallo simulado sin guardado parcial, recarga, segundo inicio de sesión, WebGL 3D, sonido, desactivación de animaciones, notas y tiempos, reintento sin conexión, deshacer y vistas móvil/escritorio.

No se han conectado Neon ni Render. No se ha probado en un iPhone físico. Permanecen intactos `app/db.py`, `app/actions.py`, `app/workload.py`, configuración Render, dependencias y todos los archivos de la mascota/3D.

## Despliegue sobre V19

1. Conserva el commit V19 para volver atrás.
2. Descomprime `OpoRumbo-V19.1-parche.zip`. Copia el contenido de su carpeta `OpoRumbo_V9` sobre la carpeta existente del repositorio. No crees una carpeta anidada ni borres los demás archivos: es un ZIP de cambios, no la aplicación completa.
3. Se sustituyen cinco archivos de aplicación: `app/main.py`, `app/planner.py`, `app/static/app.js`, `app/static/index.html` y `app/static/sw.js`. Se incluyen las pruebas y este documento.
4. Commit sugerido: `OpoRumbo V19.1: aplicar selección de academia y plan de forma atómica`.
5. Despliega el commit en Render con la configuración actual. `/api/health` debe devolver `{"ok":true,"version":"19.1"}`. No hay migraciones SQL ni nuevas variables; conserva `DATABASE_URL`.
6. Recarga la aplicación. En Perfil selecciona Tema 3 y pulsa «Aplicar y reorganizar Hoy»; cambia a Tema 4 y aplica de nuevo. Comprueba Hoy y otra sesión. Lo completado debe permanecer; Tema 3 pendiente solo puede seguir por otra causa vigente y con su etiqueta correspondiente.

También se entrega un `.patch` aplicable sobre la copia V19 con `git apply`. Si tu rama tiene cambios posteriores, revisa las diferencias antes de sobrescribirla.

Pruebas locales desde `OpoRumbo_V9`: `python -m pytest -q`. Los flujos de navegador son `tests/browser.cjs` y `tests/browser_academy.cjs`; necesitan el servidor local en el puerto 8765 con una SQLite de pruebas y Playwright/Edge. Nunca apuntar estas pruebas a producción.
