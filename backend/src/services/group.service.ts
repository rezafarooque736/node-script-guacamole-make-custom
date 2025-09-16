import { prisma } from '@/configs/database';

// guacamole_entity_type enum should include 'USER_GROUP'
// Adjust according to your Prisma schema enum
export async function createGroup(name: string) {
  return prisma.$transaction(async (tx) => {
    const entity = await tx.guacamole_entity.create({
      data: { name, type: 'USER_GROUP' as any },
      select: { entity_id: true, name: true, type: true },
    });

    const group = await tx.guacamole_user_group.create({
      data: {
        entity_id: entity.entity_id,
        disabled: false,
      },
      select: {
        user_group_id: true,
        entity_id: true,
      },
    });

    return { name: entity.name, disabled: false };
  });
}

export async function deleteGroupByName(name: string) {
  return prisma.$transaction(async (tx) => {
    const entity = await tx.guacamole_entity.findFirst({
      where: { name, type: 'USER_GROUP' as any },
      select: { entity_id: true },
    });
    if (!entity) return;

    // delete user_group referencing entity
    await tx.guacamole_user_group.deleteMany({ where: { entity_id: entity.entity_id } });
    // delete entity last (cascades will help for relations)
    await tx.guacamole_entity.delete({ where: { entity_id: entity.entity_id } });
  });
}

export async function listGroups() {
  // list from entity + user_group (active/disabled)
  const rows = await prisma.guacamole_entity.findMany({
    where: { type: 'USER_GROUP' as any },
    select: {
      name: true,
      guacamole_user_group: {
        select: { disabled: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  return rows.map((r) => ({ name: r.name, disabled: r.guacamole_user_group?.disabled ?? false }));
}
