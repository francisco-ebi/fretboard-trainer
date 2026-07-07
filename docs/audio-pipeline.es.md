# Pipeline de audio y modelo de clasificación de cuerdas

> *Traducción de [audio-pipeline.md](audio-pipeline.md), sincronizada a 2026-07-07. Ante cualquier discrepancia, el original en inglés es la referencia.*

Este documento explica cómo Fretboard Trainer escucha una guitarra y predice **en qué cuerda se tocó una nota**. Cubre la ruta completa de la señal, cada feature que alimenta a la red neuronal, los flujos de entrenamiento e inferencia, las limitaciones conocidas y la hoja de ruta de mejoras.

Audiencia: una persona desarrolladora nueva en el proyecto. Las secciones de visión general no asumen conocimientos de DSP; las secciones de features incluyen la física subyacente donde importa.

---

## 1. El problema

Detectar *qué nota* se tocó es fácil — un detector de pitch te da la frecuencia fundamental (f0). El problema difícil es que **el mismo pitch existe en varios lugares del diapasón**: C3 (~130.8 Hz) puede tocarse en la cuerda 6 traste 8 o en la cuerda 5 traste 3. Misma f0, mismo cuerpo de guitarra, misma sala.

Lo que de verdad difiere entre esos dos C3 es la **propia cuerda**:

| Causa física | Consecuencia audible |
|---|---|
| Calibre, entorchado y rigidez de la cuerda | Los parciales se desvían de los armónicos perfectos (**inarmonicidad**) |
| Longitud vibrante (traste más alto en una cuerda más gruesa) | Distinta velocidad de decaimiento y envolvente de brillo |
| El transitorio de la pulsación interactuando con la cuerda | Distinto espectro de ataque |

El trabajo de la red neuronal es leer esas diferencias en secuencias cortas de features y devolver una de 6 clases de cuerda. El pitch detectado da entonces el traste gratis: `fret = midi − openStringMidi`.

---

## 2. Visión general del sistema

```
 micrófono
     │  getUserMedia (mono, AGC/eco/supresión de ruido DESACTIVADOS)
     ▼
 Hilo del AudioWorklet (tiempo real, presupuesto ~2.7ms por quantum)
 ┌───────────────────────────────────────────────────────────┐
 │ audio-capture-processor.ts                                │
 │   copia cada quantum de 128 muestras al ring SAB de       │
 │   audio crudo — nada más corre en el hilo de audio        │
 └───────────────────────────────────────────────────────────┘
     │  SAB de audio crudo (~1.4s de capacidad, sin bloqueos)
     ▼
 Worker de features (sin tiempo real; uno por backend)
 ┌───────────────────────────────────────────────────────────┐
 │ {essentia|meyda}-feature-worker.ts → base-feature-worker  │
 │   bucle de drenado de 10ms → feature-extraction-loop.ts:  │
 │     ventana de 2048 muestras, salto de 1024 (50% de       │
 │     solape, ~23ms)                                        │
 │     → puerta RMS adaptativa (sigue el suelo de ruido)     │
 │       + onsets                                            │
 │     → backend.process(ventana) ── null → frame descartado │
 │         EssentiaBackend / MeydaBackend (el WASM vive aquí)│
 │   → Float32Array[23] al ring SAB de features              │
 └───────────────────────────────────────────────────────────┘
     │  SAB de features (requiere aislamiento cross-origin)
     ▼
 Hilo principal (sondeo cada 16ms)
 ┌───────────────────────────────────────────────────────────┐
 │ recording-engine.ts        prediction-engine.ts           │
 │   etiqueta y guarda          arma secuencias → normaliza  │
 │   secuencias → descarga      → modelo TF.js → máscara de  │
 │   del dataset JSON           viabilidad → estabilización  │
 │                              con RxJS                     │
 └───────────────────────────────────────────────────────────┘
     │                              │
     ▼                              ▼
 model.ts (entrenamiento, TF.js)  UI del diapasón (PredictionOverlay)
```

### 2.1 Por qué la extracción vive en un Worker (cambio de arquitectura, 2026-07)

La extracción de features corría originalmente **dentro del callback `process()` del AudioWorklet**. Ese callback tiene un presupuesto duro de tiempo real (128 muestras ≈ 2.7ms a 48kHz); la cadena de essentia (dos enventanados, dos FFTs, YIN, MFCC, picos espectrales, ajuste de parciales) podía excederlo en dispositivos lentos, provocando glitches en el hilo de audio y perdiendo justo la entrada que se estaba analizando.

**Antes — el DSP en el hilo de tiempo real:**

