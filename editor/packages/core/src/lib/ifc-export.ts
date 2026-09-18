import type {
  AnyNode,
  BuildingNode,
  LevelNode,
  SiteNode,
  WallNode,
} from '../schema'
import { getCadBodyTransform } from './cad-body-transform'
import { getLevelFloorElevation } from './level-elevation'

export type BimPropertyValue = string | number | boolean | null
export type BimPropertySet = Record<string, BimPropertyValue>

export type NodeBimMetadata = {
  description?: string | null
  tag?: string | null
  propertySets?: Record<string, BimPropertySet>
}

export type ExportIfcOptions = {
  projectName?: string
}

type NodeRecord = Record<string, AnyNode>

type SpatialType = 'site' | 'building' | 'level'

type PlacementInfo = {
  point: [number, number, number]
  containerId: string | null
}

const IFC_BOOLEAN = {
  true: '.T.',
  false: '.F.',
} as const

const spatialTypes = new Set<SpatialType>(['site', 'building', 'level'])
const skippedIfcTypes = new Set<AnyNode['type']>([
  'cad-sketch',
  'cad-space',
  'cad-instance',
  'scan',
  'guide',
])

const sanitizeIfcGuid = (input: string) => {
  let hashA = 0
  let hashB = 0

  for (const char of input) {
    const code = char.charCodeAt(0)
    hashA = (hashA * 33 + code) >>> 0
    hashB = (hashB * 37 + code) >>> 0
  }

  const raw = `${hashA.toString(36)}${hashB.toString(36)}${input.replace(/[^a-z0-9]/gi, '')}`
  return raw.slice(0, 22).padEnd(22, '0')
}

