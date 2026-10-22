import { useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, CircleAlert, CreditCard, Plus, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";

type Payment = { id: string; purpose: "SUBSCRIPTION" | "ADDON"; purposeReference: string; amount: string | number; currency: string; method: string; status: string; note?: string | null; createdAt: string; store: { id: string; name: string; slug: string } };
type Plan = { id: string; code: string; name: string; price: string | number; currency: string; billingCycle: string; isActive: boolean };
type Addon = { id: string; code: string; name: string; price: string | number; currency: string; billingCycle: string; status: string };
type PaymentStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "REFUNDED";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || "تعذر تنفيذ طلب إدارة المنصة.");
  }
  return response.json() as Promise<T>;
}
const money = (v: string | number, currency: string) => `${Number(v).toLocaleString("ar", { maximumFractionDigits: 2 })} ${currency === "YER" ? "ر.ي" : currency}`;
const statusLabel: Record<string, string> = { PENDING: "بانتظار المراجعة", CONFIRMED: "مؤكد", REJECTED: "مرفوض", REFUNDED: "مسترد", SUBSCRIPTION: "اشتراك", ADDON: "إضافة", MONTHLY: "شهري", QUARTERLY: "ربع سنوي", YEARLY: "سنوي", CUSTOM: "مخصص", AVAILABLE: "متاح", DRAFT: "مسودة", RETIRED: "متقاعد" };
const methodLabel: Record<string, string> = { CASH: "نقدًا", BANK_TRANSFER: "تحويل بنكي", OTHER: "أخرى" };

