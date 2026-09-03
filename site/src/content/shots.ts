/**
 * Camera shots on the one city model, keyed by chapter slug.
 *
 *   u, v   where the camera looks, as a fraction of the picture (0,0 = top-left)
 *   zoom   1 = the whole city fits the box; 2 = twice as close
 *   yaw    resting swing around the vertical axis, radians (the dwell orbit adds to it)
 *   pitch  resting tilt, radians (negative looks down a little more)
 *
 * Positions come off art/raw/city.png under tools/grid.sh.
 */
export type Shot = { u: number; v: number; zoom: number; yaw: number; pitch: number }

export const shots: Record<string, Shot> = {
  hero: { u: 0.5, v: 0.52, zoom: 1, yaw: -0.04, pitch: 0 },
  jianghu: { u: 0.17, v: 0.5, zoom: 2.4, yaw: -0.12, pitch: -0.04 },
  'lark-arena': { u: 0.38, v: 0.5, zoom: 2.5, yaw: 0.1, pitch: -0.04 },
  'codemode-go': { u: 0.59, v: 0.5, zoom: 2.3, yaw: -0.1, pitch: -0.04 },
  keyward: { u: 0.83, v: 0.5, zoom: 2.3, yaw: 0.12, pitch: -0.04 },
  scriptorium: { u: 0.16, v: 0.77, zoom: 2.3, yaw: -0.1, pitch: -0.05 },
  streamhub: { u: 0.62, v: 0.29, zoom: 2.4, yaw: 0.1, pitch: -0.03 },
  'defai-relay': { u: 0.41, v: 0.27, zoom: 2.5, yaw: -0.1, pitch: -0.03 },
  deckforge: { u: 0.35, v: 0.75, zoom: 2.5, yaw: 0.1, pitch: -0.05 },
  'wechat-finder-dlna': { u: 0.19, v: 0.22, zoom: 2.4, yaw: -0.1, pitch: -0.02 },
  'wechat-chatgpt': { u: 0.76, v: 0.76, zoom: 2.3, yaw: 0.1, pitch: -0.05 },
  section: { u: 0.85, v: 0.2, zoom: 2.1, yaw: -0.12, pitch: -0.02 },
  figure: { u: 0.52, v: 0.77, zoom: 2.7, yaw: 0.06, pitch: -0.06 },
}
