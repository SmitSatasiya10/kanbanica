"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  DownloadSimpleIcon,
  SpinnerGapIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { getCustomFieldDefinitions } from "@/app/actions/custom-field";
import { CsvColumnPicker } from "@/components/import-export/csv-column-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  autoDetectMapping,
  buildMappableFields,
  type MappableField,
} from "@/lib/import-export/column-mapping";
import { parseCsv } from "@/lib/import-export/csv";
import { downloadCsvTemplate } from "@/lib/import-export/csv-template";
import { formatRowIssues } from "@/lib/import-export/format-issues";
import {
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_ROWS,
} from "@/lib/import-export/limits";
import {
  assignColumn,
  columnForField,
  isColumnTakenByOtherField,
} from "@/lib/import-export/mapping-view";
import { cn } from "@/lib/utils";

type Step = "upload" | "map" | "preview" | "result";

interface RowValidation {
  errors: string[];
  rowIndex: number;
  status: "valid" | "warning" | "invalid" | "skipped";
  title: string;
  warnings: string[];
}

interface ValidateResponse {
  // Informational; the authoritative check runs on confirm. limit/remaining are
  // null when the workspace has no task limit.
  capacity: { limit: number | null; used: number; remaining: number | null };
  missingRequired: string[];
  rows: RowValidation[];
  summary: { total: number; valid: number; warning: number; invalid: number };
}

