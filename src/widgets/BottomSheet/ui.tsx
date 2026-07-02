import React from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import './ui.css';

interface BottomSheetProps {
    title: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
}

// Mobile bottom sheet: an always-visible peek bar at the bottom of the screen
// opens a draggable panel. The panel is dragged from its handle only, so the
// content area can scroll freely.
const BottomSheet: React.FC<BottomSheetProps> = ({ title, open, onOpenChange, children }) => {
    const dragControls = useDragControls();

    return (
        <>
            {!open && (
                <button className="bottom-sheet-peek" onClick={() => onOpenChange(true)}>
                    <div className="bottom-sheet-handle" aria-hidden="true" />
                    <span className="bottom-sheet-peek-title">{title}</span>
                </button>
            )}

            <AnimatePresence>
                {open && (
                    <>
                        <motion.div
                            className="bottom-sheet-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => onOpenChange(false)}
                        />
                        <motion.div
                            className="bottom-sheet-panel"
                            role="dialog"
                            aria-modal="true"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
                            drag="y"
                            dragListener={false}
                            dragControls={dragControls}
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={{ top: 0, bottom: 0.6 }}
                            onDragEnd={(_e, info) => {
                                if (info.offset.y > 80 || info.velocity.y > 500) {
                                    onOpenChange(false);
                                }
                            }}
                        >
                            <div
                                className="bottom-sheet-handle-area"
                                onPointerDown={(e) => dragControls.start(e)}
                            >
                                <div className="bottom-sheet-handle" aria-hidden="true" />
                                <span className="bottom-sheet-peek-title">{title}</span>
                            </div>
                            <div className="bottom-sheet-content">
                                {children}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

export default BottomSheet;
