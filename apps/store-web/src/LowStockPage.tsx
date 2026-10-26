import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CircleAlert, RefreshCw, Search } from "lucide-react";

type LowStockProduct = { id: string; sku: string; barcode: string | null; name: string; unit: string; stockQuantity: string | number; lowStockAt: string | number };
type Props = { storeId: string };

async function api<T>(path: string): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || "تعذر تحميل تقرير المخزون.");
  }
  return response.json() as Promise<T>;
}

export default function LowStockPage({ storeId }: Props) {
  const [products, setProducts] = useState<LowStockProduct[]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(search = appliedQuery) {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (search.trim()) params.set("q", search.trim());
      const result = await api<{ products: LowStockProduct[]; pagination: { total: number } }>(`/stores/${encodeURIComponent(storeId)}/reports/low-stock?${params.toString()}`);
      setProducts(result.products);
      setTotal(result.pagination.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر تحميل تقرير المخزون.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(""); }, [storeId]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedQuery(query.trim());
    void load(query.trim());
  }

  return <section className="products-panel">
    <div className="panel-heading"><div><h2>تنبيهات المخزون المنخفض</h2><p>قائمة من الخادم للمنتجات التي وصلت إلى حد إعادة الطلب أو نزلت عنه</p></div><button className="secondary" onClick={() => void load()}><RefreshCw size={16}/> تحديث</button></div>
    {error && <div className="alert error"><CircleAlert size={17}/>{error}</div>}
    <form className="table-tools low-stock-tools" onSubmit={search}><label className="search-box"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو SKU أو الباركود…"/></label><button className="secondary" type="submit">بحث</button><span>{total.toLocaleString("ar")} منتج يحتاج متابعة</span></form>
    <div className="table-wrap"><table><thead><tr><th>المنتج</th><th>رمز SKU</th><th>المخزون الحالي</th><th>حد التنبيه</th><th>النقص</th><th>الحالة</th></tr></thead><tbody>
      {products.map((product) => { const stock = Number(product.stockQuantity); const threshold = Number(product.lowStockAt); return <tr key={product.id}><td><div className="product-name"><div className="product-thumb warning-thumb"><AlertTriangle size={17}/></div><div><strong>{product.name}</strong><small>{product.barcode || "لا يوجد باركود"}</small></div></div></td><td><code>{product.sku}</code></td><td className="low-stock-quantity">{stock.toLocaleString("ar", { maximumFractionDigits: 3 })} <small>{product.unit}</small></td><td>{threshold.toLocaleString("ar", { maximumFractionDigits: 3 })} <small>{product.unit}</small></td><td>{Math.max(0, threshold - stock).toLocaleString("ar", { maximumFractionDigits: 3 })} <small>{product.unit}</small></td><td><span className="status low"><span/>يحتاج إعادة طلب</span></td></tr>; })}
      {!loading && products.length === 0 && <tr><td colSpan={6}><div className="table-empty"><AlertTriangle size={25}/><strong>{appliedQuery ? "لا توجد نتائج مطابقة" : "لا توجد تنبيهات مخزون حاليًا"}</strong><span>{appliedQuery ? "جرّب كلمة بحث أخرى." : "كل المنتجات المحمّلة أعلى من حد التنبيه المحدد."}</span></div></td></tr>}
      {loading && <tr><td colSpan={6}><div className="table-empty">جارٍ تحميل التنبيهات…</div></td></tr>}
    </tbody></table></div>
    <div className="panel-foot"><span>عرض أول 100 نتيجة من الخادم. لا تتضمن هذه الصفحة عمليات تعديل للمخزون.</span><span className="secure-note"><AlertTriangle size={15}/> البيانات تعتمد على حد التنبيه لكل منتج</span></div>
  </section>;
}