interface ConfirmResponse {
  createdTaskIds: string[];
  failedRows: { rowIndex: number; title: string; reason: string }[];
  successCount: number;
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "Upload" },
    { key: "map", label: "Map" },
    { key: "preview", label: "Preview" },
    { key: "result", label: "Result" },
  ];
  const index = steps.findIndex((s) => s.key === step);
  return (
    <div className="mb-2 flex items-center gap-2">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                i < index && "bg-primary text-primary-content",
                i === index && "bg-primary text-primary-content",
                i > index && "bg-base-200 text-base-content/60"
              )}
            >
              {i < index ? (
                <CheckIcon className="size-3.5" weight="bold" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={cn(
                "text-xs font-medium",
                i === index ? "text-base-content" : "text-base-content/60"
              )}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="h-px w-6 shrink-0 bg-base-300" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export function ImportWizardDialog({
  open,
  onOpenChange,
  workspaceId,
  spaceId,
  listId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  spaceId: string;
  listId: string;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("upload");
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [dataRows, setDataRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [mappableFields, setMappableFields] = React.useState<MappableField[]>(
    []
  );
  const [uploadError, setUploadError] = React.useState("");
  const [validating, setValidating] = React.useState(false);
  const [validation, setValidation] = React.useState<ValidateResponse | null>(
    null
  );
  const [checkedRows, setCheckedRows] = React.useState<Set<number>>(new Set());
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<ConfirmResponse | null>(null);
  const [resultError, setResultError] = React.useState("");

  const reset = React.useCallback(() => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setUploadError("");
    setValidation(null);
    setCheckedRows(new Set());
    setResult(null);
    setResultError("");
  }, []);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    reset();
    (async () => {
      const res = await getCustomFieldDefinitions(workspaceId, spaceId, listId);
      if ("fields" in res) {
        setMappableFields(buildMappableFields(res.fields));
      } else {
        setMappableFields(buildMappableFields([]));
      }
    })();
  }, [open, workspaceId, spaceId, listId, reset]);

  async function handleFile(file: File) {
    setUploadError("");
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      setUploadError(
        `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_IMPORT_FILE_SIZE / 1024 / 1024} MB.`
      );
      return;
    }
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.headers.length === 0) {
      setUploadError("Couldn't find any columns in this file.");
      return;
    }
    if (parsed.rows.length === 0) {
      setUploadError("This file has no data rows.");
      return;
    }
    if (parsed.rows.length > MAX_IMPORT_ROWS) {
      setUploadError(
        `This file has ${parsed.rows.length} rows — imports are limited to ${MAX_IMPORT_ROWS} rows per file.`
      );
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setDataRows(parsed.rows);
    const customFields = mappableFields
      .filter((f) => f.key.startsWith("customField:"))
      .map((f) => ({ id: f.key.slice(12), name: f.label }));
    setMapping(autoDetectMapping(parsed.headers, customFields));
    setStep("map");
  }

  async function runValidate() {
    setValidating(true);
    try {
      const res = await fetch(`/api/lists/${listId}/import/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping,
          rows: dataRows.map((row, i) => ({ rowIndex: i + 1, row })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Validation failed");
        return;
      }
      const data = json as ValidateResponse;
      setValidation(data);
      setCheckedRows(
        new Set(
          data.rows
            .filter((r) => r.status !== "invalid" && r.status !== "skipped")
            .map((r) => r.rowIndex)
        )
      );
      setStep("preview");
    } finally {
      setValidating(false);
    }
  }

  async function runImport() {
    setImporting(true);
    setResultError("");
    try {
      const selectedRows = dataRows
        .map((row, i) => ({ rowIndex: i + 1, row }))
        .filter((r) => checkedRows.has(r.rowIndex));
      const res = await fetch(`/api/lists/${listId}/import/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapping, rows: selectedRows }),
      });
      const json = await res.json();
      if (!res.ok) {
        setResultError(json.error || "Import failed");
        setStep("result");
        return;
      }
      setResult(json as ConfirmResponse);
      setStep("result");
      router.refresh();
    } finally {
      setImporting(false);
    }
  }

  const remainingCapacity = validation?.capacity.remaining ?? null;
  const overCapacity =
    remainingCapacity !== null && checkedRows.size > remainingCapacity;

  const titleMapped = Object.values(mapping).includes("title");

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Tasks</DialogTitle>
        </DialogHeader>
        <Stepper step={step} />

        {step === "upload" && (
          <div className="space-y-4">
            <label
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-base-300 px-6 py-10 text-center cursor-pointer hover:bg-base-200/30 transition-colors"
              htmlFor="import-csv-file"
            >
              <UploadSimpleIcon className="size-6 text-base-content/60" />
              <span className="text-sm font-medium">
                Click to choose a CSV file
              </span>
              <span className="text-xs text-base-content/60">
                Max {MAX_IMPORT_ROWS} rows, {MAX_IMPORT_FILE_SIZE / 1024 / 1024}{" "}
                MB
              </span>
              <input
                accept=".csv,text/csv"
                className="sr-only"
                id="import-csv-file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    void handleFile(file);
                  }
                  e.target.value = "";
                }}
                type="file"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-base-content/60">
                Not sure about the format? Start from a template with every
                supported column.
              </p>
              <Button
                className="w-full sm:w-auto"
                onClick={() => downloadCsvTemplate()}
                size="sm"
                type="button"
                variant="outline"
              >
                <DownloadSimpleIcon className="size-4" />
                Download CSV Template
              </Button>
            </div>
            {uploadError && (
              <Alert variant="destructive">
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === "map" && (
          <div className="space-y-4">
            <p className="text-sm text-base-content/60">
              {fileName} — {dataRows.length} row
              {dataRows.length === 1 ? "" : "s"}. Choose which CSV column feeds
              each Kanbanica field, or leave it as Do not import.
            </p>
            <div className="max-h-96 overflow-y-auto rounded-xl border border-base-300">
              <div className="hidden grid-cols-2 gap-4 border-b border-base-300 px-4 py-2 text-xs font-semibold tracking-wider text-base-content/60 uppercase sm:grid">
                <span>Kanbanica Field</span>
                <span>CSV Column</span>
              </div>
              <ul className="divide-y divide-base-300">
                {mappableFields.map((f) => (
                  <li
                    className="grid grid-cols-1 items-center gap-1.5 px-4 py-2.5 sm:grid-cols-2 sm:gap-4"
                    key={f.key}
                  >
                    <span className="min-w-0 truncate text-sm font-medium">
                      {f.label}
                      {f.required ? " *" : ""}
                    </span>
                    <CsvColumnPicker
                      ariaLabel={`CSV column for ${f.label}`}
                      headers={headers}
                      isDisabled={(h) =>
                        isColumnTakenByOtherField(mapping, h, f.key)
                      }
                      onChange={(h) =>
                        setMapping((prev) => assignColumn(prev, f.key, h))
                      }
                      value={columnForField(mapping, f.key)}
                    />
                  </li>
                ))}
              </ul>
            </div>
            {!titleMapped && (
              <Alert variant="destructive">
                <AlertDescription>
                  Title is required — map a column to it.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {step === "preview" && validation && (
          <div className="space-y-4">
            {validation.missingRequired.length > 0 && (
              <Alert variant="destructive">
                <AlertTitle>Required fields not mapped</AlertTitle>
                <AlertDescription>
                  {validation.missingRequired.join(", ")} — every row will fail
                  until these are mapped.
                </AlertDescription>
              </Alert>
            )}
            {validation.capacity.limit !== null && (
              <Alert variant={overCapacity ? "warning" : "default"}>
                <AlertTitle>Workspace task limit</AlertTitle>
                <AlertDescription>
                  {validation.capacity.used.toLocaleString("en-US")} /{" "}
                  {validation.capacity.limit.toLocaleString("en-US")} tasks used
                  — room for {(remainingCapacity ?? 0).toLocaleString("en-US")}{" "}
                  more.
                  {overCapacity &&
                    ` You selected ${checkedRows.size.toLocaleString("en-US")} rows; deselect at least ${(checkedRows.size - (remainingCapacity ?? 0)).toLocaleString("en-US")} to import, or ask an admin to raise the limit. Imports are all-or-nothing.`}
                </AlertDescription>
              </Alert>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-success/30 bg-success/10 px-2 py-2">
                <div className="text-lg font-semibold text-success">
                  {validation.summary.valid}
                </div>
                <div className="text-xs text-base-content/70">Ready</div>
              </div>
              <div className="rounded-xl border border-warning/30 bg-warning/10 px-2 py-2">
                <div className="text-lg font-semibold text-warning">
                  {validation.summary.warning}
                </div>
                <div className="text-xs text-base-content/70">
                  Need attention
                </div>
              </div>
              <div className="rounded-xl border border-error/30 bg-error/10 px-2 py-2">
                <div className="text-lg font-semibold text-error">
                  {validation.summary.invalid}
                </div>
                <div className="text-xs text-base-content/70">Invalid</div>
              </div>
            </div>
            {validation.summary.invalid > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  {validation.summary.invalid} row
                  {validation.summary.invalid === 1 ? " has" : "s have"} errors
                  and cannot be imported.
                </AlertDescription>
              </Alert>
            )}
            <ul className="max-h-96 space-y-2 overflow-y-auto rounded-xl border border-base-300 p-2">
              {validation.rows.map((r) => {
                const issues = formatRowIssues(r.errors, r.warnings);
                const label =
                  r.status === "invalid"
                    ? "Invalid"
                    : r.status === "warning"
                      ? "Needs attention"
                      : r.status === "skipped"
                        ? "Skipped"
                        : "Valid";
                return (
                  <li
                    className={cn(
                      "rounded-xl border p-3",
                      r.status === "invalid"
                        ? "border-error/30"
                        : r.status === "warning"
                          ? "border-warning/30"
                          : "border-base-300"
                    )}
                    key={r.rowIndex}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        aria-label={`Select row ${r.rowIndex}`}
                        checked={checkedRows.has(r.rowIndex)}
                        disabled={
                          r.status === "invalid" || r.status === "skipped"
                        }
                        onCheckedChange={(checked) =>
                          setCheckedRows((prev) => {
                            const next = new Set(prev);
                            if (checked) {
                              next.add(r.rowIndex);
                            } else {
                              next.delete(r.rowIndex);
                            }
                            return next;
                          })
                        }
                      />
                      <span className="text-xs text-base-content/60">
                        Row {r.rowIndex}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {r.title || "—"}
                      </span>
                      <Badge
                        variant={
                          r.status === "invalid"
                            ? "destructive"
                            : r.status === "warning"
                              ? "outline"
                              : "default"
                        }
                      >
                        {label}
                      </Badge>
                    </div>
                    {issues.length > 0 && (
                      <ul className="mt-2 space-y-1.5">
                        {issues.map((issue) => (
                          <li
                            className={cn(
                              "rounded-md border-l-2 bg-base-200/40 px-3 py-1.5 text-xs break-words",
                              issue.severity === "error" && "border-error",
                              issue.severity === "warning" && "border-warning",
                              issue.severity === "info" && "border-info"
                            )}
                            key={`${issue.label}-${issue.message}`}
                          >
                            <div className="font-semibold text-base-content">
                              {issue.label}
                            </div>
                            <div
                              className={cn(
                                issue.severity === "error" && "text-error",
                                issue.severity === "warning" && "text-warning",
                                issue.severity === "info" && "text-info"
                              )}
                            >
                              {issue.severity === "error"
                                ? "✕"
                                : issue.severity === "warning"
                                  ? "⚠"
                                  : "ℹ"}{" "}
                              {issue.message}
                            </div>
                            {issue.hint && (
                              <div className="text-base-content/60">
                                {issue.hint}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {step === "result" && (
          <div className="space-y-4">
            {resultError ? (
              <Alert variant="destructive">
                <AlertTitle>Import failed</AlertTitle>
                <AlertDescription>{resultError}</AlertDescription>
              </Alert>
            ) : (
              result && (
                <>
                  <Alert>
                    <AlertTitle>Import complete</AlertTitle>
                    <AlertDescription>
                      {result.successCount} task
                      {result.successCount === 1 ? "" : "s"} created
                      {result.failedRows.length > 0 &&
                        `, ${result.failedRows.length} row${result.failedRows.length === 1 ? "" : "s"} failed`}
                      .
                    </AlertDescription>
                  </Alert>
                  {result.failedRows.length > 0 && (
                    <div className="max-h-64 overflow-y-auto rounded-xl border border-base-300">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Row</TableHead>
                            <TableHead>Title</TableHead>
                            <TableHead>Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.failedRows.map((r) => (
                            <TableRow key={r.rowIndex}>
                              <TableCell>{r.rowIndex}</TableCell>
                              <TableCell className="max-w-48 truncate">
                                {r.title}
                              </TableCell>
                              <TableCell className="text-xs text-base-content/70">
                                {r.reason}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )
            )}
          </div>
        )}

        <DialogFooter>
          {step === "map" && (
            <>
              <Button
                onClick={() => setStep("upload")}
                type="button"
                variant="outline"
              >
                <ArrowLeftIcon className="size-4" /> Back
              </Button>
              <Button
                disabled={!titleMapped || validating}
                onClick={runValidate}
                type="button"
              >
                {validating && (
                  <SpinnerGapIcon className="size-4 animate-spin" />
                )}
                Next <ArrowRightIcon className="size-4" />
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button
                onClick={() => setStep("map")}
                type="button"
                variant="outline"
              >
                <ArrowLeftIcon className="size-4" /> Back
              </Button>
              <Button
                disabled={checkedRows.size === 0 || importing || overCapacity}
                onClick={runImport}
              >
                {importing && (
                  <SpinnerGapIcon className="size-4 animate-spin" />
                )}
                {overCapacity
                  ? `Only ${(remainingCapacity ?? 0).toLocaleString("en-US")} fit`
                  : `Import ${checkedRows.size} Task${checkedRows.size === 1 ? "" : "s"}`}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={() => onOpenChange(false)} type="button">
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ImportIconButton({
  workspaceId,
  spaceId,
  listId,
  className,
}: {
  workspaceId: string;
  spaceId: string;
  listId: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        className={cn(
          "flex items-center justify-center size-8 rounded-lg border border-base-300 text-base-content/60 hover:bg-base-200/30 hover:text-base-content transition-colors cursor-pointer",
          className
        )}
        onClick={() => setOpen(true)}
        title="Import Tasks (CSV)"
        type="button"
      >
        <UploadSimpleIcon className="size-4" />
      </button>
      <ImportWizardDialog
        listId={listId}
        onOpenChange={setOpen}
        open={open}
        spaceId={spaceId}
        workspaceId={workspaceId}
      />
    </>
  );
}

export function ImportMenuRow({
  workspaceId,
  spaceId,
  listId,
  className,
}: {
  workspaceId: string;
  spaceId: string;
  listId: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm hover:bg-base-200",
          className
        )}
        onClick={() => setOpen(true)}
        type="button"
      >
        <UploadSimpleIcon className="size-4 text-base-content/60" />
        Import Tasks (CSV)
      </button>
      <ImportWizardDialog
        listId={listId}
        onOpenChange={setOpen}
        open={open}
        spaceId={spaceId}
        workspaceId={workspaceId}
      />
    </>
  );
}
