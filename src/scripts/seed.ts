/**
 * Script de datos demo para PosBank.
 *
 *   npm run seed
 *
 * Crea (o recrea) una empresa realista —"Distribuidora La 80 SAS"— con
 * movimientos, cartera vencida, cuentas por pagar, presupuesto, política de
 * pago y compromisos fijos calibrados para disparar alertas en las 4
 * severidades (crítica, precaución, configurar, oportunidad).
 *
 * Requiere un .env válido apuntando a tu proyecto Supabase (con la migración
 * ya aplicada). Usa la service_role key, así que bypasea RLS.
 */
import { adminClient } from '../config/supabase';
import { logger } from '../config/logger';
import { formatCOP } from '../shared/format';
import { todayBogota, addDays } from '../shared/dates';
import { runCashEngine } from '../modules/analysis/cash-engine';
import { processCompanyAlerts } from '../modules/alerts/alerts.service';

const DEMO = {
  companyName: 'Distribuidora La 80 SAS',
  nit: '901234567-8',
  industry: 'Comercio al por mayor',
  size: 12,
  email: 'demo@posbank.com',
  password: 'Demo1234!',
  name: 'Johno (Demo)',
  phone: '+573001112233',
  minReserve: 5_000_000,
};

async function findAuthUserByEmail(email: string): Promise<string | null> {
  // listUsers pagina; para el demo con 1 página basta.
  const { data } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  return user?.id ?? null;
}

async function cleanupExisting(): Promise<void> {
  const existingId = await findAuthUserByEmail(DEMO.email);
  if (!existingId) return;
  logger.info('Limpiando datos demo previos...');
  // Borrar la empresa (cascade elimina movimientos, cartera, etc.).
  const { data: profile } = await adminClient
    .from('users')
    .select('company_id')
    .eq('id', existingId)
    .maybeSingle();
  if (profile?.company_id) {
    await adminClient.from('companies').delete().eq('id', profile.company_id);
  }
  await adminClient.auth.admin.deleteUser(existingId);
}

