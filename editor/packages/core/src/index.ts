// Store

export type {
  BuildingEvent,
  CadBodyEvent,
  CadSketchEvent,
  CameraControlEvent,
  CeilingEvent,
  DoorEvent,
  EventSuffix,
  GuideEvent,
  GridEvent,
  ItemEvent,
  LevelEvent,
  NodeEvent,
  RoofEvent,
  RoofSegmentEvent,
  ScanEvent,
  SiteEvent,
  SlabEvent,
  WallEvent,
  WindowEvent,
  ZoneEvent,
} from './events/bus'
// Events
export { emitter, eventSuffixes } from './events/bus'
// Hooks
export {
  sceneRegistry,
  useRegistry,
} from './hooks/scene-registry/scene-registry'
export { pointInPolygon, spatialGridManager } from './hooks/spatial-grid/spatial-grid-manager'
export {
  initSpatialGridSync,
  resolveLevelId,
} from './hooks/spatial-grid/spatial-grid-sync'
export { useSpatialQuery } from './hooks/spatial-grid/use-spatial-query'
// Asset storage
export { loadAssetUrl, saveAsset } from './lib/asset-storage'
export { getCadBodyTransform } from './lib/cad-body-transform'
export {
  getNodeBimMetadata,
  serializeSceneToIfc,
  type BimPropertySet,
  type BimPropertyValue,
  type ExportIfcOptions,
  type NodeBimMetadata,
} from './lib/ifc-export'
export {
  DEFAULT_LEVEL_HEIGHT,
  getLevelFloorElevation,
  getLevelHeight,
} from './lib/level-elevation'
// Space detection
export {
  detectSpacesForLevel,
  initSpaceDetectionSync,
  type Space,
  wallTouchesOthers,
} from './lib/space-detection'
// Schema
export * from './schema'
export {
  type ControlValue,
  type ItemInteractiveState,
  useInteractive,
} from './store/use-interactive'
export { clearSceneHistory, default as useScene } from './store/use-scene'
// Systems
export { CeilingSystem } from './systems/ceiling/ceiling-system'
export { DoorSystem } from './systems/door/door-system'
export { ItemSystem } from './systems/item/item-system'
export { RoofSystem } from './systems/roof/roof-system'
export { SlabSystem } from './systems/slab/slab-system'
export { WallSystem } from './systems/wall/wall-system'
export { WindowSystem } from './systems/window/window-system'
export { isObject } from './utils/types'
export { CadBriefSchema, type CadBrief } from './schema/cad-brief'
