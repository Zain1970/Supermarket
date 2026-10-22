import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, CircleAlert, Plus, Receipt, RefreshCw, ShoppingCart, Trash2, X } from "lucide-react";

type Sale = { id: string; invoiceNumber: string; status: string; paymentStatus: string; totalAmount: string | number; paidAmount: string | number; balanceDue: string | number; paymentMethod: string; createdAt: string; customer?: { name: string; phone?: string | null } | null; _count: { items: number } };
type Product = { id: string; sku: string; name: string; unit: string; salePrice: string | number; stockQuantity: string | number; status: string };
type Customer = { id: string; name: string; phone?: string | null; creditLimit: string | number; creditBalance: string | number };
type CartLine = { productId: string; quantity: string };
type SaleItem = { id: string; productName: string; sku: string; quantity: string | number; unitPrice: string | number; lineTotal: string | number };
type SaleDetail = { id: string; invoiceNumber: string; status: string; items: SaleItem[] };
type Props = { storeId: string; currency: string; canReturn: boolean };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || "تعذر تنفيذ الطلب.");
  }
  return response.json() as Promise<T>;
}
const money = (v: string | number, currency: string) => `${Number(v).toLocaleString("ar", { maximumFractionDigits: 2 })} ${currency === "YER" ? "ر.ي" : currency}`;
const paymentLabel: Record<string, string> = { PAID: "مدفوعة", PARTIAL: "مدفوعة جزئيًا", UNPAID: "غير مدفوعة" };
const methodLabel: Record<string, string> = { CASH: "نقدًا", CARD: "بطاقة", TRANSFER: "تحويل", CREDIT: "آجل" };

