import { motion } from 'framer-motion'

/** Animated gradient mesh background with floating orbs */
export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Grid pattern */}
      <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-100" />

      {/* Primary orb — top centre */}
      <motion.div
        className="absolute w-[800px] h-[600px] rounded-full"
        style={{
          top: '-20%',
          left: '50%',
          x: '-50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.04) 50%, transparent 70%)',
          filter: 'blur(60px)',
        }}
        animate={{
          scale: [1, 1.08, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />

      {/* Secondary orb — bottom right */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full"
        style={{
          bottom: '-10%',
          right: '-5%',
          background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
        animate={{
          x: [0, -30, 0],
          y: [0, 20, 0],
          scale: [1, 1.12, 1],
        }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      {/* Tertiary orb — left */}
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full"
        style={{
          top: '40%',
          left: '-8%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.07) 0%, transparent 70%)',
          filter: 'blur(70px)',
        }}
        animate={{
          x: [0, 20, 0],
          y: [0, -25, 0],
        }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 4 }}
      />
    </div>
  )
}
