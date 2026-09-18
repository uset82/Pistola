import type { AssistantAction } from '../types'

export type RecipeCategory = 'organic' | 'vehicle' | 'robotics' | 'sports' | 'furniture' | 'aerospace'

export interface CreationRecipe {
  id: string
  name: string
  category: RecipeCategory
  keywords: string[]
  generateActions: (params: {
    width?: number
    height?: number
    depth?: number
    color?: string
    position?: [number, number, number]
  }) => AssistantAction[]
}

export const heartRecipe: CreationRecipe = {
  id: 'heart',
  name: '3D Heart',
  category: 'organic',
  keywords: ['heart', 'corazon', 'corazón', 'love', 'cardioid'],
  generateActions: ({ width = 2.0, height = 2.5, depth = 0.5 }) => [
    {
      type: 'execute_cad_brief',
      brief: {
        intent: `Create a 3D heart (${width}m x ${height}m x ${depth}m)`,
        sketchPlans: [
          {
            plane: 'XY',
            entities: [
              {
                type: 'heart',
                points: [],
                params: { width, height, center: [0, 0] },
              },
            ],
            dimensions: [
              { kind: 'distance', value: width, label: 'width' },
              { kind: 'distance', value: height, label: 'height' },
            ],
            constraints: [],
          },
        ],
        operationGraph: [
          {
            id: 'op_heart_extrude',
            op: 'extrude',
            params: {
              sketchIndex: 0,
              distance: depth,
              direction: [0, 1, 0],
              symmetric: false,
            },
            dependsOn: [],
          },
        ],
        assumptions: [
          `Generated parametric smooth curved heart profile with width ${width}m and height ${height}m.`,
          `Extruded ${depth}m in height on the XY plane.`,
        ],
        ambiguities: [],
      },
    },
  ],
}

export const boardRecipe: CreationRecipe = {
  id: 'board',
  name: 'Surfboard',
  category: 'sports',
  keywords: ['surfboard', 'board', 'tabla', 'surf', 'skateboard'],
  generateActions: ({ width = 0.6, height = 2.2, depth = 0.08 }) => [
    {
      type: 'execute_cad_brief',
      brief: {
        intent: `Create a streamlined board (${width}m x ${height}m x ${depth}m)`,
        sketchPlans: [
          {
            plane: 'XY',
            entities: [
              {
                type: 'board',
                points: [],
                params: { width, length: height, center: [0, 0] },
              },
            ],
            dimensions: [
              { kind: 'distance', value: width, label: 'width' },
              { kind: 'distance', value: height, label: 'length' },
            ],
            constraints: [],
          },
        ],
        operationGraph: [
          {
            id: 'op_board_extrude',
            op: 'extrude',
            params: {
              sketchIndex: 0,
              distance: depth,
              direction: [0, 1, 0],
              symmetric: false,
            },
            dependsOn: [],
          },
        ],
        assumptions: [
          `Generated streamlined cambered board profile (${width}m x ${height}m).`,
          `Extruded ${depth}m deck thickness.`,
        ],
        ambiguities: [],
      },
    },
  ],
}

