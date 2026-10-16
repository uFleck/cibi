// Routes under /api/settings/:key. A JSON value is stored per key (see service/appSetting.ts).
//
// - GET returns 200 with the stored JSON value, or 200 with the body null when the key was never set.
// - PUT stores the request body as the value and answers 204. A missing body is 400 "value is required".
// - A key that is not 1 to 64 letters, digits, dot, underscore or dash is 400 "invalid setting key".
// - A repo or service failure is 500 with the error text.

import type { App } from '../app'
import { HttpError, route } from '../http'
import { isValidSettingKey, type AppSettingService } from '../service/appSetting'
import { rethrow500 } from './common'

/** The service methods the handlers use (so tests can inject fakes). */
export type AppSettingServiceIface = Pick<AppSettingService, 'get' | 'put'>

function checkKey(key: string): string {
  if (!isValidSettingKey(key)) throw new HttpError(400, 'invalid setting key')
  return key
}

export function registerSettingsRoutes(app: App, svc: AppSettingServiceIface = app.settingSvc): void {
  route('GET', '/api/settings/:key', async ({ params }) => {
    const value = await svc.get(checkKey(params.key)).catch(rethrow500)
    return { body: value }
  })

  route('PUT', '/api/settings/:key', async ({ params, body }) => {
    const key = checkKey(params.key)
    if (body === undefined) throw new HttpError(400, 'value is required')
    await svc.put(key, body).catch(rethrow500)
    return { status: 204 }
  })
}
