import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CircleAlert, PackagePlus, Plus, Search, Truck, Users, X } from "lucide-react";

type Supplier = { id: string; name: string; phone: string | null; email: string | null; address: string | null; taxNumber: string | null; notes: string | null; isActive: boolean };
type Product = { id: string; sku: string; name: string; unit: string; costPrice: string | number | null; stockQuantity: string | number };
type PurchaseItem = { productId: string; quantity: string; unitCost: string };
type Purchase = { id: string; purchaseNumber: string; totalAmount: string | number; receivedAt: string; supplier: { id: string; name: string }; items: Array<{ id: string; quantity: string | number; unitCost: string | number; lineTotal: string | number; product: { id: string; name: string; sku: string; unit: string } }> };
type Props = { storeId: string; currency: string };
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || "تعذر تنفيذ الطلب.");
  }
  return response.json() as Promise<T>;
}
const money = (value: string | number, currency: string) => `${Number(value).toLocaleString("ar", { maximumFractionDigits: 2 })} ${currency === "YER" ? "ر.ي" : currency}`;

export function SuppliersPage({ storeId }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", taxNumber: "", notes: "" });

  async function load() {
    const result = await api<{ suppliers: Supplier[] }>(`/stores/${encodeURIComponent(storeId)}/suppliers?includeInactive=true&page=1&pageSize=100`);
    setSuppliers(result.suppliers);
  }
  useEffect(() => { setError(""); void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "تعذر تحميل الموردين.")); }, [storeId]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return suppliers.filter((supplier) => [supplier.name, supplier.phone || "", supplier.email || "", supplier.taxNumber || ""].some((value) => value.toLocaleLowerCase().includes(q)));
  }, [suppliers, query]);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await api(`/stores/${encodeURIComponent(storeId)}/suppliers`, { method: "POST", body: JSON.stringify({
        name: form.name.trim(),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
        ...(form.taxNumber.trim() ? { taxNumber: form.taxNumber.trim() } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {})
      }) });
      setForm({ name: "", phone: "", email: "", address: "", taxNumber: "", notes: "" });
      setShowForm(false); setNotice("تمت إضافة المورد بنجاح."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إضافة المورد."); }
    finally { setBusy(false); }
  }

  async function toggleActive(supplier: Supplier) {
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/stores/${encodeURIComponent(storeId)}/suppliers/${encodeURIComponent(supplier.id)}`, {
        method: "PATCH", body: JSON.stringify({ isActive: !supplier.isActive })
      });
      setNotice(supplier.isActive ? "تم تعطيل المورد مع الاحتفاظ بسجلاته." : "تم تفعيل المورد.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحديث المورد."); }
    finally { setBusy(false); }
  }

  return <section className="products-panel">
    <div className="panel-heading"><div><h2>الموردون</h2><p>دليل الموردين وبيانات الاتصال؛ التعطيل لا يحذف السجلات التاريخية</p></div><button className="primary" onClick={() => setShowForm((value) => !value)}><Plus size={17}/> مورد جديد</button></div>
    {error && <div className="alert error"><CircleAlert size={17}/>{error}</div>}{notice && <div className="alert success">{notice}</div>}
    {showForm && <form className="product-form" onSubmit={create}>
      <div className="form-title"><h3>إضافة مورد</h3><button className="icon-button" type="button" aria-label="إغلاق" onClick={() => setShowForm(false)}><X size={16}/></button></div>
      <label>اسم المورد *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={180}/></label>
      <label>رقم الهاتف<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40}/></label>
      <label>البريد الإلكتروني<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={254}/></label>
      <label>الرقم الضريبي<input value={form.taxNumber} onChange={(e) => setForm({ ...form, taxNumber: e.target.value })} maxLength={80}/></label>
      <label>العنوان<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={500}/></label>
      <label>ملاحظات<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000}/></label>
      <div className="form-actions"><button type="button" className="secondary" onClick={() => setShowForm(false)}>إلغاء</button><button className="primary" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ المورد"}</button></div>
    </form>}
    <div className="table-tools"><label className="search-box"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو الهاتف أو البريد أو الرقم الضريبي…"/></label><span>{visible.length.toLocaleString("ar")} مورد</span></div>
    <div className="table-wrap"><table><thead><tr><th>المورد</th><th>بيانات الاتصال</th><th>الرقم الضريبي</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>
      {visible.map((supplier) => <tr key={supplier.id}><td><div className="product-name"><div className="product-thumb"><Truck size={17}/></div><div><strong>{supplier.name}</strong><small>{supplier.address || "لا يوجد عنوان"}</small></div></div></td><td>{supplier.phone || "—"}<small className="contact-sub">{supplier.email || ""}</small></td><td>{supplier.taxNumber || "—"}</td><td><span className={supplier.isActive ? "status good" : "status low"}><span/>{supplier.isActive ? "نشط" : "معطل"}</span></td><td><button className="secondary compact" disabled={busy} onClick={() => void toggleActive(supplier)}>{supplier.isActive ? "تعطيل" : "تفعيل"}</button></td></tr>)}
      {visible.length === 0 && <tr><td colSpan={5}><div className="table-empty"><Users size={25}/><strong>{query ? "لا توجد نتائج مطابقة" : "لا يوجد موردون حتى الآن"}</strong><span>أضف الموردين الذين تتعامل معهم لتسجيل فواتير الشراء.</span></div></td></tr>}
    </tbody></table></div><div className="panel-foot"><span>يعرض أول 100 مورد. يحتفظ النظام بالمورد المعطل لأغراض التدقيق والتاريخ.</span></div>
  </section>;
}

export function PurchasesPage({ storeId, currency }: Props) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ supplierId: "", purchaseNumber: "", notes: "" });
  const [items, setItems] = useState<PurchaseItem[]>([{ productId: "", quantity: "1", unitCost: "" }]);

  async function load() {
    const [purchaseResult, supplierResult, productResult] = await Promise.all([
      api<{ purchases: Purchase[] }>(`/stores/${encodeURIComponent(storeId)}/purchases?page=1&pageSize=100`),
      api<{ suppliers: Supplier[] }>(`/stores/${encodeURIComponent(storeId)}/suppliers?page=1&pageSize=100`),
      api<{ products: Product[] }>(`/stores/${encodeURIComponent(storeId)}/products?page=1&pageSize=100`)
    ]);
    setPurchases(purchaseResult.purchases);
    setSuppliers(supplierResult.suppliers.filter((supplier) => supplier.isActive));
    setProducts(productResult.products);
  }
  useEffect(() => { setError(""); void load().catch((e: unknown) => setError(e instanceof Error ? e.message : "تعذر تحميل المشتريات.")); }, [storeId]);
  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return purchases.filter((purchase) => [purchase.purchaseNumber, purchase.supplier.name].some((value) => value.toLocaleLowerCase().includes(q)));
  }, [purchases, query]);
  const total = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitCost) || 0), 0);

  function updateItem(index: number, patch: Partial<PurchaseItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const key = `purchase-${Date.now()}-${Math.random().toString(36).slice(2, 14)}`;
      await api(`/stores/${encodeURIComponent(storeId)}/purchases`, {
        method: "POST", headers: { "Idempotency-Key": key },
        body: JSON.stringify({
          supplierId: form.supplierId,
          purchaseNumber: form.purchaseNumber.trim(),
          ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
          items: items.map((item) => ({ productId: item.productId, quantity: item.quantity, unitCost: item.unitCost }))
        })
      });
      setForm({ supplierId: "", purchaseNumber: "", notes: "" });
      setItems([{ productId: "", quantity: "1", unitCost: "" }]);
      setShowForm(false); setNotice("تم استلام فاتورة المشتريات وتحديث المخزون بنجاح."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تسجيل المشتريات."); }
    finally { setBusy(false); }
  }

  return <section className="products-panel">
    <div className="panel-heading"><div><h2>المشتريات</h2><p>تسجيل فواتير التوريد واستلام الأصناف مع تحديث المخزون تلقائيًا</p></div><button className="primary" onClick={() => setShowForm((value) => !value)}><Plus size={17}/> فاتورة شراء</button></div>
    {error && <div className="alert error"><CircleAlert size={17}/>{error}</div>}{notice && <div className="alert success">{notice}</div>}
    {showForm && <form className="product-form" onSubmit={create}>
      <div className="form-title"><h3>فاتورة مشتريات جديدة</h3><button className="icon-button" type="button" aria-label="إغلاق" onClick={() => setShowForm(false)}><X size={16}/></button></div>
      <label>المورد *<select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} required><option value="">اختر المورد</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
      <label>رقم الفاتورة *<input value={form.purchaseNumber} onChange={(e) => setForm({ ...form, purchaseNumber: e.target.value })} required maxLength={80} placeholder="PUR-2026-0001"/></label>
      <label>ملاحظات<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000}/></label>
      <div className="form-title"><h3>الأصناف</h3><button className="secondary compact" type="button" onClick={() => setItems((current) => [...current, { productId: "", quantity: "1", unitCost: "" }])}><Plus size={15}/> إضافة صنف</button></div>
      {items.map((item, index) => <div className="purchase-line" key={index}>
        <label>المنتج *<select value={item.productId} onChange={(e) => {
          const product = products.find((entry) => entry.id === e.target.value);
          updateItem(index, { productId: e.target.value, unitCost: product?.costPrice == null ? item.unitCost : String(product.costPrice) });
        }} required><option value="">اختر المنتج</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.sku} (المتاح {Number(product.stockQuantity).toLocaleString("ar")})</option>)}</select></label>
        <label>الكمية *<input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} required/></label>
        <label>تكلفة الوحدة *<input type="number" min="0" step="0.01" value={item.unitCost} onChange={(e) => updateItem(index, { unitCost: e.target.value })} required/></label>
        <div className="purchase-line-total"><span>الإجمالي</span><strong>{money((Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unitCost) || 0)), currency)}</strong>{items.length > 1 && <button type="button" className="text-button" onClick={() => setItems((current) => current.filter((_, i) => i !== index))}>حذف الصنف</button>}</div>
      </div>)}
      <div className="purchase-total"><span>إجمالي الفاتورة (يُحسب مجددًا على الخادم)</span><strong>{money(total, currency)}</strong></div>
      {suppliers.length === 0 && <div className="alert error">أضف موردًا نشطًا قبل تسجيل فاتورة شراء.</div>}
      {products.length === 0 && <div className="alert error">أضف منتجات إلى المتجر قبل تسجيل المشتريات.</div>}
      <div className="form-actions"><button type="button" className="secondary" onClick={() => setShowForm(false)}>إلغاء</button><button className="primary" disabled={busy || suppliers.length === 0 || products.length === 0}>{busy ? "جارٍ استلام الفاتورة…" : "تسجيل واستلام الفاتورة"}</button></div>
      <p className="form-note">تنبيه: الاستلام يتم فور الحفظ، ويزيد المخزون ويحدث تكلفة الشراء. تأكد من المورد والكميات قبل الإرسال.</p>
    </form>}
    <div className="table-tools"><label className="search-box"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث برقم الفاتورة أو المورد…"/></label><span>{visible.length.toLocaleString("ar")} فاتورة</span></div>
    <div className="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>المورد</th><th>الأصناف</th><th>الإجمالي</th><th>تاريخ الاستلام</th><th>الحالة</th></tr></thead><tbody>
      {visible.map((purchase) => <tr key={purchase.id}><td><strong>{purchase.purchaseNumber}</strong></td><td>{purchase.supplier.name}</td><td>{purchase.items.length.toLocaleString("ar")}</td><td className="price-cell">{money(purchase.totalAmount, currency)}</td><td>{new Date(purchase.receivedAt).toLocaleDateString("ar")}</td><td><span className="status good"><span/>مستلمة</span></td></tr>)}
      {visible.length === 0 && <tr><td colSpan={6}><div className="table-empty"><PackagePlus size={25}/><strong>{query ? "لا توجد نتائج مطابقة" : "لا توجد فواتير مشتريات"}</strong><span>سجّل فاتورة شراء لتحديث المخزون.</span></div></td></tr>}
    </tbody></table></div><div className="panel-foot"><span>يعرض أول 100 فاتورة. الاستلام وتحديث المخزون يتمان في معاملة واحدة.</span></div>
  </section>;
}
