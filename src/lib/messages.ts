import CancelCircleIcon from '@hugeicons/core-free-icons/CancelCircleIcon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import SearchRemoveIcon from '@hugeicons/core-free-icons/SearchRemoveIcon';
import Shield01Icon from '@hugeicons/core-free-icons/Shield01Icon';
import Undo02Icon from '@hugeicons/core-free-icons/Undo02Icon';
import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

// The chat between a report's reporter and the rescuer on the way. A thread belongs to a claim,
// and takes messages only while that claim is on the way; the database decides both
// (supabase/migrations/0034_messages.sql). There is no chat outside a report.

export const MESSAGE_MAX_LENGTH = 500;

/** Counts the live channels opened, so each gets a name no other has. */
let channels = 0;

/**
 * Why a chat can no longer be written to, as the database names it (`chat_end`,
 * supabase/migrations/0036_chat_end.sql). `label` is the short word for a row of the Chats tab;
 * `title` and `text` stand where the text box was, beside `icon`: the same icons as the
 * notifications of the same events. `tone` is green only for a rescue.
 */
export const CHAT_ENDS = {
  rescued: {
    label: 'Rescued',
    title: 'The animal was rescued',
    text: 'The rescuer marked it as rescued, so this chat has ended.',
    icon: CheckmarkCircle02Icon,
    tone: 'success',
  },
  reporter_rescued: {
    label: 'Rescued',
    title: 'The reporter helped the animal',
    text: 'The reporter closed the report as rescued, so this chat has ended.',
    icon: CheckmarkCircle02Icon,
    tone: 'success',
  },
  not_found: {
    label: 'Not found',
    title: 'The animal was not found',
    text: 'The rescuer went to look and could not find it, so this chat has ended.',
    icon: SearchRemoveIcon,
    tone: 'plain',
  },
  gave_up: {
    label: 'Gave up',
    title: 'The rescuer could not go',
    text: 'The rescuer gave up this rescue, so this chat has ended.',
    icon: Undo02Icon,
    tone: 'plain',
  },
  closed_by_admin: {
    label: 'Closed',
    title: 'An admin closed the report',
    text: 'The report was taken down, so this chat has ended.',
    icon: Shield01Icon,
    tone: 'danger',
  },
  closed: {
    label: 'Closed',
    title: 'The report was closed',
    text: 'The report was closed without a rescue, so this chat has ended.',
    icon: CancelCircleIcon,
    tone: 'plain',
  },
} as const;

export type ChatEnd = keyof typeof CHAT_ENDS;

/** A reason this version of the app does not know reads as a plain closing. */
function toChatEnd(value: unknown, isOpen: boolean): ChatEnd | null {
  if (isOpen) return null;
  return typeof value === 'string' && value in CHAT_ENDS ? (value as ChatEnd) : 'closed';
}

export type ChatMessage = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type Thread = {
  claimId: string;
  reportId: string;
  animalType: string | null;
  /** False once the rescuer gave up or the report ended: the thread is then only read. */
  isOpen: boolean;
  /** Why it ended. `null` while it is open. */
  ended: ChatEnd | null;
  /** The admin's reason, when an admin closed the report. */
  closeReason: string | null;
  /** Whoever the viewer is talking to. For an admin, who is neither, it is the rescuer. */
  other: { id: string; name: string | null; avatarUrl: string | null; isRescuer: boolean };
  messages: ChatMessage[];
};

function toMessage(row: Record<string, any>): ChatMessage {
  return { id: row.id, senderId: row.sender_id, body: row.body, createdAt: row.created_at };
}

/**
 * The thread of one claim, oldest message first, as `viewerId` sees it. `null` when there is no
 * such claim. Throws on failure.
 */
