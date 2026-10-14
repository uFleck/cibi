// Configuration values the Go server reads, with the defaults from internal/config/config.go.
//
// The in-process app is handed its Db by the Tauri side, so databasePath and serverPort are
// informational here (the Go server uses them to open the file and bind the port).
//
// Safety buffer: the Go code has no config value for it. CreateAccount falls back to a
// hard-coded 1000 cents when the request leaves safety_buffer at 0 (internal/service/accounts.go),
// and the Account column default is 1000 too. docker-compose.yml sets CIBI_SAFETY_BUFFER: 1000
// (DOCKER.md documents CIBI_SAFETYBUFFER), but no Go code reads either variable, so that value
// does not apply. The port uses the hard-coded 1000.

export interface Config {
  /** Go default: data/cibi.db (CIBI_DATABASE_PATH). */
  databasePath: string
  /** Go default: :42069 (CIBI_SERVER_PORT). */
  serverPort: string
}

export const DEFAULT_CONFIG: Config = {
  databasePath: 'data/cibi.db',
  serverPort: ':42069',
}

/** Cents. Used when a new account is created with safety_buffer 0 (Go: service.CreateAccount). */
export const DEFAULT_SAFETY_BUFFER_CENTS = 1000
