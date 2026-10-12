'use client';

import { useId, useState } from 'react';
import { formatDuration } from '@/lib/formatDuration';

type SliderNumberInputProps = {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  /** Optional narrower slider range; manual entry retains the full valid range. */
  sliderMax?: number;
  step?: number;
  unit?: string;
  prefix?: string;
  optional?: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (value: number | undefined) => void;
};

export default function SliderNumberInput({ label, value, min, max, sliderMax = max, step = 5,
  unit, prefix, optional = false, disabled = false, hint, onChange }: SliderNumberInputProps) {
  const id = useId();
  // Temporary editing text only. The parent's numeric preference remains authoritative.
  const [editing, setEditing] = useState<{ text: string; value: number | undefined } | null>(null);
  const text = editing && Object.is(editing.value, value) ? editing.text : value === undefined ? '' : String(value);
  const parsed = text.trim() === '' ? undefined : Number(text);
  const invalid = parsed === undefined ? !optional : !Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || parsed > max;
  const rangeMax = Math.min(max, sliderMax);
  const sliderValue = Math.min(rangeMax, Math.max(min, min + Math.round(((value ?? min) - min) / step) * step));

  function edit(raw: string) {
    const numeric = raw.trim() === '' ? undefined : Number(raw);
    const valid = numeric === undefined ? optional : Number.isFinite(numeric) && Number.isInteger(numeric) && numeric >= min && numeric <= max;
    setEditing({ text: raw, value: valid ? numeric : value });
    if (valid) onChange(numeric);
  }

  function finishEditing() {
    if (text.trim() === '') {
      if (optional) onChange(undefined);
    } else if (Number.isFinite(parsed)) {
      onChange(Math.min(max, Math.max(min, Math.round(parsed!))));
    }
    setEditing(null);
  }

  return (
    <div className="slider-number-control">
      <label className="field-label" htmlFor={`${id}-number`}>{label}</label>
      <div className="slider-number-row">
        <input className="slider-number-range" type="range" min={min} max={rangeMax} step={step}
          value={sliderValue} disabled={disabled} aria-label={`${label} slider`}
          aria-describedby={`${id}-hint`} aria-valuetext={value === undefined ? 'No limit' : unit === 'min' ? formatDuration(value) : `${prefix ?? ''}${value}${unit ? ` ${unit}` : ''}`}
          onChange={event => { setEditing(null); onChange(Number(event.currentTarget.value)); }} />
        <div className="slider-number-value">
          {prefix && <span aria-hidden="true">{prefix}</span>}
          <input id={`${id}-number`} type="number" min={min} max={max} step={1} inputMode="numeric"
            value={text} placeholder={optional ? 'No limit' : undefined} required={!optional} disabled={disabled}
            aria-label={`${label} value`} aria-invalid={invalid || undefined} aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ''}`}
            onChange={event => edit(event.currentTarget.value)} onBlur={finishEditing} />
          {unit && <span aria-hidden="true">{unit}</span>}
        </div>
      </div>
      <p className="field-hint" id={`${id}-hint`}>{unit === 'min' && value !== undefined && <>{formatDuration(value)}. Enter minutes. </>}{hint}{optional && ' Clear the value for no limit.'}</p>
      {invalid && <p className="form-error" id={`${id}-error`} role="alert">Enter a whole number from {min} to {max}{optional ? ', or leave blank' : ''}.</p>}
    </div>
  );
}
