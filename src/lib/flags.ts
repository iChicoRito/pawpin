import type { HistoryReport } from '@/lib/claims';
import { supabase } from '@/lib/supabase';

// Flagging a report as fake or abusive. Anyone signed in may flag, guests too, once per report and
// never their own (0018_flags.sql). A guest may flag 3 reports in 24 hours (0019). Only admins can
// read flags (0001_init.sql): for anyone else `fetchFlaggedReports` comes back empty.

/** What can be wrong with a report. The chosen words are what is saved and what an admin reads. */
export const FLAG_REASONS = [
  'Not a real animal or report',
  'Wrong place',
  'Offensive photo or words',
  'Same animal reported twice',
  'Something else',
] as const;

export type FlagReason = (typeof FLAG_REASONS)[number];

/**
 * Sends one flag. Throws when it was not saved; `isAlreadyFlagged` and `isGuestFlagLimit` name
 * the two known causes.
 */
export async function flagReport(reportId: string, userId: string, reason: FlagReason) {
  // No `.select()`: the sender may not read the row, so asking for it back would turn a saved flag
  // into an error.
  const { error } = await supabase
    .from('flags')
    .insert({ report_id: reportId, flagged_by: userId, reason });
  if (error) throw error;
}

/** Whether a flag was refused because this user already flagged this report. */
export function isAlreadyFlagged(error: unknown) {
  // 23505 is the database's code for "this pair is already there".
  return (error as { code?: string } | null)?.code === '23505';
}

/** Whether a flag was refused because a guest has flagged 3 reports in the past 24 hours. */
export function isGuestFlagLimit(error: unknown) {
  return String((error as { message?: string } | null)?.message).includes('guest_flag_limit');
}

/** A report that was flagged. `changedAt` is when it was last flagged. */
export type FlaggedReport = HistoryReport & {
  flagCount: number;
  /** The different reasons given, the newest flag's first. */
  reasons: string[];
};

const FLAGGED_LIMIT = 50;

/**
 * Every flagged report, the most recently flagged first, for the admin's screens. One line per
 * report, not per flag. With `onlyActive`, finished reports are left out: nothing is left to do
 * about those. The database hands flags to admins only, so anyone else gets none. Throws if the
 * read fails.
 */
export async function fetchFlaggedReports(
  onlyActive = false,
): Promise<{ reports: FlaggedReport[]; total: number }> {
  // ponytail: grouped on the phone from the newest 200 flags. Past that, older flags are not
  // counted; move the grouping into a database function when there are that many.
  let query = supabase
    .from('flags')
    .select(
      'reason, created_at, reports!inner(id, animal_type, status, landmark, photos, created_at)',
    );
  if (onlyActive) query = query.in('reports.status', ['reported', 'responding']);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(200);
  if (error) throw error;

  // A Map keeps the order rows were first put in: newest flag first.
  const byReport = new Map<string, FlaggedReport>();
  for (const flag of data as Record<string, any>[]) {
    const report = flag.reports;
    const found = byReport.get(report.id);
    if (found) {
      found.flagCount += 1;
      if (!found.reasons.includes(flag.reason)) found.reasons.push(flag.reason);
    } else {
      byReport.set(report.id, {
        id: report.id,
        animalType: report.animal_type,
        status: report.status,
        createdAt: report.created_at,
        changedAt: flag.created_at,
        landmark: report.landmark,
        photo: report.photos?.[0] ?? null,
        flagCount: 1,
        reasons: [flag.reason],
      });
    }
  }
  return { reports: [...byReport.values()].slice(0, FLAGGED_LIMIT), total: byReport.size };
}
