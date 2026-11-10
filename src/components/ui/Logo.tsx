import { useId } from 'react';
import clsx from 'clsx';
import styles from './Logo.module.css';

interface LogoProps {
  size?: number;
  label?: string;
  className?: string;
}

export function Logo({ size = 32, label, className }: LogoProps) {
  const gradientId = useId();

  return (
    <span className={clsx(styles.logo, className)}>
      <svg
        className={styles.mark}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="8"
            y1="6"
            x2="56"
            y2="58"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#4338ca" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="14" fill={`url(#${gradientId})`} />
        <path
          d="M20 15h17l7 7v10.5a10.5 10.5 0 1 0 0 17V49a2 2 0 0 1-2 2H20a2 2 0 0 1-2-2V17a2 2 0 0 1 2-2Z"
          fill="#ffffff"
          fillOpacity="0.94"
        />
        <path d="M37 15v5a2 2 0 0 0 2 2h5" fill="none" stroke="#c7d2fe" strokeWidth="2.5" />
        <circle cx="43" cy="43" r="8" fill="none" stroke="#ffffff" strokeWidth="3.5" />
        <path d="M49 49l5.5 5.5" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {label ? <span className={styles.wordmark}>{label}</span> : null}
    </span>
  );
}
