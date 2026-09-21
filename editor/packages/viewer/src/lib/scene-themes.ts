export type SceneTheme = {
  id: string
  name: string
  appearance: 'light' | 'dark'
  background: string
  backgroundSky?: string
  ground: string
  ambient: { color: string; intensity: number }
  hemi?: { sky: string; ground: string; intensity: number }
  lights: Array<{
    position: [number, number, number]
    color: string
    intensity: number
    castShadow?: boolean
  }>
  toneMappingExposure: number
}

/** Themes ported from pascalorg/editor main (sun-dominant lighting pass). */
export const SCENE_THEMES: SceneTheme[] = [
  {
    id: 'studio',
    name: 'Studio',
    appearance: 'light',
    background: '#fbfbfa',
    backgroundSky: '#b6cfe7',
    ground: '#e9e7e2',
    ambient: { color: '#ffffff', intensity: 0.15 },
    hemi: { sky: '#ffffff', ground: '#aaa49a', intensity: 0.45 },
    lights: [
      { position: [10, 10, 10], color: '#ffffff', intensity: 4, castShadow: true },
      { position: [-10, 10, -10], color: '#ffffff', intensity: 0.6 },
    ],
    toneMappingExposure: 0.9,
  },
  {
    id: 'night',
    name: 'Night',
    appearance: 'dark',
    background: '#1f2433',
    backgroundSky: '#12161f',
    ground: '#4a5470',
    ambient: { color: '#a0b0ff', intensity: 0.25 },
    hemi: { sky: '#3a4666', ground: '#232a3d', intensity: 0.55 },
    lights: [
      { position: [10, 10, 10], color: '#e0e5ff', intensity: 1.2, castShadow: true },
      { position: [-10, 10, -10], color: '#8090ff', intensity: 0.3 },
    ],
    toneMappingExposure: 0.9,
  },
]

const SCENE_THEME_BY_ID = new Map(SCENE_THEMES.map((theme) => [theme.id, theme]))

export function getSceneTheme(id: string): SceneTheme {
  return SCENE_THEME_BY_ID.get(id) ?? SCENE_THEMES[0]!
}

/** Map the existing light/dark toggle onto the public sun-and-sky themes. */
export function themeFromViewerAppearance(theme: 'light' | 'dark'): SceneTheme {
  return getSceneTheme(theme === 'dark' ? 'night' : 'studio')
}
