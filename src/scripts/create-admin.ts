/**
 * Crea (o reusa) la cuenta de administrador de plataforma en Supabase Auth.
 * NO tiene empresa: el acceso admin se controla por la allowlist
 * PLATFORM_ADMIN_EMAILS del backend, no por la tabla users.
 *
 *   npm run create-admin
 */
import { adminClient } from '../config/supabase';

const EMAIL = process.env.ADMIN_EMAIL || 'admin@ingizer.com';
const PASSWORD = process.env.ADMIN_PASSWORD || 'IngizerAdmin*2026';

async function main() {
  const { data: list } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());

  if (existing) {
    // Aseguramos la contraseña conocida (por si se creó antes).
    await adminClient.auth.admin.updateUserById(existing.id, { password: PASSWORD });
    console.log(`✓ Admin ya existía; contraseña actualizada.\n  ${EMAIL} / ${PASSWORD}`);
    process.exit(0);
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: 'Admin Ingizer', platform_admin: true },
  });
  if (error || !data.user) {
    console.error('❌ No se pudo crear el admin:', error?.message);
    process.exit(1);
  }
  console.log(`✓ Admin creado:\n  ${EMAIL} / ${PASSWORD}\n  (cámbiala luego; el acceso lo da PLATFORM_ADMIN_EMAILS)`);
  process.exit(0);
}
main();
