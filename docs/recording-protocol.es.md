# Protocolo de grabación del dataset

> *Traducción de [recording-protocol.md](recording-protocol.md), sincronizada a 2026-07-16. Ante cualquier discrepancia, el original en inglés es la referencia.*

Un protocolo paso a paso para grabar un dataset de entrenamiento para el modelo de clasificación de cuerdas. Síguelo al pie de la letra y obtendrás un dataset equilibrado, con etiquetas limpias y concentrado donde el modelo de verdad se gana el sueldo. Sáltate pasos y obtendrás un modelo que memoriza tu sesión de grabación en lugar de tus cuerdas.

Documento complementario: [audio-pipeline.es.md](audio-pipeline.es.md) — qué ocurre con el audio que grabas.

---

## 0. Principios (por qué el protocolo es así)

1. **El modelo solo importa donde los pitches se solapan.** En inferencia, la máscara de viabilidad ya elimina las cuerdas que no pueden producir la nota detectada. E2–G#2 solo existen en la cuerda 6 — ahí no hace falta modelo. G3 existe en cuatro cuerdas — ahí es donde el modelo trabaja. El esfuerzo de grabación sigue a ese valor.
2. **La etiqueta es la cuerda que seleccionaste en la UI — nada la verifica.** El filtro de pitch por cuerda rechaza notas *fuera* del rango de la cuerda, pero como los rangos se solapan, una cuerda mal seleccionada a menudo pasa igualmente. La disciplina del operador es la única defensa.
3. **Qué debe variar y qué no.** La firma de la cuerda (inarmonicidad B, decaimiento) sobrevive a cambios de dinámica, estilo de pulsación y posición de pulsación — las features de molestia (la envolvente espectral cruda) no. Así que variamos *deliberadamente* todo lo que no es la cuerda, y el modelo se ve forzado a apoyarse en lo que queda.
4. **Las huellas de sesión son el enemigo.** Si toda la cuerda 3 se graba en una sola toma continua (una ganancia, una posición de micrófono, un agarre de púa), el modelo puede clasificar la *toma*, no la cuerda. Intercala y divide las sesiones.

---

## 1. Lista de comprobación de equipo y entorno

Hazlo una vez por sesión, antes de grabar nada:

- [ ] **Afina con precisión a A440.** El motor etiqueta las notas redondeando el pitch a la nota MIDI más cercana — una cuerda desviada más de ±50 cents queda *mal etiquetada al completo*. Revisa la afinación cada ~15 minutos (las cuerdas nuevas se destensan).
- [ ] **La misma cadena de señal que usarás para predecir** (misma guitarra → misma interfaz/micrófono). Un dataset grabado con un micrófono de condensador no transferirá perfectamente a un micrófono de teléfono.
- [ ] **Sin clipping, con nivel sano.** La puerta adaptativa hace que el nivel absoluto sea casi irrelevante, pero el clipping es una no-linealidad dura que fabrica parciales y corrompe el ajuste de inarmonicidad. Toca tu pulsación de prueba más fuerte y ajusta la ganancia de la interfaz para que el pico quede bien por debajo de 0 dBFS (apunta a ≈ −12 dB de margen).
- [ ] **Desactiva cualquier AGC/"mejora" del dispositivo** (algunas interfaces USB y la mayoría de micrófonos de auriculares lo tienen). La app ya pide audio crudo al navegador, pero el AGC de hardware está por debajo de eso.
- [ ] **Sala silenciosa.** La puerta sigue el suelo de ruido, así que un zumbido constante se tolera — pero una TV, conversaciones o golpecitos abrirán la puerta y, si llevan pitch, pueden colar frames. Teléfono en silencio.
- [ ] **Anota los metadatos de la sesión en algún sitio** (un archivo de texto junto al dataset): fecha, guitarra, marca/calibre/antigüedad de las cuerdas, tipo de púa, interfaz, sample rate si lo conoces. Tu yo del futuro lo necesitará.
- [ ] **Configura el campo `Guitar tag`** del Recording Studio con el id estable de este instrumento (p. ej. `strat-daddario-10s`) — cada secuencia capturada lo incrusta como `guitarId` (§7). Cuerdas nuevas = tag nuevo.