export const airplaneRecipe: CreationRecipe = {
  id: 'airplane',
  name: 'Airplane Assembly',
  category: 'vehicle',
  keywords: ['airplane', 'plane', 'avion', 'avión', 'aircraft', 'jet'],
  generateActions: ({ position = [0, 0, 0] }) => {
    const [x, y, z] = position
    const rootRef = '$ref_airplane_root'
    return [
      // Fuselage (Root node)
      {
        type: 'place_item',
        refId: rootRef,
        placement: 'explicit',
        name: 'Airplane Fuselage',
        assetId: 'primitive-capsule',
        position: [x, y + 1.2, z],
        scale: [1.2, 7.0, 1.2],
        rotation: [Math.PI / 2, 0, 0],
      },
      // Cockpit canopy
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Cockpit Canopy',
        assetId: 'primitive-sphere',
        position: [x, y + 1.7, z + 2.0],
        scale: [0.9, 0.6, 1.8],
      },
      // Left Wing
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Left Wing',
        assetId: 'primitive-box',
        position: [x - 3.8, y + 1.1, z - 0.2],
        scale: [5.0, 0.1, 1.8],
        rotation: [0, 0.15, 0],
      },
      // Right Wing
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Right Wing',
        assetId: 'primitive-box',
        position: [x + 3.8, y + 1.1, z - 0.2],
        scale: [5.0, 0.1, 1.8],
        rotation: [0, -0.15, 0],
      },
      // Vertical Tail Fin
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Vertical Tail Fin',
        assetId: 'primitive-box',
        position: [x, y + 2.4, z - 3.0],
        scale: [0.15, 1.8, 1.4],
        rotation: [-0.2, 0, 0],
      },
      // Left Horizontal Stabilizer
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Left Stabilizer',
        assetId: 'primitive-box',
        position: [x - 1.4, y + 1.3, z - 3.2],
        scale: [1.8, 0.08, 0.9],
      },
      // Right Horizontal Stabilizer
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Right Stabilizer',
        assetId: 'primitive-box',
        position: [x + 1.4, y + 1.3, z - 3.2],
        scale: [1.8, 0.08, 0.9],
      },
      // Left Engine
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Left Engine',
        assetId: 'primitive-cylinder',
        position: [x - 2.2, y + 0.6, z - 0.1],
        scale: [0.6, 1.8, 0.6],
        rotation: [Math.PI / 2, 0, 0],
      },
      // Right Engine
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Right Engine',
        assetId: 'primitive-cylinder',
        position: [x + 2.2, y + 0.6, z - 0.1],
        scale: [0.6, 1.8, 0.6],
        rotation: [Math.PI / 2, 0, 0],
      },
    ]
  },
}

export const robotArmRecipe: CreationRecipe = {
  id: 'robot_arm',
  name: 'Articulated Robotic Arm',
  category: 'robotics',
  keywords: ['robot arm', 'arm robot', 'robotic arm', 'brazo robot', 'brazo robotico', 'brazo robótico', 'manipulator'],
  generateActions: ({ position = [0, 0, 0] }) => {
    const [x, y, z] = position
    const rootRef = '$ref_arm_root'
    return [
      // Base Pedestal (Root node)
      {
        type: 'place_item',
        refId: rootRef,
        placement: 'explicit',
        name: 'Base Pedestal',
        assetId: 'primitive-cylinder',
        position: [x, y, z],
        scale: [1.0, 0.3, 1.0],
      },
      // Shoulder Joint
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Shoulder Joint',
        assetId: 'primitive-sphere',
        position: [x, y + 0.45, z],
        scale: [0.6, 0.6, 0.6],
      },
      // Upper Arm Link
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Upper Arm Link',
        assetId: 'primitive-cylinder',
        position: [x, y + 1.2, z + 0.3],
        scale: [0.25, 1.5, 0.25],
        rotation: [0.35, 0, 0],
      },
      // Elbow Joint
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Elbow Joint',
        assetId: 'primitive-sphere',
        position: [x, y + 1.9, z + 0.6],
        scale: [0.5, 0.5, 0.5],
      },
      // Forearm Link
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Forearm Link',
        assetId: 'primitive-cylinder',
        position: [x, y + 2.1, z + 1.2],
        scale: [0.2, 1.2, 0.2],
        rotation: [1.1, 0, 0],
      },
      // Wrist Joint
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Wrist Joint',
        assetId: 'primitive-sphere',
        position: [x, y + 2.25, z + 1.75],
        scale: [0.35, 0.35, 0.35],
      },
      // Gripper Base Plate
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Gripper Base Plate',
        assetId: 'primitive-box',
        position: [x, y + 2.25, z + 1.95],
        scale: [0.4, 0.15, 0.1],
      },
      // Left Finger
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Gripper Left Finger',
        assetId: 'primitive-box',
        position: [x - 0.15, y + 2.25, z + 2.15],
        scale: [0.06, 0.12, 0.35],
      },
      // Right Finger
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Gripper Right Finger',
        assetId: 'primitive-box',
        position: [x + 0.15, y + 2.25, z + 2.15],
        scale: [0.06, 0.12, 0.35],
      },
    ]
  },
}