```
 Hilo de audio (plazo duro de 2.7ms)          Hilo principal
 ┌─────────────────────────────────┐          ┌──────────────────┐
 │ recorder-processor              │ features │ engines: sondeo, │
 │  acumular → ventana → puerta →  │──SAB────▶│ secuencias,      │
 │  ⚠ TODO EL DSP (FFTs WASM, YIN,│          │ modelo           │
 │    MFCC, picos, ajuste de B) ⚠ │          └──────────────────┘
 └─────────────────────────────────┘
   incumplir el plazo → glitches de audio → ventanas de entrada corruptas
```

**Después — el hilo de tiempo real solo copia muestras:**

```
 Hilo de audio (plazo 2.7ms)      Worker (sin plazo)                Hilo principal
 ┌───────────────────────┐ audio ┌───────────────────────┐ frames  ┌────────────────┐
 │ audio-capture-        │ crudo │ worker de features:   │ de      │ engines:       │
 │ processor: copia 128  │──SAB─▶│ ventana → puerta →    │ features│ sondeo,        │
 │ muestras y retorna    │ ~1.4s │ DSP (FFTs WASM, YIN,  │──SAB───▶│ secuencias,    │
 └───────────────────────┘ búfer │ MFCC, picos, ajuste B)│         │ modelo, UI     │
   siempre cumple el plazo       └───────────────────────┘         └────────────────┘
                                   ¿dispositivo lento? el trabajo se
                                   encola en el ring de 1.4s en vez
                                   de producir glitches
```

Qué se movió a dónde:

| Responsabilidad | Antes | Después |
|---|---|---|
| Captura de muestras | worklet | worklet (`audio-capture-processor.ts`, ~4KB, sin asignaciones de memoria) |
| Enventanado, puerta, onset | worklet | Worker (`feature-extraction-loop.ts`, puro y con tests unitarios) |
| Extracción de features (WASM) | worklet | Worker (`base-feature-worker.ts` + entradas por backend) |
| Coste de inicialización del backend | hilo de audio | Worker |
| SAB de features → engines | sin cambios | sin cambios |

Costes: un hilo extra por backend activo, ≤10ms de latencia añadida por el bucle de drenado del worker (irrelevante frente a la ventana de secuencia de ~116ms) y el SAB de audio crudo (256KB). Si el worker se atasca por completo, el worklet de captura descarta quanta en lugar de bloquearse — la degradación es inaudible, nunca un glitch. Esto también desbloquea una ventana de análisis de 4096 muestras para mejor resolución de parciales en notas graves (hoja de ruta).

Archivos clave:

| Archivo | Rol |
|---|---|
| `src/shared/lib/audio/audio-capture-processor.ts` | Worklet de tiempo real: copia los quanta de entrada al SAB de audio crudo, nada más |
| `src/shared/lib/audio/feature-extraction-loop.ts` | Pipeline de análisis puro (enventanado, puerta adaptativa, onset, backend, sink) — con tests unitarios |
| `src/shared/lib/audio/base-feature-worker.ts` | Conductor del worker: drena el SAB de audio crudo hacia el bucle de extracción, parametrizado por backend |
| `src/shared/lib/audio/essentia-feature-worker.ts` | Entrada fina del worker con `EssentiaBackend` (bundle propio, carga el WASM) |
| `src/shared/lib/audio/meyda-feature-worker.ts` | Entrada fina del worker con `MeydaBackend` |
| `src/shared/lib/audio/essentia-worklet-backend.ts` | Extracción de features con essentia.js (WASM) |
| `src/shared/lib/audio/meyda-worklet-backend.ts` | Extracción de features con Meyda + pitchfinder |
| `src/shared/lib/audio/inharmonicity.ts` | Matemática pura: seguimiento de parciales + ajuste del coeficiente de rigidez (con tests unitarios) |
| `src/shared/lib/audio/adaptive-gate.ts` | Máquina de estados pura: puerta RMS que sigue el suelo de ruido + onset + SNR (con tests unitarios) |
| `src/shared/lib/audio/worklet-types.ts` | El layout de frames del SAB (`FEATURE_POSITIONS`) — fuente única de verdad |
| `src/shared/lib/audio/sab-ring-buffer.ts` | Ring buffer sobre SharedArrayBuffer sin bloqueos (worklet → hilo principal) |
| `src/shared/lib/audio/ring-buffer.ts` | FIFO dentro del worklet para construir ventanas de 2048 a partir de quanta de 128 muestras |
| `src/shared/lib/audio/recording-engine.ts` | Captura del dataset: etiquetado, construcción de secuencias, descarga |
| `src/shared/lib/audio/prediction-engine.ts` | Inferencia en vivo: secuencias, normalización, enmascaramiento, estabilización |
| `src/shared/lib/audio/dataset-preparation.ts` | Estadísticas, normalización, división estratificada entrenamiento/validación |
| `src/shared/lib/audio/model.ts` | Definición del modelo + bucle de entrenamiento |
| `src/shared/lib/audio/dataset-loader.ts` | Descarga datasets desde `public/datasets/` (fuera del bundle de JS) |
| `src/shared/lib/audio/model-manifest.ts` | Esquema del manifiesto + validación pura (emparejado modelo↔stats↔pipeline, con tests unitarios) |
| `public/model/manifest.json` | Manifiesto de despliegue: puntero al modelo por modo + estadísticas de normalización embebidas |

