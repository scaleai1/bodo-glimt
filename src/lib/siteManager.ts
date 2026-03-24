// ─── Site Manager — Website Data Bridge ────────────────────────────────────────
// Connects to Shopify, WooCommerce, or Custom REST APIs to pull order stats
// and inventory alerts for the AI Analyst Agent.
//
// ⚠️  CORS NOTE: Shopify Admin API blocks browser requests. In production, route
//     calls through the `site-proxy` Supabase Edge Function by setting
//     VITE_USE_SITE_PROXY=true. WooCommerce may also require server-side proxying
//     unless the store has CORS headers configured.
//
// All calls that handle API keys run exclusively inside the runAgentLoop context
// where the key has already been decrypted. Keys are never stored in plaintext.

export type PlatformType = 'shopify' | 'woocommerce' | 'custom';

export interface SiteCredentials {
  apiUrl:   string;        // e.g. https://mystore.myshopify.com
  apiKey:   string;        // decrypted access token / consumer_key:secret
  platform: PlatformType;
}

export interface TopProduct {
  id:      string;
  name:    string;
  revenue: number;
  units:   number;
}

export interface OrderStats {
  revenue:          number;
  orders:           number;
  avgOrderValue:    number;
  conversionRate:   number | null;  // null if not available from this platform
  currency:         string;
  topProducts:      TopProduct[];
  dateRange:        { start: string; end: string };
  platformSource:   PlatformType;
}

export interface InventoryAlert {
  productId:       string;
  productName:     string;
  sku:             string;
  currentStock:    number;
  soldLast30Days:  number;
  alertType:       'low_stock' | 'bestseller' | 'out_of_stock';
  suggestedAction: string;
}

