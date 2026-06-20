import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Home, Search } from 'lucide-react'
import { AnimatedBackground } from '../components/AnimatedBackground'

export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <AnimatedBackground />
      <motion.div
        className="text-center px-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.p
          className="text-[120px] font-black leading-none text-gradient opacity-20 select-none"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 0.2 }}
          transition={{ delay: 0.1 }}
        >
          404
        </motion.p>
        <div className="-mt-8">
          <h1 className="text-2xl font-bold text-slate-200 mb-2">Page not found</h1>
          <p className="text-sm text-slate-500 mb-8 max-w-xs mx-auto">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <Link to="/dashboard" className="btn-primary inline-flex">
            <Home className="w-4 h-4" />
            Back to Dashboard
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
