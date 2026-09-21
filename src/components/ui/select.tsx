'use client';

import { ChevronDown, type LucideIcon } from 'lucide-react';
import { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  options?: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  icon?: LucideIcon;
  children?: ReactNode;
}

export interface SelectOptionProps {
  value: string;
  disabled?: boolean;
  children?: ReactNode;
}

function SelectBase({
  options = [],
  value = '',
  onChange,
  onValueChange,
  placeholder = 'Select an option',
  disabled = false,
  label,
  error,
  hint,
  className = '',
  icon: Icon,
  children,
}: SelectProps) {
  const handleChange = (next: string) => {
    onChange?.(next);
    onValueChange?.(next);
  };

  const optionNodes =
    children ??
    options.map((option) => (
      <option key={option.value} value={option.value} disabled={option.disabled}>
        {option.label}
      </option>
    ));

  return (
    <div className={'w-full ' + className}>
      {label && <label className="chase-label">{label}</label>}
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
        )}
        <select
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          disabled={disabled}
          className={cn(
            'chase-input appearance-none pr-10',
            Icon && 'pl-11',
            error && 'border-destructive',
            value === '' && 'text-muted-foreground'
          )}
        >
          {children ? null : (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {optionNodes}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
      {hint && !error && (
        <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="mt-1.5 text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

function SelectOption({ value, disabled = false, children }: SelectOptionProps) {
  return (
    <option value={value} disabled={disabled}>
      {children}
    </option>
  );
}

export const Select = Object.assign(SelectBase, { Option: SelectOption });
