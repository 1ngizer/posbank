/**
 * Prueba de conexión a Supabase. No imprime credenciales.
 *   npx ts-node-dev --transpile-only src/scripts/check-connection.ts
 */
import { adminClient } from '../config/supabase';
import { env } from '../config/env';

async function main() {
  console.log(`\n🔌 Probando conexión a ${env.SUPABASE_URL} ...`);

  // 1) service_role + Auth (funciona aunque la migración no esté aplicada aún).
  const { data, error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) {
    console.error(`❌ Falló la conexión / service_role inválida: ${error.message}`);
    process.exit(1);
  }
  console.log(`✅ Conexión OK. Auth accesible (usuarios actuales: ${data.users.length}).`);

  // 2) ¿Existen ya las tablas? (para saber si toca aplicar la migración)
  const { error: tblErr } = await adminClient.from('companies').select('id').limit(1);
  if (tblErr) {
    if (/does not exist|schema cache|relation/i.test(tblErr.message)) {
      console.log('ℹ️  Las tablas aún NO existen → falta aplicar la migración (Paso 3).');
    } else {
      console.log(`ℹ️  Nota al consultar 'companies': ${tblErr.message}`);
    }
  } else {
    console.log("✅ La tabla 'companies' ya existe (migración aplicada).");
  }
  console.log('');
  process.exit(0);
}

main().catch((e) => {
  console.error('❌ Error inesperado:', e?.message ?? e);
  process.exit(1);
});
