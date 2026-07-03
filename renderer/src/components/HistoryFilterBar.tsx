import React from 'react';
import { Search, User, FileText, Calendar, X } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { HistoryFilters } from '../electron';

interface HistoryFilterBarProps {
  filters: HistoryFilters;
  onChange: (filters: HistoryFilters) => void;
  onApply: () => void;
  onClear: () => void;
}

export function HistoryFilterBar({ filters, onChange, onApply, onClear }: HistoryFilterBarProps) {
  const hasFilters = Object.values(filters).some(val => val !== undefined && val !== '');

  const handleChange = (key: keyof HistoryFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onApply();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-card border-b border-border shadow-sm text-sm transition-all">
      <div className="flex items-center gap-2 flex-1 min-w-[200px]">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="Search commit messages..."
          value={filters.message || ''}
          onChange={(e) => handleChange('message', e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-xs bg-background"
        />
      </div>
      
      <div className="flex items-center gap-2 flex-1 min-w-[150px]">
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="Author"
          value={filters.author || ''}
          onChange={(e) => handleChange('author', e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-xs bg-background"
        />
      </div>

      <div className="flex items-center gap-2 flex-1 min-w-[150px]">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          placeholder="Changed File Path"
          value={filters.file || ''}
          onChange={(e) => handleChange('file', e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-8 text-xs bg-background"
        />
      </div>

      <div className="flex items-center gap-2 w-[160px]">
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          type="date"
          placeholder="Since"
          value={filters.since || ''}
          onChange={(e) => handleChange('since', e.target.value)}
          onKeyDown={handleKeyDown}
          title="Since Date"
          style={{ colorScheme: 'dark' }}
          className="h-8 text-xs bg-background px-2" // Reduced padding for date input
        />
      </div>

      <div className="flex items-center gap-2 w-[160px]">
        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          type="date"
          placeholder="Until"
          value={filters.until || ''}
          onChange={(e) => handleChange('until', e.target.value)}
          onKeyDown={handleKeyDown}
          title="Until Date"
          style={{ colorScheme: 'dark' }}
          className="h-8 text-xs bg-background px-2"
        />
      </div>

      <div className="flex items-center gap-2 ml-auto shrink-0 pl-2 border-l border-border">
        {hasFilters && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClear} 
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            title="Clear Filters"
          >
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={onApply}
          className="h-8 text-xs px-4"
        >
          Apply Filters
        </Button>
      </div>
    </div>
  );
}
