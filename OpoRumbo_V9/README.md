# OpoRumbo · actualización de estabilidad y experiencia (V18)

Evolución del proyecto existente. Se conservan FastAPI, las tablas `users`, `sessions` y `progress`, PostgreSQL/Neon, el catálogo, las imágenes y la configuración de Render. No hay migraciones destructivas ni nuevas variables de producción.

## Qué cambia

- El servidor completa cada tarea y guarda nota, próximo repaso y XP en una sola escritura. Los reintentos de una tarea ya completada no vuelven a premiarla ni duplican el test.
- Los cambios al progreso incorporan una revisión dentro del JSON existente. Una sesión antigua recibe un conflicto visible en lugar de sobrescribir otro dispositivo. La escritura condicional funciona entre procesos, sin depender de un bloqueo en memoria.
- Reorganizar el día conserva las tareas terminadas. Los planes tienen fecha e identificadores estables. Los datos anteriores sin fecha se adoptan una vez, sin borrar sus checks.
- Se puede deshacer la última tarea, incluyendo su nota y recompensa. Se limita a la última para no borrar estudio posterior. Los checks terminados dejan de funcionar como un interruptor accidental.
- Los envíos sin confirmar se conservan localmente por cuenta y pueden reintentarse. No se presenta un guardado fallido como confirmado.
- El sonido empieza en el gesto de completar/guardar nota. La energía y la reacción del compañero no esperan al servidor ni bloquean la escritura.
- Hoy contiene el compañero y las tareas. Progreso, Temario, Compañero y Perfil quedan separados. Botones accesibles, formularios con etiquetas, diálogo de nota con teclado, contraste y preferencias de movimiento reducido.
- Se recupera la búsqueda y configuración inicial. La consulta al BOE usa el formulario completo vigente; el catálogo histórico y las extracciones se etiquetan para revisión. Un fallo del BOE es visible y permite seguir consultando el catálogo.
- Academia muestra todos los temas. Se priorizan hasta dos de los seleccionados en cada sesión, con los menos recorridos primero, para mantener un máximo de cinco tareas. Los demás siguen seleccionados.
- El plan respeta el presupuesto diario, incorpora repasos vencidos y avanza por bloques y vueltas. Se muestran estimaciones para dos, tres y cuatro vueltas y se descuentan las pasadas registradas. Los días de estudio son una estimación basada en días/semana, no un calendario con festivos.
- El índice de dominio usa la última nota de cada tema; la media de tests conserva el historial. Ninguno se presenta como una probabilidad de aprobar.

## Compañero 3D

El fallo original principal era la ausencia del iframe que el código intentaba controlar. Ahora el iframe existe y carga un módulo independiente con Three.js 0.160.0 servido desde `app/static/vendor/`, con su licencia MIT. No se utilizan CDNs en ejecución.

Auri, Nexo y Bruma son mallas reales con iluminación, cuerpo, ojos, orejas y cola. Tienen respiración, parpadeo, pequeños movimientos y reacción a la energía. Las cinco etapas añaden detalles. La imagen original solo es un fallback estático si falla WebGL o el módulo; no se anuncia como 3D.

Los mensajes comprueban origen y ventana emisora. Se atiende la pérdida de contexto WebGL. La animación se detiene al desactivarla o al ocultar la escena. `companion-model.js` expone `root/update/dispose`, el punto de sustitución para modelos GLB futuros. Esta entrega incluye modelos procedurales; no incluye GLB de artista.

## PWA y caché

- La API nunca se almacena en la caché del service worker.
- HTML, JavaScript y CSS se revalidan; se prefiere red para recursos estáticos.
- Al activar la V18 se eliminan las cachés anteriores de OpoRumbo.
- La caché estática sirve de respaldo sin red. La autenticación y la lectura del progreso requieren servidor: esto no es un modo de estudio completamente offline.
- Se añade icono y manifiesto instalable. El día de estudio se calcula en Europe/Madrid.

## Despliegue en Render

