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
