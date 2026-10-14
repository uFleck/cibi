// Startup for the in-process domain: opens the database, builds the app and registers its routes.
// main.tsx awaits this before rendering, so the UI never calls localFetch before the routes exist.

import { buildApp, type App } from './app'
import { initDb, setDb, getDb, type Db } from './db'
import { registerRoutes } from './routes'

let started: Promise<App> | undefined

/**
 * Opens the app once. The first call wins: later calls return the same App (same promise), so
 * routes are never registered twice. `db` is for tests (no Tauri there); without it the Tauri
 * database is opened with initDb().
 */
export async function startDomain(db?: Db): Promise<App> {
  started ??= open(db)
  return started
}

async function open(db: Db | undefined): Promise<App> {
  if (db) {
    setDb(db)
  } else {
    await initDb()
  }
  const app = buildApp(getDb())
  registerRoutes(app)
  return app
}
