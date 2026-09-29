# Modelo V19: supuestos y límites

## Volumen y procedencia

`app/workload.py` contiene el cálculo determinista. La fecha se inyecta en `estimate`; la capa de planificación usa Europe/Madrid. No realiza peticiones de red.

Se trabaja al nivel de bloque disponible. El extractor BOE conserva subapartados separados por punto y coma y subepígrafes explícitos numerados o con viñeta. No divide retrospectivamente los bloques de usuarios existentes porque cambiaría los índices de su progreso.

Los pesos son relativos a un bloque medio, no páginas o artículos inventados:

| Evidencia disponible | Regla inicial |
|---|---|
| Peso manual en `block_metadata` | Entre 0,25 y 12 |
| Páginas declaradas | Páginas / 15, limitado a 0,5–12 |
| Rango explícito de artículos | Artículos del rango / 20, limitado a 0,5–12 |
| Capítulo citado | 0,75 |
| Título citado | 1,5 |
| Norma sin alcance delimitado | 2,5, aproximado |
| Varios subapartados en un bloque | 0,6 por subapartado, hasta 4 |
| Sin volumen conocido | 1,0, provisional |

Cada bloque guarda método, peso, tamaño, procedencia de la evidencia, URL cuando existe y procedencia de la estimación. **Un documento oficial no convierte el tiempo inferido en un tiempo oficial.** Una ley completa sin extensión disponible queda marcada como aproximada. No se descarga ni se mide automáticamente el articulado de cada norma citada; no se garantiza extracción de anexos PDF ni de programas remitidos a otra publicación. La confirmación del temario sigue siendo necesaria.

Se admiten metadatos manuales de un temario investigado mediante `topics[i].block_metadata["0"] = {"weight": 2}` o `{ "pages": 30 }`; esta versión no añade un editor visual de esos metadatos.

## Tiempos y aprendizaje

Las constantes de tiempos y multiplicadores están en `CONFIG`:

- Unidad inicial: 60 min de estudio y 15 min de test por peso 1.
- Estudio/repaso por vuelta: 1 / 0,50 / 0,30 / 0,20 / 0,16.
- Test: 1 / 0,90 / 1,10 / 0,80 / 0,70. La tercera refuerza errores y práctica.
- Nota baja aumenta el repaso (hasta ×1,5); nota alta lo reduce (hasta ×0,65), sin eliminarlo.
- En Cabo, inglés y psicotécnicos tienen cada uno una reserva inicial de 10 min por bloque y vuelta. Es una hipótesis de práctica, no un volumen oficial de esos ejercicios. Los bloques explícitos de inglés o psicotécnicos en otros programas usan sus factores personales separados.

Para cada categoría se toma la mediana de `minutos reales / minutos base de la porción`, en sus últimas 60 mediciones. Se limita el factor mediano a 0,25–4 y se mezcla con el valor inicial: `factor = 1 + n/(n+5) × (mediana−1)`. Una medición pesa 1/6; cinco pesan 1/2; veinte pesan 4/5. La mediana evita que una sesión atípica domine una muestra suficiente. Los límites impiden extrapolaciones extremas y pueden infravalorar dificultades excepcionales.

Hay cinco factores: estudio nuevo, repaso, test, inglés y psicotécnicos. Desde cinco mediciones válidas una categoría se marca personalizada. El histórico conserva tema, bloque, tipo, tiempo previsto, base, fracción y tiempo real. Las mediciones de tareas V18 sin fracción conocida se conservan, pero no entrenan el modelo. No se interpreta el tiempo previsto como tiempo real.

Las tareas parciales acreditan fracciones. El estudio y el test se contabilizan por separado; el plan atiende también tests que quedaron atrasados. El usuario confirma haber realizado la porción mostrada. No se mide automáticamente qué páginas ha leído ni su calidad de comprensión.

## Repasos y calendario

Se conserva `review_interval` de V18 y su curva según nota y rachas. Hasta el examen se proyectan los repasos con el intervalo actualmente guardado, sin suponer que una mala nota mejorará por sí sola. Una nota nueva recalcula esa proyección. Por eso una nota baja puede aumentar bastante la carga a largo plazo.

Por bloque, carga pendiente = estudio nuevo + **máximo entre repasos de vueltas y reserva de recuerdos programados** + tests. Las vueltas posteriores absorben la reserva coincidente; solo se suma el exceso. Es una conciliación de presupuestos de tiempo, no un calendario exacto de todas las citas. Al generar el día, no se añade un repaso separado para el bloque ya cubierto por academia y su test.

Los días de estudio son `floor(días naturales × días/semana / 7)`, suponiendo distribución uniforme; no se conocen días de la semana concretos ni festivos. Se excluye el día del examen. El colchón final reserva el 10% de los días estimados, hasta siete días. Se descuenta de la capacidad disponible y se incluye al calcular el ritmo necesario.

Los hitos usan la carga acumulada de cada vuelta y descuentan de la capacidad diaria la parte de repasos adicionales proporcional al horizonte. Son fechas orientativas; si la carga recurrente absorbe toda la disponibilidad, no se inventa fecha. Las vueltas posibles se calculan hasta cinco. Un resultado de cinco se muestra como «cinco o más».

Las alternativas vuelven a calcular minutos/día y días útiles con un día semanal adicional. El porcentaje de tercera selectiva se refiere a **porcentaje de carga temporal**, no porcentaje garantizado de temas. Se propone atender primero lo débil. Una fecha ausente o sin días útiles produce un valor no disponible, nunca un horizonte ficticio de 180 días.

El margen al examen usa la disponibilidad actual menos la carga actual. El avance respecto al plan inicial compara trabajo base acreditado con el trabajo previsto desde su fecha de inicio; se fija antes de aprender nuevos factores. Así una mala nota cambia la carga pendiente, pero no se convierte por sí sola en horas de retraso.

Academia fija primero hasta dos temas del día, como límite de interfaz V18; el temario restante y todas las vueltas siguen en el cálculo maestro. Los demás temas seleccionados quedan guardados. No se dispone de un calendario futuro de la academia: su efecto se refleja a medida que se registra el trabajo.

## Compatibilidad y persistencia

Todo se añade al JSON existente: `pacing` (schema 1, sesiones), `workload_weights`, `workload_anchor`, `practice_credit`, `block_coverage`, `test_coverage` y crédito de repasos. No cambian tablas ni credenciales. Lecturas antiguas usan valores por defecto y el prefijo `block` o `block_passes` existente. No se reinician usuarios, sesiones ni oposición actual.

La finalización guarda tiempo, nota, avance y recompensa en la misma escritura condicional V18. El reintento no duplica sesiones; deshacer la última tarea retira su medición. El cambio de oposición archiva el histórico y reinicia los factores del nuevo programa. La pantalla usa datos recalculados al leer, completar, configurar y reorganizar; no confía en estimaciones antiguas de otro dispositivo.

## Alcance de la validación

Los coeficientes son hipótesis iniciales de producto, no un modelo psicométrico validado. La personalización mejora el ajuste al tiempo comunicado, pero no permite prometer aprobados ni precisión en minutos. La interfaz usa «unas», «orientativo» y procedencia visible. El cálculo mantiene números deterministas para comparar cambios sin ruido.
