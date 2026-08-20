# Security Policy — Discovery Stage

هذا المشروع غير موزع بعد ولا يحتوي Firmware خاصًا به. خلال Milestone 0:

- لا تُقبل ملفات Firmware مجهولة كمصدر حقيقة.
- لا تُخزن Binding phrases أو UID أو Wi-Fi credentials في تقارير البحث أو logs.
- لا تُنفذ Hardware writes.
- لا تُنسخ secrets أو access tokens إلى المستودع.
- أي dependency أو artifact أو manifest يدخل لاحقًا يحتاج provenance وhash وسياسة تحديث.

حدود الثقة التي يجب إغلاقها قبل التنفيذ: upstream source، target metadata، artifact hosting، build toolchain، browser device permissions، local storage، diagnostic export، وplatform adapters.

سياسة الإبلاغ العامة وعنوان التواصل الأمني سيحددان قبل فتح المشروع أو نشر أول Release.