### Dos backends, dos modos

| | `essentia` (modo "precisión") | `meyda` (modo "rendimiento") |
|---|---|---|
| Pitch | essentia `PitchYinFFT` (+ confianza) | pitchfinder Macleod (filtrado por probabilidad) o YIN |
| Features | Conjunto completo incl. inarmonicidad + B ajustado | Solo MFCC + centroide + rolloff + brillo |
| Coste | Más pesado (FFTs WASM ×2, picos, ajuste de parciales) | Más ligero (JS puro) |
| Entrada del modelo | 21 features/frame | 17 features/frame |
| Modelo desplegado | `public/model/guitar-essentia-ts.json` (**obsoleto — requiere reentrenar**, ver §8) | `public/model/guitar-meyda-ts-brightness-model.json` |

El modo se elige en el motor de predicción (`setMode`), que intercambia tanto el procesador del worklet como el par modelo+stats.

---

## 3. Del micrófono al frame de features

1. **Restricciones de captura** (`recording-engine.init` / `prediction-engine.init`): mono, con `echoCancellation/autoGainControl/noiseSuppression` desactivados — el DSP del navegador distorsionaría justo las features tímbricas que necesitamos.
2. **Enventanado**: Web Audio entrega quanta de 128 muestras, que el worklet de captura copia al SAB de audio crudo. El worker de features lo drena (bucle de ~10 ms) y analiza **ventanas de 2048 muestras con salto de 1024** (50% de solape). A 44.1 kHz eso es una ventana de ~46 ms cada ~23 ms.
3. **Puerta RMS adaptativa** (`adaptive-gate.ts`): en lugar de un umbral fijo, la puerta sigue el suelo de ruido ambiente con una EMA **mientras está cerrada** (congelada mientras suena una nota, para que las notas largas no lo inflen y se coman su propia cola de decaimiento) y abre en `suelo × 4`, cerrando en `suelo × 2.5` (histéresis — sin parpadeo cuando una nota decae a través del límite). Un mínimo absoluto (`0.003`) evita que una entrada en silencio total abra con cualquier cosa. El suelo inicial se elige para que los primeros frames se comporten como la antigua puerta fija de `0.02` hasta que el estimador converge (~120 ms de silencio). Como ambos umbrales escalan con el suelo, la selección de frames es aproximadamente **invariante a la ganancia**: distintas interfaces/ganancias capturan la misma población de frames.
4. **Detección de onsets** (en la puerta, agnóstica al backend): una ventana es un *onset* si la puerta acaba de abrirse, o si el RMS saltó >2× respecto a la ventana anterior (re-pulsación de una cuerda que aún suena). El flag se lleva "pendiente" en el bucle de extracción, de modo que si el backend descarta el frame del ataque, el *siguiente* frame entregado sigue anunciando la pulsación. La puerta también emite **SNR** = `log10(rms / suelo)`, una medida de sonoridad invariante a la ganancia usada como feature del modelo.
5. **Extracción de features** (backend): descrita en §4. El backend devuelve `null` para cualquier frame que no pueda analizar con fiabilidad — entrada sin voz, baja confianza de pitch, extracción fallida, muy pocos parciales. **Los frames descartados nunca se rellenan con ceros**; unos ceros fabricados serían indistinguibles de valores legítimos y envenenarían el dataset.
6. **Transporte**: el `Float32Array` de 22 huecos se encola en un ring buffer sobre SharedArrayBuffer. El hilo principal lo sondea cada 16 ms. Los frames se escriben completos de forma atómica, así que el lector siempre desencola un múltiplo de 22 floats.

### Layout de frames del SAB (`FEATURE_POSITIONS`, 23 huecos)

