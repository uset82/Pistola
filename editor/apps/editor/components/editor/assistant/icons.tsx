import type { ReactNode } from 'react'

type IconProps = { size?: number; className?: string }

const StrokeIcon = ({
  size = 16,
  strokeWidth = 1.75,
  className,
  children,
}: IconProps & { strokeWidth?: number; children: ReactNode }) => (
  <svg
    aria-hidden="true"
    className={className}
    fill="none"
    height={size}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={strokeWidth}
    viewBox="0 0 24 24"
    width={size}
  >
    {children}
  </svg>
)

/** Crosshair mark: the assistant's brand glyph, drawn in the accent colour. */
export const AssistantMarkIcon = (props: IconProps) => (
  <StrokeIcon strokeWidth={2} {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
  </StrokeIcon>
)

export const NewChatIcon = (props: IconProps) => (
  <StrokeIcon {...props}>
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.4 2.6a2 2 0 0 1 3 3L12 15l-4 1 1-4Z" />
  </StrokeIcon>
)

export const DockLeftIcon = (props: IconProps) => (
  <StrokeIcon {...props}>
    <rect height="18" rx="2" width="18" x="3" y="3" />
    <path d="M9 3v18" />
  </StrokeIcon>
)

export const MinusIcon = (props: IconProps) => (
  <StrokeIcon {...props}>
    <path d="M5 12h14" />
  </StrokeIcon>
)

export const CloseIcon = (props: IconProps) => (
  <StrokeIcon {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </StrokeIcon>
)

export const PaperclipIcon = (props: IconProps) => (
  <StrokeIcon {...props}>
    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </StrokeIcon>
)

export const ArrowUpIcon = (props: IconProps) => (
  <StrokeIcon strokeWidth={2} {...props}>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </StrokeIcon>
)

export const ArrowLeftIcon = (props: IconProps) => (
  <StrokeIcon {...props}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </StrokeIcon>
)

export const ChevronDownIcon = (props: IconProps) => (
  <StrokeIcon strokeWidth={2} {...props}>
    <path d="m6 9 6 6 6-6" />
  </StrokeIcon>
)

export const ChevronRightIcon = (props: IconProps) => (
  <StrokeIcon strokeWidth={2} {...props}>
    <path d="m9 18 6-6-6-6" />
  </StrokeIcon>
)

export const CheckIcon = (props: IconProps) => (
  <StrokeIcon strokeWidth={2.25} {...props}>
    <path d="M20 6 9 17l-5-5" />
  </StrokeIcon>
)

export const UndoIcon = (props: IconProps) => (
  <StrokeIcon strokeWidth={2} {...props}>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </StrokeIcon>
)

export const SearchIcon = (props: IconProps) => (
  <StrokeIcon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </StrokeIcon>
)

export const SlidersIcon = (props: IconProps) => (
  <StrokeIcon {...props}>
    <path d="M20 7h-9" />
    <path d="M14 17H5" />
    <circle cx="17" cy="17" r="3" />
    <circle cx="7" cy="7" r="3" />
  </StrokeIcon>
)

export const RefreshIcon = (props: IconProps) => (
  <StrokeIcon {...props}>
    <path d="M21 12a9 9 0 0 1-15.4 6.4L3 16" />
    <path d="M3 12a9 9 0 0 1 15.4-6.4L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M3 21v-5h5" />
  </StrokeIcon>
)

export const PinIcon = ({ filled = false, ...props }: IconProps & { filled?: boolean }) => (
  <svg
    aria-hidden="true"
    className={props.className}
    fill={filled ? 'currentColor' : 'none'}
    height={props.size ?? 14}
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={1.75}
    viewBox="0 0 24 24"
    width={props.size ?? 14}
  >
    <path d="M12 17v5" />
    <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
  </svg>
)

/** Autopilot glyph: double chevron. */
export const AutopilotIcon = (props: IconProps) => (
  <StrokeIcon strokeWidth={2} {...props}>
    <path d="m6 17 5-5-5-5" />
    <path d="m13 17 5-5-5-5" />
  </StrokeIcon>
)

/** Review glyph: padlock. */
export const ReviewIcon = (props: IconProps) => (
  <StrokeIcon strokeWidth={2} {...props}>
    <path d="M9 11V6a3 3 0 0 1 6 0v5" />
    <rect height="10" rx="2" width="14" x="5" y="11" />
  </StrokeIcon>
)

export const StopIcon = ({ size = 12, className }: IconProps) => (
  <svg aria-hidden="true" className={className} height={size} viewBox="0 0 24 24" width={size}>
    <rect fill="currentColor" height="14" rx="2" width="14" x="5" y="5" />
  </svg>
)

/** Accent arc over a neutral ring; spins unless reduced motion is on. */
export const SpinnerIcon = ({ size = 14, className = '' }: IconProps) => (
  <svg
    aria-hidden="true"
    className={`animate-spin ${className}`}
    fill="none"
    height={size}
    viewBox="0 0 24 24"
    width={size}
  >
    <circle className="stroke-as-line-strong" cx="12" cy="12" r="9" strokeWidth="2.5" />
    <path
      className="stroke-as-accent"
      d="M21 12a9 9 0 0 0-9-9"
      strokeLinecap="round"
      strokeWidth="2.5"
    />
  </svg>
)

export const PendingIcon = ({ size = 14 }: IconProps) => (
  <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 24 24" width={size}>
    <circle cx="12" cy="12" r="8" stroke="#5a5953" strokeWidth="2" />
  </svg>
)

export const ErrorIcon = (props: IconProps) => (
  <StrokeIcon strokeWidth={2} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4.5" />
    <path d="M12 16h.01" />
  </StrokeIcon>
)
