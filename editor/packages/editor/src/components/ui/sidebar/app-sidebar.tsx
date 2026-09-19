'use client'

import { type ReactNode, useState } from 'react'
import { CommandPalette } from './../../../components/ui/command-palette'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebar,
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
  const { isMobile, openMobile, state, toggleSidebar } = useSidebar()
  const projectHidden = isMobile ? !openMobile : state === 'collapsed'

  const renderPanelContent = () => {
    if (activePanel === 'settings') return <SettingsPanel {...settingsPanelProps} />
    if (enableCad && workspace === 'cad') return <CadSpacePanel />
    return <SitePanel {...sitePanelProps} />
  }

  return (
    <>
      <Sidebar className={cn('dark text-white top-9 h-[calc(100svh-2.25rem)]')} variant="floating">
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
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.16em] text-white/45">Project</span>
                <button
                  aria-label="Hide project"
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/80"
                  data-testid="hide-project"
                  onClick={toggleSidebar}
                  type="button"
                >
                  Hide
                </button>
              </div>
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
      {projectHidden ? (
        <button
          aria-label="Show project"
          className="pointer-events-auto fixed top-12 left-3 z-30 rounded-full border border-white/15 bg-neutral-950/92 px-3 py-2 text-xs text-white shadow-lg"
          data-testid="show-project"
          onClick={toggleSidebar}
          type="button"
        >
          Show project
        </button>
      ) : null}
      <CommandPalette />
    </>
  )
}