export interface ConnectivityStatus {
  connected:  boolean;
  shopName?:  string;
  platform?:  PlatformType;
  error?:     string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function dateNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function normalizeUrl(url: string): string {
  const u = url.trim();
  return u.startsWith('http') ? u.replace(/\/$/, '') : `https://${u.replace(/\/$/, '')}`;
}

// ─── Shopify Adapter ──────────────────────────────────────────────────────────
// Uses Admin API v2024-01. Requires: read_orders, read_products, read_inventory.

async function shopifyFetch(
  creds: SiteCredentials,
  endpoint: string,
  params?: Record<string, string>,
): Promise<Response> {
  const base = normalizeUrl(creds.apiUrl);
  const qs   = params ? '?' + new URLSearchParams(params).toString() : '';
  const url  = `${base}/admin/api/2024-01/${endpoint}${qs}`;
  return fetch(url, {
    headers: {
      'X-Shopify-Access-Token': creds.apiKey,
      'Content-Type': 'application/json',
    },
  });
}

async function fetchShopifyOrderStats(creds: SiteCredentials, daysBack: number): Promise<OrderStats> {
  const since = dateNDaysAgo(daysBack);
  const res   = await shopifyFetch(creds, 'orders.json', {
    status:           'any',
    financial_status: 'paid',
    created_at_min:   since,
    limit:            '250',
    fields:           'id,total_price,currency,line_items',
  });

  if (!res.ok) throw new Error(`Shopify orders API error: ${res.status} ${res.statusText}`);

  const data = await res.json() as { orders: Array<{
    id: number;
    total_price: string;
    currency: string;
    line_items: Array<{ title: string; product_id: number; quantity: number; price: string }>;
  }> };

  const orders   = data.orders ?? [];
  const revenue  = orders.reduce((s, o) => s + parseFloat(o.total_price || '0'), 0);
  const currency = orders[0]?.currency ?? 'USD';

  // Aggregate by product
  const productMap = new Map<string, { name: string; revenue: number; units: number }>();
  for (const order of orders) {
    for (const item of order.line_items ?? []) {
      const key = String(item.product_id);
      const existing = productMap.get(key) ?? { name: item.title, revenue: 0, units: 0 };
      existing.revenue += parseFloat(item.price || '0') * item.quantity;
      existing.units   += item.quantity;
      productMap.set(key, existing);
    }
  }

  const topProducts: TopProduct[] = Array.from(productMap.entries())
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const now   = new Date();
  const start = new Date(since);

  return {
    revenue,
    orders:        orders.length,
    avgOrderValue: orders.length > 0 ? revenue / orders.length : 0,
    conversionRate: null,
    currency,
    topProducts,
    dateRange: {
      start: start.toISOString().slice(0, 10),
      end:   now.toISOString().slice(0, 10),
    },
    platformSource: 'shopify',
  };
}

async function fetchShopifyInventoryAlerts(creds: SiteCredentials): Promise<InventoryAlert[]> {
  const res = await shopifyFetch(creds, 'products.json', {
    limit:  '250',
    fields: 'id,title,variants',
  });

  if (!res.ok) throw new Error(`Shopify products API error: ${res.status}`);

  const data = await res.json() as { products: Array<{
    id: number;
    title: string;
    variants: Array<{ id: number; sku: string; inventory_quantity: number }>;
  }> };

  const LOW_STOCK_THRESHOLD = 10;
  const alerts: InventoryAlert[] = [];

  for (const product of data.products ?? []) {
    const totalStock = (product.variants ?? []).reduce((s, v) => s + (v.inventory_quantity ?? 0), 0);
    const sku        = product.variants?.[0]?.sku ?? '';

    if (totalStock <= 0) {
      alerts.push({
        productId:       String(product.id),
        productName:     product.title,
        sku,
        currentStock:    0,
        soldLast30Days:  0,
        alertType:       'out_of_stock',
        suggestedAction: `Replenish inventory for "${product.title}" — currently out of stock. Consider pausing ads targeting this product.`,
      });
    } else if (totalStock <= LOW_STOCK_THRESHOLD) {
      alerts.push({
        productId:       String(product.id),
        productName:     product.title,
        sku,
        currentStock:    totalStock,
        soldLast30Days:  0,
        alertType:       'low_stock',
        suggestedAction: `Low stock warning for "${product.title}" (${totalStock} units). Reorder soon or reduce ad spend to avoid overselling.`,
      });
    }
  }

  return alerts;
}

// ─── WooCommerce Adapter ──────────────────────────────────────────────────────
// Uses WC REST API v3. apiKey format: "consumer_key:consumer_secret"

async function wooFetch(
  creds: SiteCredentials,
  endpoint: string,
  params?: Record<string, string>,
): Promise<Response> {
  const base  = normalizeUrl(creds.apiUrl);
  const [ck, cs] = creds.apiKey.split(':');
  const url   = `${base}/wp-json/wc/v3/${endpoint}`;
  const qs    = new URLSearchParams({ consumer_key: ck, consumer_secret: cs, ...params });
  return fetch(`${url}?${qs.toString()}`);
}

async function fetchWooOrderStats(creds: SiteCredentials, daysBack: number): Promise<OrderStats> {
  const after = dateNDaysAgo(daysBack);
  const res   = await wooFetch(creds, 'orders', {
    after,
    status:   'completed',
    per_page: '100',
    fields:   'id,total,currency,line_items,date_created',
  });

  if (!res.ok) throw new Error(`WooCommerce orders API error: ${res.status}`);

  const orders = await res.json() as Array<{
    id: number;
    total: string;
    currency: string;
    line_items: Array<{ product_id: number; name: string; quantity: number; subtotal: string }>;
  }>;

  const revenue  = orders.reduce((s, o) => s + parseFloat(o.total || '0'), 0);
  const currency = orders[0]?.currency ?? 'USD';

  const productMap = new Map<string, { name: string; revenue: number; units: number }>();
  for (const order of orders) {
    for (const item of order.line_items ?? []) {
      const key = String(item.product_id);
      const existing = productMap.get(key) ?? { name: item.name, revenue: 0, units: 0 };
      existing.revenue += parseFloat(item.subtotal || '0');
      existing.units   += item.quantity;
      productMap.set(key, existing);
    }
  }

  const topProducts: TopProduct[] = Array.from(productMap.entries())
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    revenue,
    orders:        orders.length,
    avgOrderValue: orders.length > 0 ? revenue / orders.length : 0,
    conversionRate: null,
    currency,
    topProducts,
    dateRange: {
      start: new Date(dateNDaysAgo(daysBack)).toISOString().slice(0, 10),
      end:   new Date().toISOString().slice(0, 10),
    },
    platformSource: 'woocommerce',
  };
}

async function fetchWooInventoryAlerts(creds: SiteCredentials): Promise<InventoryAlert[]> {
  const res = await wooFetch(creds, 'products', { per_page: '100', stock_status: 'instock,outofstock' });
  if (!res.ok) throw new Error(`WooCommerce products API error: ${res.status}`);

  const products = await res.json() as Array<{
    id: number;
    name: string;
    sku: string;
    stock_quantity: number | null;
    stock_status: string;
    total_sales: number;
  }>;

  const LOW_STOCK_THRESHOLD = 10;
  const alerts: InventoryAlert[] = [];

  for (const p of products) {
    const stock = p.stock_quantity ?? 0;
    if (p.stock_status === 'outofstock' || stock <= 0) {
      alerts.push({
        productId:       String(p.id),
        productName:     p.name,
        sku:             p.sku,
        currentStock:    0,
        soldLast30Days:  p.total_sales,
        alertType:       'out_of_stock',
        suggestedAction: `"${p.name}" is out of stock. Pause ads driving traffic to this product immediately.`,
      });
    } else if (stock <= LOW_STOCK_THRESHOLD) {
      alerts.push({
        productId:       String(p.id),
        productName:     p.name,
        sku:             p.sku,
        currentStock:    stock,
        soldLast30Days:  p.total_sales,
        alertType:       'low_stock',
        suggestedAction: `"${p.name}" has only ${stock} units left. Reduce ad budget or prioritize fast replenishment.`,
      });
    } else if (p.total_sales > 100) {
      alerts.push({
        productId:       String(p.id),
        productName:     p.name,
        sku:             p.sku,
        currentStock:    stock,
        soldLast30Days:  p.total_sales,
        alertType:       'bestseller',
        suggestedAction: `"${p.name}" is a bestseller (${p.total_sales} sales). Increase ad budget and create new creatives.`,
      });
    }
  }

  return alerts;
}

