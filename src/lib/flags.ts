import { supabase } from '@/lib/supabase';

// Flagging a report as fake or abusive. Anyone signed in may flag, guests too, once per report and
// never their own (0018_flags.sql). A guest may flag 3 reports in 24 hours (0019). Only admins can
// read flags, so nothing here reads one back.

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