export const humanoidRobotRecipe: CreationRecipe = {
  id: 'robot',
  name: 'Humanoid Robot',
  category: 'robotics',
  keywords: ['robot', 'humanoid', 'android', 'androide', 'automaton'],
  generateActions: ({ position = [0, 0, 0] }) => {
    const [x, y, z] = position
    const rootRef = '$ref_robot_root'
    return [
      // Torso (Root node)
      {
        type: 'place_item',
        refId: rootRef,
        placement: 'explicit',
        name: 'Robot Torso',
        assetId: 'primitive-box',
        position: [x, y + 1.3, z],
        scale: [0.8, 1.0, 0.5],
      },
      // Chest display / core
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Robot Core',
        assetId: 'primitive-cylinder',
        position: [x, y + 1.45, z + 0.27],
        scale: [0.25, 0.08, 0.25],
        rotation: [Math.PI / 2, 0, 0],
      },
      // Neck
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Robot Neck',
        assetId: 'primitive-cylinder',
        position: [x, y + 1.85, z],
        scale: [0.2, 0.15, 0.2],
      },
      // Head
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Robot Head',
        assetId: 'primitive-box',
        position: [x, y + 2.1, z],
        scale: [0.45, 0.45, 0.4],
      },
      // Visor / Eyes
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Robot Visor',
        assetId: 'primitive-box',
        position: [x, y + 2.15, z + 0.22],
        scale: [0.35, 0.12, 0.06],
      },
      // Left Shoulder
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Left Shoulder',
        assetId: 'primitive-sphere',
        position: [x - 0.55, y + 1.65, z],
        scale: [0.25, 0.25, 0.25],
      },
      // Left Arm
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Left Arm',
        assetId: 'primitive-cylinder',
        position: [x - 0.55, y + 1.15, z],
        scale: [0.18, 0.8, 0.18],
      },
      // Right Shoulder
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Right Shoulder',
        assetId: 'primitive-sphere',
        position: [x + 0.55, y + 1.65, z],
        scale: [0.25, 0.25, 0.25],
      },
      // Right Arm
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Right Arm',
        assetId: 'primitive-cylinder',
        position: [x + 0.55, y + 1.15, z],
        scale: [0.18, 0.8, 0.18],
      },
      // Left Leg Hip
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Left Hip',
        assetId: 'primitive-sphere',
        position: [x - 0.25, y + 0.8, z],
        scale: [0.22, 0.22, 0.22],
      },
      // Left Leg
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Left Leg',
        assetId: 'primitive-cylinder',
        position: [x - 0.25, y + 0.4, z],
        scale: [0.2, 0.8, 0.2],
      },
      // Left Foot
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Left Foot',
        assetId: 'primitive-box',
        position: [x - 0.25, y, z + 0.1],
        scale: [0.22, 0.12, 0.38],
      },
      // Right Leg Hip
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Right Hip',
        assetId: 'primitive-sphere',
        position: [x + 0.25, y + 0.8, z],
        scale: [0.22, 0.22, 0.22],
      },
      // Right Leg
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Right Leg',
        assetId: 'primitive-cylinder',
        position: [x + 0.25, y + 0.4, z],
        scale: [0.2, 0.8, 0.2],
      },
      // Right Foot
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Right Foot',
        assetId: 'primitive-box',
        position: [x + 0.25, y, z + 0.1],
        scale: [0.22, 0.12, 0.38],
      },
    ]
  },
}

