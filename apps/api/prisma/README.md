# قاعدة البيانات

المخطط الحالي في `schema.prisma` هو بداية تصميمية تشمل المتاجر والعضويات والتدقيق والمنتجات وحركات المخزون والباقات والاشتراكات والإضافات والمدفوعات.

## التحقق محليًا

من جذر المستودع:

```bash
npm install
npx prisma validate --schema apps/api/prisma/schema.prisma
npx prisma generate --schema apps/api/prisma/schema.prisma
```

لإنشاء ترحيل بعد إعداد PostgreSQL محليًا وملف `.env`:

```bash
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name initial_schema
```

لا تشغّل ترحيلات على قاعدة إنتاج قبل مراجعتها وأخذ نسخة احتياطية. لم يتم تشغيل التحقق أو الترحيل بعد في بيئة تنفيذ هذا العمل.
