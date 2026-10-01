"use client";

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  SpinnerGapIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { getCustomFieldDefinitions } from "@/app/actions/custom-field";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  IGNORE_TARGET,
  type MappableField,
} from "@/lib/import-export/column-mapping";
import { parseCsv } from "@/lib/import-export/csv";
import {
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_ROWS,
} from "@/lib/import-export/limits";
import { cn } from "@/lib/utils";

type Step = "upload" | "map" | "preview" | "result";

interface RowValidation {
  errors: string[];
  rowIndex: number;
  status: "valid" | "warning" | "invalid";
  title: string;
  warnings: string[];
}

interface ValidateResponse {
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

  function setFieldMapping(header: string, target: string) {
    setMapping((prev) => ({ ...prev, [header]: target }));
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
          data.rows.filter((r) => r.status !== "invalid").map((r) => r.rowIndex)
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

  const titleMapped = Object.values(mapping).includes("title");
  const usedTargets = new Set(
    Object.values(mapping).filter((t) => t !== IGNORE_TARGET)
  );

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
              {dataRows.length === 1 ? "" : "s"}. Map each column to a Kanbanica
              field, or leave it unmapped to ignore it.
            </p>
            <div className="max-h-96 overflow-y-auto rounded-xl border border-base-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CSV Column</TableHead>
                    <TableHead>Kanbanica Field</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((header) => (
                    <TableRow key={header}>
                      <TableCell className="font-medium">{header}</TableCell>
                      <TableCell>
                        <Select
                          onValueChange={(v) => setFieldMapping(header, v)}
                          value={mapping[header] ?? IGNORE_TARGET}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={IGNORE_TARGET}>
                              Do not import
                            </SelectItem>
                            {mappableFields.map((f) => (
                              <SelectItem
                                disabled={
                                  usedTargets.has(f.key) &&
                                  mapping[header] !== f.key
                                }
                                key={f.key}
                                value={f.key}
                              >
                                {f.label}
                                {f.required ? " *" : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
            <Alert>
              <AlertTitle>Import Preview</AlertTitle>
              <AlertDescription>
                {validation.summary.valid} ready · {validation.summary.warning}{" "}
                need attention · {validation.summary.invalid} invalid
              </AlertDescription>
            </Alert>
            <div className="max-h-80 overflow-y-auto rounded-xl border border-base-300">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead />
                    <TableHead>Row</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validation.rows.map((r) => (
                    <TableRow key={r.rowIndex}>
                      <TableCell>
                        <Checkbox
                          checked={checkedRows.has(r.rowIndex)}
                          disabled={r.status === "invalid"}
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
                      </TableCell>
                      <TableCell>{r.rowIndex}</TableCell>
                      <TableCell className="max-w-48 truncate">
                        {r.title || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "invalid"
                              ? "destructive"
                              : r.status === "warning"
                                ? "secondary"
                                : "default"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-96 whitespace-normal text-xs text-base-content/70">
                        {[...r.errors, ...r.warnings].join("; ") || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
                disabled={checkedRows.size === 0 || importing}
                onClick={runImport}
              >
                {importing && (
                  <SpinnerGapIcon className="size-4 animate-spin" />
                )}
                Import {checkedRows.size} Task
                {checkedRows.size === 1 ? "" : "s"}
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
