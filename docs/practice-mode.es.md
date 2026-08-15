# Modo Práctica: repetición espaciada para la geometría del diapasón

> *Traducción de [practice-mode.md](practice-mode.md), sincronizada a 2026-08-15. Ante cualquier discrepancia, el original en inglés es la referencia.*

Este documento explica cómo el Modo Práctica enseña el diapasón: qué considera una unidad de conocimiento, cómo funciona el planificador de repetición espaciada, cómo se arma una sesión y cómo todo ello se conecta al widget Fretboard existente sin perturbar los modos Escala ni Acorde.

Audiencia: una persona desarrolladora nueva en esta parte del proyecto. No se asume más teoría musical que "un intervalo es una distancia entre dos notas".

---

## 1. El problema

Aprender el diapasón se enseña normalmente como **memorizar formas en posiciones**: las cinco cajas pentatónicas, las formas de acorde CAGED. Eso funciona para tocar, pero fracasa estrepitosamente como material de repetición espaciada:

- Una caja en una tonalidad es un único ítem enorme. No hay nada que planificar con una granularidad útil.
- Practicar la caja 1 en La menor enseña *números de traste*, no la forma. Cambia a Do menor y el conocimiento no se transfiere.
- Planificar "(cuerda, traste) en la tonalidad X" da unos 360 ítems. El mazo nunca converge.

Lo que una guitarrista realmente necesita saber, y lo que sí generaliza, es **cómo ir de una nota a otra**: desde esta nota, ¿dónde está la 5ª? ¿Dónde está la misma nota una octava arriba? Esa es la unidad que planifica el Modo Práctica.

La idea que lo hace posible es pequeña y exacta:

> Moverse de la cuerda `from` a la cuerda `to` con un desplazamiento de trastes `delta` produce siempre el mismo intervalo, **independientemente del traste desde el que partas**.

Ir de la quinta cuerda a la sexta en el mismo traste da la 5ª tanto en el traste 3 como en el 12. El movimiento es, por tanto, independiente de la transposición *y* de la posición: un ítem genera preguntas ilimitadas, así que quien aprende no puede memorizar la pregunta en lugar de la respuesta.

`fretboardMoves.test.ts` verifica esto de forma exhaustiva sobre cada combinación de (par de cuerdas × delta × traste inicial) en una guitarra estándar. Si ese test llega a fallar, todo el diseño del mazo se ha derrumbado y nada más en este documento se sostiene.

---

## 2. La geometría

Un movimiento queda descrito por completo con cuatro números:

```ts
interface MoveSpec {
    from: number;      // índice de cuerda (0 = la primera dibujada; Mi agudo en guitarra estándar)
    to: number;        // índice de cuerda
    delta: number;     // trastes a sumar en la cuerda de destino
    interval: number;  // clase de semitonos 0-11 que produce el movimiento
}
```

Y toda la teoría cabe en una línea (`fretboardMoves.ts`):

```ts
const intervalOf = (pitches, from, to, delta) =>
    (((pitches[to] + delta) - pitches[from]) % 12 + 12) % 12;
```

`pitches` es el valor absoluto en semitonos de cada cuerda al aire, con los offsets de afinación ya aplicados. Pasar los pitches en lugar de un nombre de instrumento es deliberado: así las afinaciones alteradas, las guitarras de rango extendido y el bajo quedan cubiertos *por construcción* en vez de por casos especiales.

### 2.1 La tabla de movimientos adyacentes

Para una guitarra estándar de 6 cuerdas, moviéndose una cuerda hacia los graves:

|            | d+0 | d+1 | d+2 | d+3 | d+4 |
|------------|-----|-----|-----|-----|-----|
| cue1 → cue2 | 5  | b6  | 6   | b7  | 7   |
| cue2 → cue3 | b6 | 6   | b7  | 7   | 1   |
| cue3 → cue4 | 5  | b6  | 6   | b7  | 7   |
| cue4 → cue5 | 5  | b6  | 6   | b7  | 7   |
| cue5 → cue6 | 5  | b6  | 6   | b7  | 7   |

Leído al revés: qué desplazamiento realiza un intervalo dado:

