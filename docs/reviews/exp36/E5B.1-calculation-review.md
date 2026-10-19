# Experiment 36 — E5B.1 Calculation Review

**Status:** candidate calculation utilities only — `teacher-review-pending`  
**Runnable:** no  
**RAG-approved:** no  
**Source:** `nie-handbook-2018`, PDF pages 119–121 / printed pages 111–113  
**SHA-256:** `1d32553317439d992adccc75ba905f98e35b87536607362736f175722ab9fcbe`

This document records ideal stoichiometric relationships that can be tested
offline. It does not approve an Experiment 36 handler, endpoint acceptance
window, observed result, safety consequence, or assessment rule.

## Confirmed and conditional inputs

| Input                    | Value                                                      | Status                                              |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------- |
| Na₂CO₃ sample mass       | 0.20–0.22 g, accurate to 0.1 mg                            | Source-stated; observed mass remains a trial input  |
| Na₂CO₃ molar mass        | 105.99 g mol⁻¹, with 106 g mol⁻¹ as a rounded school value | Conditional calculation input                       |
| Initial water            | 50.00 cm³                                                  | Source-stated preparation step, not final volume    |
| Final preparation volume | 250 cm³ = 0.250 dm³                                        | Source-stated final mark                            |
| Aliquot                  | Extracted as `50.cm³` / approximately 50 cm³               | Precision and interpretation require teacher review |
| HCl concentration        | Approximately 0.1 / 0.100 mol dm⁻³                         | Exact value and precision require teacher review    |
| Repetition               | At least three titrations and average endpoint volumes     | Source-stated; no concordance rule supplied         |

## Pure calculation relationships

For mass `m` in grams and molar mass `M` in g mol⁻¹:

```text
n(Na₂CO₃) = m / M
```

For final preparation volume `Vₚ = 0.250 dm³`:

```text
c(Na₂CO₃) = n(Na₂CO₃) / Vₚ
```

For a teacher-confirmed aliquot `Vₐ` in dm³:

```text
nₐ(Na₂CO₃) = c(Na₂CO₃) × Vₐ
```

Under the ideal carbonate stoichiometric model:

```text
n(HCl) at first equivalence = 1 × nₐ(Na₂CO₃)
n(HCl) at second equivalence = 2 × nₐ(Na₂CO₃), cumulative
```

For supplied HCl concentration `c(HCl)`:

```text
V₁(HCl) = nₐ / c(HCl)
V₂,cumulative(HCl) = 2 × nₐ / c(HCl)
```

The second value is the total burette delivery from the initial reading. It
is not the additional volume after the first endpoint. The additional
second-stage delivery would be `V₂,cumulative − V₁`, but it is not exposed as
an accepted endpoint or grading result by E5B.1.

For trial readings in one unit:

```text
mean(V) = ΣVᵢ / k
```

The utility requires `k ≥ 3` by default because the source says to repeat at
least three times. It does not apply a concordance threshold, discard trials,
or infer experimental quality.

## Scientific boundary

The calculated volumes are ideal stoichiometric predictions. They are not
necessarily the volumes observed at the phenolphthalein or methyl-orange
indicator endpoints. E5B.1 does not implement:

- pH thresholds or colour-change acceptance windows;
- titration curves;
- warming or CO₂ effects;
- experimental error consequences;
- measurement tolerances or concordance rules;
- competency scoring or grading thresholds.

All utility inputs require finite, non-negative values; quantities used as
mass, concentration, amount, final volume or aliquot are additionally required
to be positive. Units are explicit and mixed-unit trial averages are rejected.

## Teacher-review checklist

- [ ] Confirm apparatus identities, capacities and omitted procedure apparatus.
- [ ] Confirm whether the aliquot is exactly 50.00 cm³ or only approximately 50 cm³.
- [ ] Confirm whether 105.99 or 106 g mol⁻¹ is the accepted calculation value.
- [ ] Confirm the exact HCl concentration and permitted precision.
- [ ] Approve the ideal first-equivalence stoichiometric relationship.
- [ ] Approve the ideal second-equivalence relationship and cumulative-volume interpretation.
- [ ] Distinguish theoretical equivalence volumes from observed indicator endpoints.
- [ ] Review phenolphthalein and methyl-orange observation terminology.
- [ ] Review the warming instruction and the scientific treatment of CO₂.
- [ ] Approve experiment-specific chemical safety and disposal rules.
- [ ] Define acceptable measurement tolerances and repeatability/concordance rules.
- [ ] Define any assessment or scoring criteria.
- [ ] Review Sinhala terminology and teacher-reviewed translations.

Teacher approval remains pending. Software unit tests establish arithmetic and
validation behavior only; they do not constitute scientific validation.
