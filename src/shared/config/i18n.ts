import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
    en: {
        translation: {
            reloadPrompt: {
                offlineReady: "App ready to work offline",
                newContentAvailable: "New content available, click on reload button to update.",
                reload: "Reload",
                close: "Close"
            },
            title: "Fretboard Trainer",
            subtitle: "Visualize scales and master the fretboard.",
            listeningModal: {
                title: "Start Listening",
                description: "Pick your input device. Detection is intended for an electric guitar running through an audio interface. Audio is analyzed locally on your device — nothing is uploaded.",
                start: {
                    title: "Start",
                    desc: "String and fret detection runs on the Essentia (WebAssembly) engine.",
                    warning: "⚠️ WebAssembly is not supported in this browser — listening is unavailable."
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
                stopListening: "Stop Listening",
                inputDevice: "Input Device",
                selectDevice: "Select a device",
                requestMic: "Request Microphone Access",
                selectedScale: "Selected Scale",
                baseTonality: "Base Tonality",
                categories: {
                    MAJOR_BASED: "Major",
                    MINOR_BASED: "Minor",
                    OTHER: "Other / Symmetrical"
                },
                alterations: "Alterations",
                colorScheme: "Color Scheme",
                themeOklch: "OKLCH (Perceptual)",
                themeLegacy: "Legacy (Bright)",
                stringCountVal: "{{count}} Strings",
                editSettings: "Edit key & scale",
                scaleLengths: {
                    all: "All Lengths",
                    5: "Pentatonic (5 notes)",
                    6: "Hexatonic (6 notes)",
                    7: "Heptatonic (7 notes)",
                },
            },
            instruments: {
                GUITAR: "Guitar",
                BASS: "Bass",
                UKULELE: "Ukulele"
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
                LOCRIAN: "Locrian (Mode 7)",
                DOUBLE_HARMONIC: "Double Harmonic",
                HUNGARIAN_MINOR: "Hungarian Minor",
                NEAPOLITAN_MINOR: "Neapolitan Minor",
                NEAPOLITAN_MAJOR: "Neapolitan Major",
                HARMONIC_MINOR: "Harmonic Minor",
                MELODIC_MINOR: "Melodic Minor",
                DOUBLE_HARMONIC_PENTATONIC: "Double Harmonic Pentatonic",
                DOUBLE_HARMONIC_HEXATONIC_M2: "Double Harmonic Hexatonic (Add M2)",
                DOUBLE_HARMONIC_HEXATONIC_AUG4: "Double Harmonic Hexatonic (Add Aug4)"
            },
            modes: {
                scale: "Scale Explorer",
                chord: "Chord Viewer",
                library: "Chord Library"
            },
            groups: {
                triads: "Triads",
                sevenths: "Sevenths",
                extended: "Extended",
                suspended: "Suspended & Added"
            },
            chordFamilies: {
                major: "Major",
                dominant: "Dominant",
                minor: "Minor",
                diminished: "Diminished",
                augmented: "Augmented",
                modifiers: "Sus / add",
                triad: "Triad"
            },
            chords: {
                MAJOR: "Major",
                MINOR: "Minor",
                DIMINISHED: "Diminished",
                AUGMENTED: "Augmented",
                MAJB5: "Major b5",
                SUS2B5: "Sus2 b5",
                SUS2: "Sus2",
                SUS4: "Sus4",
                ADD2: "Add2",
                ADD4: "Add4",
                ADD6: "Add6",
                ADD9: "Add9",
                MINADD9: "Minor Add9",
                DOM7: "Dominant 7",
                MAJ7: "Major 7",
                MIN7: "Minor 7",
                MIN7B5: "Minor 7b5",
                DIM7: "Diminished 7",
                MINMAJ7: "Minor Major 7",
                DOM9: "Dominant 9",
                MAJ9: "Major 9",
                MIN9: "Minor 9",
                DOM11: "Dominant 11",
                MAJ11: "Major 11",
                MIN11: "Minor 11",
                DOM13: "Dominant 13",
                MAJ13: "Major 13",
                MIN13: "Minor 13"
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
            fretboard: {
                allNotes: "All Notes",
                voicingXofY: "Voicing {{current}} of {{total}}",
                selected: "Selected",
                voicing: "Voicing",
                openPosition: "Open Position",
                fretX: "Fret {{fret}}"
            },
            language: "Language",
            queue: {
                title: "Chord Sequence",
                addToQueue: "Add to Sequence",
                next: "Next Chord",
                previous: "Previous Chord",
                remove: "Remove Chord",
                clear: "Clear Sequence",
                empty: "Sequence is empty",
                share: "Share Sequence",
                shareCopied: "Copied!"
            },
            harmony: {
                explore: "Explore Extended Harmony",
                hide: "Hide Extended Harmony",
                inKey: "In Key",
                secondary: "Secondary Dominants",
                borrowed: "Modal Interchange",
                mediant: "Chromatic Mediants"
            },
            intervals: {
                unison: "Unison",
                min2: "Minor 2nd",
                maj2: "Major 2nd",
                min3: "Minor 3rd",
                maj3: "Major 3rd",
                perf4: "Perfect 4th",
                tritone: "Tritone",
                perf5: "Perfect 5th",
                min6: "Minor 6th",
                maj6: "Major 6th",
                min7: "Minor 7th",
                maj7: "Major 7th",
                octave: "Octave",
                min9: "Minor 9th",
                maj9: "Major 9th",
                min10: "Minor 10th",
                maj10: "Major 10th",
                perf11: "Perfect 11th",
                aug11: "Augmented 11th",
                perf12: "Perfect 12th",
                min13: "Minor 13th",
                maj13: "Major 13th",
                min14: "Minor 14th",
                maj14: "Major 14th",
                octaves_one: "Octave",
                octaves_other: "Octaves"
            }
        }
    },
    es: {
        translation: {
            reloadPrompt: {
                offlineReady: "Aplicación lista para funcionar sin conexión",
                newContentAvailable: "Nuevo contenido disponible, haz clic en el botón de recargar para actualizar.",
                reload: "Recargar",
                close: "Cerrar"
            },
            title: "Entrenador de Diapasón",
            subtitle: "Visualiza escalas y domina el diapasón.",
            listeningModal: {
                title: "Comenzar a Escuchar",
                description: "Elige tu dispositivo de entrada. La detección está pensada para una guitarra eléctrica conectada a través de una interfaz de audio. El audio se analiza localmente en tu dispositivo — no se sube nada.",
                start: {
                    title: "Comenzar",
                    desc: "La detección de cuerda y traste corre sobre el motor Essentia (WebAssembly).",
                    warning: "⚠️ WebAssembly no está soportado en este navegador — la escucha no está disponible."
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
                stopListening: "Dejar de Escuchar",
                inputDevice: "Dispositivo de Entrada",
                selectDevice: "Selecciona un dispositivo",
                requestMic: "Solicitar Acceso al Micrófono",
                selectedScale: "Escala Seleccionada",
                baseTonality: "Tonalidad Base",
                categories: {
                    MAJOR_BASED: "Mayor",
                    MINOR_BASED: "Menor",
                    OTHER: "Otras / Simétricas"
                },
                colorScheme: "Esquema de Colores",
                themeOklch: "OKLCH (Perceptual)",
                themeLegacy: "Heredado (Brillante)",
                stringCountVal: "{{count}} Cuerdas",
                editSettings: "Editar tonalidad y escala",
                scaleLengths: {
                    all: "Todas las Longitudes",
                    5: "Pentatónica (5 notas)",
                    6: "Hexatónica (6 notas)",
                    7: "Heptatónica (7 notas)"
                },
            },
            instruments: {
                GUITAR: "Guitarra",
                BASS: "Bajo",
                UKULELE: "Ukelele"
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
                LOCRIAN: "Locrio (Modo 7)",
                DOUBLE_HARMONIC: "Doble Armónica",
                HUNGARIAN_MINOR: "Menor Húngara",
                NEAPOLITAN_MINOR: "Menor Napolitana",
                NEAPOLITAN_MAJOR: "Mayor Napolitana",
                HARMONIC_MINOR: "Menor Armónica",
                MELODIC_MINOR: "Menor Melódica",
                DOUBLE_HARMONIC_PENTATONIC: "Pentatónica Doble Armónica",
                DOUBLE_HARMONIC_HEXATONIC_M2: "Hexatónica Doble Armónica (Añade 2M)",
                DOUBLE_HARMONIC_HEXATONIC_AUG4: "Hexatónica Doble Armónica (Añade 4A)"
            },
            modes: {
                scale: "Explorador de Escalas",
                chord: "Visor de Acordes",
                library: "Biblioteca de Acordes"
            },
            groups: {
                triads: "Tríadas",
                sevenths: "Séptimas",
                extended: "Extendidos",
                suspended: "Suspendidas y Añadidas"
            },
            chordFamilies: {
                major: "Mayor",
                dominant: "Dominante",
                minor: "Menor",
                diminished: "Disminuido",
                augmented: "Aumentado",
                modifiers: "Sus / add",
                triad: "Tríada"
            },
            chords: {
                MAJOR: "Mayor",
                MINOR: "Menor",
                DIMINISHED: "Disminuido",
                AUGMENTED: "Aumentado",
                MAJB5: "Mayor b5",
                SUS2B5: "Sus2 b5",
                SUS2: "Sus2",
                SUS4: "Sus4",
                ADD2: "Add2",
                ADD4: "Add4",
                ADD6: "Add6",
                ADD9: "Add9",
                MINADD9: "Menor Add9",
                DOM7: "Dominante 7",
                MAJ7: "Mayor 7",
                MIN7: "Menor 7",
                MIN7B5: "Menor 7b5 (Semidisminuido)",
                DIM7: "Disminuido 7",
                MINMAJ7: "Menor Mayor 7",
                DOM9: "Dominante 9",
                MAJ9: "Mayor 9",
                MIN9: "Menor 9",
                DOM11: "Dominante 11",
                MAJ11: "Mayor 11",
                MIN11: "Menor 11",
                DOM13: "Dominante 13",
                MAJ13: "Mayor 13",
                MIN13: "Menor 13"
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
            fretboard: {
                allNotes: "Todas las Notas",
                voicingXofY: "Posición {{current}} de {{total}}",
                selected: "Selecc.",
                voicing: "Posición",
                openPosition: "Posición Abierta",
                fretX: "Traste {{fret}}"
            },
            language: "Idioma",
            queue: {
                title: "Secuencia de Acordes",
                addToQueue: "Añadir a la Secuencia",
                next: "Siguiente Acorde",
                previous: "Acorde Anterior",
                remove: "Eliminar Acorde",
                clear: "Limpiar Secuencia",
                empty: "Secuencia vacía",
                share: "Compartir Secuencia",
                shareCopied: "¡Copiado!"
            },
            harmony: {
                explore: "Explorar Armonía Extendida",
                hide: "Ocultar Armonía Extendida",
                inKey: "En Tonalidad",
                secondary: "Dominantes Secundarios",
                borrowed: "Intercambio Modal",
                mediant: "Mediantes Cromáticas"
            },
            intervals: {
                unison: "Unísono",
                min2: "2ª Menor",
                maj2: "2ª Mayor",
                min3: "3ª Menor",
                maj3: "3ª Mayor",
                perf4: "4ª Justa",
                tritone: "Tritono",
                perf5: "5ª Justa",
                min6: "6ª Menor",
                maj6: "6ª Mayor",
                min7: "7ª Menor",
                maj7: "7ª Mayor",
                octave: "Octava",
                min9: "9ª Menor",
                maj9: "9ª Mayor",
                min10: "10ª Menor",
                maj10: "10ª Mayor",
                perf11: "11ª Justa",
                aug11: "11ª Aumentada",
                perf12: "12ª Justa",
                min13: "13ª Menor",
                maj13: "13ª Mayor",
                min14: "14ª Menor",
                maj14: "14ª Mayor",
                octaves_one: "Octava",
                octaves_other: "Octavas"
            }
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
