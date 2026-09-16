import { db } from '../db';

export async function getSettings() {
  return (await db().query('select * from system_settings where id=true')).rows[0];
}

export async function toggleSetting(field: 'system_enabled' | 'licensing_enabled' | 'maintenance_mode' | 'release_system_enabled' | 'deployment_enabled', actorUserId: string, actor: string) {
  const result = await db().query(`update system_settings set ${field}=not ${field}, updated_at=now() where id=true returning *`);
  await db().query(`insert into audit_events(actor_user_id,actor,action,resource_type,details) values($1,$2,$3,'system_settings',$4)`, [actorUserId, actor, `settings.toggle.${field}`, JSON.stringify({ field })]);
  return result.rows[0];
}
