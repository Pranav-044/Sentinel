import { motion, AnimatePresence } from 'framer-motion'
import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

const variants = {
  initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
  enter:   { opacity: 1, y: 0, filter: 'blur(0px)' },
  exit:    { opacity: 0, y: -8, filter: 'blur(4px)' },
}

export function PageTransition({ children }: { children: ReactNode }) {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        variants={variants}
        initial="initial"
        animate="enter"
        exit="exit"
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
