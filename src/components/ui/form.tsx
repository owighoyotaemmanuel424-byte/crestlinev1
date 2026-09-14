'use client';

import { useState, FormEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface FormFieldProps {
  name: string;
  label?: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}

export interface FormProps {
  fields: FormFieldProps[];
  initialValues: Record<string, any>;
  onSubmit: (values: Record<string, any>) => void | Promise<void>;
  submitText?: string;
  className?: string;
  children?: (props: { values: Record<string, any>; setValue: (name: string, value: any) => void; errors: Record<string, string> }) => ReactNode;
}

export function Form({ fields, initialValues, onSubmit, submitText = 'Submit', className = '', children }: FormProps) {
  const [values, setValues] = useState<Record<string, any>>(initialValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const setValue = (name: string, value: any) => { setValues((prev) => ({ ...prev, [name]: value })); if (errors[name]) setErrors((prev) => ({ ...prev, [name]: '' })); };
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => { const { name, value, type, checked } = e.target; setValue(name, type === 'checkbox' ? checked : value); };
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setIsSubmitting(true); setSubmitError(null);
    const newErrors: Record<string, string> = {};
    fields.forEach((field) => { if (field.required && !values[field.name]) newErrors[field.name] = (field.label || field.name) + ' is required'; });
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); setIsSubmitting(false); return; }
    try { await onSubmit(values); } catch (error: any) { setSubmitError(error.message || 'An error occurred'); } finally { setIsSubmitting(false); }
  };
  if (children) { return <form onSubmit={handleSubmit} className={className}>{submitError && <Alert variant="destructive" className="mb-6"><AlertDescription>{submitError}</AlertDescription></Alert>}{children({ values, setValue, errors })}<Button type="submit" isLoading={isSubmitting}>{submitText}</Button></form>; }
  return <form onSubmit={handleSubmit} className={"space-y-6 " + className}>{submitError && <Alert variant="destructive"><AlertDescription>{submitError}</AlertDescription></Alert>}<div className="space-y-4">{fields.map((field) => <div key={field.name}>{field.label && <label className="mb-2 block text-sm font-medium text-foreground">{field.label}{field.required && <span className="text-destructive ml-1">*</span>}</label>}<Input type={field.type || 'text'} name={field.name} value={values[field.name] || ''} onChange={handleChange} placeholder={field.placeholder} disabled={field.disabled} className={errors[field.name] ? 'border-destructive' : ''} />{errors[field.name] && <p className="mt-2 text-sm text-destructive">{errors[field.name]}</p>}</div>)}</div><Button type="submit" isLoading={isSubmitting}>{submitText}</Button></form>;
}
