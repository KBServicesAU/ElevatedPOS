'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

interface AnimatedTextProps {
  text: string;
  className?: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  delay?: number;
  stagger?: number;
  splitBy?: 'line' | 'word';
}

export function AnimatedText({
  text,
  className = '',
  as: Tag = 'h1',
  delay = 0,
  stagger = 0.08,
  splitBy = 'line',
}: AnimatedTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });

  const parts = splitBy === 'line' ? text.split('\n') : text.split(' ');

  return (
    <Tag ref={ref as React.RefObject<HTMLHeadingElement>} className={className} aria-label={text}>
      {parts.map((part, i) => (
        <span key={i} className="split-line" aria-hidden="true">
          <motion.span
            className="split-line-inner"
            initial={{ y: '110%' }}
            animate={isInView ? { y: '0%' } : {}}
            transition={{
              duration: 0.9,
              delay: delay + i * stagger,
              ease: [0.76, 0, 0.24, 1],
            }}
          >
            {part}
            {splitBy === 'word' && i < parts.length - 1 ? '\u00A0' : ''}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
