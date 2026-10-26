import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, CircleAlert, PackageCheck, Plus, RefreshCw, X } from "lucide-react";

type Product = { id: string; sku: string; name: string; unit: string; stockQuantity: string | number; salePrice: string | number };
type Movement = { id: string; productId: string; type: string; quantity: string | number; reason: string; reference?: string | null; createdAt: string };
type Props = { storeId: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || "تعذر تنفيذ الطلب.");
  }
  return response.json() as Promise<T>;
}
const movementLabel: Record<string, string> = { OPENING: "رصيد افتتاحي", PURCHASE: "شراء", SALE: "بيع", SALE_RETURN: "مرتجع بيع", PURCHASE_RETURN: "مرتجع شراء", ADJUSTMENT_IN: "تسوية إضافة", ADJUSTMENT_OUT: "تسوية خصم", DAMAGED: "تالف" };

export default function InventoryPage({ storeId }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filterProductId, setFilterProductId] = useState("");
  const [form, setForm] = useState({ productId: "", direction: "IN" as "IN" | "OUT", quantity: "1", reason: "" });

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  async function loadMovements(productId = filterProductId) {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "100" });
      if (productId) params.set("productId", productId);
      const result = await api<{ movements: Movement[]; pagination: { total: number } }>(`/stores/${encodeURIComponent(storeId)}/stock-movements?${params.toString()}`);
      setMovements(result.movements); setTotal(result.pagination.total);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل حركات المخزون."); }
    finally { setLoading(false); }
  }
  async function loadProducts() {
    setCatalogLoading(true);
    try {
      const result = await api<{ products: Product[] }>(`/stores/${encodeURIComponent(storeId)}/products?page=1&pageSize=100`);
      setProducts(result.products);
      setForm((current) => ({ ...current, productId: result.products.some((p) => p.id === current.productId) ? current.productId : (result.products[0]?.id || "") }));
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل المنتجات."); }
    finally { setCatalogLoading(false); }
  }
  useEffect(() => { void loadProducts(); void loadMovements(""); }, [storeId]);

  async function createAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.productId || !Number.isFinite(Number(form.quantity)) || Number(form.quantity) <= 0 || form.reason.trim().length < 3) {
      setError("اختر المنتج وأدخل كمية موجبة وسببًا واضحًا للتعديل."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ movement: Movement; replayed?: boolean }>(`/stores/${encodeURIComponent(storeId)}/stock-movements`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ productId: form.productId, direction: form.direction, quantity: form.quantity, reason: form.reason.trim() })
      });
      setNotice(result.replayed ? "تم التعرف على حركة المخزون السابقة دون تكرارها." : "تم تسجيل تسوية المخزون وتحديث الكمية بنجاح.");
      setForm((current) => ({ ...current, quantity: "1", reason: "" }));
      setShowForm(false);
      await Promise.all([loadMovements(filterProductId), loadProducts()]);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تسجيل تسوية المخزون."); }
    finally { setBusy(false); }
  }

  return <section className="products-panel">
    <div className="panel-heading"><div><h2>إدارة حركات المخزون</h2><p>عرض سجل الحركات وتسجيل تسويات الكميات مع سجل تدقيق</p></div><div className="sale-actions"><button className="secondary" onClick={() => { void loadMovements(); void loadProducts(); }}><RefreshCw size={16}/> تحديث</button><button className="primary" onClick={() => { setShowForm((current) => !current); setError(""); setNotice(""); }}><Plus size={16}/> تسوية مخزون</button></div></div>
    {error && <div className="alert error"><CircleAlert size={17}/>{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    {showForm && <form className="stock-adjustment-form" onSubmit={createAdjustment}>
      <div className="form-title"><div><h3>تسوية كمية المخزون</h3><p>كل تعديل يسجل حركة مستقلة وسببًا واضحًا في سجل التدقيق.</p></div><button type="button" className="icon-button" aria-label="إغلاق" onClick={() => setShowForm(false)}><X size={16}/></button></div>
      <label>المنتج<select required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} disabled={catalogLoading || products.length === 0}><option value="">اختر المنتج</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku} · المتاح {Number(p.stockQuantity).toLocaleString("ar", { maximumFractionDigits: 3 })}</option>)}</select></label>
      <label>نوع التسوية<select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as "IN" | "OUT" })}><option value="IN">زيادة الكمية</option><option value="OUT">إنقاص الكمية</option></select></label>
      <label>الكمية<input type="number" min="0.001" step="0.001" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })}/></label>
      <label className="adjustment-reason">سبب التعديل *<input required minLength={3} maxLength={500} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="مثال: نتيجة الجرد الفعلي"/></label>
      <div className="form-actions"><button type="button" className="secondary" onClick={() => setShowForm(false)}>إلغاء</button><button className="primary" disabled={busy || catalogLoading || !form.productId}>{busy ? "جارٍ حفظ الحركة…" : "حفظ تسوية المخزون"}</button></div>
      <p className="sale-security-note"><CircleAlert size={14}/> لا يسمح الخادم بإنقاص المخزون إلى قيمة سالبة إلا للمنتجات التي تسمح بذلك، ويتحقق من صلاحيات الدور.</p>
    </form>}
    <div className="table-tools inventory-filter"><label>تصفية حسب المنتج<select value={filterProductId} onChange={(e) => { setFilterProductId(e.target.value); void loadMovements(e.target.value); }}><option value="">كل المنتجات</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label><span>{total.toLocaleString("ar")} حركة</span></div>
    <div className="table-wrap"><table><thead><tr><th>التاريخ</th><th>المنتج</th><th>نوع الحركة</th><th>الكمية</th><th>السبب</th><th>المرجع</th></tr></thead><tbody>
      {movements.map((movement) => { const product = productById.get(movement.productId); const increase = ["OPENING", "PURCHASE", "SALE_RETURN", "ADJUSTMENT_IN"].includes(movement.type); return <tr key={movement.id}><td>{new Date(movement.createdAt).toLocaleString("ar", { dateStyle: "medium", timeStyle: "short" })}</td><td><div className="product-name"><div className="product-thumb">{increase ? <ArrowDownLeft size={17}/> : <ArrowUpRight size={17}/>}</div><div><strong>{product?.name || "منتج"}</strong><small>{product?.sku || movement.productId.slice(0, 10)}</small></div></div></td><td><span className={increase ? "status good" : "status low"}><span/>{movementLabel[movement.type] || movement.type}</span></td><td className={increase ? "movement-in" : "movement-out"}>{increase ? "+" : "−"}{Math.abs(Number(movement.quantity)).toLocaleString("ar", { maximumFractionDigits: 3 })} {product?.unit || ""}</td><td>{movement.reason}</td><td><small>{movement.reference ? movement.reference.slice(0, 12) : "—"}</small></td></tr>; })}
      {!loading && movements.length === 0 && <tr><td colSpan={6}><div className="table-empty"><PackageCheck size={25}/><strong>لا توجد حركات مخزون لعرضها</strong><span>ستظهر هنا المبيعات والتسويات وحركات المخزون المسجلة.</span></div></td></tr>}
      {loading && <tr><td colSpan={6}><div className="table-empty">جارٍ تحميل سجل الحركات…</div></td></tr>}
    </tbody></table></div>
    <div className="panel-foot"><span>عرض آخر 100 حركة. الرصيد الحالي يُقرأ من سجل المنتجات، ولا يُعدّل مباشرة من الجدول.</span><span className="secure-note"><PackageCheck size={15}/> الحركات تُسجل في الخادم</span></div>
  </section>;
}