# Architecture Foundation

اتجاه المعمارية المنفذ في Milestone 1:

`UI → Workflows → Core services → ExpressLRS adapter → Platform/device adapters → Official tools/protocols`

الـUI لا يقرر Target أو compatibility أو Binding strategy. Core يعيد structured states/results/errors/progress، ويظل مستقلًا عن React وDOM واللغة والمنصة.

Phase 0 خرجت إلى Foundation/Mock فقط، مع بقاء Hardware/write/release gates مؤجلة. المجلد يوثق:

- [مقترح Milestone 1 وبوابة القبول الأصلية](milestone-1-proposal.md).
- [حدود Core API التجريبية](core-api.md).
- [مسارات Binding/Update التجريبية وحالات الفشل](mock-workflows.md).
- [مرشح Milestone 2A للاتصال الحقيقي للقراءة فقط](milestone-2-read-only-device.md).
- [أساس Milestone 5 للتشخيص البرمجي للقراءة فقط](milestone-5-read-only-diagnostics.md).
- [أساس PWA والعمل المحدود دون إنترنت](pwa-offline-foundation.md).
- [ADR-0010: قرار Local HTTP للقراءة فقط](../adr/ADR-0010-read-only-local-http-discovery.md).
- [أدلة قبول Milestone 1 الحالية](../testing/milestone-1-acceptance.md).
- [أدلة قبول مرشح Milestone 2A](../testing/milestone-2-read-only-acceptance.md).
- [أدلة قبول أساس Milestone 5 للتشخيص للقراءة فقط](../testing/milestone-5-read-only-diagnostics-acceptance.md).
- [أدلة قبول أساس PWA والعمل المحدود دون إنترنت](../testing/pwa-offline-foundation-acceptance.md).
- [إجراء اختبار العتاد والمتصفح للقراءة فقط](../testing/milestone-2-hardware-browser-runbook.md).

البنية ليست API مستقرة بعد. يوجد Browser Local HTTP candidate للقراءة فقط،
ودائرة Diagnostics برمجية للقراءة فقط، وأساس PWA آمن للـstatic shell دون
Firmware cache أو اعتماد Hardware أو Target ودون أي write capability. لا يوجد
Provider حقيقي لـAndroid أو Firmware write.
