import { useEffect, useState } from "react";
import { BadgeCheck, CircleAlert, CreditCard, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

type Plan = { id: string; code: string; name: string; description?: string | null; price: string | number; currency: string; billingCycle: string; trialDays: number; limits?: Record<string, number>; features?: string[] };
type Subscription = { id: string; status: string; startsAt?: string | null; trialEndsAt?: string | null; currentPeriodEnd?: string | null; plan: { code: string; name: string; price: string | number; currency: string; billingCycle: string } };
type Addon = { id: string; code: string; name: string; description?: string | null; version: string; price: string | number; currency: string; billingCycle: string };
type StoreAddon = { id: string; code: string; name: string; status: string; startsAt?: string | null; endsAt?: string | null };
type Props = { storeId: string };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", ...init, headers: { ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || "تعذر تنفيذ الطلب.");
  }
  return response.json() as Promise<T>;
}
const money = (v: string | number, currency: string) => `${Number(v).toLocaleString("ar", { maximumFractionDigits: 2 })} ${currency === "YER" ? "ر.ي" : currency}`;
const cycleLabel: Record<string, string> = { MONTHLY: "شهريًا", QUARTERLY: "كل 3 أشهر", YEARLY: "سنويًا", CUSTOM: "حسب الاتفاق" };
const statusLabel: Record<string, string> = { TRIALING: "تجربة مجانية", PENDING_PAYMENT: "بانتظار تأكيد الدفع", ACTIVE: "نشط", PAST_DUE: "متأخر", EXPIRED: "منتهي", CANCELLED: "ملغي", SUSPENDED: "موقوف", PENDING: "بانتظار المراجعة", AVAILABLE: "متاح" };
const methodLabel: Record<string, string> = { CASH: "نقدًا", BANK_TRANSFER: "تحويل بنكي", OTHER: "وسيلة أخرى" };

