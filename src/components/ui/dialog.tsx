'use client';

import { Fragment, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export interface DialogProps {
  isOpen?: boolean;
  open?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

export function Dialog({ isOpen, open, onClose, onOpenChange, title, description, children, size = 'md', showCloseButton = true }: DialogProps) {
  const visible = open ?? isOpen ?? false;
  const close = () => { onClose?.(); onOpenChange?.(false); };
  if (!visible) return null;
  const sizeClasses = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', full: 'max-w-4xl', icon: 'max-w-md' };
  return <Fragment><div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" onClick={close} aria-hidden="true" /><div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby={title ? 'dialog-title' : undefined} aria-describedby={description ? 'dialog-description' : undefined}><div className={"bg-white rounded-xl shadow-xl w-full " + sizeClasses[size]} onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between p-6 border-b"><div>{title && <h2 id="dialog-title" className="text-xl font-semibold">{title}</h2>}{description && <p id="dialog-description" className="text-sm text-muted-foreground mt-1">{description}</p>}</div>{showCloseButton && <Button variant="ghost" size="icon" onClick={close} className="-mr-2"><X className="h-4 w-4" /></Button>}</div><div className="p-6">{children}</div></div></div></Fragment>;
}

export interface DialogFooterProps { children: ReactNode; className?: string; }
export function DialogFooter({ children, className }: DialogFooterProps) {
  return <div className={"flex items-center justify-end space-x-3 p-6 border-t bg-muted/50 rounded-b-xl " + (className || '')}>{children}</div>;
}