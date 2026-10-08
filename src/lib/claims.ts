import { supabase } from '@/lib/supabase';

// A report's status changes only through these database functions (0007_claims.sql). Each throws
// when the database refuses; the short reason is in the error's message, see `refusalOf`.

/** "I'm on my way": the report becomes Responding. Refused for guests and for a report already taken. */
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

/** Why the database refused, when it was one of its own reasons and not a lost connection. */
export function refusalOf(error: unknown) {
  const message = String((error as { message?: string } | null)?.message);
  if (message.includes('report_not_open')) return 'report_not_open';
  if (message.includes('no_active_claim')) return 'no_active_claim';
  return null;
}
