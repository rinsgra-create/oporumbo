# Desplegar OpoRumbo V19

## 1. Actualizar GitHub

Conserva la rama/copia V18 que ya funciona. El ZIP mantiene `OpoRumbo_V9/` como carpeta de aplicación.

1. Descomprime `OpoRumbo-V19.zip`.
2. En tu repositorio GitHub, abre la carpeta existente `OpoRumbo_V9` en la rama que despliegas.
3. Sube **el contenido** de la carpeta `OpoRumbo_V9` del ZIP. No metas otra carpeta `OpoRumbo_V9` dentro de ella.
4. Comprueba que se incluye el nuevo `app/workload.py` y que se actualizan `planner.py`, `actions.py`, `main.py`, `researcher.py`, `static/app.js`, `static/index.html` y `static/sw.js`.
5. Confirma con un mensaje como `OpoRumbo V19: carga de estudio y ritmo personal`.

El ZIP no contiene credenciales, bases de datos ni dependencias instaladas. No reemplaces tu `DATABASE_URL` ni copies una SQLite de pruebas al despliegue.

## 2. Render

Mantén la configuración actual:

- Root Directory: `OpoRumbo_V9`
- Build: `pip install -r requirements.txt`
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/health`
- La misma `DATABASE_URL` de Neon.

Espera al despliegue automático o usa **Manual Deploy → Deploy latest commit**. La salud debe devolver `{"ok":true,"version":"19.0"}`. No necesitas migraciones SQL, Node en producción ni nuevas variables.

## 3. Comprobación después del despliegue

1. Entra con tu cuenta existente. Comprueba oposición, progreso, notas y mascota.
2. Abre Plan: debe aparecer una estimación inicial si aún no hay cinco sesiones medidas de alguna categoría.
3. Completa una tarea e indica minutos reales. Completa un test con nota y tiempo.
4. Recarga y entra en otra sesión/dispositivo: verifica que siguen guardados y que Plan coincide.
5. Cambia minutos/día y días/semana en Perfil. Comprueba que cambian margen, hitos y alternativas.
6. Selecciona academia y temas del día: deben salir primero. Comprueba que Plan sigue calculando el temario completo.
7. Verifica sonido, animación, movimiento reducido y 3D en tu móvil habitual. Cierra y vuelve a abrir la PWA para renovar estáticos.

Las tareas V18 que ya estaban preparadas se conservan; sus minutos reales se guardan, pero sin base de volumen no se usan para entrenar. Las tareas nuevas V19 aparecen al reorganizar lo pendiente o al cambiar de día. No se fabrican mediciones históricas.

## 4. Si algo falla

Conserva el mensaje de error y el registro del despliegue. Puedes volver al commit V18 desde Render sin restaurar ni borrar la base completa: los campos nuevos son aditivos. Mientras uses V18, sus tareas no alimentarán el nuevo modelo de ritmo. Al volver a V19 se conserva el JSON existente.

## Validación realizada y pendiente

54 pruebas backend y flujo de navegador local con SQLite y Edge/Chromium. La suite sigue verificando conflictos reales de escritura. No se ha conectado a tu Neon de producción ni desplegado en Render. Quedan la comprobación de persistencia con el servicio PostgreSQL real y la prueba física de iPhone/Safari.

Los pesos de normas sin extensión conocida son aproximaciones visibles, no páginas o artículos inventados. Las fechas suponen días de estudio uniformes, sin festivos. Consulta `MODEL_V19.md` para los supuestos completos.
