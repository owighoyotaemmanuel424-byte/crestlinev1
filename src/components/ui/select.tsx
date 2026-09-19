'use client';

import { ReactNode } from 'react';

export interface SelectOption { value: string; label: string; disabled?: boolean; }
export interface SelectProps {
  options?: SelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  error?: string;
  className?: string;
  children?: ReactNode;
}
export interface SelectOptionProps { value: string; disabled?: boolean; children?: ReactNode; }

function SelectBase({ options = [], value = '', onChange, onValueChange, placeholder = 'Select an option', disabled = false, label, error, className = '', children }: SelectProps) {
  const handleChange = (next: string) => { onChange?.(next); onValueChange?.(next); };
  const optionNodes = children ?? options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>);
  return (
    <div className={'w-full ' + className}>
      {label && <label className="mb-2 block text-sm font-medium text-foreground">{label}</label>}
      <select value={value} onChange={e => handleChange(e.target.value)} disabled={disabled} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
        {!children && <option value="" disabled>{placeholder}</option>}
        {optionNodes}
      </select>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
function SelectOption({ value, disabled = false, children }: SelectOptionProps) {
  return <option value={value} disabled={disabled}>{children}</option>;
}
export const Select = Object.assign(SelectBase, { Option: SelectOption });
