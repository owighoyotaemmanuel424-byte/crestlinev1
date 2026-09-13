'use client';

import { Fragment, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

export function Dialog({ isOpen, onClose, title, description, children, size = 'md', showCloseButton = true }: DialogProps) {
  if (!isOpen) return null;
  const sizeClasses = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', full: 'max-w-4xl' };
  return <Fragment><div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={onClose} aria-hidden="true" /><div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={title ? 'dialog-title' : undefined} aria-describedby={description ? 'dialog-description' : undefined}><div className={"bg-white rounded-xl shadow-xl w-full " + sizeClasses[size]} onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between p-6 border-b"><div>{title && <h2 id="dialog-title" className="text-xl font-semibold">{title}</h2>}{description && <p id="dialog-description" className="text-sm text-muted-foreground mt-1">{description}</p>}</div>{showCloseButton && <Button variant="ghost" size="icon" onClick={onClose} className="-mr-2"><X className="h-4 w-4" /></Button>}</div><div className="p-6">{children}</div></div></Fragment>;
}

export interface DialogFooterProps { children: ReactNode; className?: string; }
export function DialogFooter({ children, className }: DialogFooterProps) {
  return <div className={"flex items-center justify-end space-x-3 p-6 border-t bg-muted/50 rounded-b-xl " + (className || '')}>{children}</div>;
}