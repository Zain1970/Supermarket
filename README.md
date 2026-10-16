# Supermarket — منصة إدارة السوبر ماركت متعددة المتاجر

حالة المشروع: **نواة API أولية قيد التطوير، غير جاهزة للإنتاج.**

الهدف هو بناء منصة SaaS عربية RTL لإدارة عدة متاجر مع عزل بيانات المستأجرين، اشتراكات، وإضافات مستقلة مدفوعة مثل POS وAI Analytics.

## التقنيات

- Node.js + Express + TypeScript
- Prisma + PostgreSQL
- React + Vite للواجهات الويب
- React Native + Expo لتطبيقات الهاتف
- OpenAPI واختبارات آلية

## ما هو موجود حاليًا

- نقطة فحص صحة API: `GET /health`.
- مسارات تسجيل الدخول والخروج والجلسة الحالية.
- جلسات عشوائية لا يُخزن منها إلا SHA-256 hash، وملف cookie من نوع HttpOnly/SameSite Strict.
- أمر CLI محدود لإنشاء مسؤول المنصة الأول من متغيرات بيئة، مع قفل قاعدة بيانات لتسلسل محاولات التهيئة.
- مخطط Prisma للمتاجر والعضويات والتدقيق والمنتجات والمخزون والباقات والاشتراكات والإضافات والمدفوعات والجلسات.
- API محمي لعرض المنتجات وإنشاءها مع تحقق عضوية المتجر والصلاحيات.
- API محمي لعرض حركات المخزون وتسجيل تعديلات الكميات بمعاملة Serializable وسجل تدقيق ومفتاح Idempotency.
- قواعد وصول أولية قابلة للاختبار للتحقق من عضوية المتجر واستحقاق الإضافات.
- GitHub Actions نجح في تشغيل Prisma generate وTypeScript typecheck والاختبارات والبناء. راجع [تقرير الاختبارات](TEST_REPORT.md) للتشغيل والعدد الدقيق.

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
printf '\n'
export BOOTSTRAP_ADMIN_PASSWORD
npm run bootstrap:admin --workspace @supermarket/api
unset BOOTSTRAP_ADMIN_PASSWORD
```

تحتاج كلمة المرور إلى 14 محرفًا على الأقل. الأمر يرفض العمل إذا كان هناك مسؤول منصة موجود. لا يوجد تسجيل عام للمستخدمين.

## واجهات API الحالية

- `GET /health`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `GET /stores/:storeId/products`
- `POST /stores/:storeId/products`
- `GET /stores/:storeId/stock-movements`
- `POST /stores/:storeId/stock-movements` — يتطلب ترويسة `Idempotency-Key` فريدة لكل عملية.

واجهات المنتجات والمخزون تتطلب جلسة صالحة وعضوية المتجر المناسبة. لم تُنفذ بعد اختبارات تكامل قاعدة البيانات لهذه العمليات.

## التحقق

```bash
npm run typecheck
npm test
npm run build
```

النتائج الفعلية تُسجّل في [تقرير الاختبارات](TEST_REPORT.md) وحالة [GitHub Actions](https://github.com/Zain1970/Supermarket/actions).

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
- [عقد OpenAPI الأولي](docs/openapi.yaml)

## تحذيرات مهمة

- لم تُنفذ بعد إدارة المتاجر والأعضاء، المشتريات والمبيعات وPOS والاشتراكات والإضافات عبر واجهات مكتملة.
- لم تُختبر عمليات قاعدة البيانات التجارية على PostgreSQL باختبارات تكامل.
- لا تستخدم المشروع مع بيانات حقيقية أو في الإنتاج قبل إكمال الاختبارات الأمنية والتشغيلية.
