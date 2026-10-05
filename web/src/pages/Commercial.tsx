import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { cop } from '../lib/format';
import './Pages.css';
import './Commercial.css';

interface PricingTierResult {
  minQty: number;
  maxQty?: number | null;
  unitCost: number;
  unitPrice: number;
  profitPerUnit: number;
  marginPct: number;
  totalRevenueAtMin: number;
  totalProfitAtMin: number;
  isViable: boolean;
}

interface BreakEvenData {
  fixedCostsMonthly: number;
  calculation: {
    fixedCostsMonthly: number;
    unitPrice: number;
    unitVariableCost: number;
    contributionMarginPerUnit: number;
    contributionMarginRatio: number;
    breakEvenUnits: number;
    breakEvenRevenue: number;
    safetyMarginUnits?: number;
    safetyMarginPct?: number;
    isCoveringFixedCosts: boolean;
  } | null;
}

interface UnitEconomicsData {
  cac: number;
  crc: number;
  ltv: number;
  ltvCacRatio: number;
  cacPaybackMonths: number;
  annualRevenuePerCustomer: number;
  monthlyGrossProfitPerCustomer: number;
  status: 'critical' | 'warning' | 'healthy' | 'underinvested';
  statusMessage: string;
}

interface AcidTestData {
  totalAcquisitionInvestment: number;
  cashDrainPct: number;
  isViable: boolean;
  riskLevel: 'bajo' | 'medio' | 'alto' | 'critico';
  estimatedPostInvestmentCash: number;
  projectedRunwayDays: number;
  diagnostico: string;
  recomendaciones: string[];
  availableCashUsed: number;
  currentRunwayDaysUsed: number;
}