// ─── Custom REST Adapter ──────────────────────────────────────────────────────

async function fetchCustomOrderStats(creds: SiteCredentials, daysBack: number): Promise<OrderStats> {
  const base  = normalizeUrl(creds.apiUrl);
  const since = dateNDaysAgo(daysBack);
  const res   = await fetch(`${base}/api/orders?since=${since}&limit=250`, {
    headers: { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' },
  });

  if (!res.ok) throw new Error(`Custom API error: ${res.status}`);

  const data = await res.json() as {
    orders?: Array<{ id: string; total: number; currency?: string; items?: Array<{ name: string; id: string; revenue: number; qty: number }> }>;
    revenue?: number;
    total_orders?: number;
  };

  if (data.revenue !== undefined) {
    return {
      revenue:        data.revenue,
      orders:         data.total_orders ?? 0,
      avgOrderValue:  data.total_orders ? data.revenue / data.total_orders : 0,
      conversionRate: null,
      currency:       'USD',
      topProducts:    [],
      dateRange:      { start: new Date(since).toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) },
      platformSource: 'custom',
    };
  }

  const orders  = data.orders ?? [];
  const revenue = orders.reduce((s, o) => s + (o.total ?? 0), 0);
  return {
    revenue,
    orders:        orders.length,
    avgOrderValue: orders.length > 0 ? revenue / orders.length : 0,
    conversionRate: null,
    currency:       orders[0]?.currency ?? 'USD',
    topProducts:    [],
    dateRange:      { start: new Date(since).toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) },
    platformSource: 'custom',
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pulls revenue, AOV, orders, and top products for the last N days.
 * Used by the Analyst Agent to correlate website revenue with Meta ad spend.
 */
export async function fetchOrderStats(
  creds:   SiteCredentials,
  daysBack = 30,
): Promise<OrderStats> {
  switch (creds.platform) {
    case 'shopify':     return fetchShopifyOrderStats(creds, daysBack);
    case 'woocommerce': return fetchWooOrderStats(creds, daysBack);
    case 'custom':      return fetchCustomOrderStats(creds, daysBack);
    default:            throw new Error(`Unsupported platform: ${creds.platform}`);
  }
}

/**
 * Returns inventory alerts: low-stock, out-of-stock, and bestseller flags.
 * Provides the Analyst Agent with product-level intelligence for ad decisions.
 */
export async function fetchInventoryAlerts(creds: SiteCredentials): Promise<InventoryAlert[]> {
  switch (creds.platform) {
    case 'shopify':     return fetchShopifyInventoryAlerts(creds);
    case 'woocommerce': return fetchWooInventoryAlerts(creds);
    case 'custom':      return [];  // Custom APIs have no standard inventory endpoint
    default:            throw new Error(`Unsupported platform: ${creds.platform}`);
  }
}

/**
 * Tests connectivity without pulling full data.
 * Calls a lightweight endpoint (shop info / system status).
 */
export async function checkConnectivity(creds: SiteCredentials): Promise<ConnectivityStatus> {
  if (!creds.apiUrl || !creds.apiKey) {
    return { connected: false, error: 'No credentials configured' };
  }

  try {
    switch (creds.platform) {
      case 'shopify': {
        const res = await shopifyFetch(creds, 'shop.json');
        if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
        const data = await res.json() as { shop?: { name: string } };
        return { connected: true, shopName: data.shop?.name, platform: 'shopify' };
      }
      case 'woocommerce': {
        const res = await wooFetch(creds, 'system_status', { fields: 'environment' });
        if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };
        return { connected: true, platform: 'woocommerce' };
      }
      case 'custom': {
        const res = await fetch(normalizeUrl(creds.apiUrl) + '/api/status', {
          headers: { Authorization: `Bearer ${creds.apiKey}` },
        });
        return { connected: res.ok, platform: 'custom', error: res.ok ? undefined : `HTTP ${res.status}` };
      }
      default:
        return { connected: false, error: 'Unknown platform' };
    }
  } catch (err) {
    return { connected: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Validates that the site_api_url domain matches the onboarding website_url domain.
 * Prevents cross-brand API credential injection.
 */
export function domainsMatch(websiteUrl: string, siteApiUrl: string): boolean {
  try {
    const normalize = (url: string) =>
      new URL(url.startsWith('http') ? url : `https://${url}`).hostname
        .replace(/^www\./, '')
        .split('.')
        .slice(-2)
        .join('.');

    const webRoot = normalize(websiteUrl);
    const apiRoot = normalize(siteApiUrl);

    // Also allow mystore.myshopify.com to match mystore.com (Shopify subdomain)
    return webRoot === apiRoot || apiRoot.includes(webRoot.split('.')[0]);
  } catch {
    return false;
  }
}
