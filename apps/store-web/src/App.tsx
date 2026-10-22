import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Activity, ArrowDownLeft, Boxes, Check, ChevronDown, CircleAlert, LogOut, PackagePlus, RefreshCw, Search, ShieldCheck, ShoppingBasket, Store as StoreIcon, Users, Receipt, TrendingUp, PackageCheck, CreditCard } from "lucide-react";
import CustomersPage from "./CustomersPage";
import SalesPage from "./SalesPage";
import ReportsPage from "./ReportsPage";
import LowStockPage from "./LowStockPage";
import InventoryPage from "./InventoryPage";
import BillingPage from "./BillingPage";

type Store = { id: string; name: string; slug: string; currency: string; role: string; status: string };
type Product = { id: string; sku: string; barcode?: string | null; name: string; unit: string; salePrice: string | number; costPrice?: string | number | null; stockQuantity: string | number; lowStockAt: string | number; category?: { name: string } | null };
type ApiError = { error?: { message?: string; code?: string } };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as ApiError;
    throw new Error(body.error?.message || (response.status === 401 ? "انتهت الجلسة. سجّل الدخول من جديد." : "تعذر تنفيذ الطلب. حاول مرة أخرى."));
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const currencyLabel = (value: string) => value === "YER" ? "ر.ي" : value;
const money = (value: string | number, currency: string) => `${Number(value).toLocaleString("ar", { maximumFractionDigits: 2 })} ${currencyLabel(currency)}`;

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [activeSection, setActiveSection] = useState<"products" | "customers" | "sales" | "reports" | "low-stock" | "inventory" | "billing">("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [productForm, setProductForm] = useState({ sku: "", name: "", salePrice: "", costPrice: "", unit: "piece", lowStockAt: "0" });

  const selectedStore = stores.find((store) => store.id === storeId);
  const visibleProducts = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return products.filter((product) => !q || [product.name, product.sku, product.barcode || ""].some((field) => field.toLocaleLowerCase().includes(q)));
  }, [products, query]);

  const loadStores = useCallback(async () => {
    const result = await api<{ stores: Store[] }>("/stores");
    setStores(result.stores);
    setStoreId((current) => result.stores.some((store) => store.id === current) ? current : (result.stores[0]?.id || ""));
  }, []);

  const loadProducts = useCallback(async (id: string) => {
    if (!id) { setProducts([]); return; }
    const result = await api<{ products: Product[] }>(`/stores/${encodeURIComponent(id)}/products?page=1&pageSize=100`);
    setProducts(result.products);
  }, []);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    try {
      const me = await api<{ userId: string }>("/auth/me");
      setUserId(me.userId);
      await loadStores();
    } catch {
      setUserId(null);
    } finally {
      setLoading(false);
    }
  }, [loadStores]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => {
    if (!userId || !storeId) { setProducts([]); return; }
    setError("");
    void loadProducts(storeId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "تعذر تحميل المنتجات."));
  }, [userId, storeId, loadProducts]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      setPassword("");
      await bootstrap();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر تسجيل الدخول.");
    } finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    try { await api("/auth/logout", { method: "POST" }); }
    catch { /* Session may already have expired. */ }
    setUserId(null); setStores([]); setStoreId(""); setProducts([]); setBusy(false);
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/stores/${encodeURIComponent(storeId)}/products`, {
        method: "POST",
        body: JSON.stringify({
          sku: productForm.sku.trim(),
          name: productForm.name.trim(),
          salePrice: productForm.salePrice,
          ...(productForm.costPrice ? { costPrice: productForm.costPrice } : {}),
          unit: productForm.unit,
          lowStockAt: productForm.lowStockAt
        })
      });
      setProductForm({ sku: "", name: "", salePrice: "", costPrice: "", unit: "piece", lowStockAt: "0" });
      setShowProductForm(false);
      setNotice("تمت إضافة المنتج بنجاح.");
      await loadProducts(storeId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "تعذر إضافة المنتج.");
    } finally { setBusy(false); }
  }

  if (loading) return <main className="loading-screen"><div className="brand-mark"><ShoppingBasket /></div><p>جارٍ الاتصال بالمنصة…</p></main>;

  if (!userId) return (
    <main className="login-layout">
      <section className="login-art">
        <div className="brand-lockup"><div className="brand-mark"><ShoppingBasket /></div><span>سوبرماركت <small>منصة إدارة المتاجر</small></span></div>
        <div className="login-message"><span className="eyebrow">إدارة أبسط · رؤية أوضح</span><h1>كل تفاصيل متجرك<br /><em>في مكان واحد.</em></h1><p>إدارة المنتجات والمخزون بكفاءة، من لوحة عربية صُممت لعملك.</p></div>
        <div className="art-foot"><ShieldCheck size={16} /> جلسة آمنة وإمكانية وصول حسب الصلاحيات</div>
      </section>
      <section className="login-panel"><form className="login-card" onSubmit={login}>
        <span className="eyebrow">مرحبًا بعودتك</span><h2>تسجيل الدخول</h2><p className="muted">أدخل بيانات حسابك للوصول إلى لوحة المتجر.</p>
        {error && <div className="alert error"><CircleAlert size={18} />{error}</div>}
        <label>البريد الإلكتروني<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" required /></label>
        <label>كلمة المرور<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="أدخل كلمة المرور" required /></label>
        <button className="primary full" type="submit" disabled={busy}>{busy ? "جارٍ تسجيل الدخول…" : "دخول إلى حسابي"} <ArrowDownLeft size={18} /></button>
        <p className="form-note">لا يوجد تسجيل عام للحسابات. استخدم حسابًا أنشأه مسؤول المنصة.</p>
      </form></section>
    </main>
  );

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark"><ShoppingBasket /></div><span>سوبرماركت<small>إدارة المتجر</small></span></div>
      <div className="side-label">مساحة العمل</div>
      <button className={`nav-item ${activeSection === "products" ? "active" : ""}`} onClick={() => setActiveSection("products")}><Boxes size={19} /> المنتجات والمخزون</button>
      <button className={`nav-item ${activeSection === "customers" ? "active" : ""}`} onClick={() => setActiveSection("customers")}><Users size={19} /> العملاء</button>
      {(selectedStore?.role === "STORE_OWNER" || selectedStore?.role === "STORE_MANAGER" || selectedStore?.role === "CASHIER") && <button className={`nav-item ${activeSection === "sales" ? "active" : ""}`} onClick={() => setActiveSection("sales")}><Receipt size={19} /> المبيعات والفواتير</button>}
      {(selectedStore?.role === "STORE_OWNER" || selectedStore?.role === "STORE_MANAGER") && <button className={`nav-item ${activeSection === "reports" ? "active" : ""}`} onClick={() => setActiveSection("reports")}><TrendingUp size={19} /> التقارير اليومية</button>}
      {(selectedStore?.role === "STORE_OWNER" || selectedStore?.role === "STORE_MANAGER") && <button className={`nav-item ${activeSection === "billing" ? "active" : ""}`} onClick={() => setActiveSection("billing")}><CreditCard size={19} /> الباقات والإضافات</button>}
      {(selectedStore?.role === "STORE_OWNER" || selectedStore?.role === "STORE_MANAGER" || selectedStore?.role === "INVENTORY_STAFF") && <button className={`nav-item ${activeSection === "inventory" ? "active" : ""}`} onClick={() => setActiveSection("inventory")}><PackageCheck size={19} /> حركات المخزون</button>}
      {(selectedStore?.role === "STORE_OWNER" || selectedStore?.role === "STORE_MANAGER" || selectedStore?.role === "INVENTORY_STAFF") && <button className={`nav-item ${activeSection === "low-stock" ? "active" : ""}`} onClick={() => setActiveSection("low-stock")}><CircleAlert size={19} /> تنبيهات المخزون</button>}
      <div className="side-caption">تظهر البيانات بحسب صلاحيات عضويتك في المتجر المحدد.</div>
      <div className="sidebar-bottom"><div className="avatar">{(selectedStore?.name || "م").slice(0, 1)}</div><div className="account-name"><strong>{selectedStore?.name || "لا يوجد متجر"}</strong><small>{selectedStore?.role || "حساب مسجل"}</small></div><button className="icon-button" title="تسجيل الخروج" onClick={() => void logout()} disabled={busy}><LogOut size={17} /></button></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div><span className="eyebrow">لوحة التحكم</span><h1>{({ products: "المنتجات والمخزون", customers: "العملاء", sales: "المبيعات والفواتير", reports: "التقارير اليومية", "low-stock": "تنبيهات المخزون المنخفض", inventory: "حركات المخزون", billing: "الباقات والاشتراكات" })[activeSection]}</h1></div><div className="top-actions">
        <label className="store-select"><StoreIcon size={17} /><select aria-label="اختيار المتجر" value={storeId} onChange={(e) => { setStoreId(e.target.value); setActiveSection("products"); }}><option value="">اختر متجرًا</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select><ChevronDown size={15} /></label>
        <button className="icon-button refresh" aria-label="تحديث البيانات" onClick={() => void loadProducts(storeId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "تعذر التحديث."))}><RefreshCw size={17} /></button>
      </div></header>
      {stores.length === 0 ? <section className="empty-state"><div className="empty-icon"><StoreIcon /></div><h2>لا توجد متاجر مرتبطة بحسابك</h2><p>لم نجد متجرًا يمكنك الوصول إليه. تواصل مع مسؤول المنصة لإضافة عضويتك.</p></section> : <>
        {error && <div className="alert error"><CircleAlert size={18} />{error}</div>}
        {notice && <div className="alert success"><Check size={18} />{notice}</div>}
        {activeSection === "products" && <>
        <section className="welcome-strip"><div className="welcome-icon"><Activity /></div><div><strong>مرحبًا بك في {selectedStore?.name || "متجرك"}</strong><p>هذه البيانات تُحمّل مباشرة من واجهة النظام وفق صلاحيات حسابك.</p></div><span className="live-pill"><span /> اتصال مباشر</span></section>
        <section className="stat-grid">
          <article className="stat-card"><div className="stat-icon violet"><Boxes /></div><span>المنتجات المعروضة</span><strong>{visibleProducts.length.toLocaleString("ar")}</strong><small>من المنتجات النشطة المحمّلة</small></article>
          <article className="stat-card"><div className="stat-icon amber"><CircleAlert /></div><span>تنبيهات المخزون</span><strong>{visibleProducts.filter((p) => Number(p.stockQuantity) <= Number(p.lowStockAt)).length.toLocaleString("ar")}</strong><small>بحسب حد المخزون لكل منتج</small></article>
          <article className="stat-card"><div className="stat-icon green"><ShieldCheck /></div><span>دورك في المتجر</span><strong className="role-value">{selectedStore?.role || "—"}</strong><small>محدد من عضويتك في الخادم</small></article>
        </section>
        </>}
        {activeSection === "products" && <section className="products-panel">
          <div className="panel-heading"><div><h2>قائمة المنتجات</h2><p>بحث سريع بالاسم أو رمز SKU أو الباركود</p></div><button className="primary" onClick={() => { setShowProductForm((v) => !v); setError(""); }} disabled={!selectedStore}><PackagePlus size={18} /> إضافة منتج</button></div>
          {showProductForm && <form className="product-form" onSubmit={createProduct}>
            <div className="form-title"><h3>منتج جديد</h3><span>الحقول المعلّمة مطلوبة</span></div>
            <label>اسم المنتج *<input value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} maxLength={180} required /></label>
            <label>رمز SKU *<input value={productForm.sku} onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })} maxLength={80} required /></label>
            <label>سعر البيع *<input type="number" min="0.01" step="0.01" value={productForm.salePrice} onChange={(e) => setProductForm({ ...productForm, salePrice: e.target.value })} required /></label>
            <label>سعر التكلفة<input type="number" min="0" step="0.01" value={productForm.costPrice} onChange={(e) => setProductForm({ ...productForm, costPrice: e.target.value })} /></label>
            <label>الوحدة<select value={productForm.unit} onChange={(e) => setProductForm({ ...productForm, unit: e.target.value })}><option value="piece">قطعة</option><option value="kg">كيلوغرام</option><option value="liter">لتر</option><option value="box">كرتون</option></select></label>
            <label>حد التنبيه للمخزون<input type="number" min="0" step="0.001" value={productForm.lowStockAt} onChange={(e) => setProductForm({ ...productForm, lowStockAt: e.target.value })} /></label>
            <div className="form-actions"><button className="secondary" type="button" onClick={() => setShowProductForm(false)}>إلغاء</button><button className="primary" type="submit" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ المنتج"}</button></div>
          </form>}
          <div className="table-tools"><label className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن منتج…" /></label><span>{visibleProducts.length.toLocaleString("ar")} منتج</span></div>
          <div className="table-wrap"><table><thead><tr><th>المنتج</th><th>رمز SKU</th><th>سعر البيع</th><th>الكمية المتاحة</th><th>الحالة</th></tr></thead><tbody>
            {visibleProducts.map((product) => { const low = Number(product.stockQuantity) <= Number(product.lowStockAt); return <tr key={product.id}><td><div className="product-name"><div className="product-thumb"><Boxes size={18} /></div><div><strong>{product.name}</strong><small>{product.category?.name || "بدون تصنيف"}</small></div></div></td><td><code>{product.sku}</code></td><td className="price-cell">{money(product.salePrice, selectedStore?.currency || "YER")}</td><td>{Number(product.stockQuantity).toLocaleString("ar", { maximumFractionDigits: 3 })} <small>{product.unit}</small></td><td><span className={low ? "status low" : "status good"}><span />{low ? "مخزون منخفض" : "متوفر"}</span></td></tr>; })}
            {visibleProducts.length === 0 && <tr><td colSpan={5}><div className="table-empty"><Boxes size={26} /><strong>{query ? "لا توجد نتائج مطابقة" : "لا توجد منتجات لعرضها"}</strong><span>{query ? "جرّب كلمة بحث مختلفة." : "يمكنك إضافة أول منتج لهذا المتجر."}</span></div></td></tr>}
          </tbody></table></div>
          <div className="panel-foot"><span>عرض أول 100 منتج نشط. يمكن توسيع الجدول إلى صفحات في المرحلة التالية.</span><span className="secure-note"><ShieldCheck size={15} /> الوصول محمي من الخادم</span></div>
        </section>}
        {activeSection === "customers" && selectedStore && <CustomersPage storeId={selectedStore.id} currency={selectedStore.currency} />}
        {activeSection === "sales" && selectedStore && (selectedStore.role === "STORE_OWNER" || selectedStore.role === "STORE_MANAGER" || selectedStore.role === "CASHIER") && <SalesPage storeId={selectedStore.id} currency={selectedStore.currency} canReturn={selectedStore.role === "STORE_OWNER" || selectedStore.role === "STORE_MANAGER"} />}
        {activeSection === "reports" && selectedStore && (selectedStore.role === "STORE_OWNER" || selectedStore.role === "STORE_MANAGER") && <ReportsPage storeId={selectedStore.id} />}
        {activeSection === "billing" && selectedStore && (selectedStore.role === "STORE_OWNER" || selectedStore.role === "STORE_MANAGER") && <BillingPage storeId={selectedStore.id} />}
        {activeSection === "low-stock" && selectedStore && (selectedStore.role === "STORE_OWNER" || selectedStore.role === "STORE_MANAGER" || selectedStore.role === "INVENTORY_STAFF") && <LowStockPage storeId={selectedStore.id} />}
        {activeSection === "inventory" && selectedStore && (selectedStore.role === "STORE_OWNER" || selectedStore.role === "STORE_MANAGER" || selectedStore.role === "INVENTORY_STAFF") && <InventoryPage storeId={selectedStore.id} />}
      </>}
      <footer className="footer"><span>Supermarket Platform</span><span>واجهة أولية قيد التطوير</span></footer>
    </main>
  </div>;
}