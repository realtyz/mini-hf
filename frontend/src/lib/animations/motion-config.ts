import { type Transition, type Variants } from 'framer-motion'

export const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── Transition presets ──────────────────────────────────────────────

export const smoothTransition: Transition = {
  duration: prefersReducedMotion ? 0 : 0.2,
  ease: [0.16, 1, 0.3, 1],
}

export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
  mass: 1,
}

export const springSmooth: Transition = {
  type: 'spring',
  stiffness: 150,
  damping: 20,
  mass: 1,
}

// ── Page container ──────────────────────────────────────────────────

export const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: prefersReducedMotion ? 0 : 0.04,
      delayChildren: prefersReducedMotion ? 0 : 0.04,
    },
  },
}

export const itemVariants: Variants = {
  hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: prefersReducedMotion ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] },
  },
}

// ── Panel transitions (tab switching) ───────────────────────────────

export const panelVariants: Variants = {
  hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: prefersReducedMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: prefersReducedMotion ? 0 : -8,
    transition: { duration: prefersReducedMotion ? 0 : 0.12 },
  },
}

// ── Card entrance ───────────────────────────────────────────────────

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 16, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: prefersReducedMotion ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] },
  },
}

// ── Stagger children (form fields, list items) ──────────────────────

export const staggerContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: prefersReducedMotion ? 0 : 0.03,
      delayChildren: prefersReducedMotion ? 0 : 0.05,
    },
  },
}

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: prefersReducedMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] },
  },
}

// ── Instrument panel (cache-scan stats) ──────────────────────────────

export const instrumentContainer: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: prefersReducedMotion ? 0 : 0.06,
      delayChildren: prefersReducedMotion ? 0 : 0.1,
    },
  },
}

export const instrumentItem: Variants = {
  hidden: { opacity: 0, y: prefersReducedMotion ? 0 : 4, scale: 0.99 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: prefersReducedMotion ? 0 : 0.35, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}