| Hueco | Nombre | Productor | Notas |
|---|---|---|---|
| 0 | PITCH | backend | Hz, YIN/Macleod |
| 1–13 | MFCC (13) | backend | envolvente mel-cepstral |
| 14 | CENTROID | backend | essentia: normalizado 0–1; meyda: índice de bin |
| 15 | ROLLOFF | backend | Hz |
| 16 | FLUX | backend | solo essentia (0 en meyda) |
| 17 | INHARMONICITY | backend | el escalar genérico de essentia (0 en meyda) |
| 18 | RMS | bucle de extracción | energía de la ventana |
| 19 | PITCH_CONFIDENCE | backend | confianza YIN / probabilidad Macleod |
| 20 | INHARMONICITY_B | backend | **log10(B ajustado)** (0 en meyda) |
| 21 | ONSET | bucle de extracción | 1 en el primer frame de una pulsación |
| 22 | SNR | bucle de extracción | log10(rms / suelo de ruido), invariante a la ganancia |

---

## 4. Las features, y por qué ayuda cada una

### 4.1 Vector de entrada del modelo — ruta essentia (22 por frame)

El orden importa y debe coincidir entre `recording-engine.saveData` y `prediction-engine.makeSequencePrediction`:

```
[ mfcc×13, midiNote, centroid, flux, rolloff, inharmonicity, rms, log10(B), onset, snr ]
```

| Feature | Qué mide | Por qué discrimina cuerdas |
|---|---|---|
| **13 MFCCs** | Envolvente espectral suavizada en escala mel | Timbre global: cuerdas entorchadas vs lisas, filtrado del cuerpo. Débil por debajo de ~500 Hz (las bandas mel son gruesas ahí) |
| **midiNote** | Pitch redondeado | *Contexto*, no discriminación — el timbre varía por nota, así que la red condiciona sobre ella |
| **Centroide espectral** | "Centro de masa" espectral (essentia: normalizado 0–1) | Brillo; una longitud vibrante más corta suena más brillante a igual pitch |
| **Flujo espectral** | Cambio espectral frame a frame | Ataque vs estado estacionario |
| **Rolloff espectral** | Frecuencia por debajo de la cual está el 85% de la energía (Hz) | Contenido de alta frecuencia del ruido de entorchado / pulsación |
| **Inarmonicidad (essentia)** | Desviación ponderada de los picos espectrales respecto a los armónicos del primer pico | Proxy genérico de rigidez; ruidoso, se mantiene por continuidad |
| **RMS** | Energía de la ventana | Pendiente de decaimiento a lo largo de la secuencia — las cuerdas más gruesas y los trastes más altos decaen distinto |
| **log10(B)** — *la feature estrella* | Coeficiente de rigidez ajustado del modelo de cuerda inarmónica | Mide directamente la construcción de la cuerda; ver más abajo |
| **Flag de onset** | 1 en el primer frame de la pulsación | Le dice a la red si un frame es ataque o decaimiento, así ambos son utilizables |
| **SNR** | log10(rms / suelo de ruido) desde la puerta adaptativa | Sonoridad/decaimiento invariante a la ganancia: a diferencia del RMS crudo, comparable entre interfaces y salas |

### 4.2 El coeficiente de inarmonicidad ajustado B

Los parciales de una cuerda real (rígida) no están en `n·f0` sino en

```
f_n = n · f0 · √(1 + B·n²)
```

`B` crece con la rigidez/calibre de la cuerda y decrece con la longitud vibrante — precisamente las cantidades físicas que difieren cuando el mismo pitch se toca en cuerdas distintas (rango típico en guitarra ≈ 1e-5…1e-3, varias veces mayor entre una cuerda grave entorchada pisada en trastes altos y una cuerda lisa pisada en trastes bajos). Es el discriminador con más base física, y el enfoque usado en la literatura de clasificación de cuerdas (Abeßer; el trabajo de tablatura de Barbancho).

Implementación (`inharmonicity.ts`, invocada desde el backend de essentia):

1. **Seguimiento de parciales guiado por el pitch**: para n = 1…10, busca en una ventana de ±4% alrededor de la posición *esperada* (corregida por inarmonicidad) — la estimación en curso de B mantiene centradas las ventanas de los parciales altos. Los picos por debajo del 0.1% del máximo del espectro se tratan como ruido y se omiten.
2. **Interpolación parabólica en log-magnitud** refina cada pico a precisión sub-bin (los lóbulos principales de la ventana son casi parabólicos en el dominio logarítmico; las parábolas en dominio lineal tienen un sesgo sistemático).
3. **Ajuste por mínimos cuadrados de dos parámetros** de `f_n² = F²·n² + F²B·n⁴`, y después `B = coef₂/coef₁`. Ajustar F² conjuntamente evita tomar como referencia cualquier parcial medido como f0 — un error en la fundamental medida se propagaría a cada cociente y puede incluso invertir el signo del ajuste (este modo de fallo está capturado en los tests unitarios).
4. Requiere ≥4 parciales medidos; si no, el frame se descarta. La feature es `log10(B)` acotada a [1e-6, 1e-2].

