# NS-3: Perception and Inspection

Implementation policy: `fixture-perception-v1`. This is an explicit fixture policy,
not RPG balance, a stat progression system, party perception, or service exposure.
Existing actors without a profile keep `fixture-visibility-v1`; old receipts and
contexts retain their old interpretation and exact bytes.

## Disclosure

The host resolves one of four allowlisted profiles: untrained (0), alert (1), keen
(2), expert (3). The command supplies only an inspection direction. It cannot
supply a score, a remote viewpoint, a hidden feature ID, or a detection threshold.

- Undetected: concealed features contribute no public identity, count, location,
  or threshold. Coverage records still describe the public area examined.
- Suspicious: one vague cue per adjacent public direction. Multiple concealed
  objects in that direction do not produce identities or object counts.
- Detected: identity, type, observed position and fixture state. No examination
  description or causal wiring is included.
- Examined: expert perception plus deliberate inspection of the occupied or one
  directly connected visible cell. Only authored player-permitted detail is added.

Passive vision uses the existing radius-two connected-cell policy. Concealed
feature detection and deliberate inspection are limited to the occupied/adjacent
cells reached by that view. A blocked visible doorway or missing crossing prevents
inspection through it. Panning the camera never changes the actor viewpoint.
The fixture has clear conditions only; weather, variable sensory conditions and
per-feature thresholds belong in a future version of this replaceable policy.

## Evidence and Persistence

An inspection is a separate stopped-travel command. Its immutable observation
records the original attempt ID, policy, host-resolved profile/effective value,
conditions, viewpoint, direction, covered cells, depth and coverage limitation.
The source-local validator checks these relationships without using current world
truth to reinterpret old observations.

Evaluation is deterministic: repeated inspections at unchanged conditions cannot
farm another chance or gain progression. Distinct attempts retain distinct source
receipts; retransmitting the same attempt uses the durable original receipt.
Remembered detection and examination survive a weaker profile. Failure to detect
a previously concealed feature does not imply it vanished or refresh its state.
This conservative policy does not yet confirm absence of concealed mechanisms.

Human and decision-fixture consumers receive the same fact projection. The human
preview renders that archived JSON, not host truth. The preview's Inspect tab
selects isolated per-profile saves with `?expedition=3&perception=expert` (or the
other three profile IDs). The default legacy slot and ordinary RPG saves are not
migrated. Authored trap detail does not implement trap damage or a disarm action.

## Qualification

Domain: 86 directed tests pass, including 12 NS-3 cases for grades, parity,
identity/count opacity, passive-versus-deliberate disclosure, occlusion, no farming,
expired-profile memory, malformed evidence, and legacy policy compatibility.
The four additional lifecycle tests qualify the shared destination-operation core
extracted for the forthcoming streamed adapter; the fixed fixture already uses it.

Five actual Chrome IndexedDB cases pass: all four profiles, original-attempt replay
after takeover/reload, immutable archived context, and rejection of caller-supplied
power/viewpoint/hidden identity. Two UI cases pass at 1280x800 and 390x844; inspected
screenshots under `test-results/ns3-play` show readable controls, bounded results,
and more than 300px of map height. The production build passes.

The pre-extraction full suite passed 1,400 tests / 93 files in 143.10 seconds;
the post-extraction focused suite passed 86 tests / 10 files. Full regression is
rerun after the remaining slices integrate. This remains provider-free local proof.