export default function SalesPage({ storeId, currency, canReturn }: Props) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "TRANSFER" | "CREDIT">("CASH");
  const [discountAmount, setDiscountAmount] = useState("0");
  const [paidAmount, setPaidAmount] = useState("");
  const [note, setNote] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [returnSale, setReturnSale] = useState<SaleDetail | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<string, string>>({});
  const [returnReason, setReturnReason] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [returnBusy, setReturnBusy] = useState(false);
  const [paymentSale, setPaymentSale] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "TRANSFER">("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentBusy, setPaymentBusy] = useState(false);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + Number(productById.get(line.productId)?.salePrice || 0) * Number(line.quantity), 0), [cart, productById]);
  const total = Math.max(0, Math.round((subtotal - Number(discountAmount || 0) + Number.EPSILON) * 100) / 100);
  const selectedProduct = productById.get(productId);

  async function loadSales() {
    setLoading(true); setError("");
    try {
      const result = await api<{ sales: Sale[] }>(`/stores/${encodeURIComponent(storeId)}/sales?page=1&pageSize=100`);
      setSales(result.sales);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل المبيعات."); }
    finally { setLoading(false); }
  }
  async function loadCatalog() {
    setCatalogLoading(true);
    try {
      const [productResult, customerResult] = await Promise.all([
        api<{ products: Product[] }>(`/stores/${encodeURIComponent(storeId)}/products?page=1&pageSize=100`),
        api<{ customers: Customer[] }>(`/stores/${encodeURIComponent(storeId)}/customers?page=1&pageSize=100`)
      ]);
      setProducts(productResult.products);
      setCustomers(customerResult.customers);
      setProductId((current) => productResult.products.some((p) => p.id === current) ? current : (productResult.products[0]?.id || ""));
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل المنتجات والعملاء."); }
    finally { setCatalogLoading(false); }
  }
  useEffect(() => { void loadSales(); void loadCatalog(); }, [storeId]);

  function addToCart() {
    if (!selectedProduct || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return;
    setCart((current) => {
      const existing = current.find((line) => line.productId === selectedProduct.id);
      return existing
        ? current.map((line) => line.productId === selectedProduct.id ? { ...line, quantity: String(Number(line.quantity) + Number(quantity)) } : line)
        : [...current, { productId: selectedProduct.id, quantity }];
    });
    setQuantity("1");
    setError("");
  }
  function resetSale() {
    setCart([]); setCustomerId(""); setPaymentMethod("CASH"); setDiscountAmount("0"); setPaidAmount(""); setNote("");
  }
  function openPayment(sale: Sale) {
    setReturnSale(null); setPaymentSale(sale); setPaymentAmount(String(sale.balanceDue));
    setPaymentMethod("CASH"); setPaymentReference(""); setError(""); setNotice("");
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!paymentSale) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(paymentSale.balanceDue)) {
      setError("أدخل مبلغًا موجبًا لا يتجاوز الرصيد المتبقي على الفاتورة."); return;
    }
    setPaymentBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ sale?: { invoiceNumber: string; balanceDue: string | number; paymentStatus: string }; replayed?: boolean }>("/stores/" + encodeURIComponent(storeId) + "/sales/" + encodeURIComponent(paymentSale.id) + "/payments", {
        method: "POST", headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ amount: paymentAmount, method: paymentMethod, ...(paymentReference.trim() ? { reference: paymentReference.trim() } : {}) })
      });
      setNotice("تم تسجيل الدفعة للفاتورة " + paymentSale.invoiceNumber + (result.sale ? "؛ المتبقي " + money(result.sale.balanceDue, currency) + "." : "."));
      setPaymentSale(null); setPaymentAmount(""); setPaymentReference("");
      await Promise.all([loadSales(), loadCatalog()]);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تسجيل الدفعة."); }
    finally { setPaymentBusy(false); }
  }
  async function openReturn(saleId: string) {
    setPaymentSale(null);
    setError(""); setNotice("");
    try {
      const result = await api<{ sale: SaleDetail }>("/stores/" + encodeURIComponent(storeId) + "/sales/" + encodeURIComponent(saleId));
      setReturnSale(result.sale);
      setReturnQuantities(Object.fromEntries(result.sale.items.map((item) => [item.id, "0"])));
      setReturnReason(""); setReturnNote("");
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل تفاصيل الفاتورة."); }
  }

  async function createReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!returnSale) return;
    const items = returnSale.items.filter((item) => Number(returnQuantities[item.id]) > 0).map((item) => ({ saleItemId: item.id, quantity: returnQuantities[item.id] }));
    if (!items.length || returnReason.trim().length < 3) { setError("اختر كمية مرتجعة واحدة على الأقل وأدخل سببًا واضحًا."); return; }
    setReturnBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{ saleReturn: { returnNumber: string; totalAmount: string | number }; replayed?: boolean }>("/stores/" + encodeURIComponent(storeId) + "/sales/" + encodeURIComponent(returnSale.id) + "/returns", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ reason: returnReason.trim(), ...(returnNote.trim() ? { note: returnNote.trim() } : {}), items })
      });
      setNotice("تم تسجيل المرتجع " + result.saleReturn.returnNumber + " بقيمة " + money(result.saleReturn.totalAmount, currency) + " وإعادة الكميات إلى المخزون. لا يتضمن ذلك ردًا نقديًا.");
      setReturnSale(null); setReturnQuantities({}); setReturnReason(""); setReturnNote("");
      await Promise.all([loadSales(), loadCatalog()]);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تسجيل المرتجع."); }
    finally { setReturnBusy(false); }
  }

  async function createSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.length) { setError("أضف منتجًا واحدًا على الأقل إلى الفاتورة."); return; }
    if (Number(discountAmount) < 0 || Number(discountAmount) > subtotal) { setError("تحقق من قيمة الخصم؛ يجب ألا يتجاوز المجموع."); return; }
    if (paymentMethod === "CREDIT" && !customerId) { setError("اختر عميلًا لتسجيل البيع الآجل."); return; }
    if (paidAmount.trim() && paymentMethod !== "CREDIT" && Number(paidAmount) > total) { setError("المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = {
        ...(customerId ? { customerId } : {}),
        discountAmount: String(Number(discountAmount || 0).toFixed(2)),
        paymentMethod,
        ...(paidAmount.trim() && paymentMethod !== "CREDIT" ? { paidAmount: paidAmount.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity }))
      };
      const result = await api<{ sale: Sale; replayed?: boolean }>(`/stores/${encodeURIComponent(storeId)}/sales`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify(payload)
      });
      setNotice(`تم تسجيل الفاتورة ${result.sale.invoiceNumber} بنجاح. الإجمالي: ${money(result.sale.totalAmount, currency)}.`);
      resetSale(); setShowSaleForm(false);
      await Promise.all([loadSales(), loadCatalog()]);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تسجيل البيع."); }
    finally { setBusy(false); }
  }

  return <section className="products-panel">
    <div className="panel-heading"><div><h2>المبيعات والفواتير</h2><p>تسجيل بيع وتحديث المخزون عبر معاملة الخادم الآمنة</p></div><div className="sale-actions"><button className="secondary" onClick={() => { void loadSales(); void loadCatalog(); }}><RefreshCw size={16}/> تحديث</button><button className="primary" onClick={() => { setShowSaleForm((v) => !v); setError(""); setNotice(""); }} disabled={catalogLoading}><ShoppingCart size={16}/> بيع جديد</button></div></div>
    {error && <div className="alert error"><CircleAlert size={17}/>{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    {paymentSale && <form className="sale-form payment-form" onSubmit={createPayment}>
      <div className="form-title sale-form-title"><div><h3>تسجيل دفعة · {paymentSale.invoiceNumber}</h3><p>المتبقي على الفاتورة: {money(paymentSale.balanceDue, currency)}. سيتم تحديث حالة التحصيل ورصيد العميل في الخادم.</p></div><button type="button" className="icon-button" aria-label="إغلاق نموذج السداد" onClick={() => setPaymentSale(null)}><X size={16}/></button></div>
      <div className="sale-details-grid"><label>مبلغ السداد *<input type="number" required min="0.01" max={Number(paymentSale.balanceDue)} step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}/></label><label>وسيلة السداد<select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}><option value="CASH">نقدًا</option><option value="CARD">بطاقة</option><option value="TRANSFER">تحويل</option></select></label><label className="sale-note">مرجع العملية (اختياري)<input maxLength={180} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="رقم إيصال أو مرجع التحويل"/></label></div>
      <div className="form-actions sale-form-actions"><button type="button" className="secondary" onClick={() => setPaymentSale(null)}>إلغاء</button><button className="primary" disabled={paymentBusy}>{paymentBusy ? "جارٍ تسجيل الدفعة…" : "تأكيد السداد"}</button></div>
    </form>}
    {returnSale && canReturn && <form className="sale-form return-form" onSubmit={createReturn}>
      <div className="form-title sale-form-title"><div><h3>مرتجع مخزني · {returnSale.invoiceNumber}</h3><p>يُعاد المخزون فقط. لا تُنفّذ هذه العملية استردادًا نقديًا أو تعديلًا على الدفعات.</p></div><button type="button" className="icon-button" aria-label="إغلاق نموذج المرتجع" onClick={() => setReturnSale(null)}><X size={16}/></button></div>
      <div className="table-wrap"><table><thead><tr><th>الصنف المباع</th><th>الكمية المباعة</th><th>سعر الوحدة</th><th>كمية المرتجع</th></tr></thead><tbody>
        {returnSale.items.map((item) => <tr key={item.id}><td><strong>{item.productName}</strong><small className="contact-sub">{item.sku}</small></td><td>{Number(item.quantity).toLocaleString("ar", { maximumFractionDigits: 3 })}</td><td>{money(item.unitPrice, currency)}</td><td><input className="cart-quantity" aria-label={"كمية المرتجع من " + item.productName} type="number" min="0" max={Number(item.quantity)} step="0.001" value={returnQuantities[item.id] || "0"} onChange={(e) => setReturnQuantities((current) => ({ ...current, [item.id]: e.target.value }))}/></td></tr>)}
      </tbody></table></div>
      <div className="sale-details-grid"><label>سبب المرتجع *<input required minLength={3} maxLength={500} value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="مثال: منتج تالف أو كمية زائدة"/></label><label>ملاحظة إضافية<input maxLength={1000} value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder="اختياري"/></label></div>
      <div className="form-actions sale-form-actions"><button type="button" className="secondary" onClick={() => setReturnSale(null)}>إلغاء</button><button className="primary" disabled={returnBusy}>{returnBusy ? "جارٍ تسجيل المرتجع…" : "تأكيد المرتجع وإعادة المخزون"}</button></div>
      <p className="sale-security-note"><AlertTriangle size={14}/> يرفض الخادم تجاوز الكمية المتبقية بعد المرتجعات السابقة ويسجل الحركة والتدقيق ضمن معاملة واحدة.</p>
    </form>}
    {showSaleForm && <form className="sale-form" onSubmit={createSale}>
      <div className="form-title sale-form-title"><div><h3>فاتورة بيع جديدة</h3><p>يُعاد احتساب الأسعار والمخزون وحد الائتمان في الخادم قبل الحفظ.</p></div><span>{catalogLoading ? "جارٍ تحميل البيانات…" : `${products.length.toLocaleString("ar")} منتج متاح`}</span></div>
      <div className="sale-add-row">
        <label>المنتج<select value={productId} onChange={(e) => setProductId(e.target.value)} required disabled={catalogLoading || products.length === 0}>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku} · {money(p.salePrice, currency)}</option>)}</select></label>
        <label>الكمية<input type="number" min="0.001" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} required /></label>
        <button type="button" className="secondary add-line" onClick={addToCart} disabled={!selectedProduct || Number(quantity) <= 0}><Plus size={16}/> إضافة</button>
      </div>
      {products.length === 0 && !catalogLoading && <p className="inline-hint"><AlertTriangle size={15}/> لا توجد منتجات محمّلة. أضف منتجًا أولًا من قسم المنتجات.</p>}
      <div className="sale-cart">
        <div className="sale-cart-heading"><strong>بنود الفاتورة</strong><span>{cart.length.toLocaleString("ar")} بند</span></div>
        {cart.length === 0 ? <p className="cart-empty">أضف المنتجات التي يريد العميل شراءها.</p> : <div className="table-wrap"><table><thead><tr><th>المنتج</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th><th></th></tr></thead><tbody>
          {cart.map((line) => { const p = productById.get(line.productId); return <tr key={line.productId}><td><strong>{p?.name || "منتج غير متاح"}</strong><small className="contact-sub">{p?.sku}</small></td><td><input className="cart-quantity" aria-label={`كمية ${p?.name || "المنتج"}`} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => setCart((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: e.target.value } : item))}/></td><td>{money(p?.salePrice || 0, currency)}</td><td className="price-cell">{money(Number(p?.salePrice || 0) * Number(line.quantity), currency)}</td><td><button type="button" className="icon-button" aria-label="حذف المنتج" onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))}><Trash2 size={16}/></button></td></tr>; })}
        </tbody></table></div>}
      </div>
      <div className="sale-details-grid">
        <label>العميل (مطلوب للبيع الآجل أو الجزئي)<select value={customerId} onChange={(e) => setCustomerId(e.target.value)}><option value="">عميل نقدي / غير محدد</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name} · رصيد {money(c.creditBalance, currency)} / حد {money(c.creditLimit, currency)}</option>)}</select></label>
        <label>طريقة الدفع<select value={paymentMethod} onChange={(e) => { const next = e.target.value as typeof paymentMethod; setPaymentMethod(next); if (next === "CREDIT") setPaidAmount("0"); else if (paidAmount === "0") setPaidAmount(""); }}><option value="CASH">نقدًا</option><option value="CARD">بطاقة</option><option value="TRANSFER">تحويل</option><option value="CREDIT">آجل</option></select></label>
        <label>الخصم<input type="number" min="0" max={subtotal} step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} /></label>
        <label>المبلغ المدفوع (اختياري للدفع الكامل)<input type="number" min="0" max={total} step="0.01" value={paymentMethod === "CREDIT" ? "0" : paidAmount} disabled={paymentMethod === "CREDIT"} placeholder={money(total, currency)} onChange={(e) => setPaidAmount(e.target.value)}/></label>
        <label className="sale-note">ملاحظة الفاتورة<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="اختياري"/></label>
      </div>
      <div className="sale-total-row"><div><span>المجموع قبل الخصم</span><strong>{money(subtotal, currency)}</strong></div><div><span>الإجمالي بعد الخصم</span><strong>{money(total, currency)}</strong></div><div><span>المتبقي المتوقع</span><strong>{money(paymentMethod === "CREDIT" ? total : Math.max(0, total - (paidAmount.trim() ? Number(paidAmount) : total)), currency)}</strong></div></div>
      <div className="form-actions sale-form-actions"><button type="button" className="secondary" onClick={() => { resetSale(); setShowSaleForm(false); }}>إلغاء</button><button className="primary" disabled={busy || catalogLoading || cart.length === 0}>{busy ? "جارٍ تسجيل الفاتورة…" : "تأكيد البيع وحفظ الفاتورة"}</button></div>
      <p className="sale-security-note"><AlertTriangle size={14}/> لا يُعتمد رصيد المخزون المعروض وحده؛ يتحقق الخادم من الكميات الفعلية وحد الائتمان قبل إتمام البيع.</p>
    </form>}
    <div className="table-tools"><span>{sales.length.toLocaleString("ar")} فاتورة محمّلة</span><span>{loading ? "جارٍ التحميل…" : "بيانات مباشرة"}</span></div>
    <div className="table-wrap"><table><thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>التحصيل</th>{canReturn && <th>المرتجع</th>}</tr></thead><tbody>
      {sales.map((sale) => <tr key={sale.id}><td><div className="product-name"><div className="product-thumb"><Receipt size={17}/></div><div><strong>{sale.invoiceNumber}</strong><small>{sale._count.items.toLocaleString("ar")} بند · {methodLabel[sale.paymentMethod] || sale.paymentMethod}</small></div></div></td><td>{sale.customer?.name || "عميل نقدي"}<small className="contact-sub">{sale.customer?.phone || ""}</small></td><td>{new Date(sale.createdAt).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" })}</td><td className="price-cell">{money(sale.totalAmount, currency)}</td><td>{money(sale.paidAmount, currency)}</td><td>{money(sale.balanceDue, currency)}</td><td><span className={sale.paymentStatus === "PAID" ? "status good" : "status low"}><span/>{paymentLabel[sale.paymentStatus] || sale.paymentStatus}</span></td>{canReturn && <td>{sale.status === "COMPLETED" ? <button className="secondary return-action" onClick={() => void openReturn(sale.id)} type="button">مرتجع</button> : "—"}</td>}</tr>)}
      {!loading && sales.length === 0 && <tr><td colSpan={canReturn ? 8 : 7}><div className="table-empty"><Receipt size={25}/><strong>لا توجد فواتير لعرضها</strong><span>سجّل أول عملية بيع من الزر أعلاه.</span></div></td></tr>}
    </tbody></table></div><div className="panel-foot"><span>عرض آخر 100 فاتورة. أسعار البيع والمخزون وحد الائتمان تُتحقق من الخادم عند الحفظ.</span></div>
  </section>;
}