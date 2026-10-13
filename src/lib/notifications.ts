import BubbleChatIcon from '@hugeicons/core-free-icons/BubbleChatIcon';
import CancelCircleIcon from '@hugeicons/core-free-icons/CancelCircleIcon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import Clock01Icon from '@hugeicons/core-free-icons/Clock01Icon';
import Navigation03Icon from '@hugeicons/core-free-icons/Navigation03Icon';
import SearchRemoveIcon from '@hugeicons/core-free-icons/SearchRemoveIcon';
import Shield01Icon from '@hugeicons/core-free-icons/Shield01Icon';
import Undo02Icon from '@hugeicons/core-free-icons/Undo02Icon';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { ANIMAL_TYPES, labelFor } from '@/lib/reports';
import { supabase } from '@/lib/supabase';

// What happened to a person's reports and rescues. The rows are written by the database
// (supabase/migrations/0032_notifications.sql); the app reads them and marks them read.

/**
 * Each kind of notification: the line in the list, the sentence on its page, and its icon. `tone`
 * picks the icon's color: green for good news, red for a report taken down, plain for the rest.
 */
export const NOTIFICATION_KINDS = {
  on_the_way: {
    title: 'Someone is on the way',
    line: (animal: string) => `A rescuer is going to the ${animal} you reported.`,
    icon: Navigation03Icon,
    tone: 'success',
  },
  gave_up: {
    title: 'The rescuer could not go',
    line: (animal: string) => `The ${animal} you reported is open again for someone else.`,
    icon: Undo02Icon,
    tone: 'plain',
  },
  rescued: {
    title: 'Rescued',
    line: (animal: string) => `Someone helped the ${animal} you reported. Thank you for reporting.`,
    icon: CheckmarkCircle02Icon,
    tone: 'success',
  },
  not_found: {
    title: 'Not found',
    line: (animal: string) =>
      `A rescuer went to look for the ${animal} you reported and could not find it.`,
    icon: SearchRemoveIcon,
    tone: 'plain',
  },
  closed_by_admin: {
    title: 'Closed by an admin',
    line: (animal: string) => `An admin closed your report of the ${animal}.`,
    icon: Shield01Icon,
    tone: 'danger',
  },
  closed_stale: {
    title: 'Closed after 72 hours',
    line: (animal: string) =>
      `Nobody updated your report of the ${animal} for 72 hours, so it was closed.`,
    icon: Clock01Icon,
    tone: 'plain',
  },
  closed_under_you: {
    title: 'The report has ended',
    line: (animal: string) =>
      `The report of the ${animal} you were going to was closed. You can go to another animal.`,
    icon: CancelCircleIcon,
    tone: 'plain',
  },
  message: {
    title: 'New message',
    line: (animal: string) => `Someone wrote to you about the ${animal}.`,
    icon: BubbleChatIcon,
    tone: 'plain',
  },
} as const;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  /** Why an admin closed the report. `null` for every other kind. */
  reason: string | null;
  createdAt: string;
  readAt: string | null;
  reportId: string;
  animalType: string | null;
  landmark: string | null;
  /** The report's status now, which may be later than what this notification tells. */
  status: string;
  photo: string | null;
};

/** Counts the live channels opened, so each gets a name no other has. */
let channels = 0;

/** How many notifications one read hands back. */
const PAGE = 50;

const COLUMNS =
  'id, kind, reason, created_at, read_at, report_id, reports(animal_type, landmark, status, photos)';

function toNotification(row: Record<string, any>): AppNotification {
  return {
    id: row.id,
    // A kind this version of the app does not know reads as a plain closing, not a crash.
    kind: row.kind in NOTIFICATION_KINDS ? row.kind : 'closed_under_you',
    reason: row.reason,
    createdAt: row.created_at,
    readAt: row.read_at,
    reportId: row.report_id,
    animalType: row.reports?.animal_type ?? null,
    landmark: row.reports?.landmark ?? null,
    status: row.reports?.status ?? 'closed',
    photo: row.reports?.photos?.[0] ?? null,
  };
}

/** The animal as it reads inside a sentence: "dog", "cat", the reporter's own word, or "animal". */
export function animalIn(notification: Pick<AppNotification, 'animalType'>) {
  return (labelFor(ANIMAL_TYPES, notification.animalType) || 'animal').toLowerCase();
}

/** The user's latest notifications, newest first. Throws on failure. */
export async function fetchNotifications(userId: string): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(PAGE);
  if (error) throw error;
  return (data as Record<string, any>[]).map(toNotification);
}

/** One notification, or `null` when there is none with this id for the viewer. Throws on failure. */
export async function fetchNotification(id: string): Promise<AppNotification | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? toNotification(data) : null;
}

/** Only logged on failure: a dot that stays is not worth an error on the screen. */
export async function markRead(id: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) console.warn('Marking the notification read failed:', error);
}

/** Opening a chat reads its "New message" line too. Only logged on failure. */
export async function markMessagesRead(reportId: string, userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('report_id', reportId)
    .eq('kind', 'message')
    .is('read_at', null);
  if (error) console.warn('Marking the messages read failed:', error);
}

/** Throws on failure, so the screen can say nothing changed. */
export async function markAllRead(userId: string) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('read_at', null);
  if (error) throw error;
}

/**
 * How many of the user's notifications are unread: all of them, or with `kind` only those of one
 * kind (the Chats tab counts messages). `null` until it is known, and when it cannot be read.
 * Counted again on every live change to the user's rows, and when the app comes back to the
 * front, since changes made in the background may have been missed.
 */
export function useUnreadCount(userId: string | undefined, kind?: NotificationKind) {
  const [answer, setAnswer] = useState<{ userId: string; count: number }>();

  useEffect(() => {
    if (!userId) return;
    let isGone = false;
    const read = () => {
      let query = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('read_at', null);
      if (kind) query = query.eq('kind', kind);
      query.then(({ count, error }) => {
          if (error) console.warn('Counting unread notifications failed:', error);
          else if (!isGone) setAnswer({ userId, count: count ?? 0 });
        });
    };
    read();
    // A name of its own: the Profile tab and the list both count while both are mounted, and a
    // second listener cannot be added to a channel that is already subscribed.
    const channel = supabase
      .channel(`notifications:${userId}:${++channels}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        read,
      )
      .subscribe();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => {
      isGone = true;
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [userId, kind]);

  return answer && answer.userId === userId ? answer.count : null;
}