const escapeIfcString = (value: string) => value.replace(/'/g, "''")

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toIfcString = (value: string | null | undefined) =>
  value ? `'${escapeIfcString(value)}'` : '$'

const toIfcValue = (value: BimPropertyValue) => {
  if (value === null) return '$'
  if (typeof value === 'boolean') return `IFCBOOLEAN(${IFC_BOOLEAN[String(value) as keyof typeof IFC_BOOLEAN]})`
  if (typeof value === 'number') return Number.isInteger(value) ? `IFCINTEGER(${value})` : `IFCREAL(${value})`
  return `IFCTEXT('${escapeIfcString(value)}')`
}

const getNodeName = (node: AnyNode, fallback: string) => node.name?.trim() || fallback

const getNodeChildren = (node: AnyNode): string[] => {
  if (!('children' in node) || !Array.isArray(node.children)) return []

  const childIds: string[] = []

  for (const child of node.children) {
    if (typeof child === 'string') {
      childIds.push(child)
      continue
    }

    if (isRecord(child) && typeof child.id === 'string') {
      childIds.push(child.id)
    }
  }

  return childIds
}

const getWallLength = (node: WallNode) => {
  const [x1, z1] = node.start
  const [x2, z2] = node.end
  return Math.hypot(x2 - x1, z2 - z1)
}

const getWallPlacement = (node: WallNode): [number, number, number] => {
  const [x1, z1] = node.start
  const [x2, z2] = node.end
  return [(x1 + x2) / 2, 0, (z1 + z2) / 2]
}

const getBasePropertySets = (node: AnyNode): Record<string, BimPropertySet> => {
  const base: Record<string, BimPropertySet> = {
    Pset_PistolaNode: {
      NodeId: node.id,
      NodeType: node.type,
      Visible: node.visible ?? true,
      ParentId: node.parentId,
      Name: node.name ?? null,
    },
  }

  switch (node.type) {
    case 'site':
      base.Pset_PistolaSite = {
        BoundaryPointCount: node.polygon.points.length,
        Boundary: JSON.stringify(node.polygon.points),
      }
      break
    case 'building':
      base.Pset_PistolaBuilding = {
        Position: JSON.stringify(node.position),
        Rotation: JSON.stringify(node.rotation),
      }
      break
    case 'level':
      base.Pset_PistolaLevel = {
        LevelIndex: node.level,
      }
      break
    case 'wall':
      base.Pset_PistolaWall = {
        Length: Number(getWallLength(node).toFixed(4)),
        Height: node.height ?? null,
        Thickness: node.thickness ?? null,
        Start: JSON.stringify(node.start),
        End: JSON.stringify(node.end),
        FrontSide: node.frontSide,
        BackSide: node.backSide,
      }
      break
    case 'slab':
      base.Pset_PistolaSlab = {
        Elevation: node.elevation,
        Boundary: JSON.stringify(node.polygon),
        HoleCount: node.holes.length,
      }
      break
    case 'ceiling':
      base.Pset_PistolaCeiling = {
        Height: node.height,
        Boundary: JSON.stringify(node.polygon),
        HoleCount: node.holes.length,
      }
      break
    case 'roof':
      base.Pset_PistolaRoof = {
        Position: JSON.stringify(node.position),
        Rotation: node.rotation,
        SegmentCount: node.children.length,
      }
      break
    case 'roof-segment':
      base.Pset_PistolaRoofSegment = {
        RoofType: node.roofType,
        Width: node.width,
        Depth: node.depth,
        WallHeight: node.wallHeight,
        RoofHeight: node.roofHeight,
        WallThickness: node.wallThickness,
        DeckThickness: node.deckThickness,
        Overhang: node.overhang,
      }
      break
    case 'zone':
      base.Pset_PistolaZone = {
        Color: node.color,
        Boundary: JSON.stringify(node.polygon),
      }
      break
    case 'item':
      base.Pset_PistolaItem = {
        AssetId: node.asset.id,
        AssetName: node.asset.name,
        Category: node.asset.category,
        Source: node.asset.src,
        Dimensions: JSON.stringify(node.asset.dimensions),
        Position: JSON.stringify(node.position),
        Rotation: JSON.stringify(node.rotation),
      }
      break
    case 'door':
      base.Pset_PistolaDoor = {
        Width: node.width,
        Height: node.height,
        WallId: node.wallId ?? null,
        HingesSide: node.hingesSide,
        SwingDirection: node.swingDirection,
        Threshold: node.threshold,
      }
      break
    case 'window':
      base.Pset_PistolaWindow = {
        Width: node.width,
        Height: node.height,
        WallId: node.wallId ?? null,
        ColumnRatios: JSON.stringify(node.columnRatios),
        RowRatios: JSON.stringify(node.rowRatios),
      }
      break
    case 'cad-body':
      base.Pset_PistolaCadBody = {
        RegenStatus: node.regenStatus,
        SourceSketchCount: node.sourceSketchIds.length,
        OperationCount:
          node.operationHistory.length > 0 ? node.operationHistory.length : node.operations.length,
        CadArtifactRef: node.cadArtifactRef ?? null,
      }
      break
    default:
      break
  }

  return base
}

export const getNodeBimMetadata = (node: AnyNode): NodeBimMetadata => {
  const metadata = isRecord(node.metadata) ? node.metadata : {}
  const bim = isRecord(metadata.bim) ? metadata.bim : {}
  const propertySets = isRecord(bim.propertySets) ? bim.propertySets : {}
  const parsedPropertySets: Record<string, BimPropertySet> = {}

  for (const [name, values] of Object.entries(propertySets)) {
    if (!isRecord(values)) continue

    parsedPropertySets[name] = Object.fromEntries(
      Object.entries(values).filter(
        ([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value),
      ),
    ) as BimPropertySet
  }

  return {
    description: typeof bim.description === 'string' ? bim.description : null,
    tag: typeof bim.tag === 'string' ? bim.tag : null,
    propertySets: {
      ...getBasePropertySets(node),
      ...parsedPropertySets,
    },
  }
}

class IfcWriter {
  private readonly entities: string[] = []
  private nextEntityId = 1

  add(definition: string) {
    const id = this.nextEntityId++
    this.entities.push(`#${id}=${definition};`)
    return id
  }

  ref(id: number | null | undefined) {
    return id ? `#${id}` : '$'
  }

  finalize(header: string[]) {
    return [
      'ISO-10303-21;',
      'HEADER;',
      ...header,
      'ENDSEC;',
      'DATA;',
      ...this.entities,
      'ENDSEC;',
      'END-ISO-10303-21;',
    ].join('\n')
  }
}

const createLocalPlacement = (
  writer: IfcWriter,
  point: [number, number, number],
  axisId: number,
  refDirectionId: number,
  parentPlacementId?: number | null,
) => {
  const cartesianPointId = writer.add(
    `IFCCARTESIANPOINT((${point[0]},${point[1]},${point[2]}))`,
  )
  const axisPlacementId = writer.add(
    `IFCAXIS2PLACEMENT3D(${writer.ref(cartesianPointId)},${writer.ref(axisId)},${writer.ref(refDirectionId)})`,
  )

  return writer.add(`IFCLOCALPLACEMENT(${writer.ref(parentPlacementId)},${writer.ref(axisPlacementId)})`)
}

const createPropertySet = (
  writer: IfcWriter,
  ownerHistoryId: number,
  objectId: number,
  seed: string,
  name: string,
  properties: BimPropertySet,
) => {
  const propertyIds = Object.entries(properties)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([propertyName, value]) =>
      writer.add(
        `IFCPROPERTYSINGLEVALUE(${toIfcString(propertyName)},$,${
          toIfcValue(value as BimPropertyValue)
        },$)`,
      ),
    )

  if (propertyIds.length === 0) return

  const propertySetId = writer.add(
    `IFCPROPERTYSET('${sanitizeIfcGuid(`${seed}:${name}`)}',${writer.ref(ownerHistoryId)},${toIfcString(
      name,
    )},$,(${propertyIds.map((propertyId) => writer.ref(propertyId)).join(',')}))`,
  )

  writer.add(
    `IFCRELDEFINESBYPROPERTIES('${sanitizeIfcGuid(`${seed}:${name}:rel`)}',${writer.ref(
      ownerHistoryId,
    )},$,$,(${writer.ref(objectId)}),${writer.ref(propertySetId)})`,
  )
}

const isSpatialNode = (node: AnyNode): node is SiteNode | BuildingNode | LevelNode =>
  spatialTypes.has(node.type as SpatialType)

const shouldExportElement = (node: AnyNode) => !isSpatialNode(node) && !skippedIfcTypes.has(node.type)

const getSpatialContainerId = (node: AnyNode, nodes: NodeRecord) => {
  let currentId = node.parentId

  while (currentId) {
    const currentNode = nodes[currentId]
    if (!currentNode) return null
    if (isSpatialNode(currentNode)) return currentNode.id
    currentId = currentNode.parentId
  }

  return null
}

const getPlacementInfo = (node: AnyNode, nodes: NodeRecord): PlacementInfo => {
  switch (node.type) {
    case 'site':
      return { point: [0, 0, 0], containerId: null }
    case 'building':
      return {
        point: [node.position[0], node.position[2], node.position[1]],
        containerId: getSpatialContainerId(node, nodes),
      }
    case 'level':
      return {
        point: [0, 0, getLevelFloorElevation(node.id, nodes)],
        containerId: getSpatialContainerId(node, nodes),
      }
    case 'wall': {
      const [x, y, z] = getWallPlacement(node)
      return { point: [x, z, y], containerId: getSpatialContainerId(node, nodes) }
    }
    case 'slab':
      return { point: [0, 0, node.elevation], containerId: getSpatialContainerId(node, nodes) }
    case 'ceiling':
      return { point: [0, 0, node.height], containerId: getSpatialContainerId(node, nodes) }
    case 'roof':
      return {
        point: [node.position[0], node.position[2], node.position[1]],
        containerId: getSpatialContainerId(node, nodes),
      }
    case 'roof-segment':
      return {
        point: [node.position[0], node.position[2], node.position[1]],
        containerId: getSpatialContainerId(node, nodes),
      }
    case 'zone':
      return { point: [0, 0, 0], containerId: getSpatialContainerId(node, nodes) }
    case 'item':
      return {
        point: [node.position[0], node.position[2], node.position[1]],
        containerId: getSpatialContainerId(node, nodes),
      }
    case 'door':
      return {
        point: [node.position[0], node.position[2], node.position[1]],
        containerId: getSpatialContainerId(node, nodes),
      }
    case 'window':
      return {
        point: [node.position[0], node.position[2], node.position[1]],
        containerId: getSpatialContainerId(node, nodes),
      }
    case 'cad-body': {
      const transform = getCadBodyTransform(node)
      return {
        point: [transform.position[0], transform.position[2], transform.position[1]],
        containerId: getSpatialContainerId(node, nodes),
      }
    }
    default:
      return { point: [0, 0, 0], containerId: getSpatialContainerId(node, nodes) }
  }
}

const collectChildIdsByType = <T extends AnyNode['type']>(
  node: AnyNode,
  nodes: NodeRecord,
  type: T,
) =>
  getNodeChildren(node)
    .map((childId) => nodes[childId])
    .filter((child): child is Extract<AnyNode, { type: T }> => child?.type === type)

const collectContainedElementIds = (
  containerId: string,
  nodes: NodeRecord,
) => {
  const result: string[] = []
  const stack = [containerId]

  while (stack.length > 0) {
    const currentId = stack.pop()
    if (!currentId) continue

    const currentNode = nodes[currentId]
    if (!currentNode) continue

    for (const childId of getNodeChildren(currentNode)) {
      const childNode = nodes[childId]
      if (!childNode) continue

      if (isSpatialNode(childNode)) continue
      if (shouldExportElement(childNode)) {
        result.push(childNode.id)
      }
      stack.push(childNode.id)
    }
  }

  return Array.from(new Set(result))
}

const sortIds = <T extends string>(ids: T[]) => [...ids].sort((a, b) => a.localeCompare(b))

export function serializeSceneToIfc(
  nodes: NodeRecord,
  rootNodeIds: string[],
  options: ExportIfcOptions = {},
) {
  const writer = new IfcWriter()
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date().toISOString()

  const personId = writer.add("IFCPERSON($,$,'Pistola',$,$,$,$,$)")
  const orgId = writer.add("IFCORGANIZATION($,'Pistola',$,$,$)")
  const personAndOrgId = writer.add(`IFCPERSONANDORGANIZATION(${writer.ref(personId)},${writer.ref(orgId)},$)`)
  const applicationId = writer.add(
    `IFCAPPLICATION(${writer.ref(orgId)},'1.0','Pistola IFC Metadata Export','Pistola')`,
  )
  const ownerHistoryId = writer.add(
    `IFCOWNERHISTORY(${writer.ref(personAndOrgId)},${writer.ref(
      applicationId,
    )},$,.ADDED.,$,$,$,${timestamp})`,
  )

  const originId = writer.add('IFCCARTESIANPOINT((0.,0.,0.))')
  const axisId = writer.add('IFCDIRECTION((0.,0.,1.))')
  const refDirectionId = writer.add('IFCDIRECTION((1.,0.,0.))')
  const worldPlacementId = writer.add(
    `IFCAXIS2PLACEMENT3D(${writer.ref(originId)},${writer.ref(axisId)},${writer.ref(refDirectionId)})`,
  )
  const contextId = writer.add(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,0.00001,${writer.ref(worldPlacementId)},$)`,
  )
  const unitAssignmentId = writer.add(
    'IFCUNITASSIGNMENT((IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.),IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.),IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.))))',
  )

  const projectName = options.projectName?.trim() || 'Pistola Project'
  const projectId = writer.add(
    `IFCPROJECT('${sanitizeIfcGuid(`project:${projectName}`)}',${writer.ref(
      ownerHistoryId,
    )},${toIfcString(projectName)},$,$,$,$,(${writer.ref(contextId)}),${writer.ref(unitAssignmentId)})`,
  )

  const placementIds = new Map<string, number>()
  const entityIds = new Map<string, number>()

  const createSpatialEntity = (
    node: SiteNode | BuildingNode | LevelNode,
    definition: string,
  ) => {
    const { point, containerId } = getPlacementInfo(node, nodes)
    const parentPlacementId = containerId ? placementIds.get(containerId) ?? null : null
    const placementId = createLocalPlacement(writer, point, axisId, refDirectionId, parentPlacementId)
    placementIds.set(node.id, placementId)

    const entityId = writer.add(definition.replace('__PLACEMENT__', writer.ref(placementId)))
    entityIds.set(node.id, entityId)

    const metadata = getNodeBimMetadata(node)
    for (const [propertySetName, properties] of Object.entries(metadata.propertySets || {})) {
      createPropertySet(writer, ownerHistoryId, entityId, node.id, propertySetName, properties)
    }
  }

  const siteIds = sortIds(
    rootNodeIds.filter((rootId) => nodes[rootId]?.type === 'site') as SiteNode['id'][],
  )

  for (const siteId of siteIds) {
    const site = nodes[siteId]
    if (site?.type !== 'site') continue

    createSpatialEntity(
      site,
      `IFCSITE('${sanitizeIfcGuid(site.id)}',${writer.ref(ownerHistoryId)},${toIfcString(
        getNodeName(site, 'Site'),
      )},$,$,__PLACEMENT__,$,$,.ELEMENT.,$,$,$,$,$)`,
    )
  }

  const buildingIds = sortIds(
    Object.values(nodes)
      .filter((node): node is BuildingNode => node.type === 'building')
      .map((node) => node.id),
  )

  for (const buildingId of buildingIds) {
    const building = nodes[buildingId]
    if (building?.type !== 'building') continue

    createSpatialEntity(
      building,
      `IFCBUILDING('${sanitizeIfcGuid(building.id)}',${writer.ref(ownerHistoryId)},${toIfcString(
        getNodeName(building, 'Building'),
      )},$,$,__PLACEMENT__,$,$,.ELEMENT.,$,$,$)`,
    )
  }

  const levelIds = sortIds(
    Object.values(nodes)
      .filter((node): node is LevelNode => node.type === 'level')
      .map((node) => node.id),
  )

  for (const levelId of levelIds) {
    const level = nodes[levelId]
    if (level?.type !== 'level') continue

    const elevation = getLevelFloorElevation(level.id, nodes)
    createSpatialEntity(
      level,
      `IFCBUILDINGSTOREY('${sanitizeIfcGuid(level.id)}',${writer.ref(ownerHistoryId)},${toIfcString(
        getNodeName(level, `Level ${level.level}`),
      )},$,$,__PLACEMENT__,$,$,.ELEMENT.,${elevation})`,
    )
  }

  const projectSiteRefs = siteIds
    .map((siteId) => entityIds.get(siteId))
    .filter((id): id is number => typeof id === 'number')
    .map((id) => writer.ref(id))

  if (projectSiteRefs.length > 0) {
    writer.add(
      `IFCRELAGGREGATES('${sanitizeIfcGuid('project-sites')}',${writer.ref(ownerHistoryId)},$,$,${writer.ref(
        projectId,
      )},(${projectSiteRefs.join(',')}))`,
    )
  }

  for (const siteId of siteIds) {
    const site = nodes[siteId]
    if (site?.type !== 'site') continue

    const childBuildingRefs = collectChildIdsByType(site, nodes, 'building')
      .map((child) => entityIds.get(child.id))
      .filter((id): id is number => typeof id === 'number')
      .map((id) => writer.ref(id))

    if (childBuildingRefs.length > 0) {
      writer.add(
        `IFCRELAGGREGATES('${sanitizeIfcGuid(`${site.id}:buildings`)}',${writer.ref(
          ownerHistoryId,
        )},$,$,${writer.ref(entityIds.get(site.id))},(${childBuildingRefs.join(',')}))`,
      )
    }
  }

  for (const buildingId of buildingIds) {
    const building = nodes[buildingId]
    if (building?.type !== 'building') continue

    const childLevelRefs = collectChildIdsByType(building, nodes, 'level')
      .map((child) => entityIds.get(child.id))
      .filter((id): id is number => typeof id === 'number')
      .map((id) => writer.ref(id))

    if (childLevelRefs.length > 0) {
      writer.add(
        `IFCRELAGGREGATES('${sanitizeIfcGuid(`${building.id}:levels`)}',${writer.ref(
          ownerHistoryId,
        )},$,$,${writer.ref(entityIds.get(building.id))},(${childLevelRefs.join(',')}))`,
      )
    }
  }

  const elementIds = sortIds(
    Object.values(nodes)
      .filter((node): node is AnyNode => shouldExportElement(node))
      .map((node) => node.id),
  )

  for (const nodeId of elementIds) {
    const node = nodes[nodeId]
    if (!node || !shouldExportElement(node)) continue

    const { point, containerId } = getPlacementInfo(node, nodes)
    const parentPlacementId = containerId ? placementIds.get(containerId) ?? null : null
    const placementId = createLocalPlacement(writer, point, axisId, refDirectionId, parentPlacementId)
    placementIds.set(node.id, placementId)

    const metadata = getNodeBimMetadata(node)
    const elementName =
      node.type === 'item'
        ? node.asset.name
        : getNodeName(node, node.type.replace(/-/g, ' '))

    const elementId = writer.add(
      `IFCBUILDINGELEMENTPROXY('${sanitizeIfcGuid(node.id)}',${writer.ref(ownerHistoryId)},${toIfcString(
        elementName,
      )},${toIfcString(metadata.description)},$,${writer.ref(placementId)},$,${toIfcString(
        metadata.tag,
      )},.NOTDEFINED.)`,
    )

    entityIds.set(node.id, elementId)

    for (const [propertySetName, properties] of Object.entries(metadata.propertySets || {})) {
      createPropertySet(writer, ownerHistoryId, elementId, node.id, propertySetName, properties)
    }
  }

  for (const siteId of siteIds) {
    const containedRefs = collectContainedElementIds(siteId, nodes)
      .filter((id) => {
        const node = nodes[id]
        return node ? getSpatialContainerId(node, nodes) === siteId : false
      })
      .map((id) => entityIds.get(id))
      .filter((id): id is number => typeof id === 'number')
      .map((id) => writer.ref(id))

    if (containedRefs.length > 0) {
      writer.add(
        `IFCRELCONTAINEDINSPATIALSTRUCTURE('${sanitizeIfcGuid(`${siteId}:contained`)}',${writer.ref(
          ownerHistoryId,
        )},$,$,(${containedRefs.join(',')}),${writer.ref(entityIds.get(siteId))})`,
      )
    }
  }

  for (const buildingId of buildingIds) {
    const containedRefs = collectContainedElementIds(buildingId, nodes)
      .filter((id) => {
        const node = nodes[id]
        return node ? getSpatialContainerId(node, nodes) === buildingId : false
      })
      .map((id) => entityIds.get(id))
      .filter((id): id is number => typeof id === 'number')
      .map((id) => writer.ref(id))

    if (containedRefs.length > 0) {
      writer.add(
        `IFCRELCONTAINEDINSPATIALSTRUCTURE('${sanitizeIfcGuid(`${buildingId}:contained`)}',${writer.ref(
          ownerHistoryId,
        )},$,$,(${containedRefs.join(',')}),${writer.ref(entityIds.get(buildingId))})`,
      )
    }
  }

  for (const levelId of levelIds) {
    const containedRefs = collectContainedElementIds(levelId, nodes)
      .filter((id) => {
        const node = nodes[id]
        return node ? getSpatialContainerId(node, nodes) === levelId : false
      })
      .map((id) => entityIds.get(id))
      .filter((id): id is number => typeof id === 'number')
      .map((id) => writer.ref(id))

    if (containedRefs.length > 0) {
      writer.add(
        `IFCRELCONTAINEDINSPATIALSTRUCTURE('${sanitizeIfcGuid(`${levelId}:contained`)}',${writer.ref(
          ownerHistoryId,
        )},$,$,(${containedRefs.join(',')}),${writer.ref(entityIds.get(levelId))})`,
      )
    }
  }

  return writer.finalize([
    "FILE_DESCRIPTION(('ViewDefinition [MetadataView]'),'2;1');",
    `FILE_NAME('pistola_metadata.ifc','${date}',('Pistola'),('OpenAI Codex'),'Pistola','Pistola','');`,
    "FILE_SCHEMA(('IFC4'));",
  ])
}
