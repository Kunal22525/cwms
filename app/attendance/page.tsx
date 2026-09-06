'use client';

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  Check,
  X,
  Clock,
  Minus,
  Loader2,
  Save,
  CheckCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/layout/status-badge';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { cn, formatDate, initials } from '@/lib/utils';
import type { Worker, Site, AttendanceStatus } from '@/types';

const STATUS_CONFIG: Record<AttendanceStatus, { icon: typeof Check; color: string; activeColor: string }> = {
  Present: { icon: Check, color: 'text-success', activeColor: 'bg-success text-white border-success' },
  Absent: { icon: X, color: 'text-destructive', activeColor: 'bg-destructive text-white border-destructive' },
  'Half Day': { icon: Clock, color: 'text-warning', activeColor: 'bg-warning text-white border-warning' },
  Leave: { icon: Minus, color: 'text-primary', activeColor: 'bg-primary text-white border-primary' },
};

export default function AttendancePage() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [selectedShift, setSelectedShift] = useState<'Day' | 'Night'>('Day');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async (): Promise<Site[]> => {
      const { data, error } = await supabase
        .from('sites')
        .select('id, site_name, site_code, status')
        .order('site_name');
      if (error) throw error;
      return (data as Site[]) ?? [];
    },
  });

  // Auto-select supervisor's site
  useEffect(() => {
    if (role !== 'admin' && sites && sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
    }
  }, [sites, role, selectedSiteId]);

  const { data: workers, isLoading } = useQuery({
    queryKey: ['attendance-workers', selectedSiteId],
    queryFn: async (): Promise<Worker[]> => {
      if (!selectedSiteId) return [];
      const { data, error } = await supabase
        .from('workers')
        .select('id, worker_code, name, trade, photo_url, status')
        .eq('site_id', selectedSiteId)
        .eq('status', 'Active')
        .order('name');
      if (error) throw error;
      return (data as Worker[]) ?? [];
    },
    enabled: !!selectedSiteId,
  });

  // Load existing attendance for the selected date/shift/site
  const { data: existingAttendance } = useQuery({
    queryKey: ['existing-attendance', selectedSiteId, selectedDate, selectedShift],
    queryFn: async (): Promise<{ id: string; worker_id: string; status: string }[]> => {
      if (!selectedSiteId) return [];
      const { data, error } = await supabase
        .from('attendance')
        .select('id, worker_id, status')
        .eq('site_id', selectedSiteId)
        .eq('attendance_date', selectedDate)
        .eq('shift', selectedShift);
      if (error) throw error;
      return (data as { id: string; worker_id: string; status: string }[]) ?? [];
    },
    enabled: !!selectedSiteId,
  });

  useEffect(() => {
    const map: Record<string, AttendanceStatus> = {};
    const records = existingAttendance ?? [];
    records.forEach((a: { id: string; worker_id: string; status: string }) => {
      map[a.worker_id] = a.status as AttendanceStatus;
    });
    setStatuses(map);
  }, [existingAttendance]);

  const todaySummary = useMemo(() => {
    const values = Object.values(statuses);
    return {
      present: values.filter((s) => s === 'Present').length,
      absent: values.filter((s) => s === 'Absent').length,
      halfDay: values.filter((s) => s === 'Half Day').length,
      leave: values.filter((s) => s === 'Leave').length,
      total: values.length,
    };
  }, [statuses]);

  const handleSetStatus = (workerId: string, status: AttendanceStatus) => {
    setStatuses((prev) => ({ ...prev, [workerId]: status }));
  };

  const handleMarkAllPresent = () => {
    if (!workers) return;
    const map: Record<string, AttendanceStatus> = {};
    workers.forEach((w: Worker) => {
      map[w.id] = 'Present';
    });
    setStatuses(map);
  };

  const handleSave = async () => {
    if (!selectedSiteId || !workers) return;
    setSaving(true);
    try {
      const records = workers
        .filter((w: Worker) => statuses[w.id])
        .map((w: Worker) => ({
          worker_id: w.id,
          site_id: selectedSiteId,
          attendance_date: selectedDate,
          shift: selectedShift,
          status: statuses[w.id],
          supervisor_id: user?.id ?? null,
        }));

      if (records.length === 0) {
        toast({
          variant: 'destructive',
          title: 'No attendance to save',
          description: 'Mark at least one worker before saving.',
        });
        setSaving(false);
        return;
      }

      // Upsert: on conflict (worker_id, attendance_date, shift), update status
      const { error } = await supabase
        .from('attendance')
        .upsert(records, {
          onConflict: 'worker_id,attendance_date,shift',
        });

      if (error) throw error;

      toast({
        title: 'Attendance saved',
        description: `${records.length} attendance records saved for ${formatDate(selectedDate)}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['existing-attendance'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      toast({ variant: 'destructive', title: 'Save failed', description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader title="Attendance" description="Mark daily attendance for your site" />

      {/* Controls */}
      <Card className="mb-6 border-border/60">
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="site">Site</Label>
            <Select
              value={selectedSiteId || 'none'}
              onValueChange={(v) => setSelectedSiteId(v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a site" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No site selected</SelectItem>
                {sites?.map((s: Site) => (
                  <SelectItem key={s.id} value={s.id}>{s.site_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shift">Shift</Label>
            <Select
              value={selectedShift}
              onValueChange={(v) => setSelectedShift(v as 'Day' | 'Night')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Day">Day</SelectItem>
                <SelectItem value="Night">Night</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleMarkAllPresent}
              disabled={!workers?.length}
            >
              <CheckCheck className="mr-2 h-4 w-4" />
              All Present
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Today's Summary */}
      {selectedSiteId && workers && workers.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          <div className="rounded-lg border border-border/60 bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-xl font-bold">{todaySummary.total}</p>
          </div>
          <div className="rounded-lg border border-success/20 bg-success/5 p-3 text-center">
            <p className="text-xs text-muted-foreground">Present</p>
            <p className="text-xl font-bold text-success">{todaySummary.present}</p>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
            <p className="text-xs text-muted-foreground">Absent</p>
            <p className="text-xl font-bold text-destructive">{todaySummary.absent}</p>
          </div>
          <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 text-center">
            <p className="text-xs text-muted-foreground">Half Day</p>
            <p className="text-xl font-bold text-warning">{todaySummary.halfDay}</p>
          </div>
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
            <p className="text-xs text-muted-foreground">Leave</p>
            <p className="text-xl font-bold text-primary">{todaySummary.leave}</p>
          </div>
        </div>
      )}

      {/* Worker List */}
      {!selectedSiteId ? (
        <EmptyState
          icon={CalendarCheck}
          title="Select a site"
          description="Choose a site to start marking attendance."
        />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : !workers || workers.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No active workers"
          description="There are no active workers assigned to this site."
        />
      ) : (
        <div className="space-y-3">
          {workers.map((worker: Worker) => {
            const currentStatus = statuses[worker.id];
            return (
              <Card key={worker.id} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    {/* Worker Info */}
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        {worker.photo_url ? (
                          <AvatarImage src={worker.photo_url} alt={worker.name} />
                        ) : null}
                        <AvatarFallback>{initials(worker.name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{worker.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {worker.worker_code} · {worker.trade ?? '—'}
                        </p>
                      </div>
                    </div>

                    {/* Status Buttons */}
                    <div className="flex gap-1.5 sm:gap-2">
                      {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((status) => {
                        const config = STATUS_CONFIG[status];
                        const Icon = config.icon;
                        const isActive = currentStatus === status;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => handleSetStatus(worker.id, status)}
                            className={cn(
                              'flex h-11 w-11 items-center justify-center rounded-lg border-2 transition-all sm:h-12 sm:w-12',
                              isActive
                                ? config.activeColor
                                : `border-border bg-card ${config.color} hover:bg-secondary`
                            )}
                            aria-label={status}
                            title={status}
                          >
                            <Icon className="h-5 w-5" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Save Button */}
          <div className="sticky bottom-20 pt-4 lg:bottom-4">
            <Button
              size="lg"
              className="w-full shadow-lg"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              {saving ? 'Saving...' : 'Save Attendance'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
