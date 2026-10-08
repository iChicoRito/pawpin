import { supabase } from '@/lib/supabase';

// A report's status changes only through these database functions (0007_claims.sql,
// 0010_closing_reports.sql, 0011_own_report.sql). Each throws when the database refuses; the short
// reason is in the error's message, see `refusalOf`.

/**
 * "I'm on my way": the report becomes Responding. Refused for guests, for a report already taken,
 * for a rescuer who is already on the way to another report, and for the report's own reporter.
 */
export async function claimReport(reportId: string) {
  const { error } = await supabase.rpc('claim_report', { p_report_id: reportId });
  if (error) throw error;
}

/** "I can't make it": the report goes back to Reported. */
export async function cancelClaim(reportId: string) {
  const { error } = await supabase.rpc('cancel_claim', { p_report_id: reportId });
  if (error) throw error;
}

/** The outcome, recorded by the rescuer who is on the way. */
export async function resolveReport(reportId: string, outcome: 'rescued' | 'not_found') {
  const { error } = await supabase.rpc('resolve_report', {
    p_report_id: reportId,
    p_outcome: outcome,
  });
  if (error) throw error;
}

/**
 * The reporter ends their own report. With `rescued` they helped the animal themselves and it
 * ends as rescued, in their name; without, it ends as closed. Final either way; a rescuer on the
 * way is told by its leaving.
 */
export async function closeReport(reportId: string, rescued: boolean) {
  const { error } = await supabase.rpc('close_report', {
    p_report_id: reportId,
    p_rescued: rescued,
  });
  if (error) throw error;
}

/** One line of a person's history on the Profile tab. */
export type HistoryReport = {
  id: string;
  animalType: string | null;
  status: string;
  createdAt: string;
  /** When it last changed. For an ended report, when it ended. */
  changedAt: string;
  landmark: string | null;
  /** The first photo, if the report has one. */
  photo: string | null;
};

// The columns of reports that a history line needs.
const HISTORY_COLUMNS = 'id, animal_type, status, landmark, created_at, updated_at, photos';
const HISTORY_LIMIT = 50;

function toHistory(row: Record<string, any>): HistoryReport {
  return {
    id: row.id,
    animalType: row.animal_type,
    status: row.status,
    createdAt: row.created_at,
    changedAt: row.updated_at,
    landmark: row.landmark,
    photo: row.photos?.[0] ?? null,
  };
}

/** Every report this person sent, of any status, newest first. Throws if it cannot be read. */
export async function fetchMyReports(userId: string) {
  const { data, error } = await supabase
    .from('reports')
    .select(HISTORY_COLUMNS)
    .eq('reporter_id', userId)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;
  return data.map(toHistory);
}

/**
 * The animals this person rescued: their finished claims whose report ended as rescued, newest
 * rescue first. A visit that ended "not found" is not a rescue. Throws if it cannot be read.
 */
export async function fetchMyRescues(userId: string) {
  const { data, error } = await supabase
    .from('claims')
    .select(`created_at, reports!inner(${HISTORY_COLUMNS})`)
    .eq('rescuer_id', userId)
    .eq('status', 'completed')
    .eq('reports.status', 'rescued')
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;
  // Each claim carries its one report.
  return (data as Record<string, any>[]).map((claim) => toHistory(claim.reports));
}

/** Why the database refused, when it was one of its own reasons and not a lost connection. */
export function refusalOf(error: unknown) {
  const message = String((error as { message?: string } | null)?.message);
  if (message.includes('report_not_open')) return 'report_not_open';
  if (message.includes('no_active_claim')) return 'no_active_claim';
  if (message.includes('already_on_the_way')) return 'already_on_the_way';
  if (message.includes('cannot_close')) return 'cannot_close';
  if (message.includes('own_report')) return 'own_report';
  return null;
}