async function seed(): Promise<void> {
  await cleanupExisting();

  const today = todayBogota();

  // 1) Usuario dueño en Supabase Auth.
  const { data: created, error: authErr } = await adminClient.auth.admin.createUser({
    email: DEMO.email,
    password: DEMO.password,
    email_confirm: true,
    user_metadata: { name: DEMO.name },
  });
  if (authErr || !created.user) throw new Error(authErr?.message ?? 'createUser falló');
  const ownerId = created.user.id;

  // 2) Empresa.
  const { data: company, error: cErr } = await adminClient
    .from('companies')
    .insert({
      name: DEMO.companyName,
      nit: DEMO.nit,
      industry: DEMO.industry,
      size: DEMO.size,
      owner_id: ownerId,
      settings: {
        minimum_cash_reserve: DEMO.minReserve,
        alert_preferences: { whatsapp: true, alexa: true, app: true, email: false },
      },
    })
    .select('id')
    .single();
  if (cErr || !company) throw new Error(cErr?.message ?? 'insert company falló');
  const companyId = company.id;

  // 3) Perfil owner.
  await adminClient.from('users').insert({
    id: ownerId,
    company_id: companyId,
    email: DEMO.email,
    name: DEMO.name,
    role: 'owner',
    phone_whatsapp: DEMO.phone,
  });

  // 4) Cuenta bancaria.
  await adminClient.from('bank_accounts').insert({
    company_id: companyId,
    bank_name: 'Bancolombia',
    account_number_last4: '8041',
    current_balance: 3_000_000,
    last_synced_at: new Date().toISOString(),
  });

  // 5) Presupuesto del mes en curso (ventas quedan al 76%; costos 8% sobre).
  await adminClient.from('budgets').insert({
    company_id: companyId,
    month: Number(today.slice(5, 7)),
    year: Number(today.slice(0, 4)),
    revenue_budget: 40_000_000,
    cost_budget: 8_000_000,
    expense_budget: 4_000_000,
    sales_target: 40_000_000,
  });

  // 6) Movimientos.
  //    Mes actual: ventas 30,4M (76% de la meta) y gastos 13M (108% del ppto).
  //    Meses previos: pares balanceados income/expense de 13M para que el burn
  //    mensual quede ~13M sin alterar el efectivo neto acumulado.
  const movements = [
    // Ventas del mes (categoría sales)
    mv(companyId, ownerId, 'income', 12_000_000, 'sales', today, 'Venta mayorista'),
    mv(companyId, ownerId, 'income', 10_400_000, 'sales', today, 'Ventas mostrador'),
    mv(companyId, ownerId, 'income', 8_000_000, 'sales', today, 'Pedido cliente ABC'),
    // Gastos del mes
    mv(companyId, ownerId, 'expense', 7_000_000, 'suppliers', today, 'Compra inventario'),
    mv(companyId, ownerId, 'expense', 3_000_000, 'rent', today, 'Arriendo bodega'),
    mv(companyId, ownerId, 'expense', 1_500_000, 'utilities', today, 'Servicios públicos'),
    mv(companyId, ownerId, 'expense', 1_500_000, 'other', today, 'Gastos varios'),
    // Mes -1 (balanceado)
    mv(companyId, ownerId, 'income', 13_000_000, 'other', addDays(today, -35), 'Ventas mes anterior'),
    mv(companyId, ownerId, 'expense', 13_000_000, 'suppliers', addDays(today, -35), 'Costos mes anterior'),
    // Mes -2 (balanceado)
    mv(companyId, ownerId, 'income', 13_000_000, 'other', addDays(today, -65), 'Ventas hace 2 meses'),
    mv(companyId, ownerId, 'expense', 13_000_000, 'suppliers', addDays(today, -65), 'Costos hace 2 meses'),
  ];
  await adminClient.from('cash_movements').insert(movements);

  // 7) Cartera por cobrar (2 vencidas > 60 días promedio → crítica).
  await adminClient.from('receivables').insert([
    {
      company_id: companyId,
      client_name: 'Cliente ABC',
      amount: 5_200_000,
      issued_date: addDays(today, -80),
      due_date: addDays(today, -50),
      status: 'overdue',
      days_overdue: 50,
    },
    {
      company_id: companyId,
      client_name: 'Cliente XYZ',
      amount: 4_100_000,
      issued_date: addDays(today, -110),
      due_date: addDays(today, -80),
      status: 'overdue',
      days_overdue: 80,
    },
    {
      company_id: companyId,
      client_name: 'Cliente al día',
      amount: 3_000_000,
      issued_date: today,
      due_date: addDays(today, 20),
      status: 'pending',
      days_overdue: 0, // mismas columnas que las demás filas (requisito de PostgREST)
    },
  ]);

  // 8) Cuentas por pagar (López ofrece 3% por pronto pago → oportunidad).
  await adminClient.from('payables').insert([
    {
      company_id: companyId,
      supplier_name: 'Proveedor López',
      amount: 6_000_000,
      due_date: addDays(today, 5),
      status: 'pending',
      early_payment_discount_pct: 3,
    },
    {
      company_id: companyId,
      supplier_name: 'Proveedor Meta',
      amount: 4_000_000,
      due_date: addDays(today, 20),
      status: 'pending',
      early_payment_discount_pct: 0,
    },
  ]);

  // 9) Política de pago (habilita la alerta de descuento por pronto pago).
  //    NO creamos política de cobro → dispara alerta CONFIGURAR.
  await adminClient.from('payment_policies').insert({
    company_id: companyId,
    standard_payment_days: 30,
    early_payment_threshold_days: 10,
    early_payment_discount_min_pct: 2,
    is_active: true,
  });

  // 10) Compromisos fijos. Nómina dentro de 30d (cuenta en compromisos
  //     próximos → caja "ajustada"); arriendo a +40d queda fuera de ventana.
  await adminClient.from('fixed_commitments').insert([
    {
      company_id: companyId,
      name: 'Nómina',
      amount: 8_000_000,
      frequency: 'monthly',
      next_due_date: addDays(today, 8),
      is_active: true,
    },
    {
      company_id: companyId,
      name: 'Arriendo local',
      amount: 3_000_000,
      frequency: 'monthly',
      next_due_date: addDays(today, 40),
      is_active: true,
    },
  ]);

  // 11) Correr el motor y generar las alertas.
  const { newAlerts } = await processCompanyAlerts(companyId);
  const analysis = await runCashEngine(companyId);

  // ─── Reporte en consola ───────────────────────────────────────────
  const line = '─'.repeat(56);
  console.log(`\n${line}\n  ✅ Datos demo cargados\n${line}`);
  console.log(`  Empresa:  ${DEMO.companyName}`);
  console.log(`  Login:    ${DEMO.email}  /  ${DEMO.password}`);
  console.log(`  WhatsApp: ${DEMO.phone}`);
  console.log(line);
  console.log('  RADAR DE CAJA (CashAnalysis):');
  console.log(`   • Posición de caja: ${analysis.cashPosition.state}  (disponible ${formatCOP(analysis.cashPosition.totalAvailable)})`);
  console.log(`   • Ventas:           ${analysis.sales.state}  (${analysis.sales.percentage}% de la meta)`);
  console.log(`   • Costos:           ${analysis.costs.state}  (+${analysis.costs.overBudgetPct}% sobre ppto)`);
  console.log(`   • Cobro:            ${analysis.collection.state}  (vencido ${formatCOP(analysis.collection.totalOverdue)}, ${analysis.collection.averageDaysOverdue}d prom.)`);
  console.log(`   • Pago:             ${analysis.payment.state}  (oportunidad ${formatCOP(analysis.payment.earlyPaymentOpportunities)})`);
  console.log(`   • Runway:           ${analysis.runway.state}  (${analysis.runway.days} días)`);
  console.log(line);
  console.log(`  ALERTAS GENERADAS: ${newAlerts.length}`);
  for (const a of newAlerts) {
    console.log(`   [${a.severity.toUpperCase()}] ${a.title}`);
  }
  console.log(`${line}\n`);
}

/** Helper para construir un movimiento. */
function mv(
  companyId: string,
  userId: string,
  type: 'income' | 'expense',
  amount: number,
  category: string,
  date: string,
  description: string,
) {
  return {
    company_id: companyId,
    user_id: userId,
    type,
    amount,
    currency: 'COP',
    category,
    description,
    source_channel: 'app',
    date,
  };
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, 'Seed falló');
    process.exit(1);
  });
