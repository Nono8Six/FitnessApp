import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { active?: boolean; size?: number }

function Svg({ size = 24, children, active: _a, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  )
}

/** Concentric arcs, the "summary" glyph. */
export function TodayIcon(p: P) {
  return (
    <Svg {...p} strokeWidth={p.active ? 2.6 : 2}>
      <path d="M12 2.5a9.5 9.5 0 1 1-9.5 9.5" />
      <path d="M12 7a5 5 0 1 1-5 5" opacity={p.active ? 1 : 0.9} />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </Svg>
  )
}

export function LibraryIcon(p: P) {
  return (
    <Svg {...p}>
      <rect x="3" y="8" width="18" height="13" rx="3.5" fill={p.active ? 'currentColor' : 'none'} />
      <path d="M5.5 4.5h13" />
      {p.active && <path d="M7.5 14.5h3l1.5-3 2 6 1.5-3h1" stroke="#000" strokeWidth={1.8} />}
      {!p.active && <path d="M7.5 14.5h3l1.5-3 2 6 1.5-3h1" strokeWidth={1.8} />}
    </Svg>
  )
}

export function HistoryIcon(p: P) {
  return (
    <Svg {...p}>
      <g strokeWidth={p.active ? 2.5 : 2}>
        <path d="M3.2 10.4A9 9 0 1 1 4.6 17" />
        <path d="M3 5.5v5h5" />
        <path d="M12 7.5V12l3 2" />
      </g>
    </Svg>
  )
}

export function CoachIcon(p: P) {
  return (
    <Svg {...p}>
      <path d="M12 3.5c5 0 9 3.4 9 7.7s-4 7.7-9 7.7c-1 0-2-.1-2.9-.4L4.5 20.5l1.2-3.7C4.2 15.4 3 13.4 3 11.2 3 6.9 7 3.5 12 3.5Z"
        fill={p.active ? 'currentColor' : 'none'} />
      <path d="M12 7.6l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9Z" fill={p.active ? '#000' : 'currentColor'}
        stroke={p.active ? '#000' : 'currentColor'} strokeWidth={1.2} />
    </Svg>
  )
}

export function LiveIcon(p: P) {
  return (
    <Svg {...p} strokeWidth={p.active ? 2.4 : 2}>
      <path d="M2.5 12h4l2.5-6.5 5 13 2.5-6.5h5" />
    </Svg>
  )
}

/** Treadmill runner glyph. */
export function RunIcon(p: P) {
  return (
    <Svg {...p} strokeWidth={2.1}>
      <circle cx="14.5" cy="4.2" r="1.9" fill="currentColor" stroke="none" />
      <path d="M8.5 9.2 12 7.6l3.2 1.6 1.4 2.8 2.4.6" />
      <path d="M12 7.6 10.6 13l3 2.4-1 4.6" />
      <path d="M10.6 13 8.4 16.4l-3.4.4" />
    </Svg>
  )
}
