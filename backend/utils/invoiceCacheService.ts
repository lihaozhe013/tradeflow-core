import fs from 'fs';
import path from 'path';
import { prisma } from '@/prismaClient.js';
import decimalCalc from '@/utils/decimalCalculator.js';
import { logger } from '@/utils/logger.js';
import { getDataDir } from '@/utils/paths.js';

const CACHE_FILE_NAME = 'invoice-cache.json';

interface InvoicedRecord {
  invoice_number: string;
  invoice_date: string | null;
  total_amount: number;
  record_count: number;
}

interface InvoiceCacheData {
  [customer_code: string]: {
    invoiced_records: InvoicedRecord[];
    last_updated: string;
  };
}

class InvoiceCacheService {
  private cachePath: string;
  private cache: InvoiceCacheData;

  constructor() {
    this.cachePath = path.join(getDataDir(), CACHE_FILE_NAME);
    this.cache = this.loadCache();
  }

  /**
   * Load cache from file
   */
  private loadCache(): InvoiceCacheData {
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = fs.readFileSync(this.cachePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error(`Failed to load invoice cache: ${error}`);
    }
    return {};
  }

  /**
   * Save cache to file
   */
  private saveCache(): void {
    try {
      fs.writeFileSync(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf-8');
      logger.info('Invoice cache saved successfully');
    } catch (error) {
      logger.error(`Failed to save invoice cache: ${error}`);
      throw error;
    }
  }

  /**
   * Refresh cache for a specific customer (outbound/receivable)
   */
  public async refreshCustomerCache(customer_code: string): Promise<InvoicedRecord[]> {
    try {
      const groups = await prisma.outboundRecord.groupBy({
        by: ['invoice_number'],
        where: {
          customer_code: customer_code,
          invoice_number: { not: null, notIn: [''] }
        },
        _sum: {
          total_price: true
        },
        _min: {
          invoice_date: true
        },
        _count: {
          _all: true
        }
      });

      // Sort in memory or use logic. SQL was ORDER BY MIN(invoice_date) DESC
      // Prisma groupBy allows orderBy since recent versions, but simpler to sort in code if needed or check types.
      // Let's sort in memory to be safe and consistent.
      groups.sort((a, b) => {
        const dateA = a._min.invoice_date || '';
        const dateB = b._min.invoice_date || '';
        return dateB.localeCompare(dateA);
      });

      const invoicedRecords: InvoicedRecord[] = groups.map(g => ({
        invoice_number: g.invoice_number!,
        invoice_date: g._min.invoice_date,
        total_amount: decimalCalc.fromSqlResult(g._sum.total_price || 0, 0),
        record_count: g._count._all
      }));

      this.cache[customer_code] = {
        invoiced_records: invoicedRecords,
        last_updated: new Date().toISOString(),
      };

      this.saveCache();
      return invoicedRecords;

    } catch (err: any) {
      logger.error(`Failed to refresh invoice cache for customer ${customer_code}: ${err.message}`);
      throw err;
    }
  }

  /**
   * Refresh cache for a specific supplier (inbound/payable)
   */
  public async refreshSupplierCache(supplier_code: string): Promise<InvoicedRecord[]> {
    try {
      const groups = await prisma.inboundRecord.groupBy({
        by: ['invoice_number'],
        where: {
          supplier_code: supplier_code,
          invoice_number: { not: null, notIn: [''] }
        },
        _sum: {
          total_price: true
        },
        _min: {
          invoice_date: true
        },
        _count: {
          _all: true
        }
      });

      groups.sort((a, b) => {
        const dateA = a._min.invoice_date || '';
        const dateB = b._min.invoice_date || '';
        return dateB.localeCompare(dateA);
      });

      const invoicedRecords: InvoicedRecord[] = groups.map(g => ({
        invoice_number: g.invoice_number!,
        invoice_date: g._min.invoice_date,
        total_amount: decimalCalc.fromSqlResult(g._sum.total_price || 0, 0),
        record_count: g._count._all
      }));

      this.cache[supplier_code] = {
        invoiced_records: invoicedRecords,
        last_updated: new Date().toISOString(),
      };

      this.saveCache();
      return invoicedRecords;

    } catch (err: any) {
      logger.error(`Failed to refresh invoice cache for supplier ${supplier_code}: ${err.message}`);
      throw err;
    }
  }

  // Helper method removed as distinct implementation is clearer with Prisma types


  /**
   * Get cached invoiced records for a customer
   */
  public getCachedInvoicedRecords(customer_code: string): InvoicedRecord[] | null {
    const customerCache = this.cache[customer_code];
    if (!customerCache) {
      return null;
    }
    return customerCache.invoiced_records;
  }

  /**
   * Get last update time for a customer
   */
  public getLastUpdateTime(customer_code: string): string | null {
    const customerCache = this.cache[customer_code];
    if (!customerCache) {
      return null;
    }
    return customerCache.last_updated;
  }

  /**
   * Clear cache for a specific customer
   */
  public clearCustomerCache(customer_code: string): void {
    delete this.cache[customer_code];
    this.saveCache();
  }

  /**
   * Clear all cache
   */
  public clearAllCache(): void {
    this.cache = {};
    this.saveCache();
  }
}

export default new InvoiceCacheService();
