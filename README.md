# Supermarket — منصة إدارة السوبر ماركت متعددة المتاجر

حالة المشروع: **نسخة تطوير أولية قيد البناء، غير جاهزة للإنتاج.**

الهدف هو بناء منصة SaaS عربية RTL لإدارة عدة متاجر مع عزل بيانات المستأجرين، اشتراكات، وإضافات مستقلة مدفوعة مثل POS وAI Analytics.

## التقنيات

- Node.js + Express + TypeScript
- Prisma + PostgreSQL
- React + Vite للواجهات الويب
- React Native + Expo لتطبيقات الهاتف
- OpenAPI واختبارات آلية

## ما هو موجود حاليًا

- تسجيل الدخول والخروج والجلسة الحالية مع جلسات مخزنة كـ SHA-256 hash وcookie آمن.
- واجهة متجر عربية RTL أولية باستخدام React + Vite: المنتجات، العملاء، نقطة البيع والفواتير، التقارير اليومية، تنبيهات المخزون، سجل الحركات وتسويات المخزون، المرتجعات المخزنية، وإدارة الباقات والإضافات للمالك والمدير، ومساحة Super Admin لمراجعة المدفوعات.
- أمر CLI محدود لإنشاء مسؤول المنصة الأول.
- مخطط Prisma للمتاجر والعضويات والتدقيق والمنتجات والمخزون والعملاء والموردين والمشتريات والباقات والاشتراكات والإضافات والمدفوعات والجلسات.
- API محمي لعرض المنتجات وإنشاءها.
- API محمي لحركات المخزون، بمعاملة Serializable وسجل تدقيق ومفتاح Idempotency ومنع المخزون السالب افتراضيًا.
- API لإدارة العملاء والبيع والفواتير مع حساب الخصم والمدفوع والمتبقي وتحديث المخزون داخل معاملة واحدة.
- API لإدارة الموردين مع بحث وترقيم صفحات، وتحديث بيانات المورد أو تعطيله بدل حذفه، وتسجيل تغييرات التدقيق.
- API لتسجيل فواتير المشتريات المستلمة: يتحقق من المورد والمنتجات التابعة للمتجر، ويحسب إجمالي السطور على الخادم، ويحدّث المخزون وتكلفة المنتج ويسجل حركات المخزون والتدقيق داخل معاملة Serializable واحدة. يدعم `Idempotency-Key` لمنع تكرار الاستلام.
- تسجيل دفعات لاحقة للفواتير بمفتاح Idempotency، وتحديث حالة الفاتورة ورصيد ائتمان العميل وسجل التدقيق.
- كتالوج الباقات وطلب الاشتراك بالدفع اليدوي وتجربة مجانية لمرة واحدة لكل متجر عند توفرها في الباقة.
- كتالوج الإضافات وطلب شراء بالدفع اليدوي.
- واجهات Super Admin لإدارة الباقات والإضافات، ومراجعة المدفوعات وتأكيدها أو رفضها مع تسجيل السبب.
- تفعيل الاشتراك أو الإضافة بعد تأكيد مسؤول مخوّل فقط، وليس عند إنشاء طلب الدفع.
- GitHub Actions نجح في Prisma generate وTypeScript typecheck والاختبارات وbuild في [التشغيل #38917176896](https://github.com/Zain1970/Supermarket/actions/runs/38917176896).

## إعداد البيئة

المتطلبات: Node.js 20 أو أحدث، وPostgreSQL.

```bash
cp .env.example .env
# حدّث DATABASE_URL إلى قاعدة PostgreSQL محلية
npm install
npx prisma validate --schema apps/api/prisma/schema.prisma
npx prisma generate --schema apps/api/prisma/schema.prisma
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name initial_schema
npm run dev:api
```

فحص الصحة: `http://localhost:4000/health`.

## إنشاء مسؤول المنصة الأول

بعد إعداد قاعدة البيانات والترحيلات، نفّذ الأمر مرة واحدة في بيئة موثوقة. لا تمرر كلمة المرور في سطر الأوامر؛ أدخلها في المطالبة المخفية:

```bash
export BOOTSTRAP_ADMIN_EMAIL=admin@example.com
read -r -s -p "كلمة مرور المسؤول الأول: " BOOTSTRAP_ADMIN_PASSWORD
printf '
'
export BOOTSTRAP_ADMIN_PASSWORD
npm run bootstrap:admin --workspace @supermarket/api
unset BOOTSTRAP_ADMIN_PASSWORD
```

تحتاج كلمة المرور إلى 14 محرفًا على الأقل. الأمر يرفض العمل إذا كان هناك مسؤول منصة موجود. لا يوجد تسجيل عام للمستخدمين.

## واجهات API الحالية

- `GET /health`
- `POST /auth/login` · `GET /auth/me` · `POST /auth/logout`
- `GET /stores/:storeId/products` · `POST /stores/:storeId/products`
- `GET /stores/:storeId/customers` · `POST /stores/:storeId/customers`
- `GET /stores/:storeId/suppliers` · `POST /stores/:storeId/suppliers` · `PATCH /stores/:storeId/suppliers/:supplierId`
- `GET /stores/:storeId/purchases` · `POST /stores/:storeId/purchases` (يسجل الفاتورة كـ مستلمة ويحدّث المخزون ذريًا)
- `GET /stores/:storeId/sales` · `POST /stores/:storeId/sales` · `GET /stores/:storeId/sales/:saleId` · `POST /stores/:storeId/sales/:saleId/payments` · `POST /stores/:storeId/sales/:saleId/returns`
- `GET /stores/:storeId/reports/daily` · `GET /stores/:storeId/reports/low-stock`
- `GET /stores/:storeId/stock-movements` · `POST /stores/:storeId/stock-movements`
- `GET /stores/:storeId/plans`
- `POST /stores/:storeId/subscription/purchase`
- `POST /stores/:storeId/subscription/trial`
- `GET /stores/:storeId/addons`
- `POST /stores/:storeId/addons/:addonCode/purchase`
- `GET /admin/plans` · `POST /admin/plans` · `PATCH /admin/plans/:planId`
- `GET /admin/addons` · `POST /admin/addons` · `PATCH /admin/addons/:addonId`
- `GET /admin/payments`
- `POST /admin/payments/:paymentId/confirm` · `POST /admin/payments/:paymentId/reject`

واجهات المتاجر تتطلب جلسة صالحة وعضوية مناسبة. تسجيل المشتريات يتطلب ترويسة `Idempotency-Key`. راجع [عقد OpenAPI](docs/openapi.yaml).

## التحقق

```bash
npm run typecheck
npm test
npm run build
```

## وثائق المشروع

- [التعليمات الرئيسية](CODEX_MASTER_PROMPT_AR.md)
- [متطلبات المنتج](PRODUCT_REQUIREMENTS_AR.md)
- [معمارية النظام](ARCHITECTURE.md)
- [تقييم المستودعات](REPOSITORY_ASSESSMENT.md)
- [النموذج التجاري](BUSINESS_MODEL_AR.md)
- [دليل تجربة المستخدم](UX_UI_GUIDELINES_AR.md)
- [تقدم المشروع](CODEX_PROGRESS.md)
- [ملاحظات الأمن](SECURITY_NOTES.md)
- [تقرير الاختبارات](TEST_REPORT.md)
- [العوائق والقرارات](CODEX_BLOCKERS.md)
- [مراجعة UX](UX_REVIEW.md)
- [سجل التغييرات](CHANGELOG.md)

## تحذيرات مهمة

- واجهة الويب العربية موجودة على فرع التطوير، لكن شاشات الموردين والمشتريات والإعدادات لم تُربط بعد بالواجهة.
- لم تُختبر عمليات قاعدة البيانات التجارية على PostgreSQL باختبارات تكامل، ولم تُنفذ اختبارات E2E.
- تطبيقات الهاتف ولوحة إعدادات المتجر الكاملة وتجهيز النشر والنسخ الاحتياطي ما زالت غير مكتملة.
- مسار المشتريات الحالي يسجل الفاتورة كـ مستلمة مباشرة؛ دورة المسودة والاعتماد والإلغاء والمرتجعات للمورد تحتاج تصميمًا واختبارات إضافية.
- لا تستخدم المشروع في الإنتاج قبل إكمال اختبارات التكامل والأمن والتشغيل.
