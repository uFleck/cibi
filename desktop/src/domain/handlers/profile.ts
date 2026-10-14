// Port of internal/handler/profile.go (routes under /api/profile).
//
// Errors (Go):
// - a bad or missing account_id is 400 "invalid account_id";
// - GET: a service error is 500 with the error text as the message (not "internal server error");
// - PATCH: bind, validation and every service error (including repo failures) are 400 with the
//   error text as the message.

import type { App } from '../app'
import { HttpError, route } from '../http'
import type { UserProfile } from '../repo/profile'
import type { ProfileService } from '../service/profile'
import { parseUuid } from '../uuid'
import { validateOrThrow, type FieldSpec } from '../validate'
import { bindBody } from './bind'
import { messageOf } from '../errors'

/** The service methods the handlers use (Go: the concrete *service.ProfileService). */
export type ProfileServiceIface = Pick<ProfileService, 'getByAccount' | 'updateByAccount'>

/** JSON shape of the profile (Go: ProfileResponse). */
export interface ProfileResponse {
  display_name: string
  pix_key: string | null
  theme: string
}

const PATCH_SCHEMA = {
  display_name: 'string',
  pix_key: 'stringPtr',
  theme: 'string',
} as const

const PATCH_FIELDS: FieldSpec[] = [
  { goName: 'DisplayName', jsonName: 'display_name', rules: 'required' },
  { goName: 'Theme', jsonName: 'theme', rules: 'required' },
]

function parseIdOr400(raw: string, message: string): string {
  try {
    return parseUuid(raw)
  } catch {
    throw new HttpError(400, message)
  }
}

export function toProfileResponse(p: UserProfile): ProfileResponse {
  return { display_name: p.displayName, pix_key: p.pixKey, theme: p.theme }
}

export function registerProfileRoutes(app: App, svc: ProfileServiceIface = app.profileSvc): void {
  route('GET', '/api/profile', async ({ query }) => {
    const accountId = parseIdOr400(query.get('account_id') ?? '', 'invalid account_id')
    const p = await svc.getByAccount(accountId).catch((err: unknown) => {
      throw new HttpError(500, messageOf(err))
    })
    return { body: toProfileResponse(p) }
  })

  route('PATCH', '/api/profile', async ({ query, body }) => {
    const accountId = parseIdOr400(query.get('account_id') ?? '', 'invalid account_id')
    const req = bindBody(body, PATCH_SCHEMA)
    validateOrThrow('PatchProfileRequest', req, PATCH_FIELDS)
    await svc.updateByAccount(accountId, req.display_name, req.pix_key, req.theme).catch((err: unknown) => {
      throw new HttpError(400, messageOf(err))
    })
    return { status: 204 }
  })
}
