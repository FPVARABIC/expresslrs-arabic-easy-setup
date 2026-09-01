# Physical acceptance package status

- Package implementation commit: `54d91cf56944d8e8428d1e833b9989584c863513`
- Integration branch: `feat/m2-real-hardware-first-test`
- Recorder schema: `1`
- Recorder test steps: `19`
- Sequential recorder locks: `NONE`
- Local persistence: `ENABLED`
- JSON export/import: `ENABLED`
- Markdown report export: `ENABLED`
- Live application context capture: `ENABLED`
- Sensitive free-text export redaction: `ENABLED`
- Hardware observation at package creation: `NONE`

All nineteen result entries remain available from the first render. The displayed order is a risk-reduction recommendation, not a software prerequisite graph. Device-write code continues to require the actual safety evidence needed to avoid writing an unverified Target or starting without a recovery package, stable power acknowledgement, and—on TX—an attached antenna.

The exact Candidate SHA shown in an exported report must match the deployed build used during the physical session. The reviewed Pages workflow supplies this value at build time; the recorder also permits explicit correction before export.
