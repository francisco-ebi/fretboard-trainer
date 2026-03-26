import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './CircleOfFifths.css';
import { type Note } from '@/utils/musicTheory';

interface CircleOfFifthsProps {
    selectedRoot: Note;
    onRootChange: (root: Note) => void;
}

const KEYS: { main: Note; alt?: Note }[] = [
    { main: 'C', alt: 'B#' },
    { main: 'G' },
    { main: 'D' },
    { main: 'A' },
    { main: 'E', alt: 'Fb' },
    { main: 'B', alt: 'Cb' },
    { main: 'Gb', alt: 'F#' },
    { main: 'Db', alt: 'C#' },
    { main: 'Ab', alt: 'G#' },
    { main: 'Eb', alt: 'D#' },
    { main: 'Bb', alt: 'A#' },
    { main: 'F', alt: 'E#' }
];

const WEDGE_PATH = "M 88.35 56.53 L 74.12 3.41 A 100 100 0 0 1 125.88 3.41 L 111.65 56.53 A 45 45 0 0 0 88.35 56.53 Z";

const CircleOfFifths: React.FC<CircleOfFifthsProps> = ({ selectedRoot, onRootChange }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const handleKeySelect = (key: Note) => {
        onRootChange(key);
        setIsExpanded(false);
    };

    return (
        <div className={`circle-of-fifths-container ${isExpanded ? 'expanded' : 'collapsed'}`}>
            <button 
                className="circle-center-toggle"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <span className="current-key">{selectedRoot}</span>
                <span className="key-label">Key</span>
            </button>

            <AnimatePresence>
                {isExpanded && (
                    <>
                        <div 
                            className="circle-overlay-backdrop" 
                            onClick={() => setIsExpanded(false)} 
                        />
                        <motion.svg 
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.8, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 350, damping: 25 }}
                            viewBox="0 0 200 200" 
                            className="circle-svg"
                        >
                {/* Defs to safely apply styles if needed */}
                <defs>
                    <filter id="glow">
                        <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>

                {KEYS.map((k, i) => {
                    const angleDeg = i * 30;
                    const angleRad = (angleDeg - 90) * (Math.PI / 180);
                    
                    // Radially center text for upright alignment
                    const textRadius = 72.5; 
                    const xText = 100 + textRadius * Math.cos(angleRad);
                    const yText = 100 + textRadius * Math.sin(angleRad);
                    
                    const isMainSelected = selectedRoot === k.main;
                    const isAltSelected = k.alt && selectedRoot === k.alt;
                    const isActiveSlice = isMainSelected || isAltSelected;

                    return (
                        <g key={i} className={`circle-slice ${isActiveSlice ? 'active' : ''}`}>
                            {/* The wedge background */}
                            <path 
                                d={WEDGE_PATH} 
                                transform={`rotate(${angleDeg}, 100, 100)`}
                                onClick={() => handleKeySelect(k.main)}
                                className="slice-bg"
                            />
                            
                            {/* Text explicitly upright */}
                            {k.alt ? (
                                <>
                                    <text 
                                        x={xText} 
                                        y={yText - 8} 
                                        className={`slice-text ${isMainSelected ? 'selected-text' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); handleKeySelect(k.main); }}
                                    >
                                        {k.main}
                                    </text>
                                    <text 
                                        x={xText} 
                                        y={yText + 12} 
                                        className={`slice-text alt-text ${isAltSelected ? 'selected-text' : ''}`}
                                        onClick={(e) => { e.stopPropagation(); handleKeySelect(k.alt!); }}
                                    >
                                        {k.alt}
                                    </text>
                                </>
                            ) : (
                                <text 
                                    x={xText} 
                                    y={yText} 
                                    className={`slice-text ${isMainSelected ? 'selected-text' : ''}`}
                                    onClick={(e) => { e.stopPropagation(); handleKeySelect(k.main); }}
                                >
                                    {k.main}
                                </text>
                            )}
                        </g>
                    );
                })}
                        </motion.svg>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default CircleOfFifths;
