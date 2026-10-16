import { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../../shared/http';
import { logger } from '../../config/logger';
import {
  computeBreakEvenOverview,
  type BreakEvenOverview,
  type FixedCostAllocation,
  type ProductSalesInput,
} from './breakeven.overview';

const BOGOTA_OFFSET_HOURS = 5; // Colombia no usa horario de verano: siempre UTC-5

/** Fecha de calendario de Bogotá para `now`, con el inicio del mes en UTC. */
function bogotaMonth(now: Date) {
  const local = new Date(now.getTime() - BOGOTA_OFFSET_HOURS * 3600 * 1000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return {
    dayOfMonth: local.getUTCDate(),
    daysInMonth: new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
    monthStartUtc: new Date(Date.UTC(year, month, 1, BOGOTA_OFFSET_HOURS, 0, 0)),
  };
}

export class CommercialService {
  /**
   * Punto de equilibrio general y por producto con las ventas reales (facturas emitidas)
   * de los últimos `days` días y los costos fijos de fixed_commitments.
   */
  static async getBreakEvenOverview(
    db: SupabaseClient,
    companyId: string,
    days: number,
    allocation: FixedCostAllocation,
    now: Date = new Date(),
  ): Promise<BreakEvenOverview & { unassignedRevenuePerMonth: number }> {
    const fixedCostsMonthly = await CommercialService.getMonthlyFixedCosts(db, companyId);
    const { dayOfMonth, daysInMonth, monthStartUtc } = bogotaMonth(now);
    const windowStart = new Date(now.getTime() - days * 24 * 3600 * 1000);
    const since = windowStart < monthStartUtc ? windowStart : monthStartUtc;

    const { data: products, error: pErr } = await db
      .from('products')
      .select('id, name, price, cost')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .eq('category', 'finished');
    if (pErr) throw ApiError.badRequest(pErr.message);

    const { data: items, error: iErr } = await db
      .from('invoice_items')
      .select('product_id, quantity, line_total, invoices!inner(status, created_at)')
      .eq('company_id', companyId)
      .eq('invoices.status', 'issued')
      .gte('invoices.created_at', since.toISOString())
      .limit(50000);
    if (iErr) throw ApiError.badRequest(iErr.message);

    const byProduct = new Map<string, { units: number; revenue: number }>();
    const costById = new Map<string, number>((products ?? []).map((p) => [p.id as string, Number(p.cost) || 0]));
    let monthContribution = 0;
    let unassignedRevenue = 0;

    for (const row of items ?? []) {
      const inv = Array.isArray(row.invoices) ? row.invoices[0] : row.invoices;
      const at = inv?.created_at ? new Date(inv.created_at) : null;
      if (!at) continue;
      const qty = Number(row.quantity) || 0;
      const total = Number(row.line_total) || 0;

      if (!row.product_id || !costById.has(row.product_id as string)) {
        if (at >= windowStart) unassignedRevenue += total;
        continue;
      }
      const cost = costById.get(row.product_id as string) ?? 0;
      if (at >= windowStart) {
        const acc = byProduct.get(row.product_id as string) ?? { units: 0, revenue: 0 };
        acc.units += qty;
        acc.revenue += total;
        byProduct.set(row.product_id as string, acc);
      }
      if (at >= monthStartUtc) monthContribution += total - cost * qty;
    }

    const inputs: ProductSalesInput[] = (products ?? []).map((p) => {
      const sold = byProduct.get(p.id as string);
      return {
        id: p.id as string,
        name: p.name as string,
        listPrice: Number(p.price) || 0,
        unitCost: Number(p.cost) || 0,
        unitsSold: sold?.units ?? 0,
        revenue: sold?.revenue ?? 0,
      };
    });

    const overview = computeBreakEvenOverview({
      fixedCostsMonthly,
      products: inputs,
      windowDays: days,
      allocation,
      monthToDate: { contribution: monthContribution, dayOfMonth, daysInMonth },
    });

    const unassignedRevenuePerMonth = Math.round(unassignedRevenue * (30 / days));
    if (unassignedRevenuePerMonth > 0) {
      overview.notes.push(
        'Hay ventas sin producto del inventario asociado; no entran en este cálculo porque no se conoce su costo.',
      );
    }
    return { ...overview, unassignedRevenuePerMonth };
  }

  /**
   * Obtiene la suma mensual normalizada de compromisos fijos de la empresa (fixed_commitments).
   */
  static async getMonthlyFixedCosts(db: SupabaseClient, companyId: string): Promise<number> {
    const { data: commitments, error } = await db
      .from('fixed_commitments')
      .select('amount, frequency, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true);

    if (error) {
      logger.error({ err: error.message, companyId }, 'Error consultando fixed_commitments para comercial');
      return 0;
    }

    let totalMonthly = 0;
    for (const c of commitments ?? []) {
      const amt = Number(c.amount) || 0;
      switch (c.frequency) {
        case 'weekly':
          totalMonthly += amt * (52 / 12);
          break;
        case 'biweekly':
          totalMonthly += amt * 2;
          break;
        case 'quarterly':
          totalMonthly += amt / 3;
          break;
        case 'monthly':
        default:
          totalMonthly += amt;
          break;
      }
    }

    return Math.round(totalMonthly);
  }

  /**
   * Lista propuestas comerciales guardadas.
   */
  static async listProposals(db: SupabaseClient, companyId: string) {
    const { data, error } = await db
      .from('commercial_proposals')
      .select('*, products(id, name, price, cost)')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw ApiError.badRequest(error.message);
    return data ?? [];
  }

  /**
   * Guarda o actualiza una propuesta comercial.
   */
  static async saveProposal(
    db: SupabaseClient,
    companyId: string,
    proposal: {
      title: string;
      clientName: string;
      productId?: string | null;
      baseCost: number;
      targetMarginPct: number;
      tiers: any[];
      notes?: string | null;
      status?: string;
    },
  ) {
    const { data, error } = await db
      .from('commercial_proposals')
      .insert({
        company_id: companyId,
        title: proposal.title,
        client_name: proposal.clientName,
        product_id: proposal.productId || null,
        base_cost: proposal.baseCost,
        target_margin_pct: proposal.targetMarginPct,
        tiers: proposal.tiers,
        notes: proposal.notes || null,
        status: proposal.status || 'draft',
      })
      .select('*')
      .single();

    if (error) throw ApiError.badRequest(error.message);
    return data;
  }

  /**
   * Cambia el estado de una propuesta (draft, sent, accepted, rejected).
   */
  static async updateProposalStatus(
    db: SupabaseClient,
    companyId: string,
    proposalId: string,
    status: 'draft' | 'sent' | 'accepted' | 'rejected',
  ) {
    const { data, error } = await db
      .from('commercial_proposals')
      .update({ status })
      .eq('company_id', companyId)
      .eq('id', proposalId)
      .select('*')
      .maybeSingle();

    if (error) throw ApiError.badRequest(error.message);
    if (!data) throw new ApiError(404, 'Propuesta no encontrada');
    return data;
  }

  /**
   * Elimina una propuesta comercial.
   */
  static async deleteProposal(db: SupabaseClient, companyId: string, proposalId: string) {
    const { error } = await db
      .from('commercial_proposals')
      .delete()
      .eq('company_id', companyId)
      .eq('id', proposalId);

    if (error) throw ApiError.badRequest(error.message);
  }

  /**
   * Guarda o actualiza métricas de unit economics para un mes/año.
   */
  static async saveUnitEconomics(
    db: SupabaseClient,
    companyId: string,
    data: {
      periodMonth: number;
      periodYear: number;
      marketingSpend: number;
      salesSpend: number;
      newCustomers: number;
      retentionSpend: number;
      activeCustomers: number;
      avgTicket: number;
      purchaseFreqAnnual: number;
      avgLifespanYears: number;
      grossMarginPct: number;
    },
  ) {
    const { data: saved, error } = await db
      .from('commercial_unit_economics')
      .upsert(
        {
          company_id: companyId,
          period_month: data.periodMonth,
          period_year: data.periodYear,
          marketing_spend: data.marketingSpend,
          sales_spend: data.salesSpend,
          new_customers: data.newCustomers,
          retention_spend: data.retentionSpend,
          active_customers: data.activeCustomers,
          avg_ticket: data.avgTicket,
          purchase_freq_annual: data.purchaseFreqAnnual,
          avg_lifespan_years: data.avgLifespanYears,
          gross_margin_pct: data.grossMarginPct,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,period_year,period_month' },
      )
      .select('*')
      .single();

    if (error) throw ApiError.badRequest(error.message);
    return saved;
  }

  /**
   * Obtiene las métricas más recientes de unit economics.
   */
  static async getLatestUnitEconomics(db: SupabaseClient, companyId: string) {
    const { data, error } = await db
      .from('commercial_unit_economics')
      .select('*')
      .eq('company_id', companyId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      logger.warn({ err: error.message, companyId }, 'Error leyendo unit economics');
      return null;
    }
    return data;
  }
}
