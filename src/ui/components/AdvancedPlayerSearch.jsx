import React, { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ADVANCED_FILTER_PRESETS,
  addPrefixForStat,
  allFilters,
  filtersByCategory,
} from '../../core/footballAdvancedFilters';

const CATEGORY_OPTIONS = [
  { value: 'bio', label: 'Bio' },
  { value: 'ratings', label: 'Ratings' },
  { value: 'stats', label: 'Stats' },
];

const OPERATORS = {
  numeric: [
    { value: 'eq', label: '=' },
    { value: 'neq', label: '≠' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '≥' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '≤' },
  ],
  string: [
    { value: 'contains', label: 'contains' },
    { value: 'eq', label: '=' },
    { value: 'neq', label: '≠' },
  ],
};

const firstFieldInCategory = (category) => filtersByCategory[category]?.[0]?.key ?? allFilters[0]?.key ?? 'name';

export default function AdvancedPlayerSearch({ filters, onChange, title = 'Advanced filters' }) {
  const activeFilters = filters ?? [];
  const hasFilters = activeFilters.length > 0;

  const chips = useMemo(() => activeFilters
    .map((filter) => {
      const field = allFilters.find((entry) => entry.key === filter.fieldKey);
      if (!field) return null;
      const operatorLabel = (OPERATORS[field.valueType] ?? []).find((op) => op.value === filter.operator)?.label ?? filter.operator;
      return `${field.label} ${operatorLabel} ${filter.value}`;
    })
    .filter(Boolean), [activeFilters]);

  const addRow = () => {
    const fieldKey = firstFieldInCategory('bio');
    onChange([
      ...activeFilters,
      { id: `f-${Date.now()}-${Math.random()}`, fieldKey, operator: 'contains', value: '' },
    ]);
  };

  const updateRow = (id, changes) => {
    onChange(activeFilters.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  };

  const removeRow = (id) => onChange(activeFilters.filter((row) => row.id !== id));

  const applyPreset = (key) => {
    const preset = ADVANCED_FILTER_PRESETS[key] ?? [];
    onChange(preset.map((row, idx) => ({ ...row, id: `${row.id}-${idx}-${Date.now()}` })));
  };

  return (
    <div style={{ border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 'var(--text-sm)' }}>{title}</strong>
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button variant="ghost" onClick={() => applyPreset('youngHighPotential')}>Young high-potential</Button>
          <Button variant="ghost" onClick={() => applyPreset('cheapStarters')}>Cheap starters</Button>
          <Button variant="ghost" onClick={() => applyPreset('expiringContracts')}>Expiring</Button>
          <Button variant="ghost" onClick={() => applyPreset('draftSteals')}>Draft steals</Button>
          <Button variant="ghost" onClick={() => onChange([])} disabled={!hasFilters}>Clear all</Button>
          <Button variant="default" onClick={addRow}>+ Add filter</Button>
        </div>
      </div>

      {activeFilters.map((row) => {
        const selectedField = allFilters.find((entry) => entry.key === row.fieldKey) ?? allFilters[0];
        const fieldOptions = filtersByCategory[selectedField.category] ?? [];
        const operatorOptions = OPERATORS[selectedField.valueType] ?? OPERATORS.string;

        return (
          <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px 1fr auto', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <select
              value={selectedField.category}
              onChange={(event) => {
                const category = event.target.value;
                const nextField = firstFieldInCategory(category);
                const nextMeta = allFilters.find((entry) => entry.key === nextField);
                updateRow(row.id, { fieldKey: nextField, operator: nextMeta?.valueType === 'numeric' ? 'gte' : 'contains', value: '' });
              }}
            >
              {CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <select value={row.fieldKey} onChange={(event) => updateRow(row.id, { fieldKey: event.target.value, value: '' })}>
              {fieldOptions.map((field) => <option key={field.key} value={field.key}>{addPrefixForStat(field)}</option>)}
            </select>
            <select value={row.operator} onChange={(event) => updateRow(row.id, { operator: event.target.value })}>
              {operatorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <Input
              type={selectedField.valueType === 'numeric' ? 'number' : 'text'}
              value={row.value}
              onChange={(event) => updateRow(row.id, { value: event.target.value })}
              placeholder={selectedField.valueType === 'numeric' ? 'Value' : 'Text'}
            />
            <Button variant="ghost" onClick={() => removeRow(row.id)}>✕</Button>
          </div>
        );
      })}

      {chips.length > 0 && (
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {chips.map((chip) => (
            <span key={chip} style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', borderRadius: 999, background: 'var(--surface-strong)' }}>{chip}</span>
          ))}
        </div>
      )}
    </div>
  );
}
