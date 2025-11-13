'use client';

import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function MetricCard({ label, value, icon: Icon, delay = 0, trend, description }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    const duration = 1000;
    const steps = 60;
    const increment = numValue / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= numValue) {
        setDisplayValue(numValue);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value]);

  const formatValue = (val) => {
    if (typeof val === 'number') {
      if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
      if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
      return val.toLocaleString();
    }
    return val;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className="relative rounded-xl border bg-card text-card-foreground p-6 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden group"
    >
      {/* glowing accent border */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/10 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      {/* content */}
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <div className="p-2 rounded-lg bg-primary/10 dark:bg-primary/20">
            {Icon && <Icon className="w-5 h-5 text-primary" />}
          </div>
          {trend && (
            <div className={`text-xs font-medium ${trend > 0 ? 'text-green-500' : 'text-red-500'}`}>
              {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
            </div>
          )}
        </div>
        
        <div className="space-y-1">
          <div className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            {typeof value === 'number' ? formatValue(displayValue) : value}
          </div>
          <div className="text-sm font-medium text-muted-foreground">{label}</div>
          {description && (
            <div className="text-xs text-muted-foreground/70">{description}</div>
          )}
        </div>

        {/* progress bar */}
        {typeof value === 'number' && value > 0 && (
          <div className="mt-4 h-1 bg-muted rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((value / 100) * 100, 100)}%` }}
              transition={{ delay: delay + 0.3, duration: 0.8 }}
              className="h-full bg-gradient-to-r from-primary to-primary/60"
            />
          </div>
        )}
      </div>

      {/* glowing dot */}
      <div className="absolute top-4 right-4 w-2 h-2 bg-primary rounded-full animate-pulse opacity-60" />
    </motion.div>
  );
}

