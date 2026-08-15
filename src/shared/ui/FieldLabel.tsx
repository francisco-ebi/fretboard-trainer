import React from 'react';
import './FieldLabel.css';

interface FieldLabelProps extends React.HTMLAttributes<HTMLElement> {
    /** default = control label, eyebrow = emphasized section label, quiet = muted micro-label */
    variant?: 'default' | 'eyebrow' | 'quiet';
    as?: 'label' | 'span' | 'div';
    htmlFor?: string;
}

// The uppercase micro-label that sits above a control. Uppercasing happens
// in CSS, so write labels in Title Case for translation safety.
export const FieldLabel: React.FC<FieldLabelProps> = ({
    variant = 'default',
    as = 'label',
    className = '',
    children,
    ...rest
}) => {
    const map: Record<NonNullable<FieldLabelProps['variant']>, string> = {
        default: '',
        eyebrow: 'ft-label--eyebrow',
        quiet: 'ft-label--quiet',
    };
    const classes = ['ft-label', map[variant], className].filter(Boolean).join(' ');
    const Component = as;
    return (
        <Component className={classes} {...rest}>
            {children}
        </Component>
    );
};

interface FieldProps {
    label?: React.ReactNode;
    labelVariant?: FieldLabelProps['variant'];
    htmlFor?: string;
    className?: string;
    children?: React.ReactNode;
}

// Label + control stack, e.g. a key or scale selector.
export const Field: React.FC<FieldProps> = ({ label, labelVariant = 'default', htmlFor, className = '', children }) => (
    <div className={['ft-field', className].filter(Boolean).join(' ')}>
        {label ? (
            <FieldLabel variant={labelVariant} htmlFor={htmlFor}>
                {label}
            </FieldLabel>
        ) : null}
        {children}
    </div>
);