export const carRecipe: CreationRecipe = {
  id: 'car',
  name: 'Automobile Assembly',
  category: 'vehicle',
  keywords: ['car', 'coche', 'auto', 'vehiculo', 'vehículo', 'automovil', 'automóvil'],
  generateActions: ({ position = [0, 0, 0] }) => {
    const [x, y, z] = position
    const rootRef = '$ref_car_root'
    return [
      // Chassis (Root node)
      {
        type: 'place_item',
        refId: rootRef,
        placement: 'explicit',
        name: 'Car Chassis',
        assetId: 'primitive-box',
        position: [x, y + 0.4, z],
        scale: [1.8, 0.5, 4.0],
      },
      // Cabin
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Car Cabin',
        assetId: 'primitive-box',
        position: [x, y + 0.9, z - 0.2],
        scale: [1.5, 0.6, 2.2],
      },
      // Front-Left Wheel
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Front-Left Wheel',
        assetId: 'primitive-cylinder',
        position: [x - 0.95, y + 0.35, z + 1.2],
        scale: [0.7, 0.25, 0.7],
        rotation: [0, 0, Math.PI / 2],
      },
      // Front-Right Wheel
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Front-Right Wheel',
        assetId: 'primitive-cylinder',
        position: [x + 0.95, y + 0.35, z + 1.2],
        scale: [0.7, 0.25, 0.7],
        rotation: [0, 0, Math.PI / 2],
      },
      // Rear-Left Wheel
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rear-Left Wheel',
        assetId: 'primitive-cylinder',
        position: [x - 0.95, y + 0.35, z - 1.2],
        scale: [0.7, 0.25, 0.7],
        rotation: [0, 0, Math.PI / 2],
      },
      // Rear-Right Wheel
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rear-Right Wheel',
        assetId: 'primitive-cylinder',
        position: [x + 0.95, y + 0.35, z - 1.2],
        scale: [0.7, 0.25, 0.7],
        rotation: [0, 0, Math.PI / 2],
      },
    ]
  },
}

export const tableRecipe: CreationRecipe = {
  id: 'table',
  name: 'Dining Table Assembly',
  category: 'furniture',
  keywords: ['table', 'mesa', 'desk', 'escritorio', 'dining table', 'coffee table'],
  generateActions: ({ width = 1.8, depth = 0.9, height = 0.75, position = [0, 0, 0] }) => {
    const [x, y, z] = position
    const rootRef = '$ref_table_root'
    const legInsetX = width / 2 - 0.1
    const legInsetZ = depth / 2 - 0.1
    const legHeight = height - 0.05
    return [
      // Tabletop (Root node)
      {
        type: 'place_item',
        refId: rootRef,
        placement: 'explicit',
        name: 'Table Top',
        assetId: 'primitive-box',
        position: [x, y + height, z],
        scale: [width, 0.05, depth],
      },
      // Leg 1 (Front-Left)
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Table Leg FL',
        assetId: 'primitive-cylinder',
        position: [x - legInsetX, y + legHeight / 2, z + legInsetZ],
        scale: [0.06, legHeight, 0.06],
      },
      // Leg 2 (Front-Right)
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Table Leg FR',
        assetId: 'primitive-cylinder',
        position: [x + legInsetX, y + legHeight / 2, z + legInsetZ],
        scale: [0.06, legHeight, 0.06],
      },
      // Leg 3 (Rear-Left)
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Table Leg RL',
        assetId: 'primitive-cylinder',
        position: [x - legInsetX, y + legHeight / 2, z - legInsetZ],
        scale: [0.06, legHeight, 0.06],
      },
      // Leg 4 (Rear-Right)
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Table Leg RR',
        assetId: 'primitive-cylinder',
        position: [x + legInsetX, y + legHeight / 2, z - legInsetZ],
        scale: [0.06, legHeight, 0.06],
      },
    ]
  },
}

export const chairRecipe: CreationRecipe = {
  id: 'chair',
  name: 'Chair Assembly',
  category: 'furniture',
  keywords: ['chair', 'silla', 'seat', 'asiento', 'stool'],
  generateActions: ({ position = [0, 0, 0] }) => {
    const [x, y, z] = position
    const rootRef = '$ref_chair_root'
    return [
      // Seat (Root node)
      {
        type: 'place_item',
        refId: rootRef,
        placement: 'explicit',
        name: 'Chair Seat',
        assetId: 'primitive-box',
        position: [x, y + 0.45, z],
        scale: [0.45, 0.05, 0.45],
      },
      // Backrest
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Chair Backrest',
        assetId: 'primitive-box',
        position: [x, y + 0.75, z - 0.2],
        scale: [0.45, 0.55, 0.04],
      },
      // Leg FL
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Chair Leg FL',
        assetId: 'primitive-cylinder',
        position: [x - 0.18, y + 0.22, z + 0.18],
        scale: [0.04, 0.44, 0.04],
      },
      // Leg FR
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Chair Leg FR',
        assetId: 'primitive-cylinder',
        position: [x + 0.18, y + 0.22, z + 0.18],
        scale: [0.04, 0.44, 0.04],
      },
      // Leg RL
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Chair Leg RL',
        assetId: 'primitive-cylinder',
        position: [x - 0.18, y + 0.22, z - 0.18],
        scale: [0.04, 0.44, 0.04],
      },
      // Leg RR
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Chair Leg RR',
        assetId: 'primitive-cylinder',
        position: [x + 0.18, y + 0.22, z - 0.18],
        scale: [0.04, 0.44, 0.04],
      },
    ]
  },
}

