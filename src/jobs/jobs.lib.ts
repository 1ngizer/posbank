import { adminClient } from '../config/supabase';
import { logger } from '../config/logger';
import { AlertSeverity } from '../shared/types';
import { todayBogota, daysBetween } from '../shared/dates';
import { runCashEngine } from '../modules/analysis/cash-engine';
import { processCompanyAlerts } from '../modules/alerts/alerts.service';
import { dispatchAlerts } from '../integrations/notifications';
import { AccountingService } from '../integrations/accounting/accounting.service';

/** IDs de todas las empresas (para iterar en los jobs). */
export async function listCompanyIds(): Promise<string[]> {
  const { data, error } = await adminClient.from('companies').select('id');
  if (error) {
    logger.error({ error }, 'No se pudieron listar empresas');
    return [];
  }
  return (data ?? []).map((c) => c.id);
}

/**
 * Recalcula alertas para todas las empresas y despacha las que coincidan con
 * las severidades indicadas. Núcleo de los jobs horario/diario/semanal.
 */
export async function runAlertsForAll(dispatchSeverities: AlertSeverity[]) {
  const ids = await listCompanyIds();
  let totalNew = 0;
  for (const companyId of ids) {
    try {
      const { newAlerts } = await processCompanyAlerts(companyId);
      totalNew += newAlerts.length;
      const toSend = newAlerts.filter((a) => dispatchSeverities.includes(a.severity));
      if (toSend.length > 0) await dispatchAlerts(companyId, toSend);
    } catch (err) {
      logger.error({ err, companyId }, 'Fallo procesando alertas de empresa');
    }
  }
  logger.info({ companies: ids.length, totalNew }, 'runAlertsForAll completado');
}

/** Guarda la foto diaria de posición de caja de una empresa (upsert por fecha). */
export async function snapshotCompany(companyId: string): Promise<void> {
  const a = await runCashEngine(companyId);
  const { error } = await adminClient.from('cash_position_snapshots').upsert(
    {
      company_id: companyId,
      date: todayBogota(),
      total_cash_available: a.cashPosition.totalAvailable,
      bank_balance: a.cashPosition.bankBalance,
      physical_cash: a.cashPosition.physicalCash,
      total_receivables: a.cashPosition.totalReceivables,
      total_payables: a.cashPosition.totalPayables,
      net_position: a.cashPosition.netPosition,
      runway_days: a.runway.days >= 9999 ? 0 : a.runway.days,
    },
    { onConflict: 'company_id,date' },
  );
  if (error) logger.error({ error, companyId }, 'Fallo al guardar snapshot');
}

export async function snapshotAll(): Promise<void> {
  const ids = await listCompanyIds();
  for (const id of ids) await snapshotCompany(id);
  logger.info({ companies: ids.length }, 'Snapshots diarios completados');
}

/**
 * Marca como 'overdue' las cuentas por cobrar vencidas y actualiza days_overdue.
 * Corre a diario ("verificar cartera vencida").
 */
export async function refreshOverdueReceivables(): Promise<void> {
  const today = todayBogota();
  const { data, error } = await adminClient
    .from('receivables')
    .select('id, due_date, status')
    .neq('status', 'paid');
  if (error) {
    logger.error({ error }, 'Fallo leyendo receivables para vencimiento');
    return;
  }
  let updated = 0;
  for (const r of data ?? []) {
    const overdueDays = daysBetween(today, r.due_date);
    if (overdueDays > 0) {
      const newStatus = r.status === 'partial' ? 'partial' : 'overdue';
      await adminClient
        .from('receivables')
        .update({ days_overdue: overdueDays, status: newStatus })
        .eq('id', r.id);
      updated += 1;
    }
  }
  logger.info({ updated }, 'Cartera vencida actualizada');
}

/**
 * Reintenta sincronizaciones contables pendientes o fallidas con backoff.
 */
export async function reconcileAccountingSyncs(limit = 20): Promise<void> {
  const { data: pendingLogs, error } = await adminClient
    .from('accounting_sync_log')
    .select('*')
    .in('status', ['pending', 'failed'])
    .lt('attempts', 5)
    .order('attempts', { ascending: true })
    .order('last_attempt_at', { ascending: true })
    .limit(limit);

  if (error || !pendingLogs || pendingLogs.length === 0) return;

  logger.info({ count: pendingLogs.length }, 'Reconciliando sincronizaciones contables pendientes');

  for (const log of pendingLogs) {
    try {
      if (log.entity === 'invoice') {
        const { data: inv } = await adminClient
          .from('invoices')
          .select('id, number, customer_name, subtotal, tax, total, created_at, invoice_items(*)')
          .eq('id', log.local_id)
          .single();
        if (inv) {
          await AccountingService.syncEntity(adminClient, log.company_id, 'invoice', inv.id, {
            id: inv.id,
            number: inv.number,
            customerName: inv.customer_name,
            subtotal: inv.subtotal,
            tax: inv.tax,
            total: inv.total,
            date: inv.created_at,
            items: (inv.invoice_items ?? []).map((i: any) => ({
              description: i.description,
              quantity: i.quantity,
              unitPrice: i.unit_price,
              taxRate: i.tax_rate,
              lineTotal: i.line_total,
              productId: i.product_id,
            })),
          });
        }
      } else if (log.entity === 'receivable') {
        const { data: rec } = await adminClient
          .from('receivables')
          .select('*')
          .eq('id', log.local_id)
          .single();
        if (rec) {
          await AccountingService.syncEntity(adminClient, log.company_id, 'receivable', rec.id, {
            id: rec.id,
            clientName: rec.client_name,
            clientId: rec.client_id,
            amount: rec.amount,
            dueDate: rec.due_date,
            issuedDate: rec.issued_date,
            status: rec.status,
          });
        }
      } else if (log.entity === 'payable') {
        const { data: pay } = await adminClient
          .from('payables')
          .select('*')
          .eq('id', log.local_id)
          .single();
        if (pay) {
          await AccountingService.syncEntity(adminClient, log.company_id, 'payable', pay.id, {
            id: pay.id,
            supplierName: pay.supplier_name,
            supplierId: pay.supplier_id,
            amount: pay.amount,
            dueDate: pay.due_date,
            notes: pay.notes,
          });
        }
      } else if (log.entity === 'cash_movement') {
        const { data: mov } = await adminClient
          .from('cash_movements')
          .select('*')
          .eq('id', log.local_id)
          .single();
        if (mov) {
          await AccountingService.syncEntity(adminClient, log.company_id, 'cash_movement', mov.id, {
            id: mov.id,
            type: mov.type,
            amount: mov.amount,
            category: mov.category,
            description: mov.description,
            date: mov.date,
          });
        }
      }
    } catch (err: any) {
      logger.warn({ logId: log.id, err: err?.message }, 'Error en reintento de sync contable');
    }
  }
}