export function Commercial() {
  const [tab, setTab] = useState<'pricing' | 'breakeven' | 'unitecon' | 'acidtest' | 'proposals'>('pricing');
  const [toast, setToast] = useState<string | null>(null);

  // 1. Tab Pricing
  const [baseCost, setBaseCost] = useState('45000');
  const [targetMargin, setTargetMargin] = useState('40');
  const [t1Discount, setT1Discount] = useState('0');
  const [t2Discount, setT2Discount] = useState('5');
  const [t3Discount, setT3Discount] = useState('12');
  const [t4Discount, setT4Discount] = useState('20');
  const [pricingTiers, setPricingTiers] = useState<PricingTierResult[]>([]);
  const [proposalClient, setProposalClient] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');

  // 2. Tab Break-Even
  const [beData, setBeData] = useState<BreakEvenData | null>(null);
  const [bePrice, setBePrice] = useState('75000');
  const [beCost, setBeCost] = useState('45000');
  const [beUnitsProj, setBeUnitsProj] = useState('250');

  // 3. Tab Unit Economics
  const [acqSpend, setAcqSpend] = useState('3000000');
  const [newCust, setNewCust] = useState('25');
  const [retSpend, setRetSpend] = useState('500000');
  const [actCust, setActCust] = useState('60');
  const [avgTicket, setAvgTicket] = useState('150000');
  const [purchaseFreq, setPurchaseFreq] = useState('4');
  const [lifespanYears, setLifespanYears] = useState('2');
  const [grossMargin, setGrossMargin] = useState('38');
  const [ueResult, setUeResult] = useState<UnitEconomicsData | null>(null);

  // 4. Tab Acid Test
  const [targetNewCust, setTargetNewCust] = useState('50');
  const [acidCac, setAcidCac] = useState('120000');
  const [acidPayback, setAcidPayback] = useState('4');
  const [collectionDays, setCollectionDays] = useState('30');
  const [acidResult, setAcidResult] = useState<AcidTestData | null>(null);

  // 5. Tab Proposals
  const [proposals, setProposals] = useState<any[]>([]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  // Simular pricing en vivo
  async function computePricing() {
    try {
      const res = await api<{ tiers: PricingTierResult[] }>('/commercial/simulate-pricing', {
        method: 'POST',
        body: {
          baseCost: Number(baseCost),
          targetMarginPct: Number(targetMargin),
          tiers: [
            { minQty: 1, maxQty: 10, volumeDiscountPct: Number(t1Discount) },
            { minQty: 11, maxQty: 50, volumeDiscountPct: Number(t2Discount) },
            { minQty: 51, maxQty: 200, volumeDiscountPct: Number(t3Discount) },
            { minQty: 201, maxQty: null, volumeDiscountPct: Number(t4Discount) },
          ],
        },
      });
      setPricingTiers(res.tiers ?? []);
    } catch {
      /* ignore */
    }
  }

  // Cargar punto de equilibrio con compromisos fijos
  async function loadBreakEven() {
    try {
      const res = await api<BreakEvenData>(
        `/commercial/break-even?unitPrice=${bePrice}&unitVariableCost=${beCost}&projectedSalesUnits=${beUnitsProj}`,
      );
      setBeData(res);
    } catch {
      /* ignore */
    }
  }

  // Calcular unit economics
  async function computeUnitEconomics() {
    try {
      const res = await api<UnitEconomicsData>('/commercial/simulate-unit-economics', {
        method: 'POST',
        body: {
          acquisitionSpend: Number(acqSpend),
          newCustomers: Number(newCust),
          retentionSpend: Number(retSpend),
          activeCustomers: Number(actCust),
          avgTicket: Number(avgTicket),
          annualPurchaseFrequency: Number(purchaseFreq),
          customerLifespanYears: Number(lifespanYears),
          grossMarginPct: Number(grossMargin),
        },
      });
      setUeResult(res);
    } catch {
      /* ignore */
    }
  }

  // Ejecutar prueba ácida de crecimiento
  async function runAcidTest() {
    try {
      const res = await api<AcidTestData>('/commercial/growth-acid-test', {
        method: 'POST',
        body: {
          targetNewCustomers: Number(targetNewCust),
          estimatedCac: Number(acidCac),
          cacPaybackMonths: Number(acidPayback),
          daysToCollectReceivables: Number(collectionDays),
        },
      });
      setAcidResult(res);
    } catch {
      /* ignore */
    }
  }

  // Cargar propuestas guardadas
  async function loadProposals() {
    try {
      const res = await api<any[]>('/commercial/proposals');
      setProposals(res ?? []);
    } catch {
      /* ignore */
    }
  }

  // Guardar propuesta de pricing
  async function handleSaveProposal(e: FormEvent) {
    e.preventDefault();
    if (!proposalTitle.trim() || !proposalClient.trim()) {
      flash('Completa el título y cliente para guardar la propuesta');
      return;
    }
    try {
      await api('/commercial/proposals', {
        method: 'POST',
        body: {
          title: proposalTitle.trim(),
          clientName: proposalClient.trim(),
          baseCost: Number(baseCost),
          targetMarginPct: Number(targetMargin),
          tiers: pricingTiers,
          status: 'sent',
        },
      });
      flash('Propuesta comercial guardada');
      setProposalTitle('');
      setProposalClient('');
      await loadProposals();
    } catch (err: any) {
      flash(err.message || 'Error al guardar');
    }
  }

  // Cambiar el estado de una propuesta (borrador, enviada, aceptada, rechazada)
  async function handleProposalStatus(id: string, status: string) {
    try {
      await api(`/commercial/proposals/${id}/status`, { method: 'PATCH', body: { status } });
      setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
      flash('Estado actualizado');
    } catch (err: any) {
      flash(err.message || 'No se pudo cambiar el estado');
    }
  }

  useEffect(() => {
    void computePricing();
    void loadBreakEven();
    void computeUnitEconomics();
    void runAcidTest();
    void loadProposals();
  }, []);

  return (
    <div className="page">
      <h1>Radar Comercial & Pricing</h1>
      <p className="sub">
        Estrategia de precios por volumen, punto de equilibrio y prueba ácida de adquisición de clientes (CAC / LTV).
      </p>

      {toast && <div className="toast">✓ {toast}</div>}

      <div className="commercial-nav">
        <button className={tab === 'pricing' ? 'active' : ''} onClick={() => setTab('pricing')}>
          Pricing & Escalas
        </button>
        <button className={tab === 'breakeven' ? 'active' : ''} onClick={() => setTab('breakeven')}>
          Punto de Equilibrio
        </button>
        <button className={tab === 'unitecon' ? 'active' : ''} onClick={() => setTab('unitecon')}>
          Unit Economics (CAC & LTV)
        </button>
        <button className={tab === 'acidtest' ? 'active' : ''} onClick={() => setTab('acidtest')}>
          Prueba Ácida de Crecimiento
        </button>
        <button className={tab === 'proposals' ? 'active' : ''} onClick={() => setTab('proposals')}>
          Propuestas Guardadas ({proposals.length})
        </button>
      </div>

      {/* ──────────────── TAB 1: PRICING ──────────────── */}
      {tab === 'pricing' && (
        <div>
          <div className="panel">
            <div className="card form-card">
              <h3>Simulador de Escalas de Pricing</h3>
              <div className="field">
                <label>Costo Base Unitario (COP)</label>
                <input
                  type="number"
                  value={baseCost}
                  onChange={(e) => { setBaseCost(e.target.value); }}
                />
              </div>
              <div className="field">
                <label>Margen Objetivo Deseado (%)</label>
                <input
                  type="number"
                  min={5}
                  max={95}
                  value={targetMargin}
                  onChange={(e) => { setTargetMargin(e.target.value); }}
                />
              </div>

              <h4 style={{ margin: '14px 0 8px 0', fontSize: '.95rem' }}>Descuentos por Escala al Cliente</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>1 – 10 uds (% desc)</label>
                  <input type="number" min={0} max={50} value={t1Discount} onChange={(e) => setT1Discount(e.target.value)} />
                </div>
                <div className="field">
                  <label>11 – 50 uds (% desc)</label>
                  <input type="number" min={0} max={50} value={t2Discount} onChange={(e) => setT2Discount(e.target.value)} />
                </div>
                <div className="field">
                  <label>51 – 200 uds (% desc)</label>
                  <input type="number" min={0} max={50} value={t3Discount} onChange={(e) => setT3Discount(e.target.value)} />
                </div>
                <div className="field">
                  <label>201+ uds (% desc)</label>
                  <input type="number" min={0} max={50} value={t4Discount} onChange={(e) => setT4Discount(e.target.value)} />
                </div>
              </div>

              <button className="btn btn-secondary" style={{ width: '100%', marginTop: 8 }} onClick={computePricing}>
                Recalcular Escalas
              </button>
            </div>

            <div className="card">
              <h3>Propuesta Estructurada de Precios</h3>
              <p className="sub" style={{ fontSize: '.84rem' }}>
                Garantiza que ningún volumen comprometa el umbral de rentabilidad.
              </p>

              <div style={{ overflowX: 'auto' }}>
                <table className="pricing-table">
                  <thead>
                    <tr>
                      <th>Escala</th>
                      <th>Precio Unitario</th>
                      <th>Utilidad/Ud</th>
                      <th>Margen %</th>
                      <th>Facturación Mín</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricingTiers.map((t, idx) => (
                      <tr key={idx}>
                        <td>
                          <strong>{t.minQty} {t.maxQty ? `– ${t.maxQty}` : '+'} uds</strong>
                        </td>
                        <td className="num">{cop(t.unitPrice)}</td>
                        <td className="num" style={{ color: t.isViable ? 'var(--green)' : '#ef4444' }}>
                          {cop(t.profitPerUnit)}
                        </td>
                        <td>
                          <span className={`health-badge ${t.isViable ? 'healthy' : 'critical'}`}>
                            {t.marginPct}%
                          </span>
                        </td>
                        <td className="num">{cop(t.totalRevenueAtMin)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form onSubmit={handleSaveProposal} style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <h4>Guardar como propuesta para cliente</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                  <div className="field">
                    <label>Título de la propuesta</label>
                    <input placeholder="Ej: Propuesta Café Especial 2026" value={proposalTitle} onChange={(e) => setProposalTitle(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Nombre del cliente</label>
                    <input placeholder="Ej: Distribuidora El Poblado" value={proposalClient} onChange={(e) => setProposalClient(e.target.value)} />
                  </div>
                </div>
                <button className="btn btn-primary" type="submit" style={{ marginTop: 10 }}>
                  Guardar Propuesta
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB 2: BREAK-EVEN ──────────────── */}
      {tab === 'breakeven' && (
        <div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-title">Costos Fijos del Mes</div>
              <div className="kpi-value">{cop(beData?.fixedCostsMonthly ?? 0)}</div>
              <div className="kpi-sub">Alimentado de fixed_commitments</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-title">Punto de Equilibrio (Uds)</div>
              <div className="kpi-value" style={{ color: 'var(--green)' }}>
                {beData?.calculation?.breakEvenUnits === Infinity ? 'Inviable' : `${beData?.calculation?.breakEvenUnits ?? 0} uds`}
              </div>
              <div className="kpi-sub">Ventas mínimas para no perder</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-title">Facturación Mínima Requerida</div>
              <div className="kpi-value">{cop(beData?.calculation?.breakEvenRevenue ?? 0)}</div>
              <div className="kpi-sub">Ventas en COP necesarias</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-title">Margen Contribución / Ud</div>
              <div className="kpi-value">{cop(beData?.calculation?.contributionMarginPerUnit ?? 0)}</div>
              <div className="kpi-sub">{Math.round((beData?.calculation?.contributionMarginRatio ?? 0) * 100)}% del precio</div>
            </div>
          </div>

          <div className="card form-card" style={{ maxWidth: 640 }}>
            <h3>Simular Punto de Equilibrio</h3>
            <div className="field">
              <label>Precio de Venta Unitario (COP)</label>
              <input type="number" value={bePrice} onChange={(e) => setBePrice(e.target.value)} />
            </div>
            <div className="field">
              <label>Costo Variable Unitario (COP)</label>
              <input type="number" value={beCost} onChange={(e) => setBeCost(e.target.value)} />
            </div>
            <div className="field">
              <label>Ventas Proyectadas (Unidades)</label>
              <input type="number" value={beUnitsProj} onChange={(e) => setBeUnitsProj(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={loadBreakEven} style={{ width: '100%', marginTop: 8 }}>
              Calcular Punto de Equilibrio
            </button>
          </div>
        </div>
      )}

      {/* ──────────────── TAB 3: UNIT ECONOMICS ──────────────── */}
      {tab === 'unitecon' && (
        <div>
          {ueResult && (
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-title">Costo Adquisición (CAC)</div>
                <div className="kpi-value">{cop(ueResult.cac)}</div>
                <div className="kpi-sub">Costo de captar cada cliente</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-title">Customer Lifetime Value (LTV)</div>
                <div className="kpi-value" style={{ color: 'var(--green)' }}>{cop(ueResult.ltv)}</div>
                <div className="kpi-sub">Utilidad neta generada en vida</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-title">Ratio LTV / CAC</div>
                <div className="kpi-value">{ueResult.ltvCacRatio}x</div>
                <span className={`health-badge ${ueResult.status}`} style={{ marginTop: 4 }}>
                  {ueResult.status === 'healthy' ? 'Saludable' : ueResult.status === 'critical' ? 'Crítico' : 'Revisar'}
                </span>
              </div>
              <div className="kpi-card">
                <div className="kpi-title">Recuperación CAC (Payback)</div>
                <div className="kpi-value">{ueResult.cacPaybackMonths} meses</div>
                <div className="kpi-sub">Tiempo para devolver la pauta</div>
              </div>
            </div>
          )}

          <div className="card form-card" style={{ maxWidth: 680 }}>
            <h3>Calculadora de Unit Economics</h3>
            <p className="sub" style={{ fontSize: '.84rem' }}>{ueResult?.statusMessage}</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>Gasto mensual en Pauta / Ventas (COP)</label>
                <input type="number" value={acqSpend} onChange={(e) => setAcqSpend(e.target.value)} />
              </div>
              <div className="field">
                <label>Nuevos clientes captados en el mes</label>
                <input type="number" value={newCust} onChange={(e) => setNewCust(e.target.value)} />
              </div>
              <div className="field">
                <label>Ticket promedio de compra (COP)</label>
                <input type="number" value={avgTicket} onChange={(e) => setAvgTicket(e.target.value)} />
              </div>
              <div className="field">
                <label>Frecuencia de compra anual (veces/año)</label>
                <input type="number" value={purchaseFreq} onChange={(e) => setPurchaseFreq(e.target.value)} />
              </div>
              <div className="field">
                <label>Años de vida del cliente (retención)</label>
                <input type="number" value={lifespanYears} onChange={(e) => setLifespanYears(e.target.value)} />
              </div>
              <div className="field">
                <label>Margen bruto del negocio (%)</label>
                <input type="number" value={grossMargin} onChange={(e) => setGrossMargin(e.target.value)} />
              </div>
              <div className="field">
                <label>Gasto mensual en Fidelización/Retención (COP)</label>
                <input type="number" value={retSpend} onChange={(e) => setRetSpend(e.target.value)} />
              </div>
              <div className="field">
                <label>Total de clientes activos en la base</label>
                <input type="number" value={actCust} onChange={(e) => setActCust(e.target.value)} />
              </div>
            </div>

            <button className="btn btn-primary" onClick={computeUnitEconomics} style={{ width: '100%', marginTop: 12 }}>
              Calcular CAC y LTV
            </button>
          </div>
        </div>
      )}

      {/* ──────────────── TAB 4: PRUEBA ÁCIDA ──────────────── */}
      {tab === 'acidtest' && (
        <div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-title">Caja Líquida PosBank</div>
              <div className="kpi-value">{cop(acidResult?.availableCashUsed ?? 0)}</div>
              <div className="kpi-sub">{acidResult?.currentRunwayDaysUsed} días de runway actual</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-title">Inversión Requerida en CAC</div>
              <div className="kpi-value" style={{ color: '#ef4444' }}>
                {cop(acidResult?.totalAcquisitionInvestment ?? 0)}
              </div>
              <div className="kpi-sub">{acidResult?.cashDrainPct}% de la caja total</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-title">Runway Restante Post-Inversión</div>
              <div className="kpi-value">{acidResult?.projectedRunwayDays} días</div>
              <div className="kpi-sub">Caja disponible: {cop(acidResult?.estimatedPostInvestmentCash ?? 0)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-title">Diagnóstico de Viabilidad</div>
              <div className="kpi-value">
                <span className={`health-badge ${acidResult?.isViable ? 'healthy' : 'critical'}`}>
                  {acidResult?.isViable ? 'Viable' : 'Riesgo Crítico'}
                </span>
              </div>
              <div className="kpi-sub">Nivel de riesgo: {acidResult?.riskLevel}</div>
            </div>
          </div>

          <div className="card">
            <h3>{acidResult?.diagnostico}</h3>

            {acidResult?.recomendaciones && acidResult.recomendaciones.length > 0 && (
              <div className="recommendations-box">
                <strong>Recomendaciones Tácticas para la Pyme:</strong>
                <ul>
                  {acidResult.recomendaciones.map((rec, i) => (
                    <li key={i}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ marginTop: 22, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <h4>Parámetros del Roadmap Comercial</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                <div className="field">
                  <label>Clientes nuevos objetivo en el plan</label>
                  <input type="number" value={targetNewCust} onChange={(e) => setTargetNewCust(e.target.value)} />
                </div>
                <div className="field">
                  <label>CAC estimado por cliente (COP)</label>
                  <input type="number" value={acidCac} onChange={(e) => setAcidCac(e.target.value)} />
                </div>
                <div className="field">
                  <label>Meses de Payback estimados</label>
                  <input type="number" value={acidPayback} onChange={(e) => setAcidPayback(e.target.value)} />
                </div>
                <div className="field">
                  <label>Días promedio de cobro de cartera</label>
                  <input type="number" value={collectionDays} onChange={(e) => setCollectionDays(e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={runAcidTest} style={{ marginTop: 10 }}>
                Simular Prueba Ácida
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── TAB 5: PROPUESTAS GUARDADAS ──────────────── */}
      {tab === 'proposals' && (
        <div className="card">
          <h3>Propuestas Comerciales Guardadas</h3>
          {proposals.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontStyle: 'italic', margin: '14px 0' }}>
              No has guardado propuestas comerciales aún. Configura tus escalas en la pestaña "Pricing & Escalas".
            </p>
          ) : (
            <div style={{ overflowX: 'auto', marginTop: 14 }}>
              <table className="pricing-table">
                <thead>
                  <tr>
                    <th>Título</th>
                    <th>Cliente</th>
                    <th>Costo Base</th>
                    <th>Margen %</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.title}</strong></td>
                      <td>{p.client_name}</td>
                      <td className="num">{cop(p.base_cost)}</td>
                      <td>{p.target_margin_pct}%</td>
                      <td>
                        <select
                          aria-label={`Estado de la propuesta ${p.title}`}
                          value={p.status}
                          onChange={(e) => void handleProposalStatus(p.id, e.target.value)}
                        >
                          <option value="draft">Borrador</option>
                          <option value="sent">Enviada</option>
                          <option value="accepted">Aceptada</option>
                          <option value="rejected">Rechazada</option>
                        </select>
                      </td>
                      <td>{new Date(p.created_at).toLocaleDateString('es-CO')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