Además, la entrada *genérica* `Inharmonicity` de essentia se vuelve significativa guiando `SpectralPeaks` con el pitch (`minFrequency = 0.85·f0`, de modo que el primer pico sea la verdadera fundamental — el algoritmo de essentia trata el primer pico como f0) y comprobando que el primer pico está a ±15% del pitch de YIN.

### 4.3 Puertas de calidad (por qué desaparecen frames)

Un frame debe pasar **todo** esto: puerta adaptativa abierta → pitch YIN > 0 → confianza YIN ≥ 0.4 → enventanado/espectro/MFCC exitosos → existen picos espectrales y casan con el pitch → ≥4 parciales para el ajuste de B. Cualquier otra cosa devuelve `null` y el frame nunca sale del worklet. Aguas abajo, los engines además comprueban el rango de la nota (rangos MIDI por cuerda al grabar; rango del instrumento en inferencia).

### 4.4 Ruta meyda (17 por frame)

```
[ mfcc×13, midiNote, centroid, rolloff, brightnessPerNote ]
```

`brightnessPerNote = midiNote / centroid` — un cociente artesanal de brillo vs pitch. La ruta meyda no puede calcular flux (necesita el frame anterior) ni inarmonicidad (no hay picos espectrales), que es exactamente por lo que es el modo "rendimiento" (rápido) y la ruta essentia es el modo "precisión".

---

## 5. Secuencias y el dataset

Los frames sueltos son ruidosos; el modelo consume **secuencias de 5 frames consecutivos** (~116 ms).

Una secuencia debe representar *una nota de una pulsación continua*. Ambos engines vacían su búfer de frames cuando se rompe cualquiera de estas condiciones:

- la nota MIDI detectada cambia,
- pasan más de **150 ms** entre frames aceptados (`MAX_FRAME_GAP_MS`, ~6 periodos de salto — tolera unos pocos frames descartados o filtrados),
- llega un **onset** (las secuencias se alinean con los límites de las pulsaciones).

### DatasetEntry

```ts
{ midiNote, stringNum /* 0=E agudo … 5=E grave */, noteName,
  features: number[5][22], normalizedFeatures: number[5][22] }
```

Flujo de grabación (`RecordingControls`, se abre con el código secreto "record"): elige un índice de cuerda y toca notas a lo largo de ella; los frames se filtran al rango MIDI plausible de esa cuerda; cada 5 frames en el búfer se convierten en una entrada etiquetada. `downloadDataset()` normaliza en z-score con la media/desviación por feature de todo el dataset y descarga **ambos** archivos, el dataset y el de estadísticas — las estadísticas son parte del contrato del modelo (ver §7).

Los datasets viven en `public/datasets/` y se **descargan en tiempo de ejecución** (`dataset-loader.ts`), no se importan — empaquetarlos añadía antes ~16 MB gz al build y hacía que la precaché de la PWA fuese de 46 MB.

### División entrenamiento/validación (`prepareStratifiedSplit`)

- Una muestra de entrenamiento por secuencia grabada — sin ventanas deslizantes entre entradas (las ventanas que cruzaban dos grabaciones fueron un bug histórico importante, ver §8).
- Las entradas se agrupan por clase, se barajan con un **PRNG con semilla** (mulberry32, semilla 42 por defecto — reproducible), y el 20% de *cada clase* va a validación. Esto importa porque el flujo de captura graba cuerda a cuerda: una división ingenua por cola (el `validationSplit` de TF.js) habría validado sobre una sola clase.
- Comprobación de forma: las entradas cuyas `normalizedFeatures` no son `[5][22]` se omiten, y se lanza un error explícito si no sobrevive ninguna (la señal inequívoca de un dataset grabado con un pipeline de features antiguo).

---

## 6. El modelo

Definido en `model.ts` (TensorFlow.js, importado de forma diferida):

```
Entrada [5 frames × 22 features]
  → Conv1D(filters=32, kernel=3, relu)     # patrones temporales locales (ataque→decaimiento)
  → GlobalAveragePooling1D                 # invariancia a la posición temporal
  → Dense(32, relu)
  → Dense(6, softmax)                      # cuerda 0–5
```

