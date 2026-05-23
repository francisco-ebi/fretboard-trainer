/**
 * Dibuja un "Cepstrograma" en un canvas
 * @param {HTMLCanvasElement} canvas - Referencia al elemento <canvas>
 * @param {Array} frames - Array de vectores (solo la parte de MFCCs)
 */
export function drawCepstrogram(canvas: HTMLCanvasElement, frames: number[][]) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Limpiar canvas
    ctx.clearRect(0, 0, width, height);

    if (!frames || frames.length === 0) return;

    // Dimensiones de cada "pixel" del gráfico
    const numFrames = frames.length;
    const numCoeffs = 13; // Asumimos que usas 13 MFCCs

    const cellWidth = width / numFrames;
    const cellHeight = height / numCoeffs;

    // Encontrar max y min para normalizar el color dinámicamente
    // (O puedes usar valores fijos si ya sabes tu rango, ej: -20 a 20)
    let min = Infinity, max = -Infinity;
    frames.forEach(frame => {
        // Solo miramos los primeros 13 valores (los MFCC)
        // TIP: Empezamos en 1 para ignorar MFCC[0] (Energía) si es necesario, 
        // pero aquí iteramos todo el rango de interés (1 a numCoeffs)
        for (let i = 1; i < numCoeffs; i++) {
            if (frame[i] < min) min = frame[i];
            if (frame[i] > max) max = frame[i];
        }
    });

    // Dibujar
    for (let t = 0; t < numFrames; t++) {
        // En un espectrograma, las frecuencias bajas (coeficientes bajos) van abajo
        // Así que dibujamos el MFCC[1] abajo y MFCC[12] arriba
        for (let c = 1; c < numCoeffs; c++) {
            const valor = frames[t][c];

            // Convertir valor a color
            const color = valorAColor(valor, min, max);

            ctx.fillStyle = color;

            // Coordenadas (Invertimos Y para que el índice 1 quede abajo)
            const y = height - (c * cellHeight);
            const x = t * cellWidth;

            // +1 en width para evitar líneas blancas por redondeo
            ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1);
        }
    }
}

// Función auxiliar para mapa de calor (Azul -> Verde -> Rojo)
function valorAColor(val: number, min: number, max: number) {
    // Normalizar a 0..1
    let pct = (val - min) / (max - min);
    pct = Math.max(0, Math.min(1, pct)); // Clamp

    // HSL: 240 (Azul) a 0 (Rojo)
    const hue = (1 - pct) * 240;
    return `hsl(${hue}, 100%, 50%)`;
}