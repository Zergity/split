// Shared session/authorization helpers used by every API handler.
// Encapsulates: "is the caller authenticated?" and "is the caller a member
// of the group they're acting on?" so route files don't re-implement these.

import type { AuthEnv, Session } from '../types/auth';
import { getTokenFromCookies, verifySession } from './jwt';
import { getGroup, GroupRecord, GroupMember, findMember, isAdmin } from './groups';
import { isUserMemberOfGroup, UserMembership } from './users';

export interface AuthedContext {
  session: Session;
}

export interface GroupContext extends AuthedContext {
  group: GroupRecord;
  member: GroupMember; // the caller's member row in this group
  membership: UserMembership;
}

// Return a 401 JSON response.
function unauthorized(message = 'Not authenticated'): Response {
  return Response.json({ success: false, error: message }, { status: 401 });
}

function forbidden(message = 'Forbidden'): Response {
  return Response.json({ success: false, error: message }, { status: 403 });
}

function badRequest(message: string): Response {
  return Response.json({ success: false, error: message }, { status: 400 });
}

function notFound(message = 'Not found'): Response {
  return Response.json({ success: false, error: message }, { status: 404 });
}

// Require an authenticated session. Returns the session on success, or a
// Response on failure that the handler should return directly.
export async function requireSession(
  env: AuthEnv,
  request: Request,
): Promise<AuthedContext | Response> {
  const token = getTokenFromCookies(request);
  if (!token) return unauthorized();
  const session = await verifySession(env, token);
  if (!session) return unauthorized('Session expired');
  return { session };
}

// Extract the target groupId from the request: X-Group-Id header first,
// else ?groupId= query param. Returns null if neither is present.
export function extractGroupId(request: Request): string | null {
  const header = request.headers.get('X-Group-Id');
  if (header) return header;
  const url = new URL(request.url);
  return url.searchParams.get('groupId');
}

// Require an authenticated session AND that the caller is an active member of
// the group identified by X-Group-Id / ?groupId=. Returns a full group context
// on success or a Response on failure.
export async function requireGroup(
  env: AuthEnv,
  request: Request,
): Promise<GroupContext | Response> {
  const authed = await requireSession(env, request);
  if (authed instanceof Response) return authed;

  const groupId = extractGroupId(request);
  if (!groupId) return badRequest('Missing X-Group-Id');

  const membership = await isUserMemberOfGroup(env, authed.session.userId, groupId);
  if (!membership) return forbidden('Not a member of this group');

  const group = await getGroup(env, groupId);
  if (!group) return notFound('Group not found');

  const member = findMember(group, membership.memberId);
  if (!member || member.removedAt) {
    // Caller was removed from the group; their membership index is stale.
    return forbidden('Access to this group has been revoked');
  }

  return { session: authed.session, group, member, membership };
}

// Require that the caller is an admin of their group context.
export async function requireGroupAdmin(
  env: AuthEnv,
  request: Request,
): Promise<GroupContext | Response> {
  const ctx = await requireGroup(env, request);
  if (ctx instanceof Response) return ctx;
  if (!isAdmin(ctx.group, ctx.member.id)) return forbidden('Admin access required');
  return ctx;
}

export { unauthorized, forbidden, badRequest, notFound };
