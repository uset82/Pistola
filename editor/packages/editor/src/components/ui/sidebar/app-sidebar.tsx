'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { CommandPalette } from './../../../components/ui/command-palette'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebarStore,
} from './../../../components/ui/primitives/sidebar'
import { cn } from './../../../lib/utils'
import { CadStatus } from './cad-status'
import { CommandsTrigger } from './commands-trigger'
import { IconRail, type PanelId } from './icon-rail'
import { SettingsPanel, type SettingsPanelProps } from './panels/settings-panel'
import { SitePanel, type SitePanelProps } from './panels/site-panel'
import { WorkspaceSwitcher } from './workspace-switcher'
import useEditor from '../../../store/use-editor'
import { CadSpacePanel } from '../../../workspaces/cad'
import { WorldSwitcher } from '../../../workspaces/world-switcher'

interface AppSidebarProps {
  appMenuButton?: ReactNode
  sidebarTop?: ReactNode
  settingsPanelProps?: SettingsPanelProps
  sitePanelProps?: SitePanelProps
  enableCad?: boolean
  enableCadRuntime?: boolean
}

export function AppSidebar({
  appMenuButton,
  sidebarTop,
  settingsPanelProps,
  sitePanelProps,
  enableCad = true,
  enableCadRuntime = true,
}: AppSidebarProps) {
  const [activePanel, setActivePanel] = useState<PanelId>('site')
  const workspace = useEditor((state) => state.workspace)
  const showArchitecture = !enableCad || workspace === 'architecture'

  useEffect(() => {
    // Widen default sidebar (288px → 432px) for better project title visibility
    const store = useSidebarStore.getState()
    if (store.width <= 288) {
      store.setWidth(432)
    }
  }, [])

  const renderPanelContent = () => {
    if (activePanel === 'settings') return <SettingsPanel {...settingsPanelProps} />
    if (enableCad && workspace === 'cad') return <CadSpacePanel />
    return <SitePanel {...sitePanelProps} />
  }

  return (
    <>
      <Sidebar className={cn('dark text-white')} variant="floating">
        <div className="flex h-full">
          {/* Icon Rail */}
          <IconRail
            activePanel={activePanel}
            appMenuButton={appMenuButton}
            onPanelChange={setActivePanel}
          />

          {/* Panel Content */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <SidebarHeader className="relative flex-col items-stretch justify-center gap-3 border-border/50 border-b px-3 py-3">
              {sidebarTop}
              {enableCad ? <WorldSwitcher /> : null}
              {showArchitecture ? (
                <WorkspaceSwitcher
                  enableCad={false}
                  onWorkspaceChange={() => setActivePanel('site')}
                />
              ) : null}
              <CommandsTrigger />
              {enableCad && enableCadRuntime && workspace === 'cad' ? <CadStatus /> : null}
            </SidebarHeader>

            <SidebarContent className={cn('no-scrollbar flex flex-1 flex-col overflow-hidden')}>
              {renderPanelContent()}
            </SidebarContent>
          </div>
        </div>
      </Sidebar>
      <CommandPalette />
    </>
  )
}
