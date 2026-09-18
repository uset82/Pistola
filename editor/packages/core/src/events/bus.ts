import type { ThreeEvent } from '@react-three/fiber'
import mitt from 'mitt'
import type {
  BuildingNode,
  CadBodyNode,
  CadInstanceNode,
  CadSketchNode,
  CadSpaceNode,
  CeilingNode,
  DoorNode,
  GuideNode,
  ItemNode,
  LevelNode,
  RoofNode,
  RoofSegmentNode,
  ScanNode,
  SiteNode,
  SlabNode,
  WallNode,
  WindowNode,
  ZoneNode,
} from '../schema'
import type { AnyNode } from '../schema/types'

// Base event interfaces
export interface GridEvent {
  position: [number, number, number]
  nativeEvent: ThreeEvent<PointerEvent>
}

export interface NodeEvent<T extends AnyNode = AnyNode> {
  node: T
  position: [number, number, number]
  localPosition: [number, number, number]
  normal?: [number, number, number]
  stopPropagation: () => void
  nativeEvent: ThreeEvent<PointerEvent>
}

export type WallEvent = NodeEvent<WallNode>
export type ItemEvent = NodeEvent<ItemNode>
export type CadSketchEvent = NodeEvent<CadSketchNode>
export type CadBodyEvent = NodeEvent<CadBodyNode>
export type CadSpaceEvent = NodeEvent<CadSpaceNode>
export type CadInstanceEvent = NodeEvent<CadInstanceNode>
export type SiteEvent = NodeEvent<SiteNode>
export type BuildingEvent = NodeEvent<BuildingNode>
export type LevelEvent = NodeEvent<LevelNode>
export type ZoneEvent = NodeEvent<ZoneNode>
export type SlabEvent = NodeEvent<SlabNode>
export type CeilingEvent = NodeEvent<CeilingNode>
export type RoofEvent = NodeEvent<RoofNode>
export type RoofSegmentEvent = NodeEvent<RoofSegmentNode>
export type WindowEvent = NodeEvent<WindowNode>
export type DoorEvent = NodeEvent<DoorNode>
export type ScanEvent = NodeEvent<ScanNode>
export type GuideEvent = NodeEvent<GuideNode>

// Event suffixes - exported for use in hooks
export const eventSuffixes = [
  'click',
  'move',
  'enter',
  'leave',
  'pointerdown',
  'pointerup',
  'context-menu',
  'double-click',
] as const

export type EventSuffix = (typeof eventSuffixes)[number]

type NodeEvents<T extends string, E> = {
  [K in `${T}:${EventSuffix}`]: E
}

type GridEvents = {
  [K in `grid:${EventSuffix}`]: GridEvent
}

export interface CameraControlEvent {
  nodeId: AnyNode['id']
}

export interface ThumbnailGenerateEvent {
  projectId: string
}

type CameraControlEvents = {
  'camera-controls:view': CameraControlEvent
  'camera-controls:capture': CameraControlEvent
  'camera-controls:top-view': undefined
  'camera-controls:orbit-cw': undefined
  'camera-controls:orbit-ccw': undefined
  'camera-controls:generate-thumbnail': ThumbnailGenerateEvent
}

type ToolEvents = {
  'tool:cancel': undefined
}

type PresetEvents = {
  'preset:generate-thumbnail': { presetId: string; nodeId: string }
  'preset:thumbnail-updated': { presetId: string; thumbnailUrl: string }
}

type EditorEvents = GridEvents &
  NodeEvents<'wall', WallEvent> &
  NodeEvents<'item', ItemEvent> &
  NodeEvents<'cad-sketch', CadSketchEvent> &
  NodeEvents<'cad-body', CadBodyEvent> &
  NodeEvents<'cad-space', CadSpaceEvent> &
  NodeEvents<'cad-instance', CadInstanceEvent> &
  NodeEvents<'site', SiteEvent> &
  NodeEvents<'building', BuildingEvent> &
  NodeEvents<'level', LevelEvent> &
  NodeEvents<'zone', ZoneEvent> &
  NodeEvents<'slab', SlabEvent> &
  NodeEvents<'ceiling', CeilingEvent> &
  NodeEvents<'roof', RoofEvent> &
  NodeEvents<'roof-segment', RoofSegmentEvent> &
  NodeEvents<'window', WindowEvent> &
  NodeEvents<'door', DoorEvent> &
  NodeEvents<'scan', ScanEvent> &
  NodeEvents<'guide', GuideEvent> &
  CameraControlEvents &
  ToolEvents &
  PresetEvents

export const emitter = mitt<EditorEvents>()