```
  5ª    cue1>cue2: +0   cue2>cue3: -1   cue3>cue4: +0   cue4>cue5: +0   cue5>cue6: +0
  3ª    cue1>cue2: -3   cue2>cue3: -4   cue3>cue4: -3   cue4>cue5: -3   cue5>cue6: -3
  4ª    cue1>cue2: -2   cue2>cue3: -3   cue3>cue4: -2   cue4>cue5: -2   cue5>cue6: -2
```

### 2.2 El quiebre, y por qué se deriva

Los intervalos entre cuerdas adyacentes en una guitarra estándar son `[5, 4, 5, 5, 5]` semitonos. **El par Si/Sol es el único irregular**, y desplaza *todos* los intervalos exactamente un traste. Toda la dificultad del diapasón de la guitarra es una regla con una excepción.

Esto se deriva de la afinación, nunca se codifica a mano (`getIrregularPairs`):

| Instrumento | Intervalos adyacentes | Pares irregulares |
|---|---|---|
| Guitarra 6 (estándar) | `[5, 4, 5, 5, 5]` | solo Si/Sol |
| Guitarra 7 / 8 | `[5, 4, 5, 5, 5, …]` | solo Si/Sol |
| Bajo 4 | `[5, 5, 5]` | **ninguno** — cuartas uniformes |
| Guitarra 6, Drop D | `[5, 4, 5, 5, 7]` | Si/Sol **y** La/Re |

Codificar a mano "Si/Sol es especial" produciría silenciosamente ejercicios erróneos en Drop D e inventaría una dificultad que en el bajo no existe.

Nótese que **el planificador tampoco trata el quiebre como caso especial**. Esos ítems acumulan fallos y pierden facilidad por sí solos, así que un SM-2 corriente los saca a la superficie más a menudo. `getIrregularPairs` existe para que la *interfaz* pueda enseñar la regla, no para que el algoritmo la compense.

### 2.3 Elegir el desplazamiento

`findDelta` normaliza a `(-6, 6]`: el menor movimiento de mano. Un desplazamiento de exactamente 6 queda igual de lejos en ambas direcciones y se canoniza en positivo, de modo que los anclajes graves sigan cayendo dentro del mástil.

Minimizar el *desplazamiento de trastes* en vez de la *distancia de altura* es lo que importa. Una 3ª mayor de la cuerda 1 a la 2 es `delta = +9` si insistes en que la 3ª esté por encima del anclaje, y `delta = -3` si aceptas la instancia más cercana. La segunda es la forma que una mano hace de verdad.

Cuando el desplazamiento canónico se sale del mástil, `deltaAlternatives` devuelve las opciones desplazadas por octavas, de la más cercana a la más lejana. En la práctica `FRETS = 18` y `|delta| ≤ 6`, así que siempre existe un anclaje jugable; la función es la vía de escape documentada para mástiles cortos y una futura palanca de dificultad.

---

## 3. Visión general del sistema

```
 shared/lib/music/fretboardMoves.ts        (geometría pura, sin React, sin storage)
 ┌──────────────────────────────────────────────────────────────┐
 │ getOpenStringPitches  instrumento + afinación -> semitonos    │
 │ intervalOf / findDelta  la biyección movimiento <-> intervalo │
 │ enumerateMoves        mazo para {intervals, skips}            │
 │ getIrregularPairs     deriva el quiebre Si/Sol de la afinación│
 │ playableAnchorFrets   geometría de los límites del mástil     │
 │ makeContextKey        separa el progreso por afinación        │
 └──────────────────────────────────────────────────────────────┘
     │ MoveSpec[]                                   │ contextKey
     ▼                                              ▼
 shared/lib/srs/deck.ts                     shared/lib/srs/storage.ts
 ┌────────────────────────────────┐         ┌──────────────────────┐
 │ selectSessionItems  pend.+nuevo│         │ localStorage         │
 │ takeNext            encadenado │◀────────│ 'fretboard-srs-v1'   │
 │ submitAnswer        reencolado │  cards  │ contexts[key][id]    │
 │ generateQuestion    anclajes   │         └──────────────────────┘
 └────────────────────────────────┘                   ▲
     │ Question                                       │ SrsCard
     ▼                                                │
 shared/lib/srs/scheduler.ts ─────────────────────────┘
 ┌──────────────────────────────────────────────────────────────┐
 │ gradeFromLatency  acierto + tiempo de respuesta -> Grade      │
 │ review            variante SM-2, pura, nunca muta             │
 │ getStrength       0..1 para un futuro mapa de calor           │
 └──────────────────────────────────────────────────────────────┘
     │
     ▼
 pages/PracticeMode/ui.tsx   ──prop practice──▶  widgets/Fretboard
                                                 └─▶ entities/note/FretCell
```

