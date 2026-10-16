# Supermarket — منصة إدارة السوبر ماركت متعددة المتاجر

حالة المشروع: **نواة برمجية أولية قيد التطوير، غير جاهزة للإنتاج.**

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
- أمر CLI محدود لإنشاء مسؤول المنصة الأول من متغيرات بيئة، دون endpoint تسجيل عام.
- مخطط Prisma أولي للمتاجر والعضويات والتدقيق والمنتجات والمخزون والباقات والاشتراكات والإضافات والمدفوعات والجلسات.
- قواعد وصول أولية قابلة للاختبار للتحقق من عضوية المتجر واستحقاق الإضافات.
- سير GitHub Actions لفحص النوع والاختبارات والبناء؛ راجع حالة التشغيل قبل الاعتماد عليه.

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

بعد إعداد قاعدة البيانات والترحيلات، نفّذ الأمر مرة واحدة في بيئة موثوقة. لا تمرر كلمة المرور في سطر الأوامر؛ حمّلها كمتغير بيئة آمن من مدير الأسرار أو من جلسة محلية آمنة:

```bash
BOOTSTRAP_ADMIN_EMAIL=admin@example.com \
BOOTSTRAP_ADMIN_PASSWORD='replace-with-a-long-random-password' \
npm run bootstrap:admin --workspace @supermarket/api
```

الأمر يرفض العمل إذا كان هناك مسؤول منصة موجود. المثال توضيحي فقط؛ لا تستخدم كلمة المرور المذكورة فعليًا. لا يوجد تسجيل عام للمستخدمين.

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

- لم تُنفذ بعد واجهات إدارة المتاجر والمنتجات والمخزون أو عمليات البيع والشراء.
- لم يُثبت نجاح جميع فحوص البناء والاختبارات بعد.
- لا تستخدم المشروع مع بيانات حقيقية أو في الإنتاج قبل إكمال الاختبارات الأمنية والتشغيلية.