export const droneRecipe: CreationRecipe = {
  id: 'drone',
  name: 'Quadcopter Drone Assembly',
  category: 'robotics',
  keywords: ['drone', 'dron', 'quadcopter', 'cuadricoptero', 'cuadricóptero', 'uav'],
  generateActions: ({ position = [0, 0, 0] }) => {
    const [x, y, z] = position
    const rootRef = '$ref_drone_root'
    return [
      // Central Body (Root node)
      {
        type: 'place_item',
        refId: rootRef,
        placement: 'explicit',
        name: 'Drone Fuselage',
        assetId: 'primitive-sphere',
        position: [x, y + 1.0, z],
        scale: [0.4, 0.18, 0.4],
      },
      // Arm 1 (Front-Left)
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rotor Arm FL',
        assetId: 'primitive-cylinder',
        position: [x - 0.35, y + 1.0, z + 0.35],
        scale: [0.04, 0.5, 0.04],
        rotation: [0, -Math.PI / 4, Math.PI / 2],
      },
      // Rotor FL
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rotor Propeller FL',
        assetId: 'primitive-cylinder',
        position: [x - 0.5, y + 1.05, z + 0.5],
        scale: [0.3, 0.02, 0.3],
      },
      // Arm 2 (Front-Right)
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rotor Arm FR',
        assetId: 'primitive-cylinder',
        position: [x + 0.35, y + 1.0, z + 0.35],
        scale: [0.04, 0.5, 0.04],
        rotation: [0, Math.PI / 4, Math.PI / 2],
      },
      // Rotor FR
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rotor Propeller FR',
        assetId: 'primitive-cylinder',
        position: [x + 0.5, y + 1.05, z + 0.5],
        scale: [0.3, 0.02, 0.3],
      },
      // Arm 3 (Rear-Left)
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rotor Arm RL',
        assetId: 'primitive-cylinder',
        position: [x - 0.35, y + 1.0, z - 0.35],
        scale: [0.04, 0.5, 0.04],
        rotation: [0, Math.PI / 4, Math.PI / 2],
      },
      // Rotor RL
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rotor Propeller RL',
        assetId: 'primitive-cylinder',
        position: [x - 0.5, y + 1.05, z - 0.5],
        scale: [0.3, 0.02, 0.3],
      },
      // Arm 4 (Rear-Right)
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rotor Arm RR',
        assetId: 'primitive-cylinder',
        position: [x + 0.35, y + 1.0, z - 0.35],
        scale: [0.04, 0.5, 0.04],
        rotation: [0, -Math.PI / 4, Math.PI / 2],
      },
      // Rotor RR
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rotor Propeller RR',
        assetId: 'primitive-cylinder',
        position: [x + 0.5, y + 1.05, z - 0.5],
        scale: [0.3, 0.02, 0.3],
      },
    ]
  },
}

