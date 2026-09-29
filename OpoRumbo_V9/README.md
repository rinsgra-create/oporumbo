# OpoRumbo V19 — carga y ritmo personal

Evolución de la V18 publicada en `rinsgra-create/oporumbo`, base `e8025b2674999fec643dc221cb86cf39092e1d85`. Conserva la aplicación, las mascotas y la persistencia existente.

## Uso

1. Configura o conserva tu oposición en Perfil. Ajusta examen, minutos/día, días/semana y vueltas.
2. Organiza el día. Al completar una tarea, indica cuánto tardaste. Es opcional: dejarlo vacío nunca inventa una medición. En los tests se recoge junto con la nota.
3. Abre **Plan** para consultar horas pendientes, minutos/día para 2/3/4 vueltas, margen, hitos y alternativas. Los detalles de pesos y ritmo están plegados.
4. A partir de cinco sesiones de una categoría se indica que esa parte está personalizada. Las demás conservan su estimación inicial.

Una tarea parcial representa la fracción indicada del bloque. Completarla no acredita automáticamente un bloque entero. Los planes V18 ya guardados se conservan; al reorganizar o cambiar de día se generan tareas V19.

## Documentación y despliegue

- [Modelo y supuestos](MODEL_V19.md)
- [Cambios](CHANGELOG_V19.md)
- [Guía de despliegue y validación](DEPLOY_V19.md)

No hay nuevas dependencias de producción ni migraciones SQL. `DATABASE_URL`, auth, Neon, Render, sonido y escena 3D conservan su arquitectura V18.

## Pruebas

Con Python 3.12, instala `requirements-dev.txt` y ejecuta `python -m pytest -q`. La suite usa SQLite temporal independiente de producción.

Para navegador, inicia `uvicorn app.main:app --host 127.0.0.1 --port 8765` con `DATABASE_URL` apuntando a una SQLite local de pruebas. Instala las dependencias de `package.json`, ejecuta `npx playwright install chromium` y `npm run test:e2e`. El flujo crea cuentas locales. `BROWSER_CHANNEL=msedge` permite usar Edge; `PLAYWRIGHT_MODULE` y `TEST_OUTPUT_DIR` son opciones de las pruebas.
