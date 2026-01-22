import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
    en: {
        translation: {
            title: "Fretboard Trainer",
            subtitle: "Visualize scales and master the fretboard.",
            controls: {
                instrument: "Instrument",
                key: "Key (Root Note)",
                scale: "Scale Type",
                noteNames: "Note Names",
                orientation: "Orientation"
            },
            instruments: {
                GUITAR: "Guitar",
                BASS: "Bass"
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
                rootColor: "Red: Root Note (Tonic)",
                intervalColor: "Blue: Interval Note"
            },
            language: "Language"
        }
    },
    es: {
        translation: {
            title: "Entrenador de Diapasón",
            subtitle: "Visualiza escalas y domina el diapasón.",
            controls: {
                instrument: "Instrumento",
                key: "Tonalidad (Nota Raíz)",
                scale: "Tipo de Escala",
                noteNames: "Nombres de Notas",
                orientation: "Orientación"
            },
            instruments: {
                GUITAR: "Guitarra",
                BASS: "Bajo"
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
                rootColor: "Rojo: Nota Raíz (Tónica)",
                intervalColor: "Azul: Nota de Intervalo"
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
