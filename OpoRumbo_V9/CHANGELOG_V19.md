# Cambios V19

Base: `rinsgra-create/oporumbo`, revisión `e8025b2674999fec643dc221cb86cf39092e1d85` (V18 publicada).

## Añadido

- Motor aislado `app/workload.py`: pesos trazables, tiempos por vuelta y factores personales independientes.
- Registro opcional de minutos reales al completar cualquier tarea; en tests, junto a la nota.
- Aprendizaje robusto y gradual, histórico persistente por bloque/tema/tipo y distinción inicial/personalizada.
- Vista Plan: horas, minutos/día, vueltas posibles, margen/déficit, hitos, reserva final y alternativas calculadas. Desglose de pesos y factores plegado.
- Avance parcial por bloque, cobertura de test independiente y planificación del test pendiente.
- Esquema aditivo en el JSON existente y conservación de historial al cambiar de oposición.
- Subbloques BOE explícitos sin cambiar índices de programas ya guardados.

## Ajustado

- Academia se coloca primero; los repasos se organizan alrededor y el cálculo maestro conserva todas las vueltas.
- Las notas afectan al volumen futuro de repaso. La reserva de repaso se concilia con las vueltas para evitar sumarla dos veces.
- Las estimaciones se recalculan también al leer el progreso y cambiar disponibilidad.
- Hoy incorpora únicamente una línea de ritmo; los detalles están en Plan.
- La caché estática pasa a V19; la API conserva `no-store`.

## Conservado

No se modifica `db.py`, dependencias de producción, Render, auth ni los archivos de escena/modelo/HTML 3D y Three.js. Se conservan las comprobaciones de conflicto entre dispositivos, idempotencia, reintento sin conexión, guardado atómico, sonido, preferencias y separación de interfaz V18.

## Pruebas

54 pruebas backend aprobadas, incluidas las 21 heredadas. La expectativa de orden de academia se actualiza al requisito V19; sus controles de presupuesto y número de tareas se mantienen.

Cobertura nueva: 0/1/5/20 sesiones, mezcla con prior, valores atípicos, categorías independientes, bloques cortos/largos, procedencia oficial/inferida/manual, notas bajas/altas, reserva sin doble suma, 2/3/4 vueltas, examen cercano/pasado, alternativas, disponibilidad, ritmo, academia, fracciones, tests atrasados, persistencia entre sesiones, deshacer, reintentos, archivo de oposición y cinco días de aprendizaje mediante API.

Flujo de navegador: alta/configuración, minutos reales, nota 42, recarga y segunda sesión, Plan móvil/escritorio, sonido antes de respuesta retrasada, WebGL, pausa del 3D, reintento sin red, caché sin API, fallback de 3D, deshacer y anchos 320/390/1440. Sin errores JavaScript.

Las pruebas usan SQLite aislada y Edge/Chromium. Neon/Render de producción e iPhone/Safari físicos requieren comprobación tras desplegar. El BOE externo no fue accesible desde la instancia local de pruebas; se verificaron su parser/formulario con respuestas controladas y la continuación por catálogo con aviso. No se ha publicado ni desplegado esta entrega.