export default function AdminPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [status, setStatus] = useState<PaymentStatus>("PENDING");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [rejectingId, setRejectingId] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [total, setTotal] = useState(0);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [showAddonForm, setShowAddonForm] = useState(false);
  const [planForm, setPlanForm] = useState({ code: "", name: "", description: "", price: "0", currency: "YER", billingCycle: "MONTHLY", trialDays: "0" });
  const [addonForm, setAddonForm] = useState({ code: "", name: "", description: "", price: "0", currency: "YER", billingCycle: "MONTHLY", version: "1.0.0", status: "DRAFT", minimumPlanCode: "" });

  async function loadPayments(nextStatus = status) {
    setLoading(true); setError("");
    try {
      const result = await api<{ payments: Payment[]; pagination: { total: number } }>(`/admin/payments?status=${nextStatus}&page=1&pageSize=100`);
      setPayments(result.payments); setTotal(result.pagination.total);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل طلبات الدفع."); }
    finally { setLoading(false); }
  }
  async function loadCatalog() {
    try {
      const [planResult, addonResult] = await Promise.all([
        api<{ plans: Plan[] }>("/admin/plans"),
        api<{ addons: Addon[] }>("/admin/addons")
      ]);
      setPlans(planResult.plans); setAddons(addonResult.addons);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل كتالوج المنصة."); }
  }
  useEffect(() => { void loadCatalog(); }, []);
  useEffect(() => { void loadPayments(status); }, [status]);

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusyId("create-plan"); setError(""); setNotice("");
    try {
      await api("/admin/plans", { method: "POST", body: JSON.stringify({ code: planForm.code.trim().toLowerCase(), name: planForm.name.trim(), price: planForm.price, currency: planForm.currency, billingCycle: planForm.billingCycle, trialDays: Number(planForm.trialDays), ...(planForm.description.trim() ? { description: planForm.description.trim() } : {}), isActive: true }) });
      setNotice("تم إنشاء الباقة بنجاح."); setPlanForm({ code: "", name: "", description: "", price: "0", currency: "YER", billingCycle: "MONTHLY", trialDays: "0" }); setShowPlanForm(false); await loadCatalog();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إنشاء الباقة."); } finally { setBusyId(""); }
  }
  async function createAddon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusyId("create-addon"); setError(""); setNotice("");
    try {
      await api("/admin/addons", { method: "POST", body: JSON.stringify({ code: addonForm.code.trim().toUpperCase(), name: addonForm.name.trim(), price: addonForm.price, currency: addonForm.currency, billingCycle: addonForm.billingCycle, version: addonForm.version.trim(), status: addonForm.status, ...(addonForm.description.trim() ? { description: addonForm.description.trim() } : {}), ...(addonForm.minimumPlanCode.trim() ? { minimumPlanCode: addonForm.minimumPlanCode.trim().toLowerCase() } : {}) }) });
      setNotice("تم إنشاء الإضافة بنجاح."); setAddonForm({ code: "", name: "", description: "", price: "0", currency: "YER", billingCycle: "MONTHLY", version: "1.0.0", status: "DRAFT", minimumPlanCode: "" }); setShowAddonForm(false); await loadCatalog();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر إنشاء الإضافة."); } finally { setBusyId(""); }
  }
  async function togglePlan(plan: Plan) {
    setBusyId("plan:" + plan.id); setError(""); setNotice("");
    try { await api("/admin/plans/" + encodeURIComponent(plan.id), { method: "PATCH", body: JSON.stringify({ isActive: !plan.isActive }) }); setNotice("تم تحديث حالة الباقة."); await loadCatalog(); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر تحديث الباقة."); } finally { setBusyId(""); }
  }
  async function toggleAddon(addon: Addon) {
    const status = addon.status === "AVAILABLE" ? "RETIRED" : "AVAILABLE"; setBusyId("addon:" + addon.id); setError(""); setNotice("");
    try { await api("/admin/addons/" + encodeURIComponent(addon.id), { method: "PATCH", body: JSON.stringify({ status }) }); setNotice(status === "AVAILABLE" ? "تم إتاحة الإضافة." : "تم إيقاف إتاحة الإضافة."); await loadCatalog(); }
    catch (e) { setError(e instanceof Error ? e.message : "تعذر تحديث الإضافة."); } finally { setBusyId(""); }
  }
  async function confirmPayment(payment: Payment) {
    setBusyId(payment.id); setError(""); setNotice("");
    try {
      await api<{ message?: string }>(`/admin/payments/${encodeURIComponent(payment.id)}/confirm`, { method: "POST" });
      setNotice("تم اعتماد الدفعة وتفعيل " + (payment.purpose === "ADDON" ? "الإضافة" : "الاشتراك") + " لمتجر " + payment.store.name + ".");
      await Promise.all([loadPayments(status), loadCatalog()]);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر اعتماد الدفعة."); }
    finally { setBusyId(""); }
  }
  async function rejectPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rejectingId || rejectReason.trim().length < 3) { setError("أدخل سبب رفض واضحًا."); return; }
    setBusyId(rejectingId); setError(""); setNotice("");
    try {
      await api(`/admin/payments/${encodeURIComponent(rejectingId)}/reject`, { method: "POST", body: JSON.stringify({ reason: rejectReason.trim() }) });
      setNotice("تم رفض طلب الدفع وتسجيل سبب الرفض.");
      setRejectingId(""); setRejectReason("");
      await Promise.all([loadPayments(status), loadCatalog()]);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر رفض الدفعة."); }
    finally { setBusyId(""); }
  }

  return <div className="admin-page">
    <section className="products-panel">
      <div className="panel-heading"><div><h2>مراجعة المدفوعات</h2><p>اعتماد الدفع اليدوي أو رفضه مع حفظ أثر التدقيق</p></div><button className="secondary" onClick={() => { void loadPayments(status); void loadCatalog(); }}><RefreshCw size={16}/> تحديث</button></div>
      {error && <div className="alert error"><CircleAlert size={17}/>{error}</div>}
      {notice && <div className="alert success">{notice}</div>}
      <div className="table-tools admin-payment-tools"><label>حالة الدفع<select value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus)}><option value="PENDING">بانتظار المراجعة</option><option value="CONFIRMED">مؤكد</option><option value="REJECTED">مرفوض</option><option value="REFUNDED">مسترد</option></select></label><span>{total.toLocaleString("ar")} طلب</span></div>
      <div className="table-wrap"><table><thead><tr><th>المتجر</th><th>نوع الطلب</th><th>المبلغ</th><th>طريقة الدفع</th><th>تاريخ الطلب</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>
        {payments.map((payment) => <tr key={payment.id}><td><div className="product-name"><div className="product-thumb"><ShieldCheck size={17}/></div><div><strong>{payment.store.name}</strong><small>{payment.store.slug}</small></div></div></td><td>{statusLabel[payment.purpose] || payment.purpose}<small className="contact-sub">{payment.purposeReference.slice(0, 12)}</small></td><td className="price-cell">{money(payment.amount, payment.currency)}</td><td>{methodLabel[payment.method] || payment.method}<small className="contact-sub">{payment.note || ""}</small></td><td>{new Date(payment.createdAt).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" })}</td><td><span className={payment.status === "CONFIRMED" ? "status good" : payment.status === "PENDING" ? "status low" : "status"}><span/>{statusLabel[payment.status] || payment.status}</span></td><td>{payment.status === "PENDING" ? <div className="sale-row-actions"><button className="primary admin-action" disabled={Boolean(busyId)} onClick={() => void confirmPayment(payment)}>اعتماد وتفعيل</button><button className="secondary admin-action" disabled={Boolean(busyId)} onClick={() => { setRejectingId(payment.id); setRejectReason(""); setError(""); }}>رفض</button></div> : "—"}</td></tr>)}
        {!loading && payments.length === 0 && <tr><td colSpan={7}><div className="table-empty"><BadgeCheck size={25}/><strong>لا توجد طلبات بهذه الحالة</strong><span>طلبات الدفع الجديدة ستظهر هنا للمراجعة.</span></div></td></tr>}
        {loading && <tr><td colSpan={7}><div className="table-empty">جارٍ تحميل طلبات الدفع…</div></td></tr>}
      </tbody></table></div>
      {rejectingId && <form className="reject-payment-form" onSubmit={rejectPayment}><div><strong>رفض طلب الدفع</strong><p>سيُلغى طلب الاشتراك أو الإضافة المرتبط بهذا الدفع.</p></div><label>سبب الرفض *<textarea minLength={3} maxLength={1000} required value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="اكتب سببًا واضحًا يظهر في سجل التدقيق"/></label><div className="form-actions"><button type="button" className="secondary" onClick={() => setRejectingId("")}><X size={15}/> إلغاء</button><button className="primary" disabled={Boolean(busyId)}>{busyId === rejectingId ? "جارٍ الرفض…" : "تأكيد الرفض"}</button></div></form>}
      <div className="panel-foot"><span>اعتماد الدفع يفعّل الاشتراك أو الإضافة. لا تعتمد إلا بعد التحقق من استلام المبلغ فعليًا.</span><span className="secure-note"><ShieldCheck size={15}/> إجراءات مسؤول المنصة</span></div>
    </section>
    <div className="admin-catalog-grid">
      <section className="products-panel"><div className="panel-heading"><div><h2>الباقات</h2><p>كتالوج الباقات المسجل في المنصة</p></div><button className="secondary" onClick={() => setShowPlanForm((v) => !v)}><Plus size={15}/> باقة جديدة</button></div>{showPlanForm && <form className="admin-create-form" onSubmit={createPlan}><label>رمز الباقة *<input required maxLength={80} pattern="[a-z0-9][a-z0-9_-]*" value={planForm.code} onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })} placeholder="basic"/></label><label>اسم الباقة *<input required minLength={2} maxLength={120} value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}/></label><label>السعر *<input required type="number" min="0" step="0.01" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}/></label><label>العملة<select value={planForm.currency} onChange={(e) => setPlanForm({ ...planForm, currency: e.target.value })}><option value="YER">YER</option><option value="USD">USD</option><option value="SAR">SAR</option></select></label><label>دورة الفوترة<select value={planForm.billingCycle} onChange={(e) => setPlanForm({ ...planForm, billingCycle: e.target.value })}><option value="MONTHLY">شهري</option><option value="QUARTERLY">ربع سنوي</option><option value="YEARLY">سنوي</option></select></label><label>أيام التجربة<input type="number" min="0" max="365" step="1" value={planForm.trialDays} onChange={(e) => setPlanForm({ ...planForm, trialDays: e.target.value })}/></label><label className="admin-wide-field">الوصف<input maxLength={1000} value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}/></label><div className="form-actions admin-wide-field"><button type="button" className="secondary" onClick={() => setShowPlanForm(false)}>إلغاء</button><button className="primary" disabled={Boolean(busyId)}>{busyId === "create-plan" ? "جارٍ الإنشاء…" : "إنشاء الباقة"}</button></div></form>}<div className="admin-catalog-list">{plans.map((plan) => <div className="admin-catalog-item" key={plan.id}><div><strong>{plan.name}</strong><small>{plan.code} · {statusLabel[plan.billingCycle] || plan.billingCycle}</small></div><span>{money(plan.price, plan.currency)}</span><span className={plan.isActive ? "status good" : "status low"}><span/>{plan.isActive ? "نشطة" : "متوقفة"}</span><button className="secondary admin-toggle" disabled={Boolean(busyId)} onClick={() => void togglePlan(plan)}>{busyId === "plan:" + plan.id ? "جارٍ…" : plan.isActive ? "إيقاف" : "تفعيل"}</button></div>)}{plans.length === 0 && <p className="admin-empty">لا توجد باقات مسجلة.</p>}</div></section>
      <section className="products-panel"><div className="panel-heading"><div><h2>الإضافات</h2><p>كتالوج الإضافات المسجل في المنصة</p></div><button className="secondary" onClick={() => setShowAddonForm((v) => !v)}><Plus size={15}/> إضافة جديدة</button></div>{showAddonForm && <form className="admin-create-form" onSubmit={createAddon}><label>رمز الإضافة *<input required maxLength={80} pattern="[A-Z0-9][A-Z0-9_-]*" value={addonForm.code} onChange={(e) => setAddonForm({ ...addonForm, code: e.target.value })} placeholder="POS"/></label><label>اسم الإضافة *<input required minLength={2} maxLength={120} value={addonForm.name} onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}/></label><label>السعر *<input required type="number" min="0" step="0.01" value={addonForm.price} onChange={(e) => setAddonForm({ ...addonForm, price: e.target.value })}/></label><label>العملة<select value={addonForm.currency} onChange={(e) => setAddonForm({ ...addonForm, currency: e.target.value })}><option value="YER">YER</option><option value="USD">USD</option><option value="SAR">SAR</option></select></label><label>دورة الفوترة<select value={addonForm.billingCycle} onChange={(e) => setAddonForm({ ...addonForm, billingCycle: e.target.value })}><option value="MONTHLY">شهري</option><option value="QUARTERLY">ربع سنوي</option><option value="YEARLY">سنوي</option></select></label><label>الإصدار *<input required maxLength={32} value={addonForm.version} onChange={(e) => setAddonForm({ ...addonForm, version: e.target.value })}/></label><label>الحالة<select value={addonForm.status} onChange={(e) => setAddonForm({ ...addonForm, status: e.target.value })}><option value="DRAFT">مسودة</option><option value="AVAILABLE">متاح للشراء</option></select></label><label>أقل باقة مطلوبة (اختياري)<input maxLength={80} value={addonForm.minimumPlanCode} onChange={(e) => setAddonForm({ ...addonForm, minimumPlanCode: e.target.value })}/></label><label className="admin-wide-field">الوصف<input maxLength={1000} value={addonForm.description} onChange={(e) => setAddonForm({ ...addonForm, description: e.target.value })}/></label><div className="form-actions admin-wide-field"><button type="button" className="secondary" onClick={() => setShowAddonForm(false)}>إلغاء</button><button className="primary" disabled={Boolean(busyId)}>{busyId === "create-addon" ? "جارٍ الإنشاء…" : "إنشاء الإضافة"}</button></div></form>}<div className="admin-catalog-list">{addons.map((addon) => <div className="admin-catalog-item" key={addon.id}><div><strong>{addon.name}</strong><small>{addon.code} · {statusLabel[addon.billingCycle] || addon.billingCycle}</small></div><span>{money(addon.price, addon.currency)}</span><span className={addon.status === "AVAILABLE" ? "status good" : "status low"}><span/>{statusLabel[addon.status] || addon.status}</span><button className="secondary admin-toggle" disabled={Boolean(busyId)} onClick={() => void toggleAddon(addon)}>{busyId === "addon:" + addon.id ? "جارٍ…" : addon.status === "AVAILABLE" ? "إيقاف" : "إتاحة"}</button></div>)}{addons.length === 0 && <p className="admin-empty">لا توجد إضافات مسجلة.</p>}</div></section>
    </div>
  </div>;
}

function CreditCardIcon() { return <CreditCard size={18} />; }
