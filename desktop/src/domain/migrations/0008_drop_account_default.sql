-- The default account is gone: the app picks the starting account itself (last used, else the first).
--> statement-breakpoint
ALTER TABLE Account DROP COLUMN is_default;
