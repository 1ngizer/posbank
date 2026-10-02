import { AlegraCredentials } from '../types';
import { logger } from '../../../config/logger';

const ALEGRA_BASE_URL = 'https://api.alegra.com/api/v1';

export class AlegraClient {
  private readonly authHeader: string;

  constructor(credentials: AlegraCredentials) {
    const authString = `${credentials.email}:${credentials.token}`;
    this.authHeader = `Basic ${Buffer.from(authString).toString('base64')}`;
  }

  private async request<T = any>(
    path: string,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      body?: any;
    } = {},
  ): Promise<{ status: number; data: T }> {
    const url = `${ALEGRA_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    try {
      const res = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const text = await res.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text };
      }

      if (!res.ok) {
        logger.warn(
          {
            status: res.status,
            path,
            error: data?.message || data?.error || res.statusText,
          },
          'Alegra API error',
        );
      }

      return { status: res.status, data };
    } catch (err: any) {
      logger.error({ path, err: err.message }, 'Alegra HTTP request failed');
      throw new Error(`Error al conectar con Alegra: ${err.message}`);
    }
  }

  /**
   * Verifica que las credenciales sean válidas consultando la empresa.
   */
  async testAuth(): Promise<boolean> {
    const res = await this.request('/company');
    return res.status === 200;
  }

  /**
   * Crea una factura de venta (POST /invoices).
   */
  async createInvoice(payload: Record<string, any>): Promise<any> {
    const res = await this.request('/invoices', {
      method: 'POST',
      body: payload,
    });
    if (res.status >= 200 && res.status < 300) {
      return res.data;
    }
    throw new Error(res.data?.message || `Alegra error ${res.status}`);
  }

  /**
   * Crea una factura de compra / cuenta por pagar (POST /bills).
   */
  async createBill(payload: Record<string, any>): Promise<any> {
    const res = await this.request('/bills', {
      method: 'POST',
      body: payload,
    });
    if (res.status >= 200 && res.status < 300) {
      return res.data;
    }
    throw new Error(res.data?.message || `Alegra error ${res.status}`);
  }

  /**
   * Registra un pago / movimiento de caja (POST /payments).
   */
  async createPayment(payload: Record<string, any>): Promise<any> {
    const res = await this.request('/payments', {
      method: 'POST',
      body: payload,
    });
    if (res.status >= 200 && res.status < 300) {
      return res.data;
    }
    throw new Error(res.data?.message || `Alegra error ${res.status}`);
  }
}