export default function BillingPage({ storeId }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [storeAddons, setStoreAddons] = useState<StoreAddon[]>([]);
  const [method, setMethod] = useState<"CASH" | "BANK_TRANSFER" | "OTHER">("BANK_TRANSFER");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [billing, addonData] = await Promise.all([
        api<{ plans: Plan[]; subscriptions: Subscription[] }>(`/stores/${encodeURIComponent(storeId)}/plans`),
        api<{ catalog: Addon[]; storeAddons: StoreAddon[] }>(`/stores/${encodeURIComponent(storeId)}/addons`)
      ]);
      setPlans(billing.plans); setSubscriptions(billing.subscriptions);
      setAddons(addonData.catalog); setStoreAddons(addonData.storeAddons);
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر تحميل الباقات والإضافات."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [storeId]);

  async function requestPlan(plan: Plan) {
    setBusyKey("plan:" + plan.code); setError(""); setNotice("");
    try {
      const result = await api<{ message: string }>(`/stores/${encodeURIComponent(storeId)}/subscription/purchase`, { method: "POST", body: JSON.stringify({ planCode: plan.code, method, ...(note.trim() ? { note: note.trim() } : {}) }) });
      setNotice(result.message); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر طلب الاشتراك."); }
    finally { setBusyKey(""); }
  }
  async function startTrial(plan: Plan) {
    setBusyKey("trial:" + plan.code); setError(""); setNotice("");
    try {
      const result = await api<{ message: string }>(`/stores/${encodeURIComponent(storeId)}/subscription/trial`, { method: "POST", body: JSON.stringify({ planCode: plan.code }) });
      setNotice(result.message); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر بدء التجربة."); }
    finally { setBusyKey(""); }
  }
  async function requestAddon(addon: Addon) {
    setBusyKey("addon:" + addon.code); setError(""); setNotice("");
    try {
      const result = await api<{ message: string }>(`/stores/${encodeURIComponent(storeId)}/addons/${encodeURIComponent(addon.code)}/purchase`, { method: "POST", body: JSON.stringify({ method, ...(note.trim() ? { note: note.trim() } : {}) }) });
      setNotice(result.message); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذر طلب الإضافة."); }
    finally { setBusyKey(""); }
  }

  const activeSubscription = subscriptions.find((s) => ["ACTIVE", "TRIALING", "PENDING_PAYMENT"].includes(s.status));
  const addonStatus = (code: string) => storeAddons.find((a) => a.code === code);
  return <section className="products-panel">
    <div className="panel-heading"><div><h2>الباقات والاشتراكات</h2><p>راجع الباقات واطلب الاشتراك أو الإضافات المدفوعة</p></div><button className="secondary" onClick={() => void load()}><RefreshCw size={16}/> تحديث</button></div>
    {error && <div className="alert error"><CircleAlert size={17}/>{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    <div className="billing-payment-settings"><label>طريقة الدفع المقترحة<select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option value="BANK_TRANSFER">تحويل بنكي</option><option value="CASH">نقدًا</option><option value="OTHER">وسيلة أخرى</option></select></label><label>ملاحظة الدفع<input maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="رقم مرجع التحويل أو ملاحظة لمسؤول المنصة"/></label></div>
    {activeSubscription && <div className="billing-current"><div className="billing-current-icon"><ShieldCheck size={20}/></div><div><strong>حالة الاشتراك الحالي: {statusLabel[activeSubscription.status] || activeSubscription.status}</strong><p>{activeSubscription.plan.name} · {money(activeSubscription.plan.price, activeSubscription.plan.currency)} {cycleLabel[activeSubscription.plan.billingCycle] || ""}</p>{activeSubscription.currentPeriodEnd && <small>ينتهي في {new Date(activeSubscription.currentPeriodEnd).toLocaleDateString("ar")}</small>}</div></div>}
    <div className="billing-section-title"><div><CreditCard size={18}/><div><h3>الباقات المتاحة</h3><p>لن يتفعّل طلب الدفع اليدوي قبل تأكيد مسؤول المنصة.</p></div></div></div>
    {loading ? <div className="report-loading">جارٍ تحميل الباقات…</div> : <div className="billing-cards">{plans.map((plan) => <article className="billing-card" key={plan.id}><div className="billing-card-top"><div><h3>{plan.name}</h3><span className="billing-code">{plan.code}</span></div><span className="billing-price">{money(plan.price, plan.currency)}<small>{cycleLabel[plan.billingCycle] || ""}</small></span></div>{plan.description && <p className="billing-description">{plan.description}</p>}{Array.isArray(plan.features) && plan.features.length > 0 && <ul className="billing-features">{plan.features.map((feature) => <li key={feature}><BadgeCheck size={14}/>{feature}</li>)}</ul>}{plan.limits && Object.keys(plan.limits).length > 0 && <div className="billing-limits">{Object.entries(plan.limits).map(([key, value]) => <span key={key}>{key}: {Number(value).toLocaleString("ar")}</span>)}</div>}<div className="billing-card-actions">{plan.trialDays > 0 && <button className="secondary" disabled={Boolean(busyKey) || Boolean(activeSubscription)} onClick={() => void startTrial(plan)}>{busyKey === "trial:" + plan.code ? "جارٍ الطلب…" : "بدء تجربة " + plan.trialDays + " يومًا"}</button>}<button className="primary" disabled={Boolean(busyKey) || Boolean(activeSubscription)} onClick={() => void requestPlan(plan)}>{busyKey === "plan:" + plan.code ? "جارٍ الطلب…" : "طلب الاشتراك"}</button></div></article>)}</div>}
    <div className="billing-section-title addon-title"><div><Sparkles size={18}/><div><h3>الإضافات</h3><p>الإضافة لا تتفعّل إلا بعد مراجعة الدفع واعتمادها.</p></div></div></div>
    {loading ? <div className="report-loading">جارٍ تحميل الإضافات…</div> : <div className="billing-cards">{addons.map((addon) => { const current = addonStatus(addon.code); const blocked = current?.status === "ACTIVE" || current?.status === "PENDING_PAYMENT"; return <article className="billing-card" key={addon.id}><div className="billing-card-top"><div><h3>{addon.name}</h3><span className="billing-code">{addon.code} · v{addon.version}</span></div><span className="billing-price">{money(addon.price, addon.currency)}<small>{cycleLabel[addon.billingCycle] || ""}</small></span></div>{addon.description && <p className="billing-description">{addon.description}</p>}{current && <div className="addon-current-status"><span className={current.status === "ACTIVE" ? "status good" : "status low"}><span/>{statusLabel[current.status] || current.status}</span>{current.endsAt && <small>حتى {new Date(current.endsAt).toLocaleDateString("ar")}</small>}</div>}<button className="primary billing-addon-button" disabled={Boolean(busyKey) || blocked} onClick={() => void requestAddon(addon)}>{busyKey === "addon:" + addon.code ? "جارٍ الطلب…" : blocked ? (statusLabel[current?.status || ""] || "قيد الاستخدام") : "طلب الإضافة"}</button></article>; })}</div>}
    {!loading && plans.length === 0 && addons.length === 0 && <div className="table-empty"><Sparkles size={24}/><strong>لا توجد باقات أو إضافات متاحة حاليًا</strong></div>}
    <div className="panel-foot"><span>كل الطلبات تُحفظ في الخادم. هذه الواجهة لا تمنح الاشتراك أو الإضافة صلاحيات قبل اعتماد الدفع.</span><span className="secure-note"><ShieldCheck size={15}/> اعتماد الدفع من مسؤول المنصة فقط</span></div>
  </section>;
}