export const rocketRecipe: CreationRecipe = {
  id: 'rocket',
  name: 'Space Rocket Assembly',
  category: 'aerospace',
  keywords: ['rocket', 'cohete', 'spaceship', 'nave espacial', 'shuttle'],
  generateActions: ({ position = [0, 0, 0] }) => {
    const [x, y, z] = position
    const rootRef = '$ref_rocket_root'
    return [
      // Fuselage Cylinder (Root node)
      {
        type: 'place_item',
        refId: rootRef,
        placement: 'explicit',
        name: 'Rocket Booster Body',
        assetId: 'primitive-cylinder',
        position: [x, y + 2.5, z],
        scale: [1.0, 4.0, 1.0],
      },
      // Nose Cone
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Rocket Nose Cone',
        assetId: 'primitive-cone',
        position: [x, y + 5.25, z],
        scale: [1.0, 1.5, 1.0],
      },
      // Engine Nozzle
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Engine Nozzle',
        assetId: 'primitive-cone',
        position: [x, y + 0.25, z],
        scale: [0.7, 0.5, 0.7],
        rotation: [Math.PI, 0, 0],
      },
      // Fin North
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Stabilizer Fin N',
        assetId: 'primitive-wedge',
        position: [x, y + 0.8, z + 0.65],
        scale: [0.1, 1.2, 0.6],
      },
      // Fin South
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Stabilizer Fin S',
        assetId: 'primitive-wedge',
        position: [x, y + 0.8, z - 0.65],
        scale: [0.1, 1.2, 0.6],
        rotation: [0, Math.PI, 0],
      },
      // Fin East
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Stabilizer Fin E',
        assetId: 'primitive-wedge',
        position: [x + 0.65, y + 0.8, z],
        scale: [0.6, 1.2, 0.1],
        rotation: [0, -Math.PI / 2, 0],
      },
      // Fin West
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Stabilizer Fin W',
        assetId: 'primitive-wedge',
        position: [x - 0.65, y + 0.8, z],
        scale: [0.6, 1.2, 0.1],
        rotation: [0, Math.PI / 2, 0],
      },
    ]
  },
}

export const boatRecipe: CreationRecipe = {
  id: 'boat',
  name: '3D Boat Assembly',
  category: 'vehicle',
  keywords: [
    'boat',
    'barco',
    'barquito',
    'ship',
    'sailboat',
    'velero',
    'yacht',
    'bote',
    'lancha',
    'navio',
    'navío',
    'buque',
  ],
  generateActions: ({ position = [0, 0, 0] }) => {
    const [x, y, z] = position
    const rootRef = '$ref_boat_root'
    return [
      // Boat Hull (Root node)
      {
        type: 'place_item',
        refId: rootRef,
        placement: 'explicit',
        name: 'Boat Hull',
        assetId: 'primitive-box',
        position: [x, y + 0.4, z],
        scale: [2.0, 0.8, 5.0],
      },
      // Bow (Front tapered section)
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Boat Bow',
        assetId: 'primitive-wedge',
        position: [x, y + 0.4, z + 3.1],
        scale: [2.0, 0.8, 1.6],
      },
      // Stern Deck
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Stern Deck',
        assetId: 'primitive-box',
        position: [x, y + 0.85, z - 1.8],
        scale: [1.8, 0.1, 1.2],
      },
      // Deck Cabin / Wheelhouse
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Deck Cabin',
        assetId: 'primitive-box',
        position: [x, y + 1.2, z - 0.4],
        scale: [1.4, 0.9, 1.8],
      },
      // Cabin Roof
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Cabin Roof',
        assetId: 'primitive-box',
        position: [x, y + 1.7, z - 0.4],
        scale: [1.55, 0.1, 1.95],
      },
      // Main Mast
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Main Mast',
        assetId: 'primitive-cylinder',
        position: [x, y + 2.1, z + 1.0],
        scale: [0.12, 2.4, 0.12],
      },
      // Crow's Nest / Lookout
      {
        type: 'place_item',
        parentId: rootRef,
        placement: 'explicit',
        name: 'Crow Nest',
        assetId: 'primitive-cylinder',
        position: [x, y + 3.0, z + 1.0],
        scale: [0.45, 0.2, 0.45],
      },
    ]
  },
}

export const CREATION_RECIPES: CreationRecipe[] = [
  heartRecipe,
  boardRecipe,
  airplaneRecipe,
  robotArmRecipe,
  humanoidRobotRecipe,
  carRecipe,
  tableRecipe,
  chairRecipe,
  droneRecipe,
  rocketRecipe,
  boatRecipe,
]

export const findMatchingRecipe = (prompt: string): CreationRecipe | null => {
  const normalized = prompt.trim().toLowerCase()
  for (const recipe of CREATION_RECIPES) {
    if (recipe.keywords.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(normalized))) {
      return recipe
    }
  }
  return null
}

export function listCreationRecipes() {
  return CREATION_RECIPES.map((recipe) => ({
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    keywords: recipe.keywords,
  }))
}