Entrenamiento: Adam, entropía cruzada categórica, hasta 100 épocas, batch 64, early stopping sobre `val_acc` (paciencia 5, minDelta 0.005), `validationData` explícita de la división estratificada. El modelo se guarda con `model.save('downloads://…')` y se coloca a mano en `public/model/`.

Es deliberadamente pequeño: corre en el hilo principal en tiempo real junto al worklet de audio, y las features diseñadas cargan con la mayor parte de la señal.

---

## 7. Ruta de inferencia

1. Los frames llegan exactamente igual que durante la grabación (mismo worklet, mismas puertas) — **la simetría entrenamiento/inferencia es el invariante central de este código**.
2. Un búfer deslizante de 5 frames (con las mismas reglas de vaciado) produce una secuencia por salto.
3. Las features se ensamblan *en el mismo orden que `saveData`* y se normalizan con las estadísticas **embebidas en el manifiesto del modelo** (`public/model/manifest.json`). El manifiesto es la fuente única de verdad por modo: nombre de archivo del modelo, backend, número de features, longitud de secuencia, versión del pipeline y estadísticas de normalización viajan como un solo artefacto. Al cargar (`loadResourcesForMode` → `model-manifest.ts`), los desajustes de dimensiones — stats vs entrada, entrada vs pipeline en ejecución, entrada vs la forma de entrada *real* del modelo cargado — deshabilitan el modelo con errores explícitos en consola, y la deriva de versión del pipeline registra un aviso bien visible de "se recomienda reentrenar". Las entradas del manifiesto las genera `trainModel`, nunca se escriben a mano.
4. **Máscara de viabilidad**: para el pitch detectado, solo son físicamente posibles las cuerdas cuyo traste implícito cae en 0–24 (C3 → 2 candidatas; E2 al aire → 1). El argmax del softmax corre solo sobre las clases viables. Es una ganancia de precisión gratis y no requiere reentrenar.
5. `calculateLocation` convierte (midi, cuerda) → traste.
6. **Estabilización con RxJS**: las predicciones crudas pasan por una ventana deslizante (`bufferCount(5,1)`); un par (cuerda, traste) debe ganar ≥70% de la ventana para emitirse. Una predicción emitida se limpia sola tras 5 s de silencio (`switchMap` + timer).

---

## 8. Cambios recientes (2026-07) y su justificación

Se hicieron en una sola pasada de revisión y corrección; los estados "antes" están documentados porque varios invalidaron artefactos antiguos.

