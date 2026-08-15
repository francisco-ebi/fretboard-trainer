import React from 'react';
import './Well.css';

interface WellProps extends React.HTMLAttributes<HTMLDivElement> {
    /** default = solid dark fill, soft = lighter fill for carousels/nested wells */
    variant?: 'default' | 'soft';
    /** remove padding (for grids that manage their own) */
    flush?: boolean;
    /** optional clickable header row; implies flush */
    header?: React.ReactNode;
    onHeaderClick?: () => void;
}

// Recessed dark container for dense data: chord matrix, scale matrix. Flatter
// and darker than a glass panel — never nest one in another more than a level deep.
export const Well: React.FC<WellProps> = ({
    variant = 'default',
    flush = false,
    header,
    onHeaderClick,
    className = '',
    children,
    ...rest
}) => {
    const classes = ['ft-well'];
    if (variant === 'soft') classes.push('ft-well--soft');
    if (flush || header) classes.push('ft-well--flush');
    if (className) classes.push(className);

    return (
        <div className={classes.join(' ')} {...rest}>
            {header ? (
                <div className="ft-well__header" onClick={onHeaderClick}>
                    {header}
                </div>
            ) : null}
            {children}
        </div>
    );
};