---

## 2. Higiene de sesión (los detalles que deciden la calidad de las etiquetas)

- **Empieza con ~2 segundos de silencio** tras pulsar `Start`. La puerta adaptativa necesita ~120 ms de silencio para aprender el suelo de ruido de la sala; dale margen.
- **Una nota cada vez, bien pisada.** El rastreador de pitch es monofónico. Nada de acordes ni cuerdas al aire sonando por simpatía (apaga las cuerdas que no uses con la palma o una goma de pelo en la cejuela).
- **Sin vibrato, sin bends, sin slides.** La modulación de pitch baja la confianza de YIN (se descartan frames) y puede cruzar el límite de redondeo a mitad de nota (secuencia vaciada o, peor, mal etiquetada).
- **Deja sonar cada nota ~2 segundos y apágala del todo** con la palma; espera ~0.5 s antes de la siguiente pulsación. El hueco de silencio (> 150 ms) vacía el búfer de secuencias y deja que la puerta se recalibre; cada pulsación produce entonces una secuencia anclada al onset más varias secuencias limpias de decaimiento.
- **Sin armónicos, sin notas muertas o que trastean.** El cerdeo añade parciales de ruido que envenenan el ajuste de B; si un traste cerdea en tu guitarra, sáltatelo y anótalo en los metadatos.
- **Vigila el contador de la consola.** Cada secuencia capturada registra `Captured sequence for <nota>` (los nombres de nota van en notación inglesa: C=Do, D=Re, …). Si el nombre de la nota no es lo que estás tocando — para; estás desafinado o el rastreador de pitch está saltando de octava en esa nota.
- **El runner guiado (§4) hace cumplir por ti la mecánica de esta sección** — los 2 s de silencio de armado (se rearma si oye algo), el ritmo de sonar/apagar, y la vigilancia de notas equivocadas (comprueba cada nota detectada contra el traste que pidió). Lo físico — pisar limpio, apagar cuerdas, sin vibrato, afinación — sigue siendo cosa tuya.
- **Pulsar `Start` (manual o guiado) descarta los frames rancios previos al Start**, de modo que el audio analizado mientras la grabación estaba parada ya no puede colarse bajo la etiqueta de la siguiente cuerda.

---

## 3. Qué grabar por cuerda

### 3.1 El mapa de cobertura

Afinación estándar, trastes 0–18 (el rango que acepta el filtro de captura). "Zona de solapamiento" = notas que existen en al menos otra cuerda; esa es la prioridad.

