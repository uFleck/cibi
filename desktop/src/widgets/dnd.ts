import type { WidgetId } from './meta'

export const WALL_ZONE_ID = 'zone:wall'
export const INSP_ZONE_ID = 'zone:insp'
export const TRAY_ZONE_ID = 'zone:tray'

/** Payload of a draggable: a frame on the wall or in the inspector, or a chip in the tray. */
export interface DragData {
  id: WidgetId
  from: 'wall' | 'insp' | 'tray'
}
