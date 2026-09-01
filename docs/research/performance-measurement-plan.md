# Performance Measurement Plan

Status: research design only. No Firmware modification and no performance claim.

## Baselines

Two independent baselines are required:

1. **Official artifact baseline** — exact official binary, locally calculated SHA-256, and observed runtime identity. It represents what users received but may contain incompletely recorded build inputs.
2. **Controlled source baseline** — ExpressLRS 4.1.0 at `a9d4a9cb5b5687c4c9d7e9e7fbdf44ad93651da6`, exact Targets SHA, pinned toolchain/dependencies, zero local patches, and repeatable configuration.

A candidate must be compared against a controlled baseline built with the same inputs. Differences between an official binary and a locally controlled build cannot automatically be attributed to our patch.

## Harness model

```text
Stimulus generator
→ TX input timestamp
→ TX firmware/radio
→ controlled attenuation/link
→ RX firmware
→ RX output timestamp
→ raw event collector
→ immutable run manifest
→ analysis report
```

## First metrics

- Per-packet received/missing events and burst-loss distribution.
- LQ, RSSI, and SNR with timestamps.
- Loss detection, recovery initiation, first valid packet, and usable-link restoration time.
- Reconnect-loop count and false-recovery transitions.
- End-to-end latency/jitter: median, p95, p99, and maximum.
- Telemetry throughput/delivery latency and control-link impact.
- ISR/main-loop duration and deadline misses.
- RAM/flash delta and build identity.

“Usable link restored” needs a test-specific definition before data collection; command completion or first RF packet alone is not sufficient.

## Upstream instrumentation map

| Signal area | Stable 4.1.0 source |
| --- | --- |
| Fixed-window link quality | `src/lib/LQCALC/LQCALC.h` |
| RX sync/connection/rate cycling/link statistics | `src/src/rx_main.cpp` |
| TX sync/telemetry/timing paths | `src/src/tx_main.cpp` |
| Dynamic power statistics and thresholds | `src/src/dynpower.cpp` |
| Band/radio rate and telemetry tables | `src/src/common.cpp` |
| Reliable telemetry state | `src/lib/StubbornSender/`, `src/lib/StubbornReceiver/` |
| Frequency hopping | `src/lib/FHSS/` |
| Radio drivers | `src/lib/SX1280Driver/`, `src/lib/SX127xDriver/`, `src/lib/LR1121Driver/` |

The `DEBUG_RCVR_LINKSTATS` path changes behavior in `rx_main.cpp`; it must not be assumed measurement-neutral. Instrumentation overhead must be compared with external timing measurements.

## Controlled test policy

- Same reference TX/RX, target snapshots, toolchain, power, antennas, packet mode, telemetry ratio, and regulatory domain.
- Legal shielded or conducted attenuation for repeatable degradation; no uncontrolled jamming.
- Randomized paired baseline/candidate order.
- Pilot runs to estimate variance, then predeclared run count and thresholds.
- Preserve raw data plus environment and build manifests.
- Bench first, then controlled RF, hardware validation, and only then controlled flight.

## Candidate admission

Every candidate requires:

```text
Hypothesis
Change
Expected effect
Baseline identity
Test procedure
Raw results
Statistical summary
Cross-metric regression analysis
Hardware validation level
Decision: KEEP / MODIFY / REJECT
```

No range, stability, recovery, latency, telemetry, or resource claim enters Stable without repeatable measurements and an acceptable regression profile.