| Cambio | Problema que corrigió |
|---|---|
| **División estratificada con semilla + `validationData`** | El dataset está ordenado por cuerda; el `validationSplit` de TF.js tomaba la cola → la validación era ~una clase, `val_acc` y el early stopping no significaban nada |
| **Una muestra por secuencia** (sin re-enventanado con paso 1) | 4 de cada 5 ventanas de entrenamiento cruzaban dos grabaciones sin relación; además inflaba los datos ~5× con casi-duplicados (fuga entre train/val) |
| **Vaciado del búfer al cambiar la nota / hueco de 150ms / onset** | Las secuencias pegaban frames de pulsaciones o notas distintas; la etiqueta salía solo del último frame |
| **Sample rate real en MFCC/RollOff/SpectralPeaks (+ `Meyda.sampleRate`)** | Todo asumía 44.1 kHz; en hardware de 48 kHz todas las features con eje de frecuencia estaban ~9% desviadas → cambio de distribución entrenamiento/inferencia entre dispositivos |
| **Descartar al fallar (`process(): Float32Array \| null`)** | Las extracciones fallidas se serializaban como ceros y se grababan como datos |
| **`SpectralPeaks` guiado por el pitch + comprobación de la fundamental** | Ruido sub-fundamental se convertía en "f0" para el cálculo de inarmonicidad |
| **log10(B) ajustado** (feature nueva) | El escalar genérico de inarmonicidad es ruidoso; B es la firma física de la cuerda |
| **RMS + onset como features del modelo; puerta de confianza YIN (0.4)** | La información de decaimiento y la alineación del ataque se tiraban; frames con error de octava contaminaban las etiquetas |
| **Máscara de viabilidad en inferencia** | Cuerdas imposibles podían ganar el argmax y la predicción se descartaba en vez de recurrir a la siguiente |
| **Bifurcación de backend por `activeBackendType`** | Las grabaciones con meyda tomaban en silencio el layout de features de essentia (rama muerta de 17 features) |
| **Dirección de `brightnessPerNote` unificada** (`note/centroid`) | Grabación e inferencia calculaban features recíprocas |
| **Datasets a `public/datasets/` + alarma de precaché de 2MB** | 46 MB de precaché de la PWA en la primera visita; los datasets iban empaquetados como JS |
| **Puerta RMS adaptativa + feature SNR** | La puerta fija de 0.02 dependía de la ganancia de la interfaz (los equipos silenciosos no capturaban nada, los calientes dejaban pasar colas de ruido, los datasets quedaban acoplados al hardware); la feature de RMS crudo arrastraba la misma dependencia — SNR = log10(rms/suelo) es el reemplazo invariante a la ganancia |
| **Manifiesto del modelo con stats embebidas + validación al cargar** | El modelo y sus estadísticas de normalización se emparejaban a mano entre dos archivos; una ruta obsoleta sesgaba en silencio cada predicción. Ahora es un artefacto generado, validado contra el pipeline en ejecución y la forma de entrada real del modelo cargado |
| **Procesador de grabación base parametrizado** | Los dos procesadores del worklet eran duplicados casi literales; la lógica compartida (puerta, onset, transporte SAB) había que editarla dos veces y podía divergir. Ahora un `base-recorder-processor.ts` + dos módulos de entrada finos por backend (separados para que cada bundle del worklet cargue solo su backend) |
| **Imports del worklet cambiados a `?worker&url`** | Un `?url` a secas nunca compila TS en builds de producción — `addModule()` recibía un data-URI de TypeScript crudo, así que **los worklets no cargaban en ningún build de producción** (en dev funcionaba porque Vite transforma al vuelo). `?worker&url` emite bundles reales compilados por backend; quedan excluidos de la precaché de la PWA (funcionalidad opcional, el bundle de essentia pesa ~2.4MB) |
| **El DSP fuera del hilo de audio de tiempo real** (§2.1) | La extracción de features corría dentro del presupuesto de ~2.7ms del `process()` del worklet; los dispositivos lentos producían glitches y perdían la entrada que se analizaba. Ahora: worklet de captura mínimo → SAB de audio crudo → Worker de features por backend (el bucle de extracción es puro y con tests) → SAB de features (sin cambios) |
| **Envoltura con módulo real en el ring buffer** | El FIFO reiniciaba los índices a 0 al dar la vuelta — solo correcto cuando cada push divide exactamente la capacidad (cierto para quanta de 128, roto para los drenados de tamaño variable del worker). Los índices ahora envuelven con aritmética modular real |

**Consecuencias para los artefactos**: el dataset empaquetado (frames de 18 features) y los dos modelos *essentia* desplegados son anteriores a estos cambios. La ruta essentia/"precisión" no predecirá hasta que se grabe un dataset nuevo y se reentrene un modelo; `prepareStratifiedSplit` falla pronto con un error explicativo. La ruta meyda/"rendimiento" (17 features, layout sin cambios) sigue funcionando.

---

## 9. Limitaciones actuales

**Pipeline / ingeniería**

- **SharedArrayBuffer requiere aislamiento cross-origin** (`vite-plugin-cross-origin-isolation` en dev; cabeceras COOP/COEP en producción). Los navegadores sin él no obtienen ninguna feature de audio.

**Datos / modelo**

- **Dataset de una sola guitarra y un solo estilo**, grabado cuerda a cuerda en una sesión. Es probable que el modelo aprenda artefactos de sesión; la generalización a otras guitarras/pastillas no está demostrada.
- **Secuencias de ~116 ms** pueden perder diferencias de decaimiento más lentas; el inicio de secuencia ya se alinea al onset, pero solo la primera secuencia de una pulsación contiene el ataque.
- **La resolución de los MFCC en bajas frecuencias** es pobre exactamente donde viven los parciales 1–4 de las notas graves; el B ajustado y las futuras features armónicas lo compensan.
- **Errores de octava**: los saltos de octava de YIN dentro del filtro de rango por cuerda siguen etiquetando mal `midiNote`; la puerta de confianza los reduce pero no los elimina.
- **B no está definido en la ruta meyda**, así que el modo rendimiento sigue dependiendo solo de features de envolvente.
- **Desbalance de clases y cobertura de notas**: solo los rangos de pitch compartidos por ≥2 cuerdas necesitan de verdad el modelo; el dataset no está concentrado ahí.

---

## 10. Hoja de ruta: mejoras futuras

Ordenadas aproximadamente por valor esperado por esfuerzo.

