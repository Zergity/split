// Permanent group invites. A code maps to a groupId; admins revoke via DELETE.
// The list of a group's invites is tracked in a per-group index so we can
// render them in the group manager without a KV list scan.

import type { AuthEnv } from '../types/auth';

export interface GroupInvite {
  code: string;
  groupId: string;
  createdBy: string; // memberId of admin who created it
  createdAt: string;
  note?: string;
}

const inviteKey = (code: string) => `group-invite::${code}`;
const groupInvitesKey = (groupId: string) => `group-invites::${groupId}`;

function randomCode(): string {
  // 16 base32 chars (~80 bits of entropy), URL-safe, readable.
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export async function getInvite(env: AuthEnv, code: string): Promise<GroupInvite | null> {
  return env.SPLITTER_KV.get<GroupInvite>(inviteKey(code), 'json');
}

export async function createInvite(
  env: AuthEnv,
  params: { groupId: string; createdBy: string; note?: string },
): Promise<GroupInvite> {
  const invite: GroupInvite = {
    code: randomCode(),
    groupId: params.groupId,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
    note: params.note,
  };
  await env.SPLITTER_KV.put(inviteKey(invite.code), JSON.stringify(invite));
  const index = (await env.SPLITTER_KV.get<string[]>(groupInvitesKey(params.groupId), 'json')) ?? [];
  index.push(invite.code);
  await env.SPLITTER_KV.put(groupInvitesKey(params.groupId), JSON.stringify(index));
  return invite;
}

export async function listGroupInvites(
  env: AuthEnv,
  groupId: string,
): Promise<GroupInvite[]> {
  const codes = (await env.SPLITTER_KV.get<string[]>(groupInvitesKey(groupId), 'json')) ?? [];
  const resolved = await Promise.all(
    codes.map(async (code) => ({ code, invite: await getInvite(env, code) })),
  );
  const live = resolved.filter((r): r is { code: string; invite: GroupInvite } => r.invite !== null);
  // Prune dangling codes (invite record gone but still in the per-group
  // index) from the index in place. Avoids the list growing unbounded over
  // time if invite records are ever deleted out-of-band.
  if (live.length !== codes.length) {
    await env.SPLITTER_KV.put(
      groupInvitesKey(groupId),
      JSON.stringify(live.map((r) => r.code)),
    );
  }
  return live.map((r) => r.invite);
}

export async function deleteInvite(env: AuthEnv, code: string): Promise<void> {
  const invite = await getInvite(env, code);
  if (!invite) return;
  await env.SPLITTER_KV.delete(inviteKey(code));
  const indexKey = groupInvitesKey(invite.groupId);
  const index = (await env.SPLITTER_KV.get<string[]>(indexKey, 'json')) ?? [];
  await env.SPLITTER_KV.put(
    indexKey,
    JSON.stringify(index.filter((c) => c !== code)),
  );
}
