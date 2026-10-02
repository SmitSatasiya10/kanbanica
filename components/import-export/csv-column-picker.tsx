"use client";

import { CaretUpDownIcon, CheckIcon } from "@phosphor-icons/react";
import * as React from "react";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from "@/components/ui/combobox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { filterColumns } from "@/lib/import-export/mapping-view";
import { cn } from "@/lib/utils";

const DO_NOT_IMPORT = "Do not import";

// Searchable dropdown of the uploaded CSV's columns for one Kanbanica field.
// `value` is the selected header, or null for "Do not import".
export function CsvColumnPicker({
  ariaLabel,
  headers,
  isDisabled,
  onChange,
  value,
}: {
  ariaLabel: string;
  headers: string[];
  isDisabled: (header: string) => boolean;
  onChange: (header: string | null) => void;
  value: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const matches = filterColumns(headers, query);
  const showDoNotImport =
    !query.trim() ||
    DO_NOT_IMPORT.toLowerCase().includes(query.trim().toLowerCase());

  return (
    <Popover
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
        }
      }}
      open={open}
    >
      <PopoverTrigger asChild>
        <button
          aria-label={ariaLabel}
          className="flex h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-base-300 bg-transparent px-3 text-left text-sm transition-colors hover:bg-base-200/30 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
          type="button"
        >
          <span
            className={cn("truncate", value === null && "text-base-content/60")}
          >
            {value ?? DO_NOT_IMPORT}
          </span>
          <CaretUpDownIcon className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 max-w-[calc(100vw-2rem)] p-0"
      >
        <Combobox<string | null>
          className="border-0"
          immediate
          onChange={(header) => {
            onChange(header);
            setOpen(false);
          }}
          value={value}
        >
          <ComboboxInput
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search CSV columns..."
            value={query}
          />
          <ComboboxOptions className="p-1" static>
            {showDoNotImport && (
              <ComboboxOption value={null}>
                <span className="flex-1 truncate text-base-content/60">
                  {DO_NOT_IMPORT}
                </span>
                {value === null && <CheckIcon className="size-3.5" />}
              </ComboboxOption>
            )}
            {matches.map((header) => (
              <ComboboxOption
                disabled={isDisabled(header)}
                key={header}
                value={header}
              >
                <span className="flex-1 truncate">{header}</span>
                {value === header && <CheckIcon className="size-3.5" />}
              </ComboboxOption>
            ))}
            {matches.length === 0 && (
              <ComboboxEmpty>No columns found</ComboboxEmpty>
            )}
          </ComboboxOptions>
        </Combobox>
      </PopoverContent>
    </Popover>
  );
}