export async function fetchThread(claimId: string, viewerId: string): Promise<Thread | null> {
  const [claim, messages, ended] = await Promise.all([
    supabase
      .from('claims')
      .select('id, status, rescuer_id, report_id, reports(reporter_id, animal_type, close_reason)')
      .eq('id', claimId)
      .maybeSingle(),
    supabase
      .from('messages')
      .select('id, sender_id, body, created_at')
      .eq('claim_id', claimId)
      .order('created_at'),
    // Only for the words: a failed read leaves an ended chat saying the report was closed.
    supabase.rpc('chat_end', { p_claim_id: claimId }),
  ]);
  if (claim.error) throw claim.error;
  if (messages.error) throw messages.error;
  if (!claim.data) return null;

  const report = claim.data.reports as unknown as {
    reporter_id: string;
    animal_type: string | null;
    close_reason: string | null;
  };
  const isOpen = claim.data.status === 'on_the_way';
  const otherIsRescuer = viewerId !== claim.data.rescuer_id;
  const otherId = otherIsRescuer ? claim.data.rescuer_id : report.reporter_id;
  // Names and photos are open to every signed-in user (0014). A failed read leaves them blank.
  const profile = await supabase
    .from('profiles')
    .select('display_name, avatar_url')
    .eq('id', otherId)
    .maybeSingle();

  return {
    claimId,
    reportId: claim.data.report_id,
    animalType: report.animal_type,
    isOpen,
    ended: toChatEnd(ended.data, isOpen),
    closeReason: report.close_reason,
    other: {
      id: otherId,
      name: profile.data?.display_name ?? null,
      avatarUrl: profile.data?.avatar_url ?? null,
      isRescuer: otherIsRescuer,
    },
    messages: messages.data.map(toMessage),
  };
}

/** One row of the Chats tab: a thread, who it is with, and the last thing said in it. */
export type ChatSummary = {
  claimId: string;
  reportId: string;
  animalType: string | null;
  photo: string | null;
  /** False once the rescuer gave up or the report ended. */
  isOpen: boolean;
  /** Why it ended. `null` while it is open. */
  ended: ChatEnd | null;
  otherName: string | null;
  otherAvatarUrl: string | null;
  otherIsRescuer: boolean;
  /** `null` when nothing has been written yet. */
  lastBody: string | null;
  lastAt: string | null;
  lastFromMe: boolean;
  isUnread: boolean;
};

/**
 * Every chat the viewer is part of, newest activity first: the ones still open, and the ended
 * ones that have messages (`supabase/migrations/0035_my_chats.sql`). Throws on failure.
 */
export async function fetchChats(): Promise<ChatSummary[]> {
  const { data, error } = await supabase.rpc('my_chats');
  if (error) throw error;
  return (data as Record<string, any>[]).map((row) => ({
    claimId: row.claim_id,
    reportId: row.report_id,
    animalType: row.animal_type,
    photo: row.photo,
    isOpen: row.is_open,
    ended: toChatEnd(row.ended, row.is_open),
    otherName: row.other_name,
    otherAvatarUrl: row.other_avatar,
    otherIsRescuer: row.other_is_rescuer,
    lastBody: row.last_body,
    lastAt: row.last_at,
    lastFromMe: row.last_from_me === true,
    isUnread: row.unread,
  }));
}

/**
 * The viewer's chats for the Chats tab, kept live. `chats` is `undefined` while first read and
 * `null` when that read failed. Read again, quietly, when a message arrives in any of the
 * viewer's threads, when a report changes (a claim starting or ending changes its report), and
 * whenever `signal` changes: the screen passes whether it is in view.
 */
export function useChats(userId: string | undefined, signal?: unknown) {
  const [answer, setAnswer] = useState<{ userId: string; chats: ChatSummary[] | null }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let isGone = false;
    const read = () => {
      fetchChats()
        .then((chats) => {
          if (!isGone) setAnswer({ userId, chats });
        })
        .catch((error) => {
          console.warn('Loading the chats failed:', error);
          // A quiet read that fails leaves the list as it was.
          if (!isGone) setAnswer((shown) => (shown?.userId === userId && shown.chats ? shown : { userId, chats: null }));
        });
    };
    read();
    const channel = supabase
      .channel(`chats:${userId}:${++channels}`)
      // Only messages the viewer may read are sent to them (0034).
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, read)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reports' }, read)
      .subscribe();
    return () => {
      isGone = true;
      supabase.removeChannel(channel);
    };
  }, [userId, attempt, signal]);

  return {
    chats: answer && answer.userId === userId ? answer.chats : undefined,
    reload: () => setAttempt((count) => count + 1),
  };
}

