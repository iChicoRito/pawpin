import type { FlaggedReport, FlagReason } from '@/lib/flags';
import type { ReportUrgency } from '@/lib/reports';
import { supabase } from '@/lib/supabase';

// What the admin's screens read and do. An admin is a profile whose role was set to 'admin' by
// hand; the database refuses all of this to anyone else (0001_init.sql, 0020_admin.sql), so
// nothing here checks the role itself.

/** How many reports there are of each kind, for the Dashboard. */
export type AdminOverview = {
  reported: number;
  responding: number;
  rescued: number;
  notFound: number;
  closed: number;
  /** Sent in the last 24 hours, whatever became of them. */
  newToday: number;
  /** Active reports with at least one flag. */
  flagged: number;
};

/** Throws if the numbers cannot be read, or the caller is not an admin. */
export async function fetchAdminOverview(): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc('admin_overview');
  if (error) throw error;
  const row = (data as Record<string, number>[])[0];
  return {
    reported: row.reported,
    responding: row.responding,
    rescued: row.rescued,
    notFound: row.not_found,
    closed: row.closed,
    newToday: row.new_today,
    flagged: row.flagged,
  };
}

/** One bar of a chart: what it is, and how many. */
export type Tally = { label: string; count: number };

/** What the Dashboard's charts draw. */
export type AdminStats = {
  /** Reports sent on each of the last 14 days, oldest first, today last. `day` is "2026-10-10". */
  days: { day: string; count: number }[];
  /** Reports sent in the last 7 days, and in the 7 before those. */
  thisWeek: number;
  lastWeek: number;
  /** How urgent the active reports are. */
  urgency: Record<ReportUrgency, number>;
  /** Half of the reports a rescuer went to were taken within this many minutes. `null`: none yet. */
  responseMinutes: number | null;
  /** Active reports untouched for over 48 hours, oldest first. They close by themselves at 72. */
  closingSoon: FlaggedReport[];
  flagReasons: Tally[];
  /** Always three, in this order: `dog`, `cat`, and `other` for every other kind. */
  animals: Tally[];
};

/**
 * Throws if the numbers cannot be read, or the caller is not an admin. The days are the phone's
 * own days, not UTC's.
 */
export async function fetchAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_stats', {
    p_tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (error) throw error;
  const stats = data as Record<string, any>;
  return {
    days: stats.days,
    thisWeek: stats.this_week,
    lastWeek: stats.last_week,
    urgency: {
      critical: stats.urgency.critical ?? 0,
      needs_help_soon: stats.urgency.needs_help_soon ?? 0,
      just_sighted: stats.urgency.just_sighted ?? 0,
    },
    responseMinutes: stats.response_minutes,
    closingSoon: (stats.closing_soon as Record<string, any>[]).map((row) => ({
      id: row.id,
      animalType: row.animal_type,
      status: row.status,
      createdAt: row.created_at,
      changedAt: row.updated_at,
      landmark: row.landmark,
      photo: row.photos?.[0] ?? null,
      flagCount: 0,
      reasons: [],
    })),
    flagReasons: stats.flag_reasons,
    animals: stats.animals,
  };
}

/** Which reports the Reports tab lists. The label is the filter's button. */
export const ADMIN_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'open', label: 'Open' },
  { value: 'finished', label: 'Finished' },
  // Sent after the phone's photo check saw no animal in any photo.
  { value: 'unseen', label: 'No animal' },
] as const;

export type AdminFilter = (typeof ADMIN_FILTERS)[number]['value'];

/** How many reports one read hands back. */
export const ADMIN_PAGE = 30;

const REPORT_COLUMNS =
  'id, animal_type, status, landmark, created_at, updated_at, photos, no_animal_seen';

/** One row of `reports`, read with `REPORT_COLUMNS` and its flags, as the admin's lists show it. */
function toAdminReport(row: Record<string, any>): FlaggedReport {
  const reasons: string[] = (row.flags ?? []).map((flag: { reason: string }) => flag.reason);
  return {
    id: row.id,
    animalType: row.animal_type,
    status: row.status,
    createdAt: row.created_at,
    changedAt: row.updated_at,
    landmark: row.landmark,
    photo: row.photos?.[0] ?? null,
    flagCount: reasons.length,
    reasons: [...new Set(reasons)],
    noAnimalSeen: row.no_animal_seen,
  };
}

/**
 * Reports from everywhere, newest first, `ADMIN_PAGE` at a time starting after the first `offset`,
 * each with how many flags it has and why. `total` is how many the filter matches in all. Throws
 * if the read fails.
 */
export async function fetchAdminReports(
  filter: AdminFilter,
  offset: number,
): Promise<{ reports: FlaggedReport[]; total: number }> {
  // `!inner` keeps only reports that have a flag. Without it, a report with none still comes back.
  const flags = filter === 'flagged' ? 'flags!inner' : 'flags';
  let query = supabase
    .from('reports')
    .select(`${REPORT_COLUMNS}, ${flags}(reason)`, { count: 'exact' });
  if (filter === 'open') query = query.in('status', ['reported', 'responding']);
  if (filter === 'finished') query = query.in('status', ['rescued', 'not_found', 'closed']);
  if (filter === 'unseen') query = query.eq('no_animal_seen', true);
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + ADMIN_PAGE - 1);
  if (error) throw error;

  const reports = (data as Record<string, any>[]).map(toAdminReport);
  return { reports, total: count ?? reports.length };
}

/** How many of these the Dashboard shows before "See all". */
const UNSEEN_SHOWN = 3;

/**
 * Active reports sent after the photo check saw no animal, newest first: the first few, and how
 * many there are in all. Finished ones are left out: nothing is left to do about those. Throws if
 * the read fails.
 */
export async function fetchUnseenReports(): Promise<{ reports: FlaggedReport[]; total: number }> {
  const { data, error, count } = await supabase
    .from('reports')
    .select(`${REPORT_COLUMNS}, flags(reason)`, { count: 'exact' })
    .eq('no_animal_seen', true)
    .in('status', ['reported', 'responding'])
    .order('created_at', { ascending: false })
    .limit(UNSEEN_SHOWN);
  if (error) throw error;
  const reports = (data as Record<string, any>[]).map(toAdminReport);
  return { reports, total: count ?? reports.length };
}

/** Whether this report was sent after the photo check saw no animal. Throws on failure. */
export async function fetchNoAnimalSeen(reportId: string) {
  const { data, error } = await supabase
    .from('reports')
    .select('no_animal_seen')
    .eq('id', reportId)
    .maybeSingle();
  if (error) throw error;
  return data?.no_animal_seen === true;
}

/** The flags on one report, newest first. Who sent them is not read. Throws on failure. */
export async function fetchReportFlags(reportId: string) {
  const { data, error } = await supabase
    .from('flags')
    .select('reason, created_at')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((flag) => ({
    reason: flag.reason as string,
    createdAt: flag.created_at as string,
  }));
}

/**
 * The admin takes a report off the map: it ends as closed, the reporter is told why, and a rescuer
 * on the way is told it ended. Final. Refused with `cannot_close` when the report has already
 * ended (`refusalOf` in `claims.ts` knows that one).
 */
export async function adminCloseReport(reportId: string, reason: FlagReason) {
  const { error } = await supabase.rpc('admin_close_report', {
    p_report_id: reportId,
    p_reason: reason,
  });
  if (error) throw error;
}
