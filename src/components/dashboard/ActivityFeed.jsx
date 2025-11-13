'use client';

import { motion } from 'framer-motion';
import {
  Key,
  AppWindow,
  LogIn,
  CheckCircle,
  Zap,
  Clock,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const iconMap = {
  Key,
  AppWindow,
  LogIn,
  CheckCircle,
  Zap,
};

const colorMap = {
  blue: 'bg-primary/10 text-primary border-primary/20',
  green: 'bg-green-500/10 text-green-500 border-green-500/20',
  purple: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  orange: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  red: 'bg-red-500/10 text-red-500 border-red-500/20',
};

export default function ActivityFeed({ activities = [], userRole, onClear }) {
  const formatTime = (timestamp) => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'just now';
      if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      return date.toLocaleDateString();
    } catch {
      return 'just now';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Recent Activity</h3>
        {userRole !== 'redistributor' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            no activity yet
          </div>
        ) : (
          activities.map((activity, index) => {
            const Icon = iconMap[activity.icon] || Clock;
            const colorClass = colorMap[activity.color] || colorMap.blue;

            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors group"
              >
                <div className={`p-2 rounded-lg border ${colorClass} flex-shrink-0`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{activity.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {activity.description}
                  </div>
                  <div className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTime(activity.timestamp)}
                  </div>
                </div>
                <div className={`w-2 h-2 rounded-full ${colorClass.split(' ')[0]} opacity-60 flex-shrink-0 mt-2`} />
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

