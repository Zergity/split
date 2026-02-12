interface Env {
  SPLITTER_KV: KVNamespace;
}

interface Member {
  id: string;
  name: string;
  // Optional bank account fields
  bankId?: string;
  bankName?: string;
  bankShortName?: string;
  accountName?: string;
  accountNo?: string;
}

interface Group {
  id: string;
  name: string;
  currency: string;
  members: Member[];
  createdAt: string;
}

const DEFAULT_GROUP: Group = {
  id: 'default',
  name: 'Expenses',
  currency: 'K',
  members: [],
  createdAt: new Date().toISOString(),
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const group = await context.env.SPLITTER_KV.get<Group>('group', 'json');
    return Response.json({
      success: true,
      data: group || DEFAULT_GROUP,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to fetch group' },
      { status: 500 }
    );
  }
};

// Check for duplicate names (case-insensitive)
function findDuplicateName(members: Member[]): string | null {
  const seen = new Set<string>();
  for (const m of members) {
    const lowerName = m.name.toLowerCase();
    if (seen.has(lowerName)) {
      return m.name;
    }
    seen.add(lowerName);
  }
  return null;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const updates = await context.request.json() as Partial<Group>;
    const existing = await context.env.SPLITTER_KV.get<Group>('group', 'json');
    const group = existing || DEFAULT_GROUP;

    // Check for duplicate names if members are being updated
    let members = group.members;
    if (updates.members) {
      const duplicateName = findDuplicateName(updates.members);
      if (duplicateName) {
        return Response.json(
          { success: false, error: `Name "${duplicateName}" already exists` },
          { status: 400 }
        );
      }
      members = updates.members;
    }

    const updated: Group = {
      ...group,
      name: updates.name ?? group.name,
      currency: updates.currency ?? group.currency,
      members,
    };

    await context.env.SPLITTER_KV.put('group', JSON.stringify(updated));

    return Response.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: 'Failed to update group' },
      { status: 500 }
    );
  }
};
