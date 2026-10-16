-- App-wide settings: one JSON value per key (the home layout is stored under layout.v1).
--> statement-breakpoint
CREATE TABLE AppSetting (
	key   TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