1. **Features de estructura armónica** (pequeño, alto valor): magnitudes normalizadas de los primeros ~8 parciales (dB respecto al parcial 1) — captura directamente el filtrado de peine del punto de pulsación; el `Tristimulus` y el `OddToEvenHarmonicEnergyRatio` de essentia salen casi gratis porque los picos ya están calculados. Requiere ampliar `NUM_FEATURES` + reentrenar.
2. **Ventana de análisis de 4096 muestras para el ajuste de parciales** — reduce a la mitad el error de estimación de B en notas graves. Desbloqueado ahora que la extracción corre en un Worker sin presupuesto de tiempo real (subir `bufferSize` en la inicialización del worker de los engines + reentrenar).
3. **Protocolo de grabación**: varias dinámicas, púa vs dedo, varias posiciones de pulsación, cuerdas nuevas vs gastadas; concentrarse en los rangos de notas compartidos entre cuerdas. B sobrevive a esas variaciones; las envolventes crudas no — que es justo lo que hace que valga la pena recolectarlas. El procedimiento completo está especificado en **[recording-protocol.es.md](recording-protocol.es.md)**.
4. **Agregación por pulsación en inferencia**: agregar todas las secuencias de una pulsación (mediana del softmax por secuencia, ponderada por confianza/RMS) en lugar del voto por mayoría deslizante genérico.
5. **Híbrido con prior físico**: una pasada de calibración por guitarra que mida B por (cuerda, traste) una vez, y clasificar por B más cercano con la red como desempate. Personalizaría la precisión de forma barata y degradaría con gracia.

**Arquitecturas de modelo alternativas**, si las features diseñadas se estancan:

| Arquitectura | Entrada | Compromiso |
|---|---|---|
| Actual: Conv1D + GAP (≈3k parámetros) | 5×21 features diseñadas | Diminuta, rápida, interpretable; techo limitado por las features |
| GRU/LSTM pequeña o TCN | Secuencias de features más largas (10–20 frames) | Modela explícitamente las trayectorias de decaimiento; sigue siendo barata |
| CNN sobre parches de CQT / espectrograma log-mel | ~200 ms de espectrograma alrededor del onset | Estado del arte en la literatura de tablatura (Kehling et al., Wiggins & Kim); necesita muchos más datos + aumento de datos, más pesada en navegador |
| CRNN (frente CNN + cabeza recurrente) | Espectrograma | Mejores resultados publicados para cuerda/traste; probablemente excesivo hasta que madure el protocolo de datos |
| Transfer learning (p. ej., embeddings de audio preentrenados + cabeza pequeña) | Audio crudo | Descargas grandes; choca con el presupuesto de tamaño de la PWA |

La orientación honesta: **la calidad de los datos y la simetría entrenamiento/inferencia han valido más que la arquitectura aquí**. Cada problema histórico de precisión de este proyecto se remontó a fugas, secuencias mal etiquetadas o desajustes de features — no a capacidad del modelo.

---

## 11. Guía operativa: grabar → entrenar → desplegar

> Para la calidad del dataset, sigue el **[protocolo de grabación](recording-protocol.es.md)** completo — plan de cobertura, rejilla de variación y comprobaciones de cordura. Los pasos de abajo son el mínimo mecánico.

1. `npm run dev`, abre la app, teclea `record` (código secreto) para abrir el Recording Studio; concede acceso al micrófono, `Init`.
2. Para cada cuerda 0–5: pulsa `Start n`, toca notas a lo largo de esa cuerda (cada pulsación sostenida produce varias secuencias), `Stop`.
3. Descarga dataset + stats. Coloca el dataset en `public/datasets/<nombre>/guitar_dataset.json` y guarda el archivo de estadísticas junto a él.
4. Apunta `model.ts` (`fetchDataset`) hacia él si el nombre cambió; lanza el entrenamiento desde el Recording Studio (`Train Model`). Vigila `val_acc` por época en la consola.
5. El entrenamiento descarga **tres artefactos**: el JSON del modelo + los pesos, y un `manifest-entry-*.json` generado (puntero al modelo, dimensiones de features/secuencia, versión del pipeline, estadísticas de normalización embebidas). Mueve los archivos del modelo a `public/model/` y pega la entrada bajo la clave de modo correcta en `public/model/manifest.json`. Nunca edites dimensiones/stats a mano — el motor de predicción valida la entrada contra el pipeline en ejecución *y* la forma de entrada real del modelo cargado, y deshabilita el modelo con errores en consola ante cualquier desajuste.
6. Verifica: `npx vitest run` (matemática del pipeline), y después en vivo: modo precisión, toca el mismo pitch en dos cuerdas, observa el overlay.
