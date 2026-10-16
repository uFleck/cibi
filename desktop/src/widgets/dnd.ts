import type { WidgetId } from './meta'

export const WALL_ZONE_ID = 'zone:wall'
export const TRAY_ZONE_ID = 'zone:tray'

/** Payload of a draggable: a wall frame, or a chip in the tray. */
export interface DragData {
  id: WidgetId
  from: 'wall' | 'tray'
}
