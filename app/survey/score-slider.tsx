"use client";

import { useId, useState } from "react";

const MIN_SCORE = 1;
const MAX_SCORE = 10;
const DEFAULT_SCORE = 5;

interface ScoreSliderProps {
  name: string;
  label: string;
}

// A 1-10 career fitness rating slider. Submits the same integer `name` field
// the server action already expects (native range input), while showing the
// live value next to the label as the user drags.
export function ScoreSlider({ name, label }: ScoreSliderProps) {
  const [value, setValue] = useState(DEFAULT_SCORE);
  const valueId = useId();

  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-1 items-center gap-3">
        <input
          id={name}
          name={name}
          type="range"
          required
          min={MIN_SCORE}
          max={MAX_SCORE}
          step={1}
          value={value}
          onChange={(event) => setValue(Number(event.target.value))}
          aria-describedby={valueId}
          className="flex-1 accent-primary"
        />
        <span
          id={valueId}
          aria-live="polite"
          className="w-6 shrink-0 text-right text-sm font-medium tabular-nums"
        >
          {value}
        </span>
      </div>
    </div>
  );
}

