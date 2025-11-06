import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

export default function AppCard({ app, onChanged, userRole }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: app.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const pauseOrDelete = async () => {
    try {
      const res = await fetch(`/api/apps/delete/${app.id}`, { method: 'DELETE', credentials: 'include' });
      const json = await res.json();
      if (json.success) {
        toast.success('application deleted');
        onChanged?.();
      } else {
        toast.error(json.message || 'failed');
      }
    } catch (e) {
      toast.error('network error');
    }
  };

  return (
    <Card ref={setNodeRef} style={style}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing hover:bg-muted rounded p-1"
            >
              <GripVertical className="w-5 h-5 text-muted-foreground" />
            </button>
            <div>
              <CardTitle>{app.name}</CardTitle>
              <CardDescription>{app.description || 'no description'}</CardDescription>
            </div>
          </div>
          <Badge variant={app.status === 'active' ? 'default' : 'secondary'} className={app.status === 'active' ? 'bg-[#0066FF]' : ''}>
            {app.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex gap-2">
        <Button asChild variant="outline"><Link href={`/apps/${app.id}`}>App Settings</Link></Button>
        <Button asChild variant="outline" disabled={!userRole || !['developer', 'admin'].includes(userRole)}>
          <Link href={`/apps/${app.id}/licenses`}>Manage Licenses</Link>
        </Button>
        <Button variant="outline" disabled>Manage Redistributors</Button>
        <Button variant="destructive" className="bg-red-600 hover:bg-red-700" onClick={pauseOrDelete}>Delete</Button>
      </CardContent>
    </Card>
  );
}