1. Conserva una copia/backup de producción mediante las herramientas de Neon antes de actualizar. No exportes credenciales al repositorio.
2. Integra esta carpeta `OpoRumbo_V9` en el repositorio existente, incluyendo los archivos nuevos de `app/static` y `app/actions.py`. No basta con sustituir los dos HTML.
3. Mantén la configuración actual:
   - Root Directory: `OpoRumbo_V9`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Health check: `/api/health`
   - Conserva el valor actual de `DATABASE_URL` en Render. No lo copies a archivos.
4. Despliega la revisión integrada. No hace falta Node para servir la aplicación ni ejecutar un build de frontend.
5. Comprueba que `/api/health` devuelve versión `18.0`. Cierra y vuelve a abrir la PWA para cargar la nueva interfaz.
6. Con una cuenta de prueba: login → configuración → plan → tarea → nota → recarga → segunda sesión. Comprueba que nota y check siguen visibles. Abre `/static/pet3d.html` para revisar el 3D de forma aislada.
7. Comprueba sonido, movimiento reducido y tamaño de pantalla en un iPhone real antes de dar el despliegue por validado.

Para volver atrás, despliega el commit anterior desde Render. Los cambios de datos son aditivos dentro del JSON; no se han eliminado tablas ni columnas. No reviertas la base de datos completa para revertir la interfaz.

## Pruebas locales

Usa Python 3.12 y una base de pruebas. Nunca ejecutes pruebas contra Neon de producción.

```sh
cd OpoRumbo_V9
python -m venv .venv
# Activa .venv según tu sistema operativo
pip install -r requirements-dev.txt
python -m pytest -q
```

La suite configura su propio SQLite temporal. Comprueba autenticación, segunda sesión, persistencia de notas y checks, reintentos, conflictos entre dispositivos, dos escrituras concurrentes reales, cambio de día, legado, deshacer, vueltas, minutos y búsqueda BOE.

Para navegador, inicia una instancia separada con un SQLite de pruebas y puerto 8765:

```sh
# Establece DATABASE_URL=sqlite:///./browser-test.db solo en esta terminal de pruebas.
uvicorn app.main:app --host 127.0.0.1 --port 8765
# En otra terminal, dentro de OpoRumbo_V9:
npm install
npx playwright install chromium
npm run test:e2e
```

`tests/browser.cjs` usa exclusivamente `http://127.0.0.1:8765`, crea cuentas de prueba y guarda capturas en `test-results`. En Windows puedes definir `BROWSER_CHANNEL=msedge` para usar Edge instalado. `PLAYWRIGHT_MODULE` permite usar una instalación local de Playwright y `TEST_OUTPUT_DIR` cambia el destino de capturas. Ninguna de estas variables hace falta en Render.

Validación realizada: **21 pruebas backend aprobadas**, flujo de navegador aprobado en Edge/Chromium con WebGL por software, sin errores de JavaScript. Vistas de 320, 390 y 1440 px sin desbordamiento horizontal. AudioContext activo antes de una respuesta retrasada artificialmente, 3D congelado al desactivar animaciones, recuperación de guardado sin red y funcionamiento con el módulo 3D bloqueado. Búsqueda pública real del BOE: seis resultados para «auxiliar administrativo» tras corregir los parámetros.

## Límites pendientes de validación

- No se ha accedido a usuarios ni progreso de producción. PostgreSQL/Neon y el despliegue real en Render requieren una comprobación posterior a la integración; las pruebas de persistencia se han hecho con SQLite.
- Las dos sesiones de navegador simulan dispositivos independientes; no equivalen a una prueba física de iPhone/Safari.
- Se ha comprobado el inicio del audio en el navegador, no la latencia acústica real de un teléfono.
- BOE contiene convocatorias, modificaciones, listas y otros documentos. El usuario debe confirmar el documento correcto. La extracción de temas es preliminar y puede no encontrar un programa dentro de anexos/PDF o documentos que remiten a otra publicación. Se impide configurar un temario vacío.
- El catálogo heredado incluye referencias históricas; esta entrega no verifica su vigencia normativa.
- El progreso de otra oposición se conserva en `opposition_history` al cambiar; no hay todavía una pantalla para restaurar esos históricos.
- La planificación usa duraciones orientativas por vuelta; no dispone de cronómetro ni calendario de festivos.
- La dependencia de pruebas Starlette emite un aviso de deprecación de AnyIO; las pruebas pasan. Se mantienen las dependencias de producción originales.