Todos los módulos por debajo de la página son puros: sin React, sin DOM, sin temporizadores. Eso es lo que hace posibles los 98 tests de `fretboardMoves.test.ts`, `scheduler.test.ts`, `deck.test.ts` y `storage.test.ts` sin renderizar nada.

---

## 4. El mazo

### 4.1 Identidad de un ítem

Un ítem es un movimiento, con clave `"{from}>{to}:{interval}"`; por ejemplo `4>5:7` es "de la cuerda 5 a la 6, la 5ª".

Los ítems se separan por contexto de afinación (`makeContextKey`):

```
GUITAR-6                    estándar
GUITAR-6-0.0.0.0.0.-2       Drop D
BASS-4                      bajo
```

`4>5:7` significa un movimiento *distinto* tras una reafinación, así que el historial de repasos no debe arrastrarse. Reafinar bifurca el mazo en lugar de migrarlo: el progreso en afinación estándar queda intacto y sin tocar, y se empieza un mazo nuevo para la nueva geometría.

### 4.2 Etapas

Cada etapa añade intervalos a la anterior, de modo que una etapa posterior repasa todo lo ya construido. `STAGE_ORDER` es la progresión prevista:

| Etapa | Intervalos añadidos | Tamaño del mazo (skips `[1]`) |
|---|---|---|
| `ROOT_AND_FIFTH` | 5ª, unísono/octava | 20 |
| `TRIADS` | 3ª mayor, 3ª menor | 40 |
| `PENTATONIC` | 4ª, 7ª menor | 60 |
| `FULL_SCALE` | 2ª, 6ª, 7ª mayor | 90 |

Un test verifica que cada etapa es un superconjunto estricto de la anterior. Veinte ítems en la etapa 1 es una primera sesión genuinamente completable, lo cual importa más de lo que parece: que alguien vuelva el segundo día es todo el juego.

### 4.3 Salto de cuerdas

`skips` es un array, no un máximo: `[1, 2]` practica movimientos adyacentes *y* de dos cuerdas, mientras que `[2]` a solas aísla las formas de octava. El número de pares ordenados para un salto *k* sobre *n* cuerdas es `2 × (n − k)`.

| Instrumento | `skips: [1]` | `skips: [1, 2]` |
|---|---|---|
| Guitarra 6 | 10 pares | 18 pares |
| Guitarra 8 | 14 pares | 26 pares |

La interfaz ofrece `1 … min(4, stringCount − 1)`. Cruzar más de cuatro cuerdas deja de ser una forma que nadie use, y el selector se adapta solo a instrumentos de rango extendido. Deseleccionar el último salto activo se rechaza: un mazo vacío no deja un estado de interfaz recuperable.

---

## 5. Planificación

`scheduler.ts` es una variante de SM-2 con dos desviaciones respecto a la planificación de fichas, ambas impuestas por la naturaleza de lo que se aprende.

### 5.1 La calificación es automática

Un toque es objetivamente correcto o incorrecto, y la app lo cronometra, así que no hay botón de "¿cómo de bien te lo sabías?". **La latencia es la señal**: un conocimiento del diapasón que tarda cuatro segundos no sirve en mitad de una frase, así que una respuesta correcta pero lenta se trata deliberadamente como débil.

| Respuesta | Calificación | Efecto |
|---|---|---|
| Incorrecta, a cualquier velocidad | `AGAIN` | `reps → 0`, `lapses++`, `ease − 0.20`, intervalo 0 |
| Correcta, ≤ 1500 ms | `EASY` | `ease + 0.05`, intervalo `× ease × 1.3` |
| Correcta, ≤ 3000 ms | `GOOD` | intervalo `× ease` |
| Correcta, > 3000 ms | `HARD` | `ease − 0.15`, intervalo `× 1.2` |

