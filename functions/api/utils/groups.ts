// Data layer for groups, members, and expenses.
// Encapsulates KV access so the legacy single-group schema
// (keys 'group' and 'expenses', no admins/userId fields) remains
// readable/writable without a batch migration. The first read of
// a legacy record lazily adds the missing fields in place.

import type { AuthEnv } from '../types/auth';

export const LEGACY_GROUP_ID = '1matrix';

export interface GroupMember {
  id: string;
  userId?: string; // null for pre-created placeholders not yet claimed
  name: string;
  avatarSeed?: string;
  bankId?: string;
  bankName?: string;
  bankShortName?: string;
  accountName?: string;
  accountNo?: string;
  joinedAt?: string;
  removedAt?: string;
}

export interface GroupRecord {
  id: string;
  name: string;
  currency: string;
  admins: string[]; // memberId[]
  members: GroupMember[];
  removedMembers: GroupMember[];
  createdBy?: string; // memberId of creator; may be absent for legacy
  createdAt: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  memberCount: number;
}

const GROUP_INDEX_KEY = 'group-index';

function groupKey(groupId: string): string {
  return groupId === LEGACY_GROUP_ID ? 'group' : `group::${groupId}`;
}

function expensesKey(groupId: string): string {
  return groupId === LEGACY_GROUP_ID ? 'expenses' : `expenses::${groupId}`;
}

// Promote a raw KV record to the current GroupRecord shape.
// Idempotent — running twice produces the same result.
function promoteGroupShape(raw: any, expectedGroupId: string): GroupRecord {
  const members: GroupMember[] = (raw.members ?? []).map((m: any) => ({
    ...m,
    // Legacy invariant: userId === memberId for pre-existing members
    userId: m.userId ?? m.id,
  }));
  const removedMembers: GroupMember[] = (raw.removedMembers ?? []).map((m: any) => ({
    ...m,
    userId: m.userId ?? m.id,
  }));
  const admins: string[] = Array.isArray(raw.admins) && raw.admins.length > 0
    ? raw.admins
    // Legacy group has no admin info — promote every current member to co-admin.
    // The group owner can demote others later.
    : members.map((m) => m.id);

  return {
    id: expectedGroupId,
    name: raw.name ?? 'Expenses',
    currency: raw.currency ?? 'K',
    admins,
    members,
    removedMembers,
    createdBy: raw.createdBy,
    createdAt: raw.createdAt ?? new Date().toISOString(),
  };
}

// True if the promoted form differs from what's stored (i.e. needs write-back).
function needsPromotion(raw: any, expectedGroupId: string): boolean {
  if (!raw) return false;
  if (raw.id !== expectedGroupId) return true;
  if (!Array.isArray(raw.admins) || raw.admins.length === 0) return true;
  if (!Array.isArray(raw.removedMembers)) return true;
  if ((raw.members ?? []).some((m: any) => !m.userId)) return true;
  return false;
}

// Load a group by id. If the stored record is in legacy shape, promote it
// once and write it back before returning. Returns null if no record exists.
export async function getGroup(
  env: AuthEnv,
  groupId: string,
): Promise<GroupRecord | null> {
  const raw = await env.SPLITTER_KV.get<any>(groupKey(groupId), 'json');
  if (!raw) return null;
  if (needsPromotion(raw, groupId)) {
    const promoted = promoteGroupShape(raw, groupId);
    await env.SPLITTER_KV.put(groupKey(groupId), JSON.stringify(promoted));
    await ensureInIndex(env, groupId);
    return promoted;
  }
  return raw as GroupRecord;
}

export async function saveGroup(env: AuthEnv, group: GroupRecord): Promise<void> {
  await env.SPLITTER_KV.put(groupKey(group.id), JSON.stringify(group));
  await ensureInIndex(env, group.id);
}

export async function createGroup(
  env: AuthEnv,
  params: { name: string; currency: string; creator: GroupMember },
): Promise<GroupRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const creator: GroupMember = { ...params.creator, joinedAt: now };
  const group: GroupRecord = {
    id,
    name: params.name,
    currency: params.currency,
    admins: [creator.id],
    members: [creator],
    removedMembers: [],
    createdBy: creator.id,
    createdAt: now,
  };
  await saveGroup(env, group);
  return group;
}

// Mark a member as removed. Keeps the entry in removedMembers so existing
// expenses (which reference memberId) still render names in history.
export async function softRemoveMember(
  env: AuthEnv,
  group: GroupRecord,
  memberId: string,
): Promise<GroupRecord> {
  const idx = group.members.findIndex((m) => m.id === memberId);
  if (idx === -1) return group;
  const removed = { ...group.members[idx], removedAt: new Date().toISOString() };
  const updated: GroupRecord = {
    ...group,
    members: group.members.filter((m) => m.id !== memberId),
    removedMembers: [...group.removedMembers, removed],
    admins: group.admins.filter((id) => id !== memberId),
  };
  await saveGroup(env, updated);
  return updated;
}

// Return members (active + removed) so old expense rows still resolve names.
export function findMember(group: GroupRecord, memberId: string): GroupMember | undefined {
  return (
    group.members.find((m) => m.id === memberId) ??
    group.removedMembers.find((m) => m.id === memberId)
  );
}

export function isAdmin(group: GroupRecord, memberId: string): boolean {
  return group.admins.includes(memberId);
}

// --- Expenses ---

export async function getExpenses(env: AuthEnv, groupId: string): Promise<unknown[]> {
  const data = await env.SPLITTER_KV.get<unknown[]>(expensesKey(groupId), 'json');
  return data ?? [];
}

export async function saveExpenses(
  env: AuthEnv,
  groupId: string,
  expenses: unknown[],
): Promise<void> {
  await env.SPLITTER_KV.put(expensesKey(groupId), JSON.stringify(expenses));
}

// --- Group index ---
// Tracks non-legacy group ids so `listGroupIds` doesn't need a KV list scan.
// Legacy group is detected separately by checking the old 'group' key.

async function ensureInIndex(env: AuthEnv, groupId: string): Promise<void> {
  if (groupId === LEGACY_GROUP_ID) return;
  const index = (await env.SPLITTER_KV.get<string[]>(GROUP_INDEX_KEY, 'json')) ?? [];
  if (!index.includes(groupId)) {
    index.push(groupId);
    await env.SPLITTER_KV.put(GROUP_INDEX_KEY, JSON.stringify(index));
  }
}

export async function listGroupIds(env: AuthEnv): Promise<string[]> {
  const index = (await env.SPLITTER_KV.get<string[]>(GROUP_INDEX_KEY, 'json')) ?? [];
  const hasLegacy = (await env.SPLITTER_KV.get('group')) !== null;
  return hasLegacy ? [LEGACY_GROUP_ID, ...index.filter((id) => id !== LEGACY_GROUP_ID)] : index;
}

export async function getGroupSummaries(
  env: AuthEnv,
  groupIds: string[],
): Promise<GroupSummary[]> {
  const groups = await Promise.all(groupIds.map((id) => getGroup(env, id)));
  return groups
    .filter((g): g is GroupRecord => g !== null)
    .map((g) => ({ id: g.id, name: g.name, memberCount: g.members.length }));
}
