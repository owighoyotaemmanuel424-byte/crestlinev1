'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface SelectOption { value: string; label: string; disabled?: boolean; }
export interface SelectProps { options: SelectOption[]; value?: string; onChange?: (value: string) => void; placeholder?: string; disabled?: boolean; label?: string; error?: string; className?: string; }

export function Select({ options, value, onChange, placeholder = 'Select an option', disabled = false, label, error, className = '' }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>(options.find((opt) => opt.value === value)?.label || '');
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const selectedOption = options.find((opt) => opt.value === value); if (selectedOption) setSelectedLabel(selectedOption.label); }, [value, options]);
  useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false); }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []);
  const handleSelect = (option: SelectOption) => { if (option.disabled) return; onChange?.(option.value); setSelectedLabel(option.label); setIsOpen(false); };
  return <div className={"w-full " + className}>{label && <label className="mb-2 block text-sm font-medium text-foreground">{label}</label>}<div ref={dropdownRef} className="relative"><Button variant="outline" className="w-full justify-between h-10" onClick={() => !disabled && setIsOpen(!isOpen)} disabled={disabled}><span className={!selectedLabel ? 'text-muted-foreground' : ''}>{selectedLabel || placeholder}</span><ChevronDown className="h-4 w-4 opacity-50" /></Button>{isOpen && <div className="absolute z-50 mt-1 w-full rounded-md bg-white shadow-lg border"><div className="py-1 overflow-auto max-h-60">{options.map((option) => <button key={option.value} className={"w-full px-4 py-2 text-sm text-left hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed " + (option.value === value ? 'bg-muted/50' : '')} onClick={() => handleSelect(option)} disabled={option.disabled}>{option.label}</button>)}</div></div>}</div>{error && <p className="mt-2 text-sm text-destructive">{error}</p>}</div>;
}