La facilidad se acota a `[1.3, 2.8]` desde un valor por defecto de 2.5. Los dos primeros aciertos usan pasos fijos (`GOOD`: 1 y luego 3 días; `EASY`: 2 y luego 5) porque componer por la facilidad desde un intervalo de 0 nunca saldría del primer día.

Un fallo reinicia la escalera pero **conserva la facilidad, el recuento de fallos y el historial de velocidad**, de modo que una tarjeta que ha fallado repetidamente sigue apareciendo permanentemente más a menudo que una nueva. Un fallo no borra un historial fluido.

### 5.2 Dos escalas de tiempo

Los intervalos a escala de días deciden únicamente **qué ítems entran en una sesión**. Repetir *dentro* de una sesión es tarea de `deck.ts`.

Este es el error a evitar al llevar la planificación de fichas a un instrumento. Una sesión de práctica dura de 10 a 30 minutos; un planificador que responde "dentro de 4 días" terminaría la sesión tras una docena de toques. La cola de sesión aporta el bucle corto (§6) y el planificador el largo.

### 5.3 Señales derivadas

```ts
getStrength(card)   // 0..1 — 60% madurez del calendario (intervalo/21) + 40% velocidad
isMastered(card)    // reps >= 3 && intervalDays >= 3 && avgMs <= 1500
```

`getStrength` mezcla calendario y velocidad a propósito: una tarjeta simplemente *programada* muy a futuro pero respondida con lentitud no debería leerse como dominada. `avgMs` es una media móvil exponencial (peso 0,3 sobre la muestra más reciente) solo sobre respuestas correctas.

Todavía nada dibuja `getStrength`; véase §9.

---

## 6. La sesión

### 6.1 Armado

`selectSessionItems` devuelve todo lo pendiente (lo más antiguo primero, con empates resueltos por id para que sea reproducible) y luego movimientos nuevos hasta un tope:

```ts
DEFAULT_SESSION_CONFIG = { maxItems: 20, maxNew: 4, lapseRequeueGap: 5 }
```

**El tope de ítems nuevos es la protección más importante de todo esto.** Introducir movimientos nuevos sin límite resulta productivo el primer día y entierra a quien aprende bajo una avalancha de repasos para el cuarto. Cuatro por sesión es conservador a propósito: el fallo que evita es mucho peor que el que provoca.

### 6.2 Recorrido, no barajado

Una sesión es un paseo por el mástil. Cada respuesta correcta deja a quien aprende de pie sobre la nota que acaba de encontrar, y el siguiente movimiento parte de ahí:

```
  anclaje: cue1 traste15 (Sol)   "-> 5ª justa, en la cuerda 2"
      toca cue2 traste15 (Re)    correcto
  anclaje: cue2 traste15 (Re)    "-> 5ª justa, en la cuerda 3"
      toca cue3 traste14 (La)    correcto     <- fíjate en el -1: cruce Si/Sol
  anclaje: cue3 traste14 (La)    ...
```

`takeNext` busca en la cola un ítem que parta de donde está quien aprende y lo rota al frente; si nada encadena, toma la cabeza de la cola y reancla. Preferir en lugar de exigir mantiene el paseo natural sin llegar nunca a atascar la cola.

Las celdas de la cuerda de destino son las únicas pulsables. La pregunta es por tanto *qué traste en esta cuerda*, que es exactamente el ítem planificado; y además impide esquivar el cruce Si/Sol para evitar el caso difícil.

### 6.3 Los errores reanclan

Un fallo revela la posición correcta, reencola el ítem `lapseRequeueGap` preguntas más adelante y **limpia el anclaje**, de modo que la siguiente pregunta empiece en un sitio conocido. Sin esto, un solo error en cadena provocaría una serie de preguntas planteadas desde el lugar equivocado.

El reencolado es el bucle intra-sesión que los intervalos a escala de días no pueden dar. Un test recorre una sesión completa fallando cada ítem una vez y verifica que la cola aun así se vacía.

