import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
    en: {
        translation: {
            title: "Fretboard Trainer",
            subtitle: "Visualize scales and master the fretboard.",
            listeningModal: {
                title: "Select Listening Mode",
                description: "Choose the audio processing engine that best fits your device.",
                performance: {
                    title: "Performance Mode",
                    tag: "Recommended for Mobile",
                    desc: "Optimized for speed and lower battery usage. Best for smartphones or older devices."
                },
                precision: {
                    title: "Precision Mode",
                    tag: "Recommended for Desktop",
                    desc: "Offers higher accuracy but requires more processing power.",
                    warning: "⚠️ WebAssembly not supported"
                }
            },
            controls: {
                instrument: "Instrument",
                key: "Key (Root Note)",
                scale: "Scale Type",
                noteNames: "Note Names",
                orientation: "Orientation",
                advanced: "Advanced",
                strings: "Strings",
                tuning: "Tuning",
                setup: "Setup & Preferences",
                startListening: "Start Listening",
                stopListening: "Stop Listening"
            },
            instruments: {
                GUITAR: "Guitar",
                BASS: "Bass"
            },
            scales: {
                MAJOR: "Major (Ionian)",
                MINOR: "Minor (Aeolian)",
                PENTATONIC_MAJOR: "Major Pentatonic",
                PENTATONIC_MINOR: "Minor Pentatonic",
                BLUES: "Blues",
                IONIAN: "Ionian (Mode 1)",
                DORIAN: "Dorian (Mode 2)",
                PHRYGIAN: "Phrygian (Mode 3)",
                LYDIAN: "Lydian (Mode 4)",
                MIXOLYDIAN: "Mixolydian (Mode 5)",
                AEOLIAN: "Aeolian (Mode 6)",
                LOCRIAN: "Locrian (Mode 7)"
            },
            modes: {
                scale: "Scale Explorer",
                chord: "Chord Viewer"
            },
            orientations: {
                HORIZONTAL: "Horizontal",
                VERTICAL: "Vertical"
            },
            naming: {
                ENGLISH: "English (C, D, E)",
                SOLFEGE: "Solfège (Do, Re, Mi)"
            },
            help: {
                title: "Reference Guide",
                summary: "How to read the notes?",
                example: "Example",
                noteName: "Note Name",
                noteNameDesc: "Displays the pitch class (e.g., C, F#).",
                octave: "Octave",
                octaveDesc: "Indicates the pitch height/register.",
                interval: "Interval",
                intervalDesc: "Shows the degree relative to the Root.",
                rootColor: "Red: Root / Tonic (1)",
                thirdColor: "Gold: 3rd (Major/Minor)",
                fifthColor: "Blue: 5th (Perfect/Dim/Aug)",
                seventhColor: "Purple: 7th (Major/Minor)",
                otherColor: "White: Other Intervals (2, 4, 6)"
            },
            language: "Language"
        }
    },
    es: {
        translation: {
            title: "Entrenador de Diapasón",
            subtitle: "Visualiza escalas y domina el diapasón.",
            listeningModal: {
                title: "Seleccionar Modo de Escucha",
                description: "Elige el motor de procesamiento de audio que mejor se adapte a tu dispositivo.",
                performance: {
                    title: "Modo Rendimiento",
                    tag: "Recomendado para Móvil",
                    desc: "Optimizado para velocidad y menor consumo de batería. Ideal para smartphones o dispositivos antiguos."
                },
                precision: {
                    title: "Modo Precisión",
                    tag: "Recomendado para Escritorio",
                    desc: "Ofrece mayor precisión pero requiere más potencia de procesamiento.",
                    warning: "⚠️ WebAssembly no soportado"
                }
            },
            controls: {
                instrument: "Instrumento",
                key: "Tonalidad (Nota Raíz)",
                scale: "Tipo de Escala",
                noteNames: "Nombres de Notas",
                orientation: "Orientación",
                advanced: "Avanzado",
                strings: "Cuerdas",
                tuning: "Afinación",
                setup: "Configuración & Preferencias",
                startListening: "Comenzar a Escuchar",
                stopListening: "Dejar de Escuchar"
            },
            instruments: {
                GUITAR: "Guitarra",
                BASS: "Bajo"
            },
            scales: {
                MAJOR: "Mayor (Jónico)",
                MINOR: "Menor (Eólico)",
                PENTATONIC_MAJOR: "Pentatónica Mayor",
                PENTATONIC_MINOR: "Pentatónica Menor",
                BLUES: "Blues",
                IONIAN: "Jónico (Modo 1)",
                DORIAN: "Dórico (Modo 2)",
                PHRYGIAN: "Frigio (Modo 3)",
                LYDIAN: "Lidio (Modo 4)",
                MIXOLYDIAN: "Mixolidio (Modo 5)",
                AEOLIAN: "Eólico (Modo 6)",
                LOCRIAN: "Locrio (Modo 7)"
            },
            modes: {
                scale: "Explorador de Escalas",
                chord: "Visor de Acordes"
            },
            orientations: {
                HORIZONTAL: "Horizontal",
                VERTICAL: "Vertical"
            },
            naming: {
                ENGLISH: "Inglés (C, D, E)",
                SOLFEGE: "Solfeo (Do, Re, Mi)"
            },
            help: {
                title: "Guía de Referencia",
                summary: "¿Cómo leer las notas?",
                example: "Ejemplo",
                noteName: "Nombre de Nota",
                noteNameDesc: "Muestra la clase de tono (ej. C, F#).",
                octave: "Octava",
                octaveDesc: "Indica la altura/registro del tono.",
                interval: "Intervalo",
                intervalDesc: "Muestra el grado relativo a la Raíz.",
                rootColor: "Rojo: Raíz / Tónica (1)",
                thirdColor: "Dorado: 3ª (Mayor/Menor)",
                fifthColor: "Azul: 5ª (Justa/Dis/Aum)",
                seventhColor: "Morado: 7ª (Mayor/Menor)",
                otherColor: "Blanco: Otros Intervalos (2, 4, 6)"
            },
            language: "Idioma"
        }
    }
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false // react already safes from xss
        }
    });

export default i18n;
