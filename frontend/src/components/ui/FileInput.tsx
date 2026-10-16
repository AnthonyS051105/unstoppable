"use client";

import { useId, useRef, useState } from "react";
import { Icon } from "./Icon";

export function FileInput({
  label,
  name,
  accept,
  multiple,
  required,
  max,
  buttonLabel = "Pilih file",
  icon = "image",
  emptyText = "Belum ada file dipilih",
  hint,
  onFiles,
  onTooMany,
}: {
  label: string;
  name: string;
  accept?: string;
  multiple?: boolean;
  required?: boolean;

  max?: number;
  buttonLabel?: string;
  icon?: string;
  emptyText?: string;
  hint?: string;
  onFiles?: (files: File[]) => void;
  onTooMany?: () => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);

  const set = (list: File[]) => {
    setFiles(list);
    onFiles?.(list);
  };

  const status = files.length ? `${files.length} file dipilih: ${files.map((f) => f.name).join(", ")}` : emptyText;

  return (
    <div className="field file-field">
      <span id={`${id}-label`}>{label}</span>
      <div className="row">
        <label className="btn file-btn">
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            name={name}
            accept={accept}
            multiple={multiple}
            required={required}
            aria-labelledby={`${id}-label ${id}-btn`}
            aria-describedby={`${id}-status`}
            onChange={(e) => {
              const list = [...(e.currentTarget.files || [])];
              if (max && list.length > max) {
                e.currentTarget.value = "";
                set([]);
                onTooMany?.();
                return;
              }
              set(list);
            }}
          />
          <Icon name={icon} />
          <span id={`${id}-btn`}>{files.length ? "Ganti pilihan" : buttonLabel}</span>
        </label>
        {files.length ? (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = "";
              set([]);
              inputRef.current?.focus();
            }}
          >
            Hapus pilihan
          </button>
        ) : null}
      </div>
      <span id={`${id}-status`} className="file-status" aria-live="polite">
        {status}
      </span>
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}
