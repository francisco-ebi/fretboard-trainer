import React, { useState } from 'react';
import './Disclosure.css';

interface DisclosureProps {
    summary: React.ReactNode;
    /** controlled open state; omit for internal state */
    open?: boolean;
    defaultOpen?: boolean;
    onToggle?: (open: boolean) => void;
    className?: string;
    children?: React.ReactNode;
}

// The collapsible card used for the Reference Guide and similar secondary
// explanations. Header shrinks when collapsed; the caret rotates 180deg.
// Content stays mounted and animates via a CSS grid-rows transition, so it
// keyboard-operates (Enter/Space) with aria-expanded already wired.
export const Disclosure: React.FC<DisclosureProps> = ({
    summary,
    open,
    defaultOpen = false,
    onToggle,
    className = '',
    children,
}) => {
    const [internal, setInternal] = useState(defaultOpen);
    const isOpen = open === undefined ? internal : open;

    const toggle = () => {
        if (open === undefined) setInternal(!isOpen);
        onToggle?.(!isOpen);
    };

    const classes = ['ft-disclosure', isOpen ? 'is-open' : 'is-collapsed', className].filter(Boolean).join(' ');

    return (
        <div className={classes}>
            <div
                className="ft-disclosure__header"
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                onClick={toggle}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggle();
                    }
                }}
            >
                {summary}
                <span className="ft-disclosure__arrow" aria-hidden="true">▼</span>
            </div>
            <div className="ft-disclosure__content-wrap">
                <div className="ft-disclosure__content">{children}</div>
            </div>
        </div>
    );
};
