'use client';

import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { startOfWeek, subDays, addDays, format, isSameDay, isBefore } from 'date-fns';

export default function ActivityCalendar({ data = [], label, delay = 0 }) {
  const today = new Date();
  
  // get 30 days ago
  const thirtyDaysAgo = subDays(today, 29);
  
  // get the monday of that week (week starts on Monday)
  const startDate = startOfWeek(thirtyDaysAgo, { weekStartsOn: 1 });
  
  // build calendar grid: 7 columns (Mon-Sun), multiple rows
  const grid = [];
  let current = new Date(startDate);
  const todayStr = format(today, 'yyyy-MM-dd');
  
  // generate days until today + complete the current week
  while (isBefore(current, today) || isSameDay(current, today) || grid.length % 7 !== 0) {
    const dateStr = format(current, 'yyyy-MM-dd');
    const isPast = isBefore(current, today) || isSameDay(current, today);
    
    const entry = data.find(d => {
      const dDate = new Date(d.date);
      return format(dDate, 'yyyy-MM-dd') === dateStr;
    });
    
    grid.push({
      date: new Date(current),
      dateStr,
      count: isPast ? (entry?.count || 0) : 0,
      isPast,
      isToday: dateStr === todayStr,
    });
    
    current = addDays(current, 1);
    
    // stop after showing enough weeks (5 weeks max)
    if (grid.length >= 35) break;
  }
  
  // split into weeks (rows)
  const weeks = [];
  for (let i = 0; i < grid.length; i += 7) {
    weeks.push(grid.slice(i, i + 7));
  }
  
  const totalCount = grid.filter(d => d.isPast).reduce((sum, d) => sum + d.count, 0);
  const activeDays = grid.filter(d => d.isPast && d.count > 0).length;
  
  const getColor = (count, isPast) => {
    if (!isPast) return 'bg-transparent border-muted/20';
    if (count === 0) return 'bg-muted/20 border-muted/30';
    if (count < 5) return 'bg-primary/20 border-primary/40';
    if (count < 15) return 'bg-primary/40 border-primary/60';
    if (count < 30) return 'bg-primary/60 border-primary/80';
    return 'bg-primary border-primary';
  };
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold">{label}</h4>
      </div>
      
      <div className="space-y-2">
        {/* day headers */}
        <div className="grid grid-cols-7 gap-2 pl-8">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
            <div key={day} className="text-xs text-muted-foreground font-medium text-center">
              {day}
            </div>
          ))}
        </div>
        
        {/* calendar grid */}
        <div className="space-y-2">
          {weeks.map((week, weekIdx) => (
            <div key={weekIdx} className="grid grid-cols-7 gap-2">
              {week.map((day, dayIdx) => {
                const colorClass = getColor(day.count, day.isPast);
                const showCount = day.isPast && day.count > 0;
                
                return (
                  <motion.div
                    key={day.dateStr}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: delay + (weekIdx * 0.05) + (dayIdx * 0.01) }}
                    whileHover={{ scale: 1.1, zIndex: 10 }}
                    className={`group relative h-8 w-full rounded border transition-all cursor-pointer ${colorClass}`}
                    title={day.isPast ? `${day.dateStr}: ${day.count} ${label.toLowerCase()}` : ''}
                  >
                    {day.isToday && (
                      <div className="absolute inset-0 ring-2 ring-primary ring-offset-1 rounded" />
                    )}
                    
                    {showCount && (
                      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                        {day.count}
                      </div>
                    )}
                    
                    {/* tooltip */}
                    {day.isPast && day.count > 0 && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-foreground text-background text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                        <div className="font-bold">{day.count}</div>
                        <div className="text-[10px] opacity-80">{day.dateStr}</div>
                        <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-t-foreground border-b-transparent" />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      <div className="flex items-center justify-between pt-3 border-t text-xs">
        <div className="text-muted-foreground">
          <span className="font-semibold text-foreground">{totalCount.toLocaleString()}</span> total
          {' • '}
          <span className="font-semibold text-foreground">{activeDays}</span> active days
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="h-3 w-3 rounded border border-muted/30 bg-muted/20" />
            <div className="h-3 w-3 rounded border border-primary/40 bg-primary/20" />
            <div className="h-3 w-3 rounded border border-primary/60 bg-primary/40" />
            <div className="h-3 w-3 rounded border border-primary/80 bg-primary/60" />
            <div className="h-3 w-3 rounded border border-primary bg-primary" />
          </div>
          <span>More</span>
        </div>
      </div>
    </motion.div>
  );
}
