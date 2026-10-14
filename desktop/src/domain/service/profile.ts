// Port of internal/service/profile.go.
//
// Errors from this service are all sent to the client as 400 by the handler (Go wraps them
// all in echo.NewHTTPError(400, err.Error())), including repo failures.

import { AppError, wrapping } from '../errors'
import { goQuote, goTrimSpace } from '../strings'
import type { ProfileRepo, UserProfile } from '../repo/profile'

const VALID_THEMES: ReadonlySet<string> = new Set([
  'green-anchor',
  'neutral-command',
  'teal-bridge',
  'warm-amber',
  'rose-noir',
])

export class ProfileService {
  private readonly repo: ProfileRepo

  constructor(repo: ProfileRepo) {
    this.repo = repo
  }

  getByAccount(accountId: string): Promise<UserProfile> {
    return wrapping('service.Profile.GetByAccount', () => this.repo.getByAccount(accountId))
  }

  /**
   * Validates and saves the profile. The display name and PIX key are trimmed (a blank PIX
   * key is stored as null). The theme is not trimmed.
   */
  async updateByAccount(accountId: string, displayName: string, pixKey: string | null, theme: string): Promise<void> {
    const name = goTrimSpace(displayName)
    if (name === '') throw new AppError('display_name is required')
    const key = pixKey === null ? null : emptyToNull(goTrimSpace(pixKey))
    if (!VALID_THEMES.has(theme)) {
      const allowed = [...VALID_THEMES].sort().join(', ')
      throw new AppError(`invalid theme ${goQuote(theme)}: must be one of ${allowed}`)
    }
    await wrapping('service.Profile.UpdateByAccount', () => this.repo.upsertByAccount(accountId, name, key, theme))
  }
}

function emptyToNull(s: string): string | null {
  return s === '' ? null : s
}