### 6.4 Ritmo

Una respuesta correcta avanza sola tras 650 ms. Un fallo espera a un **Continuar** explícito: quien aprende necesita tiempo para mirar dónde estaba realmente la nota, y robarle ese momento anula el sentido de revelarla.

---

## 7. Integración con la interfaz

### 7.1 Por qué no una capa superpuesta

El enfoque obvio —posicionar en absoluto una capa de examen sobre el diapasón usando los ids de DOM `fret-${cuerda}-${traste}` existentes, como hace la superposición de medición de intervalos— se descartó. Esa superposición depende de un `setTimeout(50)` más un listener de resize para mantenerse alineada, lo cual ya es bastante frágil de por sí.

En su lugar, el propio diapasón renderiza la pregunta, mediante una única prop contenida:

```ts
interface PracticeLayer {
    cellStates: Map<string, PracticeCellState>;  // clave "stringIndex-fret"
    onCellClick: (stringIndex: number, fret: number) => void;
    locked: boolean;
}
```

Pasar `practice` sobrescribe `isActive` por celda y suprime la interacción de medición, que si no competiría por los mismos clics. `PracticeMode` pasa `scaleNotes={[]}` para que no se ilumine nada más, y `selectedRoot={anchorNote}` para que las etiquetas de intervalo existentes se rendericen *relativas a donde está quien aprende*: ninguna lógica de intervalos nueva.

### 7.2 Estados de celda

| Estado | Marcador | Significado |
|---|---|---|
| `ANCHOR` | visible, con anillo | dónde está quien aprende |
| `CANDIDATE` | **oculto** | pulsable; encontrarlo es la pregunta |
| `CORRECT` | visible, verde | el toque, y fue correcto |
| `WRONG` | visible, rojo | el toque, y fue incorrecto |
| `REVEAL` | visible, ámbar | la respuesta, mostrada solo tras un fallo |

Las celdas `CANDIDATE` no llevan marcador, y los marcadores ocultos tienen `pointer-events: none`. El área pulsable debe vivir por tanto en el propio div `.fret`: por eso `FretCell` ganó una prop `onPracticeClick` en lugar de reutilizar la ruta de clic del marcador de nota.

Mientras está `locked` (tras responder, antes de avanzar) la cuerda de destino sigue iluminada para conservar el contexto, pero deja de anunciarse como pulsable, para no invitar a toques que ya no se aceptan.

### 7.3 Dos trampas

**`FretCell` está memoizado con un comparador escrito a mano.** Cualquier prop nueva ausente de él falla silenciosamente al re-renderizar. El Modo Práctica añadió dos líneas: `practiceState` y una comprobación de identidad `!!onPracticeClick`. La segunda no es opcional: ese callback alterna entre un manejador y `undefined` según las celdas se vuelven respondibles, y omitirlo congela las celdas sin poder pulsarlas a mitad de sesión.

**El estado de sesión se reinicia durante el render, no en un efecto.** `PracticeRun` es un único objeto consolidado que lleva una `signature` del mazo al que pertenece; una discrepancia lo reconstruye en el acto. Un efecto pintaría un fotograma con la pregunta del mazo *anterior* tras cambiar de etapa. Este es el patrón sancionado por React de "ajustar el estado cuando cambia una prop" y además mantiene el código nuevo libre de `react-hooks/set-state-in-effect`.

El tiempo de respuesta se mide desde un efecto ligado a la pregunta, de modo que la latencia refleja cuándo quien aprende pudo *ver* la pregunta y no cuándo se actualizó el estado.

---

## 8. Persistencia

Una sola entrada de `localStorage`, `fretboard-srs-v1`, separada por contexto de afinación:

```jsonc
{
  "version": 1,
  "contexts": {
    "GUITAR-6": {
      "0>1:7": { "id": "0>1:7", "ease": 2.55, "intervalDays": 2,
                 "due": 1786979309360, "reps": 1, "lapses": 0, "avgMs": 969.3 }
    }
  }
}
```

El almacén degrada en lugar de lanzar excepciones: JSON corrupto, una `version` futura y objetos de tarjeta malformados caen a un mazo vacío; los errores de cuota y los `SecurityError` del modo privado se capturan para que la práctica siga funcionando cuando lo único que se pierde es el historial. Subir de versión es un solo borrado.

