'use client';

import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Zap, Server } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function SystemStatus({ metrics = {}, delay = 0 }) {
  const {
    uptime = 99.9,
    lastApiPing = 42,
  } = metrics;

  const statusItems = [
    {
      label: 'API Response',
      value: `${lastApiPing}ms`,
      icon: Zap,
      status: lastApiPing < 100,
      color: lastApiPing < 100 ? 'text-primary' : 'text-yellow-500',
    },
    {
      label: 'Uptime',
      value: `${uptime}%`,
      icon: Server,
      status: uptime >= 99,
      color: uptime >= 99 ? 'text-primary' : 'text-yellow-500',
    },
  ];

  const isHealthy = lastApiPing < 100 && uptime >= 99;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5 }}
      className="rounded-xl border bg-card text-card-foreground p-6 shadow-sm h-full flex flex-col"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">System Status</h3>
        <Badge variant={isHealthy ? 'default' : 'secondary'}>
          {isHealthy ? (
            <>
              <div className="w-2 h-2 bg-primary rounded-full mr-2 animate-pulse" />
              Healthy
            </>
          ) : (
            <>
              <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2 animate-pulse" />
              Warning
            </>
          )}
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 flex-1">
        {statusItems.map((item, index) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: delay + index * 0.1 }}
              className="flex items-center gap-4 p-5 rounded-lg bg-primary/5 hover:bg-primary/10 border border-primary/10 transition-colors flex-1"
            >
              <div className={`p-3 rounded-lg ${item.color} bg-primary/10`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-1">{item.label}</div>
                <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
              </div>
              {item.status !== undefined && (
                <div>
                  {item.status ? (
                    <CheckCircle2 className="w-5 h-5 text-primary" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-500" />
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

