import React from 'react';

export interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, activeTab, onChange, className = '' }: TabsProps) {
  return (
    <div className={`flex items-end gap-0 border-b border-zinc-800 ${className}`}>
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`
              relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors
              ${isActive
                ? 'text-orange-400 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-orange-500'
                : 'text-zinc-500 hover:text-zinc-300'
              }
            `}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold
                  ${isActive
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-zinc-700 text-zinc-400'
                  }
                `}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
