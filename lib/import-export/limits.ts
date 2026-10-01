// MVP synchronous import limits — enforced client-side (early feedback) and
// server-side (hard reject). The app already has pg-boss wired up
// (lib/worker/) for background jobs; raising this limit later means adding a
// CSV_IMPORT job that calls the same bulkImportTasks() function, not a
// rewrite. See docs/import-export.md.
export const MAX_IMPORT_ROWS = 200;
export const MAX_IMPORT_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
