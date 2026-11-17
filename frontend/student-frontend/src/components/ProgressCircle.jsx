import React from 'react'

export default function ProgressCircle({ size=120, percent=0 }){
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const visualPercent = Math.max(0, Math.min(100, percent))
  const offset = c - (visualPercent/100)*c
  return (
    <svg className="student-progress-circle" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${percent}%`}>
      <defs>
        <linearGradient id="student-progress-gradient" x1="0%" x2="100%">
          <stop offset="0%" stopColor="#087f8c" />
          <stop offset="100%" stopColor="#45b69c" />
        </linearGradient>
      </defs>
      <g transform={`translate(${size/2},${size/2})`}>
        <circle r={r} stroke="var(--student-progress-track)" strokeWidth="8" fill="none" />
        <circle r={r} stroke="url(#student-progress-gradient)" strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90)" />
        <text x="0" y="6" textAnchor="middle" fontSize="20" fontWeight="600">{percent}%</text>
      </g>
    </svg>
  )
}
