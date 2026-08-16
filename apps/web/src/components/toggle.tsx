"use client";

import { useId, useState } from "react";

/**
 * A switch backed by a real checkbox.
 *
 * The checkbox is the control — visually hidden but focusable, so it submits
 * with the form, announces itself to a screen reader, and toggles with the
 * space bar. A div with an onClick would need all three re-implemented, usually
 * badly.
 */
export function Toggle({
  name,
  label,
  description,
  defaultChecked,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  const id = useId();
  const [checked, setChecked] = useState(defaultChecked ?? false);

  return (
    <div className="flex items-start gap-3">
      <label
        htmlFor={id}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        } ${checked ? "bg-sky-600" : "bg-slate-300"} focus-within:ring-2 focus-within:ring-sky-200`}
      >
        <input
          id={id}
          name={name}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            setChecked(event.target.checked);
            onChange?.(event.target.checked);
          }}
        />
        <span
          aria-hidden="true"
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </label>

      <label htmlFor={id} className={disabled ? "cursor-not-allowed" : "cursor-pointer"}>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description ? (
          <span className="block text-xs text-slate-500">{description}</span>
        ) : null}
      </label>
    </div>
  );
}
