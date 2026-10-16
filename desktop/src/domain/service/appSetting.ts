// Settings are stored as JSON text. An unset key reads as null. A key is 1 to 64 characters of
// letters, digits, dot, underscore or dash.

import { AppError, wrapping } from '../errors'
import type { AppSettingRepo } from '../repo/appSetting'

const KEY_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

export function isValidSettingKey(key: string): boolean {
  return KEY_PATTERN.test(key)
}

export class AppSettingService {
  private readonly repo: AppSettingRepo

  constructor(repo: AppSettingRepo) {
    this.repo = repo
  }

  /** The decoded value, or null when the key was never set. */
  async get(key: string): Promise<unknown> {
    if (!isValidSettingKey(key)) throw new AppError('invalid setting key')
    const raw = await wrapping('service.AppSetting.Get', () => this.repo.get(key))
    return raw === null ? null : JSON.parse(raw)
  }

  /** Stores any JSON value (null included) under key, replacing the previous one. */
  async put(key: string, value: unknown): Promise<void> {
    if (!isValidSettingKey(key)) throw new AppError('invalid setting key')
    if (value === undefined) throw new AppError('value is required')
    const json = JSON.stringify(value)
    await wrapping('service.AppSetting.Put', () => this.repo.upsert(key, json))
  }
}