| Cuerda (índice en la UI) | Al aire | Rango de trastes | Zona de solapamiento (trastes prioritarios) | Zona exclusiva (cobertura ligera) |
|---|---|---|---|---|
| 5 — E grave | E2 (40) | 0–18 | **trastes 5–18** (A2–A#3, compartidos con la cuerda A y superiores) | trastes 0–4 (E2–G#2, la única cuerda que los tiene) |
| 4 — A | A2 (45) | 0–18 | **todos los trastes** (todo compartido con E grave y/o D) | — |
| 3 — D | D3 (50) | 0–18 | **todos los trastes** | — |
| 2 — G | G3 (55) | 0–18 | **todos los trastes** | — |
| 1 — B | B3 (59) | 0–18 | **todos los trastes** | — |
| 0 — E agudo | E4 (64) | 0–18 | **trastes 0–13** (E4–F5, compartidos con la cuerda B) | trastes 14–18 (F#5–A#5) |

Las notas más disputadas (3–4 cuerdas candidatas) son aproximadamente **G3–F4 (MIDI 55–65)** — la caja central del diapasón. Esas celdas merecen la mayor cantidad de pulsaciones.

### 3.2 La rejilla de variación

Para **cada traste** que grabes, cubre esta rejilla — es lo que fuerza al modelo hacia la firma de la cuerda:

| Dimensión | Valores | Por qué |
|---|---|---|
| Dinámica | suave, media, fuerte | El espectro del ataque y la trayectoria de SNR cambian; B no |
| Excitación | púa, yema del dedo (añade el pulgar en las cuerdas graves si tocas así) | Transitorio de pulsación muy distinto |
| Posición de pulsación | cerca del puente, sobre la boca/centro, cerca del mástil | Mueve los nulos del filtro de peine a través de la serie armónica |

Eso es 3 × 2 × 3 = **18 pulsaciones por traste** para cobertura completa. En la práctica funciona bien una pasada comprimida:

- **Trastes de la zona de solapamiento:** 6 pulsaciones por traste — {suave, media, fuerte} × {púa, dedo}, rotando la posición de pulsación entre pulsaciones.
- **Trastes de la zona exclusiva:** 2 pulsaciones por traste (púa media, dedo medio). Estos solo le enseñan al modelo "cómo suena esta cuerda en general".
- **Las cuerdas lisas (sin entorchar) reciben un margen de ×1.5 pulsaciones**: 9 pulsaciones por traste de solapamiento (la rejilla de arriba más una pasada extra {suave, media, fuerte}, alternando púa/dedo) y 3 por traste exclusivo. Las cuerdas finas decaen rápido y producen solo ~6–7 secuencias por pulsación frente a ~9–12 en las entorchadas (medido en el dataset v1), así que un plan con pulsaciones iguales queda ~2× desbalanceado frente al objetivo de ≤1.5× de §3.3. El runner guiado lo aplica automáticamente al E agudo y al B; **si tu juego lleva una G lisa** (típico en eléctricas), revisa su conteo en §5 y complétala con una sesión de cuerda única — el runner no puede saber la construcción de la cuerda.

### 3.3 Rendimiento esperado y objetivos

Cada pulsación que suena ~2 s produce aproximadamente 5–12 secuencias (una anclada al onset + rebanadas de decaimiento; las pulsaciones fuertes suenan más tiempo y producen más). El rendimiento depende de la cuerda: las entorchadas sostienen ~9–12 secuencias por pulsación, las lisas decaen en ~6–7 — que es lo que compensa el margen de ×1.5 de §3.2.

| Cantidad | Objetivo |
|---|---|
| Secuencias por cuerda | **≥ 1000** (dataset anterior: ~700/cuerda con etiquetas más sucias) |
| Por celda (cuerda, traste) en la zona de solapamiento | ≥ 30 secuencias (~6 pulsaciones) |
| Balance de clases | conteo máx/mín por cuerda ≤ 1.5× — la división estratificada no corrige el desbalance, solo lo refleja |
| Presupuesto de tiempo | ≈ 8–12 min de grabación por cuerda; una pasada completa ≈ 1.5 h con descansos |

### 3.4 Orden de grabación — intercala, no agrupes

Haz **dos medias pasadas en lugar de una gran toma por cuerda**, en sentadas distintas (o al menos separadas por desenchufar/re-enchufar y reafinar):

- Pasada A: cuerdas 5 → 0, trastes 0–9, rejilla de variación completa.
- Pasada B (más tarde, idealmente al día siguiente): cuerdas 0 → 5, trastes 10–18, rejilla de variación completa.

Esto pone cada cuerda en cada sesión, de modo que los artefactos de sesión (deriva del micrófono, humedad, tu mano calentándose) se decorrelacionan de la etiqueta de clase. Si grabas con más de una guitarra, dale a cada una su propio `Guitar tag` y mantén archivos por guitarra con metadatos — mezclar se convierte entonces en un acto deliberado y etiquetado (§7), nunca en un accidente.

**Las pasadas en varios días no requieren fusión manual.** Al comienzo de la sesión posterior, pulsa `Import dataset` en el Recording Studio y selecciona el `guitar_dataset_<timestamp>.json` de la pasada anterior. Las secuencias nuevas se añaden a él en memoria, y el `Download` final produce un único par dataset+stats coherente con las estadísticas calculadas sobre el conjunto completo. **No** concatenes a mano dos archivos descargados en su lugar: las `normalizedFeatures` de cada archivo se normalizaron en z-score con las estadísticas de su propia sesión, así que una concatenación ingenua incrusta un desplazamiento de features por sesión — precisamente la huella de sesión que este protocolo existe para eliminar. (La importación descarta esos valores obsoletos y lo renormaliza todo al descargar.)

**Seguridad ante fallos.** Cada secuencia capturada o importada se autoguarda también en el IndexedDB del navegador, y un `Download` exitoso limpia ese espejo. Si la pestaña muere o se recarga antes de haber descargado, la siguiente apertura del Recording Studio muestra un aviso *"Autosaved session found"* — `Restore` devuelve las secuencias a memoria (se validan igual que una importación), `Discard` las borra. El autoguardado solo contiene secuencias que no existen en ningún otro sitio, así que restaurar nunca duplica un archivo que ya descargaste.

---

## 4. Guion de sesión paso a paso

1. `npm run dev` → abre la app → teclea `record` → se abre el Recording Studio.
2. Selecciona tu dispositivo de entrada, pulsa `Init`, concede acceso al micrófono.
3. Configura el **`Guitar tag`** con el id de este instrumento (se recuerda entre sesiones — verifica que coincide con la guitarra que tienes en las manos, sobre todo si rotas instrumentos).
4. **¿Pasada B (continuando un día anterior)?** Pulsa `Import dataset` y selecciona el `guitar_dataset_*.json` de la pasada anterior — el contador de secuencias debería saltar al total anterior. La grabación continúa desde ahí. Si en su lugar aparece un aviso *"Autosaved session found"*, la sesión anterior nunca se descargó: haz `Restore` (sin importar nada) o `Discard` antes de grabar.
5. Afina. Verifica con unas pulsaciones de prueba que la consola muestra los nombres de nota correctos.
6. Elige el preset de la pasada en **Guided session** (Pass A / Pass B / Full / Single string) y pulsa `Start session`. El runner conduce toda la pasada — tú solo tocas:
   - **Él mismo fija la etiqueta de cuerda** — sin clics en `Start N`, así que la etiqueta siempre coincide con el plan. Entre cuerdas tienes una cuenta atrás para mover la mano y revisar la afinación; `Espacio` (o `I'm ready`) empieza antes.
   - **Guarda silencio siempre que diga *arming*** — hace cumplir la ventana de 2 s de aprendizaje de la puerta y se rearma si oye algo.
   - **Te dicta cada traste y cada variación de pulsación** (avisos de voz opcionales — ojos en el diapasón), cuenta las pulsaciones por detección de onset y avanza traste → cuerda → fin automáticamente. Dejar sonar de más tras la última pulsación de un traste no pasa nada; adelantarse también cuenta.
   - **Comprueba cada nota tocada contra el traste esperado**: una nota equivocada se avisa y no se cuenta; tres seguidas levantan la alerta de *revisa tu cuerda*. Esto verifica la **nota**, no la cuerda — el principio 2 de §0 sigue en pie; la etiqueta se confía al plan, que es exactamente por lo que la fija el runner y no tú.
   - `Espacio` también pausa/reanuda a mitad de cuerda (la pausa detiene la captura; reanudar rearma con silencio fresco en el mismo punto). Usa `Skip fret` para trastes que cerdean — los trastes saltados aparecen en el resumen de la sesión; cópialos al archivo de metadatos.
   - Cerrar el modal del Studio **no** termina la sesión — sigue corriendo y el panel se rehidrata al reabrirlo. Terminarla es siempre el `Abort` explícito.

   **Manual (respaldo)** (regrabaciones puntuales, o si el runner falla) — para cada cuerda del plan de la pasada:
   1. Pulsa `Start <índice de cuerda>` (**comprueba tres veces el índice**: 0 = E agudo … 5 = E grave — un índice equivocado aquí es un lote mal etiquetado que ningún filtro atrapará del todo).
   2. 2 s de silencio.
   3. Recorre los trastes planificados de grave a agudo ejecutando la rejilla de variación; apaga la cuerda + pausa entre pulsaciones.
   4. Pulsa `Stop`. Estira, revisa la afinación.
7. Tras la última cuerda: **Descarga dataset + stats** (un solo botón produce ambos archivos — son una pareja; el archivo de estadísticas es el contrato de normalización del modelo que entrenarás). El runner guiado te lo ofrece al terminar la sesión.
8. Nómbralos de forma consistente, p. ej. `guitar_dataset_<guitarra>_<AAAAMMDD>.json` + sus stats, deja el dataset en `public/datasets/<nombre>/` y escribe el archivo de metadatos junto a ellos.

---

## 5. Comprobaciones de cordura tras grabar (10 minutos, no opcionales)

Ejecuta un resumen rápido antes de entrenar (adapta las rutas):

```bash
python3 - <<'EOF'
import json, collections
d = json.load(open('public/datasets/<name>/guitar_dataset.json'))
by_string = collections.Counter(e['stringNum'] for e in d)
by_cell = collections.Counter((e['stringNum'], e['noteName']) for e in d)
onset_seqs = sum(1 for e in d if e['features'][0][20] == 1)  # flag de onset, primer frame
print('total sequences:', len(d))
print('per string:', dict(sorted(by_string.items())))
print('onset-anchored sequences:', onset_seqs, f'({onset_seqs/len(d):.0%})')
print('thinnest cells:', by_cell.most_common()[:-8:-1])
EOF
```

Señales de alarma y qué significan:

| Síntoma | Causa probable | Solución |
|---|---|---|
| El conteo de una cuerda ≪ las demás | Decaimiento más rápido de una cuerda lisa (esperado — ver §3.2/§3.3), la puerta nunca se abrió (¿demasiado suave?), o los frames fallaron el ajuste de B | Completa con una sesión guiada de cuerda única (`Import` del dataset primero, §3.4), pulsa con más firmeza, deja sonar las notas los ~2 s completos |
| Nombres de nota desviados un semitono en algunas celdas | La afinación derivó durante la sesión | Borra esas entradas o regraba la cuerda |
| Aparecen notas que nunca tocaste | Sonido de fondo / errores de octava | Revisa el entorno; considera subir `MIN_PITCH_CONFIDENCE` |
| Fracción de secuencias con onset muy baja (< ~10%) | Pulsaciones sin silencio entre ellas (el búfer nunca se vació en el ataque) | Apaga las cuerdas con más decisión entre pulsaciones |
| Existe una celda (cuerda, nota) en una cuerda que no puede producirla | **Índice de cuerda mal seleccionado** | Borra esas entradas — no entrenes con ellas |

Después entrena (`Train Model` en el Recording Studio) y observa implícitamente la **confusión entre cuerdas adyacentes**: si la precisión de validación es alta pero las predicciones en vivo confunden las cuerdas 4/5 en notas graves, tus celdas de cuerdas graves están demasiado finas — vuelve y engorda exactamente esas.

---

## 6. Qué *no* hacer

- No grabes todas las dinámicas agrupadas ("primero todas las pulsaciones suaves") — los efectos de lote se correlacionan con el tiempo y se cuelan en features como el SNR.
- No toquetees la ganancia de la interfaz entre cuerdas. Cambiarla a mitad de dataset es sobrevivible (el SNR es invariante a la ganancia, los MFCC son bastante robustos al nivel) pero es varianza inútil.
- No grabes cerca de un ventilador/aire acondicionado que se enciende y apaga — un suelo de ruido cambiante marea la puerta y la feature de SNR.
- No reutilices un dataset después de cambiar el calibre o la marca de las cuerdas. B *es* la cuerda; cuerdas nuevas = dataset nuevo (eso es la feature funcionando, no un bug).
- No rellenes celdas finas con copias ni ruido sintético — las secuencias duplicadas se fugan a través de la división train/val e inflan la precisión de validación, que es exactamente como este proyecto se dejó engañar una vez.

---

## 7. Datasets multi-guitarra (generalización entre guitarras)

Grabar varias guitarras habilita dos cosas: una medición honesta de cómo generaliza el modelo a instrumentos que nunca vio, y **modelos por familia** (p. ej. uno para acústicas y otro para eléctricas) entrenados filtrando por el tag. La limitación de una sola guitarra está documentada en [audio-pipeline.es.md](audio-pipeline.es.md) §9 — esta sección es la herramienta para atacarla.

- **Etiqueta cada sesión.** Configura el campo `Guitar tag` antes de grabar; cada secuencia capturada lo incrusta como `guitarId`. Usa un id estable por instrumento **y juego de cuerdas** (`strat-daddario-10s`) — un cambio de cuerdas implica un tag nuevo, porque B *es* la cuerda (§6). Los tags sobreviven a las fusiones con `Import dataset`, a las restauraciones del autoguardado y a las descargas.
- **Protocolo completo por guitarra.** Cada instrumento recibe ambas pasadas y la rejilla de variación completa (§3). El balance también importa entre guitarras: mantén los conteos máx/mín de secuencias por cuerda ≤ 1.5× *entre* guitarras, o el modelo agrupado se especializará en silencio en la mejor representada.
- **Empieza con instrumentos comparables.** Acústicas de cuerdas de acero por la misma cadena de señal son un primer experimento ganable. Una eléctrica de pastillas magnéticas añade un filtro de peine fijo más una respuesta de transductor distinta — trata las eléctricas como su propia familia en lugar de esperar transferencia acústica↔eléctrica. Las cuerdas de nylon dejan B cerca del suelo de la feature y probablemente rompen la feature estrella por completo.
- **Evalúa con la división leave-one-guitar-out, nunca con la estratificada.** La división estratificada valida sobre guitarras que el modelo ya vio, así que la `val_acc` agrupada no dice nada sobre un instrumento nuevo. Pulsa `Train` e introduce el tag a excluir (déjalo vacío para la división estratificada normal), o llama a `trainModel(data, { holdOutGuitarId })`. Rota la guitarra excluida entre ejecuciones. Los modelos entrenados en modo LOGO llevan un marcador en `notes` en su entrada del manifiesto: son para medir, no para desplegar.
- **Salvedad conocida**: las `normalizedFeatures` se normalizan en z-score al descargar con las estadísticas de todo el conjunto, así que una pizca de la guitarra excluida se filtra en la normalización. Es de segundo orden frente al efecto que se mide (la multimodalidad de B por guitarra); un modo con estadísticas solo de entrenamiento es trabajo futuro si los números se acercan.
- **Especialistas por familia**: fusiona los archivos de una familia con `Import dataset`, entrena normalmente (división estratificada) y despliega el resultado como su propia entrada del manifiesto con sus propias estadísticas. Nota: el motor de predicción carga actualmente las claves de modo fijas `performance`/`precision` — exponer la selección de modelos por familia en la UI es un paso posterior.
- **Ajuste de expectativas**: un modelo multi-guitarra agrupado normalmente puntuará algo *más bajo* en cada guitarra individual que un especialista de una sola guitarra (las distribuciones de clase se vuelven multimodales) — ese es el precio de la robustez, no una regresión. El número que importa es el de la guitarra excluida.
