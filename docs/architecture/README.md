# Architecture Foundation

اتجاه المعمارية المنفذ منذ Milestone 1:

`UI → Workflows → Core services → ExpressLRS adapter → Platform/device adapters → Official tools/protocols`

الـUI لا يقرر Target أو compatibility أو Binding strategy. Core يعيد structured
states/results/errors/progress، ويظل مستقلًا عن React وDOM واللغة والمنصة.

Phase 0 خرجت إلى Foundation/Mock فقط، مع بقاء Hardware/write/release gates
مؤجلة. المجلد يوثق:

- [مقترح Milestone 1 وبوابة القبول الأصلية](milestone-1-proposal.md).
- [حدود Core API التجريبية](core-api.md).
- [مسارات Binding/Update التجريبية وحالات الفشل](mock-workflows.md).
- [مرشح Milestone 2A للاتصال الحقيقي للقراءة فقط](milestone-2-read-only-device.md).
- [مرشح Milestone 3 لمعاينة وموافقة Binding التجريبية](milestone-3-binding-simulation.md).
- [ADR-0010: قرار Local HTTP للقراءة فقط](../adr/ADR-0010-read-only-local-http-discovery.md).
- [ADR-0011: الموافقة المرتبطة بمعاينة Binding](../adr/ADR-0011-preview-bound-binding-approval.md).
- [أدلة قبول Milestone 1 الحالية](../testing/milestone-1-acceptance.md).
- [أدلة قبول مرشح Milestone 2A](../testing/milestone-2-read-only-acceptance.md).
- [أدلة قبول مرشح Milestone 3 البرمجي](../testing/milestone-3-binding-simulation-acceptance.md).
- [إجراء اختبار العتاد والمتصفح للقراءة فقط](../testing/milestone-2-hardware-browser-runbook.md).

البنية ليست API مستقرة بعد. يوجد Browser Local HTTP candidate للقراءة فقط،
دون اعتماد Hardware أو Target ودون أي write capability. كما يوجد مختبر M3
منفصل يعمل بموفري Mock/Synthetic فقط، ويشترط معاينة وموافقة مرتبطة بالحقائق
قبل المحاكاة. لا يوجد Provider حقيقي لـBinding أو Android أو Firmware write.
