import React from 'react';
import './Spinner.css';

interface SpinnerProps {
    className?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ className = '' }) => (
    <span className={['ft-spinner', className].filter(Boolean).join(' ')} role="status" aria-label="Loading" />
);
