import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

const statusStyles: Record<string, { className: string; label?: string }> = {
  Active: { className: 'bg-success/15 text-success border-success/20' },
  Inactive: { className: 'bg-muted text-muted-foreground border-border' },
  Present: { className: 'bg-success/15 text-success border-success/20' },
  Absent: { className: 'bg-destructive/15 text-destructive border-destructive/20' },
  'Half Day': { className: 'bg-warning/15 text-warning border-warning/20' },
  Leave: { className: 'bg-primary/15 text-primary border-primary/20' },
  Pending: { className: 'bg-warning/15 text-warning border-warning/20' },
  Approved: { className: 'bg-success/15 text-success border-success/20' },
  Rejected: { className: 'bg-destructive/15 text-destructive border-destructive/20' },
  Day: { className: 'bg-primary/15 text-primary border-primary/20' },
  Night: { className: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const style = statusStyles[status] || {
    className: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <Badge
      variant="outline"
      className={cn('font-medium', style.className, className)}
    >
      {status}
    </Badge>
  );
}
