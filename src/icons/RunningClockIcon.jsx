import { motion } from "motion/react";

/**
 * Continuously running clock for live timers.
 * Paths adapted from lucide-animated ClockIcon
 * (https://lucide-animated.com/icons/clock, MIT).
 * Hands rotate via centered <g> + view-box transform origin so the
 * pivot stays at cx/cy=12 (CSS origin on <line> is unreliable in SVG).
 */
const PIVOT = {
  transformOrigin: "12px 12px",
  transformBox: "view-box",
};

export default function RunningClockIcon({
  size = 18,
  className,
  strokeWidth: _sw,
  fill: _fill,
  ...rest
}) {
  return (
    <span
      className={["card-timer-clock", className].filter(Boolean).join(" ")}
      style={{ display: "inline-flex", lineHeight: 0 }}
      aria-hidden="true"
      {...rest}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="10" />
        <motion.g
          style={PIVOT}
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <line x1="12" x2="12" y1="12" y2="6" />
        </motion.g>
        <motion.g
          style={PIVOT}
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
        >
          <line x1="12" x2="16" y1="12" y2="12" />
        </motion.g>
      </svg>
    </span>
  );
}
