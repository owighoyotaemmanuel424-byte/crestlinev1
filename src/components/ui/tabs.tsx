'use client';

import { useState } from 'react';

export interface TabItem { value: string; label: string; disabled?: boolean; icon?: React.ReactNode; }
export interface TabsProps { items: TabItem[]; defaultValue?: string; onChange?: (value: string) => void; className?: string; }

export function Tabs({ items, defaultValue, onChange, className = '' }: TabsProps) {
  const [activeTab, setActiveTab] = useState<string>(defaultValue || items[0]?.value || '');
  const handleTabChange = (value: string) => { if (items.find((item) => item.value === value)?.disabled) return; setActiveTab(value); onChange?.(value); };
  return <div className={"border-b " + className}><nav className="flex space-x-8">{items.map((item) => { const isActive = activeTab === item.value; const isDisabled = item.disabled; return <button key={item.value} onClick={() => handleTabChange(item.value)} disabled={isDisabled} className={"flex items-center py-4 px-1 border-b-2 text-sm font-medium transition-colors " + (isActive ? 'border-blue-500 text-blue-600' : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-200') + " " + (isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer')}><span className="mr-2">{item.icon}</span>{item.label}</button>; })}</nav></div>;
}

export interface TabContentProps { value: string; activeTab: string; children: React.ReactNode; }
export function TabContent({ value, activeTab, children }: TabContentProps) { if (value !== activeTab) return null; return <div className="py-6">{children}</div>; }