---

## 9. Limitaciones actuales

- **No hay mapa de calor.** `getStrength` devuelve el valor 0..1 que necesitaría un mapa de memoria sobre el diapasón, pero nada lo dibuja. El progreso solo es visible dentro de una sesión, que es la parte más floja de la gamificación actual.
- **Las bandas de latencia son conjeturas.** 1500 ms / 3000 ms son puntos de partida razonables, sin contrastar contra la práctica real. Son constantes exportadas precisamente para poder reajustarlas cuando haya datos de uso.
- **El ukelele no está soportado.** La afinación reentrante rompe la premisa "índice de cuerda mayor = altura menor"; la derivación produce disparates. O se ordenan las cuerdas por altura, o el Modo Práctica se limita a guitarra y bajo.
- **Un solo formato de pregunta.** Solo existe "encuentra la nota". La dirección inversa —*nombrar* el intervalo entre dos notas iluminadas— daría al planificador una segunda vista de cada ítem, y la superposición de medición ya implementa buena parte de ella.
- **Sin variedad por octavas.** `deltaAlternatives` existe, pero las preguntas siempre usan el desplazamiento canónico, así que un mismo ítem siempre se ve igual en el diapasón.
- **La longitud de sesión es fija** en 20 ítems, en vez de adaptarse a cómo lo esté haciendo quien aprende.

---

## 10. Hoja de ruta

Ordenada aproximadamente por valor esperado por esfuerzo.

1. **Mapa de calor del diapasón** — dibujar `getStrength` sobre el diapasón del modo Escala mediante una custom property `--strength`, replicando cómo `--octave` ya controla la luminosidad OKLCH en `NoteMarker.css`. Hace visible el progreso sobre la cosa que se está aprendiendo, fuera de una sesión de práctica. Barato; el mayor impacto de todo lo listado aquí.
2. **Preguntas de "nombra el intervalo"** — dos notas iluminadas, elegir en un teclado de grados. Reutiliza `getDetailedInterval` y la superposición de medición. Da a cada ítem una vista de recuerdo *y* otra de reconocimiento.
3. **Enseñar el quiebre explícitamente** — una explicación puntual alimentada por `getIrregularPairs`, mostrada la primera vez que quien aprende se topa con un cruce Si/Sol. Los datos ya se derivan; solo falta la presentación.
4. **Preguntas encadenadas de varios saltos** — "construye una tríada mayor desde aquí" como tres saltos calificados. Material de la etapa 2 en adelante, que ejercita varios ítems por pregunta.
5. **Ajustar las bandas de latencia** contra sesiones reales; considerar hacerlas por persona (un percentil de su propio historial) en lugar de absolutas.
6. **Longitud de sesión adaptativa** — terminar con una respuesta sólida en vez de con un recuento fijo, y acotar también por tiempo de reloj además de por número de ítems.

---

## 11. Trabajar sobre esto

```bash
npx vitest run src/shared/lib/music/fretboardMoves.test.ts src/shared/lib/srs
```

La capa pura está cubierta por completo (98 tests) y es rápida. Puntos que conviene conocer:

- **`fretboardMoves.test.ts` verifica de forma exhaustiva la independencia del traste.** Trata un fallo ahí como una regresión de diseño, no como un bug.
- Los tamaños de mazo esperados (`20 / 40 / 60 / 90`) están verificados, así que cambiar `STAGES` fallará de forma ruidosa y deliberada.
- `deck.test.ts` recorre sesiones enteras —todo correcto, todo fallado una vez, anclajes aleatorios— y verifica que cada pregunta generada cae dentro del mástil.
- Los tests de almacenamiento cubren payloads corruptos, discrepancia de versión, fallo de cuota y fallo de lectura.

Para probar la interfaz: `npm run dev` y abre **Práctica**. Ten en cuenta que `useIsMobile()` lee `matchMedia('(max-width: 600px)')`, que da positivo cuando un viewport headless reporta 0×0; fija un tamaño de viewport explícito antes de concluir que el layout de escritorio está roto.