/** Throws when it was not sent; `chatRefusalOf` names the known causes. */
export async function sendMessage(claimId: string, body: string) {
  const { error } = await supabase.rpc('send_message', { p_claim_id: claimId, p_body: body });
  if (error) throw error;
}

/** Why the database refused a message, or `null` for any other failure. */
export function chatRefusalOf(error: unknown) {
  const message = String((error as { message?: string } | null)?.message);
  if (message.includes('chat_closed')) return 'chat_closed';
  if (message.includes('not_in_chat')) return 'not_in_chat';
  if (message.includes('too_fast')) return 'too_fast';
  if (message.includes('empty_message')) return 'empty_message';
  return null;
}

/**
 * The claim whose chat a report page should offer: the one on the way now, else the newest one
 * that has messages the viewer may read. `null` when there is neither. Throws on failure.
 */
export async function claimForChat(reportId: string): Promise<string | null> {
  const active = await supabase
    .from('claims')
    .select('id')
    .eq('report_id', reportId)
    .eq('status', 'on_the_way')
    .maybeSingle();
  if (active.error) throw active.error;
  if (active.data) return active.data.id;

  // Only the two people of a thread, and an admin, are handed its messages.
  const last = await supabase
    .from('messages')
    .select('claim_id')
    .eq('report_id', reportId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last.error) throw last.error;
  return last.data?.claim_id ?? null;
}

/**
 * `claimForChat` for a screen: the claim id, or `null` while it is read, when there is none, and
 * when it cannot be read. The button it feeds is then simply not there. `status` is whatever
 * changes when the claim does, so the answer is read again.
 */
export function useChatClaim(reportId: string | undefined, status?: string) {
  const [answer, setAnswer] = useState<{ reportId: string; claimId: string | null }>();

  useEffect(() => {
    if (!reportId) return;
    let isGone = false;
    claimForChat(reportId)
      .then((claimId) => {
        if (!isGone) setAnswer({ reportId, claimId });
      })
      .catch((error) => console.warn('Reading the chat failed:', error));
    return () => {
      isGone = true;
    };
  }, [reportId, status]);

  return answer && answer.reportId === reportId ? answer.claimId : null;
}

/**
 * One thread, kept live. `thread` is `undefined` while it is read and `null` when there is none;
 * `failed` says the first read did not work. A new message from either side is added as the
 * database tells of it, and a change to the claim (the rescuer gave up, the report ended) reads
 * the thread again so the box closes.
 */
export function useThread(claimId: string | undefined, viewerId: string | undefined) {
  const [answer, setAnswer] = useState<{ claimId: string; thread: Thread | null }>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!claimId || !viewerId) return;
    let isGone = false;
    const read = () => {
      fetchThread(claimId, viewerId)
        .then((thread) => {
          if (isGone) return;
          setAnswer({ claimId, thread });
          setFailed(false);
        })
        .catch((error) => {
          console.warn('Loading the chat failed:', error);
          if (!isGone) setFailed(true);
        });
    };
    read();
    const channel = supabase
      // A name of its own: the same chat can be open twice in the stack (chat, report, chat again).
      .channel(`chat:${claimId}:${++channels}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `claim_id=eq.${claimId}` },
        (change) => {
          const message = toMessage(change.new);
          setAnswer((shown) =>
            !shown?.thread || shown.thread.messages.some((known) => known.id === message.id)
              ? shown
              : { ...shown, thread: { ...shown.thread, messages: [...shown.thread.messages, message] } },
          );
        },
      )
      // Reports are already sent live (0008), and every change to a claim changes its report.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reports' }, read)
      .subscribe();
    return () => {
      isGone = true;
      supabase.removeChannel(channel);
    };
  }, [claimId, viewerId, attempt]);

  const thread = answer && answer.claimId === claimId ? answer.thread : undefined;
  return {
    thread,
    failed: failed && thread === undefined,
    again: () => {
      setFailed(false);
      setAttempt((count) => count + 1);
    },
  };
}
