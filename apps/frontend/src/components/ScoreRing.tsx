import { motion, useSpring, useTransform, animate } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

interface ScoreRingProps {
  score: number | null | undefined
  size?: number
  strokeWidth?: number
  label?: string
  showSubLabel?: boolean
}

function getScoreColor(score: number): { stroke: string; glow: string; text: string } {
  if (score >= 80) return { stroke: '#34d399', glow: 'rgba(52,211,153,0.35)', text: 'text-emerald-400' }
  if (score >= 60) return { stroke: '#fbbf24', glow: 'rgba(251,191,36,0.35)', text: 'text-amber-400' }
  if (score >= 40) return { stroke: '#f97316', glow: 'rgba(249,115,22,0.35)', text: 'text-orange-400' }
  return { stroke: '#f87171', glow: 'rgba(248,113,113,0.35)', text: 'text-red-400' }
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent'
  if (score >= 60) return 'Good'
  if (score >= 40) return 'Fair'
  return 'Critical'
}

/** Animated count-up number */
function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [display, setDisplay] = useState(0)
  const hasMounted = useRef(false)

  useEffect(() => {
    const start = hasMounted.current ? display : 0
    hasMounted.current = true

    const controls = animate(start, value, {
      duration: 1.4,
      ease: [0.22, 1, 0.36, 1],
      onUpdate(v) { setDisplay(v) },
    })
    return () => controls.stop()
  }, [value])

  return <>{display.toFixed(decimals)}</>
}

export function ScoreRing({
  score,
  size = 140,
  strokeWidth = 8,
  label = 'Health Score',
  showSubLabel = true,
}: ScoreRingProps) {
  const resolved = score ?? 0
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - resolved / 100)

  const colors = getScoreColor(resolved)

  return (
    <motion.div
      className="flex flex-col items-center gap-2"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        {/* Background track */}
        <svg
          width={size} height={size}
          className="transform -rotate-90"
          style={{ position: 'absolute', inset: 0 }}
        >
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
          />
        </svg>

        {/* Progress arc */}
        <svg
          width={size} height={size}
          className="transform -rotate-90"
          style={{ position: 'absolute', inset: 0 }}
        >
          <motion.circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ filter: `drop-shadow(0 0 8px ${colors.glow})` }}
          />
        </svg>

        {/* Glow ring behind */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ boxShadow: `0 0 40px ${colors.glow}` }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Centre content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {score === null || score === undefined ? (
            <span className="text-2xl font-bold text-slate-500">--</span>
          ) : (
            <motion.span
              className={clsx('text-3xl font-black tabular-nums', colors.text)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <AnimatedNumber value={resolved} />
            </motion.span>
          )}
          <span className="text-[11px] text-slate-500 font-medium mt-0.5">/ 100</span>
        </div>
      </div>

      <div className="text-center">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        {showSubLabel && score !== null && score !== undefined && (
          <motion.p
            className={clsx('text-xs font-semibold', colors.text)}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            {getScoreLabel(resolved)}
          </motion.p>
        )}
      </div>
    </motion.div>
  )
}
