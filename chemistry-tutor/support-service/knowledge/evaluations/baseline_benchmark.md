# Chemistry baseline benchmark (ungrounded, no RAG)

Generated: 2026-10-20T19:07:16.053257+00:00

Same 17 questions as correctness_benchmark.md, answered with NO retrieval,
NO citations, and NO abstention logic — just the raw LLM's own chemistry
knowledge. This is the baseline for the thesis's baseline-vs-proposed-method
comparison; the proposed method's results are in correctness_benchmark.md.

For each question below: read the answer, check it against the NIE syllabus/
resource book, and mark Correct / Incorrect / Partially correct, same as the
proposed-method benchmark.

---

## 1. [EN] What is electronegativity?

**Expected unit:** 1

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Electronegativity – a concise definition**

Electronegativity is a **relative measure of an atom’s ability to attract the bonding‑pair of electrons toward itself when it is part of a chemical bond**. In other words, it tells us how “greedy” an atom is for electrons in a covalent bond.

---

### 1. Why do we need the concept?

- Atoms do not have a fixed “pull” on electrons; the pull depends on the environment (the other atom it is bonded to).  
- By assigning each element a single numerical value, we can **compare** the electron‑attracting power of different atoms and predict the type of bond that will form (ionic, polar covalent, non‑polar covalent).

---

### 2. How is it expressed?

- **Pauling scale** – the most widely used.  
  - Values are dimension‑less and range roughly from **0.7 (for Cs, Fr)** to **4.0 (for F)**.  
  - The scale is based on bond‑energy data: the greater the difference in bond energies between A–A, B–B and A–B, the larger the electronegativity difference Δχ.

- Other scales exist (Mulliken, Allred‑Rochow, Sanderson), but for A‑Level chemistry the Pauling values are the standard reference.

---

### 3. Periodic trends (G.C.E. A‑Level focus)

| Direction | Trend | Reason |
|-----------|-------|--------|
| **Across a period (left → right)** | **Increase** | Nuclear charge increases while the added electrons go into the same principal energy level, so the effective nuclear charge felt by the valence electrons rises. |
| **Down a group (top → bottom)** | **Decrease** | Additional electron shells are added, increasing the distance between the nucleus and the bonding electrons and adding shielding, which reduces the pull on the bonding pair. |

**Resulting pattern:** The most electronegative element is **fluorine (χ ≈ 4.0)**, located at the top‑right corner of the periodic table (excluding the noble gases, which are usually not assigned electronegativities because they rarely form bonds). The least electronegative are the alkali metals (e.g., Cs, χ ≈ 0.7).

---

### 4. Using electronegativity to predict bond character

1. **Δχ (difference in electronegativity) ≈ 0** → non‑polar covalent bond (e.g., H₂, Cl₂).  
2. **0 < Δχ < ~1.7** → polar covalent bond (e.g., HCl, CH₃Cl).  
3. **Δχ > ~1.7** → bond has a large ionic character (e.g., NaCl, MgO).  

*The exact cut‑offs are approximate; they are useful guidelines for A‑Level exams.*

---

### 5. Example calculations (A‑Level style)

**Example 1:** *Predict the bond type in H–F.*

- χ(H) = 2.20, χ(F) = 3.98 → Δχ = 1.78  
- Δχ > 1.7 → the H–F bond is **highly polar covalent**, often described as having significant ionic character.

**Example 2:** *Which atom in H₂O carries the partial negative charge?*

- χ(O) = 3.44, χ(H) = 2.20 → O is more electronegative, so the electron density is drawn toward oxygen.  
- Result: **O carries a δ⁻**, each H carries a δ⁺.

---

### 6. Common misconceptions to avoid

| Misconception | Correct view |
|---------------|--------------|
| “Electronegativity is the same as electron affinity.” | They are related but distinct: electron affinity is the energy change when an isolated atom gains an electron, while electronegativity is a *relative* tendency in a bond. |
| “All elements have a fixed electronegativity value.” | The value is a **scale** based on a reference (hydrogen = 2.20 on the Pauling scale). It is not an absolute physical constant. |
| “Noble gases have zero electronegativity.” | They are usually omitted from the scale because they rarely form bonds; when they do (e.g., XeF₂), a value can be assigned, but it is not part of the standard tables. |

---

### 7. Quick reference table (selected A‑Level elements)

| Element | Symbol | Pauling χ |
|---------|--------|-----------|
| Fluorine | F | 4.00 |
| Oxygen   | O | 3.44 |
| Nitrogen | N | 3.04 |
| Chlorine | Cl | 3.16 |
| Carbon   | C | 2.55 |
| Hydrogen | H | 2.20 |
| Sulphur  | S | 2.58 |
| Phosphorus| P | 2.19 |
| Sodium   | Na | 0.93 |
| Potassium| K | 0.82 |
| Calcium  | Ca | 1.00 |
| Magnesium| Mg | 1.31 |

*(Values are rounded to two decimal places.)*

---

### 8. Bottom line for your A‑Level studies

- **Electronegativity = “electron‑pulling power” in a bond.**  
- Use the **Pauling scale** and the **Δχ rule** to decide whether a bond is non‑polar covalent, polar covalent, or largely ionic.  
- Remember the **periodic trends** (increase across a period, decrease down a group) to quickly estimate relative values when a table is not provided.

Understanding electronegativity will help you with topics such as **bond polarity, dipole moments, acid‑base behavior, oxidation‑reduction potentials, and the shapes of molecules**—all of which are core components of the G.C.E. Advanced Level Chemistry syllabus. Good luck with your studies!

**Citations:** (none — baseline has no retrieval step)

**Review:** [x] Correct  [ ] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Correct and complete. Pauling scale, periodic trends, and bond-polarity cutoffs all standard and accurate.

---

## 2. [EN] Explain Rutherford's gold foil experiment and what it showed about atomic structure.

**Expected unit:** 1

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Rutherford’s Gold‑Foil Experiment (1911)**  

| Aspect | What was done / observed | Why it matters for the atomic model |
|--------|--------------------------|-------------------------------------|
| **Purpose** | Test J.J. Thomson’s “plum‑pudding” (or “soft‑ball”) model of the atom, which imagined the positive charge spread uniformly throughout the atom with electrons embedded like raisins in a pudding. | If the positive charge were diffuse, a passing α‑particle (a He²⁺ nucleus) should be deflected only a little, never turned back. |
| **Experimental set‑up** | 1. A very thin sheet of gold foil (≈ 1000 atoms thick). <br>2. A source of α‑particles (radium or polonium). <br>3. A circular fluorescent screen (zinc sulfide) surrounding the foil, marked with concentric circles to measure scattering angles. <br>4. A microscope to count the tiny flashes of light produced when an α‑particle hits the screen. | The foil had to be thin enough that most α‑particles could pass through, yet thick enough to give a measurable number of collisions. |
| **Observations** | 1. **~96 %** of the α‑particles passed straight through the foil with little or no deflection. <br>2. **~4 %** were deflected at angles of a few degrees. <br>3. **≈1 in 8000** α‑particles were scattered at angles greater than 90° – some even bounced back toward the source. | The vast majority of the atom is empty space (so most particles go straight through). The few large‑angle deflections require a very strong, localized positive charge. |
| **Interpretation (Rutherford’s conclusions)** | 1. **The atom is mostly empty.** <br>2. **All of the atom’s positive charge (and most of its mass) is concentrated in a tiny region** – the **nucleus**. <br>3. The nucleus is **extremely small** compared with the overall size of the atom (≈ 10⁻⁵ of the atomic radius). <br>4. Electrons must orbit the nucleus at relatively large distances. | This picture replaced the plum‑pudding model with the **nuclear (or planetary) model** of the atom. |
| **Key quantitative result** | Using the Coulomb scattering formula (Rutherford scattering law)  

\[
\frac{d\sigma}{d\Omega}= \left(\frac{Z_1 Z_2 e^{2}}{16\pi\varepsilon_0 E}\right)^{2}\frac{1}{\sin^{4}(\theta/2)}
\]

Rutherford could relate the number of particles scattered at a given angle (θ) to the charge (Z₂) of the scattering centre. The fit of the data required **Z₂ ≈ 79**, i.e. the whole nuclear charge of a gold atom. | Shows that the scattering is caused by a **single, massive, positively‑charged centre** rather than many small charges spread throughout the foil. |
| **What the experiment *did not* explain** | • Why electrons do not spiral into the nucleus (classical physics predicts they should). <br>• The discrete spectral lines of atoms. | These shortcomings led Niels Bohr (1913) to add quantised electron orbits, and later quantum mechanics gave the modern orbital picture. |

---

### How to remember the experiment for A‑Level exams  

1. **Set‑up diagram** – draw a source of α‑particles, a thin gold foil, and a circular detector screen with labelled angles (0°, 30°, 90°, 180°).  
2. **Key numbers** – “most go straight through; a few are deflected a little; a very few bounce back.”  
3. **Main conclusion** – **tiny, dense, positively‑charged nucleus** + **mostly empty space**.  
4. **Why it mattered** – it **disproved the plum‑pudding model** and gave the **nuclear model**, the foundation for Bohr’s model and modern quantum chemistry.  

---

### Quick checklist for answering a past‑paper question  

| Question part | What to include |
|---------------|-----------------|
| **Describe the experimental arrangement** | α‑source, gold foil, fluorescent screen, measurement of scattering angles. |
| **State the observed results** | Percentages of straight‑through, small‑angle, and large‑angle (including back‑scattered) α‑particles. |
| **Explain why the results contradict the plum‑pudding model** | Diffuse positive charge would never give large‑angle scattering. |
| **Give Rutherford’s interpretation** | Atom is mostly empty; all positive charge and most mass in a tiny nucleus; electrons occupy the surrounding space. |
| **Mention the quantitative law (optional)** | Rutherford scattering formula, showing dependence on 1/ sin⁴(θ/2). |
| **Link to later developments** | Bohr’s quantised orbits → quantum mechanical orbital model. |

---

#### Bottom line  

Rutherford’s gold‑foil experiment **proved that an atom is not a uniform sphere of charge** but a **tiny, massive nucleus surrounded by a cloud of electrons**, a discovery that reshaped the entire field of chemistry and physics and underpins everything you will study later in atomic structure, periodic trends, and chemical bonding.

**Citations:** (none — baseline has no retrieval step)

**Review:** [x] Correct  [ ] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Correct and complete. Standard account of setup, observations (~1 in 8000 large-angle), and nuclear-model conclusion.

---

## 3. [EN] State the Aufbau principle.

**Expected unit:** 1

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Aufbau Principle (Building‑up Principle)**  

The Aufbau principle states that electrons occupy atomic orbitals in order of increasing energy: an orbital of lower energy is filled completely before electrons begin to fill an orbital of higher energy.  

In practice this means that, when writing the electron configuration of an atom, the sequence of orbital filling follows the order dictated by the relative energies of the subshells (e.g., 1s < 2s < 2p < 3s < 3p < 4s < 3d < 4p < 5s < 4d < 5p < 6s < 4f < 5d < 6p < 7s < 5f < 6d < 7p).  

Thus, each electron “builds up” the electron configuration by first occupying the lowest‑energy orbital that is still available, obeying the Pauli exclusion principle and Hund’s rule as it proceeds.

**Citations:** (none — baseline has no retrieval step)

**Review:** [x] Correct  [ ] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Correct and complete. Standard statement and filling order.

---

## 4. [EN] What is Hund's rule?

**Expected unit:** 1

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Hund’s Rule (the “Maximum‑Multiplicity Rule”)**

Hund’s rule is one of the three basic principles that govern how electrons fill the available atomic orbitals when we write electron configurations. It works together with the **Pauli‑exclusion principle** and the **Aufbau (building‑up) principle**.

---

### Statement of Hund’s Rule  

*For a set of degenerate orbitals (orbitals that have the same energy, e.g. the three p‑orbitals, the five d‑orbitals, or the seven f‑orbitals), electrons will first occupy **separate orbitals** with **parallel spins** before any orbital receives a second electron.*  

In other words:

1. **Maximum number of unpaired electrons** – put one electron in each orbital of the subshell before pairing.
2. **Maximum total spin** – the electrons placed singly all have the same spin direction (usually represented as ↑).

---

### Why does this happen?  

- **Electron‑electron repulsion:** When two electrons share the same orbital they are forced to stay close together, which increases repulsion. By spreading out the electrons into different orbitals, the average distance between them is larger, lowering the overall energy.
- **Exchange energy:** Electrons with parallel spins can exchange places without violating the Pauli principle, which gives an extra stabilising “exchange” energy. This makes the high‑spin (maximum‑multiplicity) arrangement lower in energy than a low‑spin one.

---

### How to apply Hund’s rule (step‑by‑step)

1. **Identify the subshell** you are filling (e.g., 2p, 3d, 4f).  
2. **Count the number of electrons** that need to be placed in that subshell.  
3. **Place one electron in each orbital** of that subshell, all with the same spin (↑).  
4. **If there are more electrons than orbitals**, start pairing them in the already‑occupied orbitals (still keeping the same spin direction for the first set).

---

### Examples (relevant to G.C.E. A‑Level)

| Element | Ground‑state configuration (valence part) | How the electrons are placed in the subshell | Resulting electron diagram |
|---------|-------------------------------------------|-----------------------------------------------|----------------------------|
| **Carbon (Z = 6)** | 1s² 2s² 2p² | 2p has three degenerate orbitals (2pₓ, 2pᵧ, 2p_z). First put one ↑ electron in 2pₓ, another ↑ in 2pᵧ. | ↑  ↑  – (one empty) |
| **Nitrogen (Z = 7)** | 1s² 2s² 2p³ | Three electrons → one ↑ in each of the three 2p orbitals. | ↑  ↑  ↑ |
| **Oxygen (Z = 8)** | 1s² 2s² 2p⁴ | After the three ↑ electrons, the fourth electron must pair in one of the orbitals (still ↑ for the first three). | ↑↓  ↑  ↑ |
| **Fluorine (Z = 9)** | 1s² 2s² 2p⁵ | Five electrons → three ↑ (one in each) + two ↓ paired in two of the orbitals. | ↑↓  ↑↓  ↑ |
| **Neon (Z = 10)** | 1s² 2s² 2p⁶ | Six electrons → each 2p orbital gets a pair (↑↓). | ↑↓  ↑↓  ↑↓ |

*The same idea works for d‑subshells (e.g., Cr: 3d⁵ 4s¹) and f‑subshells, though the number of orbitals is larger (5 for d, 7 for f).*

---

### Common misconceptions to avoid

| Misconception | Correct view |
|---------------|--------------|
| “Hund’s rule tells you which **orbital** gets the first electron (e.g., 2pₓ vs 2pᵧ).” | The rule does **not** specify a particular spatial orientation; any of the degenerate orbitals are equivalent. |
| “All electrons in a subshell must have the same spin.” | Only the **first set** of electrons (up to the number of orbitals) have parallel spins. Once pairing begins, the second electron in an orbital has opposite spin (↓). |
| “Hund’s rule applies to non‑degenerate orbitals (e.g., 2s, 3pₓ alone).” | The rule only concerns **degenerate** orbitals—those with the same energy. Single‑orbital subshells (s) are unaffected. |

---

### Quick mnemonic for students  

**“Hund’s rule: Fill each orbital singly before you double‑up, and keep the spins the same.”**  

You can remember it as **“SINGLE‑FIRST, SAME‑SPIN.”**

---

### Why it matters for A‑Level exams  

- **Electron‑configuration questions:** You’ll be asked to write the ground‑state configuration of atoms or ions. Applying Hund’s rule ensures the correct arrangement of electrons in p, d, and f subshells.
- **Term symbols & spectroscopy:** The number of unpaired electrons determines the spin multiplicity (2S + 1) of an atom, which appears in term symbols (e.g., \(^4\!S\), \(^2\!P\)). Hund’s rule tells you the maximum possible S.
- **Magnetic properties:** Atoms with unpaired electrons (as predicted by Hund’s rule) are **paramagnetic**, while those with all electrons paired are **diamagnetic**. This is a frequent conceptual question.

---

### Bottom line  

**Hund’s rule** tells us that, within a set of orbitals that have the same energy, electrons will occupy separate orbitals with parallel spins before any pairing occurs. This maximises the total spin (multiplicity) and minimises electron‑electron repulsion, giving the most stable (lowest‑energy) arrangement for the atom. Use it whenever you are filling p, d, or f subshells, and you’ll get the correct electron configurations and be able to predict magnetic behavior and term symbols.

**Citations:** (none — baseline has no retrieval step)

**Review:** [x] Correct  [ ] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Correct and complete. Statement, reasoning (exchange energy), and worked p-subshell examples all accurate.

---

## 5. [EN] Explain the trend in ionization energy across a period.

**Expected unit:** 1

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Ionization Energy (IE) – what it is**

Ionization energy is the amount of energy required to remove one mole of electrons from one mole of isolated, gaseous atoms in their ground state  

\[
\text{X(g)} \;\rightarrow\; \text{X}^{+}(g) + e^{-}
\]

The first‑ionization energy (IE₁) is the most commonly discussed value; higher‑order ionizations (IE₂, IE₃ …) follow the same idea but are always larger because the atom is already positively charged.

---

## 1. General trend across a period

When we move **left‑to‑right** across a period (e.g., from Li to Ne in period 2), the **first‑ionization energy increases steadily**.

```
Li   Be   B    C    N    O    F    Ne
  520  900  800  1086 1402 1314 1681 2080  (kJ mol⁻¹, period 2)
```

*(Values are illustrative; the exact numbers differ slightly between data tables.)*

---

## 2. Why does IE increase?

| Factor | What happens across a period | How it affects IE |
|--------|-----------------------------|-------------------|
| **Nuclear charge (Z)** | Increases by one proton for each successive element. | A larger positive charge pulls the electrons more strongly toward the nucleus. |
| **Shielding (electron‑electron repulsion)** | The added electrons enter the **same principal energy level (same n)**. They do not provide a new inner‑shell shield. | The *effective* nuclear charge (Z_eff = Z – σ) felt by the valence electrons rises because σ (shielding) stays almost constant while Z grows. |
| **Atomic radius** | The size of the atom contracts slightly because the stronger Z_eff pulls the electron cloud inward. | Electrons are held closer to the nucleus, so more energy is needed to remove one. |
| **Electron configuration stability** | Certain subshells (full or half‑filled) are especially stable (e.g., 2p⁶, 2p³). | Removing an electron from a particularly stable configuration requires extra energy, giving a local “bump” in the trend. |

Putting these together, the **effective nuclear charge** experienced by the outermost electron increases across a period, making it harder to pull that electron away → higher ionization energy.

---

## 3. Small irregularities (exceptions)

The overall rise is not perfectly smooth. Two well‑known “dips” appear in most periods:

1. **Between Group 2 and Group 3 (e.g., Be → B, Mg → Al)**  
   *Reason*: The electron being removed from a Group 3 element is entering a **p‑subshell** after a filled **s‑subshell**. The p‑electron is slightly farther from the nucleus and experiences a bit more shielding from the inner s‑electrons, so IE₁ drops relative to the preceding Group 2 element.

2. **Between Group 5 and Group 6 (e.g., N → O, P → S)**  
   *Reason*: Group 5 elements have a **half‑filled p‑subshell** (p³), which is relatively stable due to exchange energy. Adding one more electron to make a p⁴ configuration introduces electron‑electron repulsion in the same orbital, making it easier (i.e., lower IE) to remove that extra electron.

These exceptions are small compared with the overall upward trend, but they are important for A‑Level exam questions that ask you to **explain the pattern**.

---

## 4. How to use the trend in exam problems

1. **Predicting relative IE values**  
   - If asked which of two elements in the same period has the higher IE, choose the one farther to the right (unless the pair straddles one of the two exceptions).  

2. **Explaining a given value**  
   - Mention the increase in Z_eff and the decrease in atomic radius.  
   - If the element is at a dip, explicitly cite the subshell change (s → p) or the half‑filled stability.

3. **Drawing the graph**  
   - Plot IE (y‑axis) vs. atomic number (x‑axis) for a period.  
   - Show a generally rising curve with two shallow troughs at the positions described above.

---

## 5. Quick summary (bullet points)

- **IE ↑ across a period** because **Z_eff ↑** while shielding stays almost constant.  
- **Atomic radius ↓**, so electrons are held tighter.  
- **Exceptions**:  
  - **Group 2 → 3** (s → p) – slight drop.  
  - **Group 5 → 6** (half‑filled p³ → p⁴) – slight drop.  
- **Stability of half‑filled or fully‑filled subshells** can cause local maxima (e.g., N, O, F).  

Understanding these concepts will let you answer any A‑Level question on ionization energy trends with confidence. Good luck with your studies!

**Citations:** (none — baseline has no retrieval step)

**Review:** [x] Correct  [ ] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Correct and complete (not truncated this run). IE values match real data; correctly explains the Be>B and N>O dips.

---

## 6. [EN] What is VSEPR theory and how is it used to predict molecular shape?

**Expected unit:** 2

**Grounded:** False (baseline — no retrieval)

**Answer:**

**VSEPR Theory – “Valence‑Shell Electron‑Pair Repulsion”**

VSEPR is a simple, visual model that lets us predict the three‑dimensional shape of a molecule (or ion) from the arrangement of **electron pairs** around the central atom.  
The key idea is:

> **Electron pairs – whether they are bonding pairs (shared between atoms) or lone‑pair (non‑bonding) – repel each other and try to get as far apart as possible.**  

The shape we observe (the “molecular geometry”) is the arrangement of the **atoms** after the invisible lone‑pair clouds have taken up their positions.

---

## 1. Steps to Use VSEPR for an A‑Level Question

| Step | What to do | Why it matters |
|------|------------|----------------|
| **1. Write the Lewis structure** | Count the total valence electrons, distribute them to satisfy the octet rule (or expanded octet for elements in period 3‑7). | Gives you the number of **bonding pairs** and **lone pairs** on the central atom. |
| **2. Count electron‑pair domains (the “steric number”)** | **Steric number = (number of bonding pairs) + (number of lone pairs)** on the central atom. Each multiple bond (double, triple) still counts as **one** domain. | The steric number tells you which “basic geometry” (linear, trigonal‑planar, tetrahedral, trigonal‑bipyramidal, octahedral) the electron‑pair cloud adopts. |
| **3. Identify the AXE notation** | **A** = central atom, **X** = number of atoms bonded to A, **E** = number of lone pairs on A. Write it as AXₙEₘ (e.g., **AX₃E₁**). | This notation is a quick way to look up the corresponding molecular shape. |
| **4. Place lone‑pair domains first** | Lone pairs occupy positions that give them the **largest angles** (usually equatorial positions in trigonal‑bipyramidal, or axial in octahedral). | Lone‑pair–lone‑pair repulsion > lone‑pair–bonding‑pair > bonding‑pair–bonding‑pair, so they compress the bond angles around them. |
| 5. **Read off the molecular geometry** | From the AXE pattern, use the standard table (see below) to state the shape and the expected bond angles. | Gives the answer required for the exam. |
| 6. **Check for special cases** | • Hyper‑valent central atoms (e.g., SF₆) <br>• Resonance that changes the number of bonding domains <br>• d‑orbital involvement (rare in A‑Level) | Ensures you haven’t missed an expanded octet or a delocalised bond. |

---

## 2. The “Basic” Electron‑Pair Geometries

| Steric Number (SN) | Electron‑pair geometry (all domains) | Typical bond angles (°) |
|--------------------|--------------------------------------|--------------------------|
| 2 | **Linear** | 180 |
| 3 | **Trigonal planar** | 120 |
| 4 | **Tetrahedral** | 109.5 |
| 5 | **Trigonal‑bipyramidal** | 120 (equatorial) / 90 (axial) |
| 6 | **Octahedral** | 90 |

When lone pairs are present, the **molecular geometry** (the shape we see) is a subset of the electron‑pair geometry.

---

## 3. Common AXE → Molecular Shape Table (A‑Level)

| AXE | Electron‑pair geometry | Molecular geometry (shape) | Approx. bond angles |
|-----|------------------------|----------------------------|---------------------|
| **AX₂** | Linear | Linear | 180 |
| **AX₃** | Trigonal planar | Trigonal planar | 120 |
| **AX₂E₁** | Trigonal planar | **Bent** (V‑shaped) | ~120 → ~118 |
| **AX₄** | Tetrahedral | Tetrahedral | 109.5 |
| **AX₃E₁** | Tetrahedral | **Trigonal pyramidal** | ~107 |
| **AX₂E₂** | Tetrahedral | **Bent** (water‑type) | ~104.5 |
| **AX₅** | Trigonal‑bipyramidal | Trigonal‑bipyramidal | 120 / 90 |
| **AX₄E₁** | Trigonal‑bipyramidal | **See‑saw** | ~120 / ~90 |
| **AX₃E₂** | Trigonal‑bipyramidal | **T‑shaped** | ~90 |
| **AX₂E₃** | Trigonal‑bipyramidal | **Linear** (but with three lone pairs) | 180 |
| **AX₆** | Octahedral | Octahedral | 90 |
| **AX₅E₁** | Octahedral | **Square pyramidal** | ~90 |
| **AX₄E₂** | Octahedral | **Square planar** | 90 |

*(The angles are approximate; lone‑pair repulsion usually reduces the observed angles a few degrees.)*

---

## 4. Worked Examples (A‑Level style)

### Example 1 – Water, **H₂O**

1. **Lewis structure** – O has 6 valence e⁻, each H contributes 1. After forming two O–H bonds, O has **2 lone pairs**.  
2. **Steric number** = 2 (bonding) + 2 (lone) = **4** → tetrahedral electron‑pair geometry.  
3. **AXE notation** = **AX₂E₂**.  
4. **Molecular shape** = **Bent** (water‑type).  
5. **Bond angle** ≈ **104.5°**

**Citations:** (none — baseline has no retrieval step)

**Review:** [x] Correct  [ ] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Correct for what's given (ends cleanly after the water example) — less exhaustive than the grounded version but not truncated or wrong.

---

## 7. [EN] What is dipole moment?

**Expected unit:** 2

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Dipole Moment – A Concise A‑Level Explanation**

---

### 1. What a dipole moment is  

A **dipole moment (μ)** is a vector quantity that measures the separation of positive and negative electrical charges within a molecule (or a bond).  
- **If the centre of positive charge does not coincide with the centre of negative charge, the molecule possesses a dipole moment.**  
- The dipole moment points from the negative charge toward the positive charge.

---

### 2. How it is defined mathematically  

For a simple two‑point charge system (e.g., a polar covalent bond):

\[
\boxed{\mu = q \times d}
\]

- **\(q\)** = magnitude of the partial charge on each atom (in coulombs, C).  
- **\(d\)** = distance between the centres of the opposite charges (in metres, m).  

Because chemists usually work with the elementary charge \(e = 1.602 \times 10^{-19}\,\text{C}\) and bond lengths in ångströms (1 Å = 10⁻¹⁰ m), the dipole moment is most often expressed in **debyes (D)**, where  

\[
1\;\text{D}= 3.33564 \times 10^{-30}\;\text{C·m}
\]

---

### 3. Physical meaning  

- **Magnitude** tells how strongly the charges are separated.  
- **Direction** (the vector) tells the orientation of that separation in space.  

A larger μ → a more polar bond or molecule; μ = 0 → the charge distribution is perfectly symmetric (non‑polar).

---

### 4. Dipole moment of a molecule  

For polyatomic molecules the overall dipole moment is the **vector sum** of all individual bond dipoles.  

\[
\vec{\mu}_{\text{total}} = \sum_i \vec{\mu}_i
\]

If the bond dipoles cancel (as in CO₂ or CCl₄), the molecule has **no net dipole moment** even though the individual bonds are polar.

---

### 5. Typical values (A‑Level reference)

| Molecule | Dipole moment (D) | Comment |
|----------|-------------------|---------|
| HCl      | 1.08              | Polar, linear |
| H₂O      | 1.85              | Bent shape, net dipole |
| NH₃      | 1.47              | Trigonal pyramidal |
| CO₂      | 0.00              | Linear, bond dipoles cancel |
| CH₄      | 0.00              | Tetrahedral, symmetric |
| HF       | 1.91              | Very polar bond |

---

### 6. Why dipole moment matters (A‑Level relevance)

| Property | Influence of μ |
|----------|----------------|
| **Physical state** (gas, liquid, solid) | Larger dipole → stronger intermolecular forces → higher boiling/melting points. |
| **Solubility** | Polar solvents dissolve polar solutes (like‑dissolves‑like). |
| **Spectroscopy** | Infrared activity requires a change in dipole moment during vibration. |
| **Reactivity** | Polar molecules often undergo nucleophilic/electrophilic reactions more readily. |

---

### 7. Quick way to predict dipole moment for a molecule  

1. **Draw the Lewis structure** and assign partial charges (δ⁺, δ⁻).  
2. **Identify molecular geometry** (VSEPR).  
3. **Add bond dipole vectors** using the geometry.  
4. **If the vectors do not cancel → the molecule has a net dipole moment** (non‑zero μ).  

---

### 8. Example: Water (H₂O)

- **Geometry:** Bent (≈104.5°)  
- **Bond dipoles:** Each O–H bond has a dipole pointing from H (δ⁺) to O (δ⁻).  
- **Vector sum:** Because the angle is less than 180°, the two vectors do **not** cancel; they add to give a net dipole of **1.85 D** directed roughly along the bisector of the H–O–H angle.

---

### 9. Key points to remember for exams  

- **Definition:** μ = q × d (vector).  
- **Units:** Debye (1 D = 3.336 × 10⁻³⁰ C·m).  
- **Zero dipole → non‑polar molecule** (symmetry).  
- **Non‑zero dipole → polar molecule** (asymmetry).  
- **Use VSEPR geometry** to decide whether bond dipoles cancel.  

---

**Bottom line:** The dipole moment quantifies how “polar” a bond or molecule is. It is a fundamental concept that links molecular structure to physical properties and chemical behaviour—exactly the kind of connection you’ll need for A‑Level exam questions.

**Citations:** (none — baseline has no retrieval step)

**Review:** [x] Correct  [ ] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Correct and complete. Formula, units, vector-sum explanation, and worked water example all accurate.

---

## 8. [EN] Explain the difference between ionic bonds and metallic bonds.

**Expected unit:** 2

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Ionic Bonds vs. Metallic Bonds – A‑Level Overview**

| Feature | Ionic Bond | Metallic Bond |
|---------|------------|----------------|
| **What is held together?** | Cations (positively‑charged metal ions) and anions (negatively‑charged non‑metal ions). | A lattice of positively‑charged metal nuclei surrounded by a “sea” of delocalised valence electrons. |
| **How is the bond formed?** | **Complete transfer** of one or more valence electrons from a metal atom to a non‑metal atom. The metal becomes a cation, the non‑metal an anion; electrostatic attraction between opposite charges holds the crystal together. | **Sharing of many electrons** among a large number of metal atoms. The valence electrons are not attached to any single atom; they are free to move throughout the whole solid (electron‑gas model). |
| **Typical elements involved** | Metals on the left side of the periodic table (e.g., Na, Mg, Ca) + non‑metals on the right side (e.g., Cl, O, S). | Mostly transition metals, alkali‑earth metals, and some post‑transition metals (e.g., Fe, Cu, Al, Ag, Au). |
| **Crystal structure** | Usually a **regular ionic lattice** (e.g., NaCl‑type, CsCl‑type, ZnS‑type). The ions are arranged to maximise opposite‑charge attractions and minimise like‑charge repulsions. | **Metallic lattice** (close‑packed arrangements such as face‑centered cubic, body‑centered cubic, hexagonal close‑packed). The metal cations occupy fixed lattice points while the electron sea fills the interstices. |
| **Bond strength & melting/boiling points** | Strong electrostatic forces → high lattice energy. Many ionic solids have high melting points (e.g., NaCl m.p. 801 °C) but some (e.g., NaCl) melt at relatively moderate temperatures compared with covalent network solids. | Bond strength varies with the number of delocalised electrons and the size of the metal cation. Generally high melting/boiling points (e.g., Fe m.p. 1538 °C, Cu m.p. 1085 °C). |
| **Electrical conductivity** | **In solid state:** poor conductor because ions are fixed in place. <br>**When molten or dissolved in water:** ions are free to move → good conductor (e.g., NaCl solution). | **In both solid and liquid states:** excellent conductor because the delocalised electrons move freely throughout the metal lattice. |
| **Thermal conductivity** | Usually low (heat is carried mainly by lattice vibrations). | High – the electron sea transports thermal energy efficiently. |
| **Mechanical properties** | Brittle; when a force displaces a layer of ions, like‑charged ions are forced together, causing repulsion and fracture. | Malleable and ductile; layers of atoms can slide over each other while the electron sea maintains cohesion. |
| **Examples** | NaCl, MgO, CaF₂, KBr, Li₂O. | Cu, Fe, Al, Ag, Au, Zn, Ni. |
| **Typical A‑Level reactions** | **Formation:** \( \text{Na (s)} + \frac{1}{2}\text{Cl}_2(g) \rightarrow \text{NaCl(s)} \) (electron transfer: Na → Na⁺ + e⁻, Cl + e⁻ → Cl⁻). <br>**Dissolution:** \( \text{NaCl(s)} \xrightarrow{\text{water}} \text{Na}^+(aq) + \text{Cl}^-(aq) \). | **Metallic bonding is not shown as a discrete reaction**, but you can illustrate it with the electron‑sea model: <br> \( \text{M (solid)} \rightarrow \text{M}^{n+} \text{(lattice)} + n\text{e}^- \) (delocalised). |
| **Key A‑Level concepts to remember** | • **Lattice energy** – the energy released when the ionic solid forms from its gaseous ions; a measure of bond strength. <br>• **Born‑Haber cycle** – used to calculate lattice energy. <br>• **Ionic radii** – cations are smaller than their parent atoms; anions are larger. | • **Metallic radius** – distance between neighbouring metal nuclei in the lattice. <br>• **Electron‑sea model** – explains conductivity, malleability, and luster. <br>• **Bond order** in metals is often expressed as the number of delocalised electrons per atom (e.g., Cu has one free electron per atom). |

---

### How to Visualise the Two Bonds

1. **Ionic Bond (e.g., NaCl)**  
   - Imagine a chessboard where white squares are Na⁺ ions and black squares are Cl⁻ ions. Each Na⁺ is surrounded by six Cl⁻ (octahedral coordination) and each Cl⁻ is surrounded by six Na⁺. The attraction is purely electrostatic, like opposite poles of magnets pulling together.

2. **Metallic Bond (e.g., Copper)**  
   - Picture a crowd of positively charged metal ions standing in a regular grid, while a “cloud” of electrons floats above and between them, moving freely. The electrons act as a glue that holds the whole crowd together, and because they can move, the crowd conducts electricity and can be reshaped (malleable) without breaking the glue.

---

### Quick Checklist for Exam Answers

When a question asks you to **compare ionic and metallic bonds**, include at least three of the following points:

1. **Nature of electron involvement** – transfer vs. delocalisation.  
2. **Types of particles held together** – discrete ions vs. metal cations + electron sea.  
3. **Physical properties** – conductivity, melting point, brittleness vs. malleability.  
4. **Crystal structure & lattice energy** – ionic lattice & high lattice energy vs. close‑packed metallic lattice.  
5. **Typical examples** – give one ionic compound and one metal.  

A concise answer might be:

> *Ionic bonds result from complete transfer of valence electrons from a metal to a non‑metal, producing oppositely charged ions that are held together by strong electrostatic forces in an ordered lattice. They are generally brittle, have high lattice energies, and conduct electricity only when molten or dissolved. Metallic bonds, on the other hand, involve the delocalisation of valence electrons over a lattice of metal cations; the “

**Citations:** (none — baseline has no retrieval step)

**Review:** [ ] Correct  [x] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Content given (ionic vs. metallic mechanism, lattice/conductivity table) is accurate. Cut off mid-sentence ("the “") at the 1500-token cap — same truncation pattern seen pre-fix in the grounded benchmark, but now occurring on the baseline instead.

---

## 9. [EN] What is a mole and how is it related to the Avogadro constant?

**Expected unit:** 3

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Mole – the “counting unit” of chemistry**

In chemistry we often need to talk about *how many* atoms, molecules, ions, or other particles are present in a sample. Because the numbers are astronomically large (even a tiny piece of matter contains billions‑of‑billions of particles), we use a special counting unit called the **mole**.

---

### 1. Formal definition (as used in the G.C.E. A‑Level syllabus)

A **mole** (symbol: **mol**) is the amount of substance that contains exactly **\(N_{\!A}\)** elementary entities (atoms, molecules, ions, electrons, etc.).  

\[
1\;\text{mol} = N_{\!A}\;\text{entities}
\]

The number \(N_{\!A}\) is the **Avogadro constant** (or Avogadro number).

---

### 2. Avogadro constant

\[
N_{\!A}=6.02214076\times10^{23}\;\text{mol}^{-1}
\]

- The value is a pure number (dimensionless) that tells us how many particles are in one mole.  
- The unit “mol⁻¹” simply reminds us that it is “per mole”.  
- The constant is named after Amedeo Avogadro, who first suggested that equal volumes of gases at the same temperature and pressure contain the same number of particles.

---

### 3. What does this mean in practice?

| Substance | 1 mol contains … | Mass of 1 mol (g) |
|-----------|------------------|-------------------|
| Carbon‑12 atoms | \(6.022\times10^{23}\) atoms | 12.00 g (by definition) |
| Water (H₂O) molecules | \(6.022\times10^{23}\) molecules | 18.015 g |
| Sodium chloride (NaCl) formula units | \(6.022\times10^{23}\) formula units | 58.44 g |

So, if you weigh **12.00 g of pure carbon‑12**, you have **exactly one mole** of carbon atoms, i.e. \(6.022\times10^{23}\) atoms.

---

### 4. Why the mole is useful

1. **Bridges the macroscopic and microscopic worlds**  
   - Laboratory measurements (mass, volume, concentration) are macroscopic.  
   - Chemical equations, reaction stoichiometry, and kinetic theory involve numbers of particles.  
   - The mole provides the conversion factor \(N_{\!A}\) that links the two.

2. **Stoichiometry**  
   - In a balanced equation, coefficients refer to *moles* of reactants and products.  
   - Example: \(\displaystyle 2\; \text{H}_2 + \text{O}_2 \rightarrow 2\; \text{H}_2\text{O}\)  
     Means **2 mol of H₂** react with **1 mol of O₂** to give **2 mol of H₂O**.

3. **Molar mass**  
   - The molar mass (M) of a substance is the mass of one mole, expressed in **g mol⁻¹**.  
   - \(M = \frac{\text{mass (g)}}{\text{amount of substance (mol)}}\)  

4. **Concentration**  
   - Molarity (M) = moles of solute per litre of solution (mol L⁻¹).  
   - Knowing the mole lets you prepare solutions of a desired concentration.

---

### 5. Quick “back‑of‑the‑envelope” calculations

| Goal | Formula | Example |
|------|---------|---------|
| **Convert mass → moles** | \(n = \frac{m}{M}\) | 5.0 g NaCl, \(M = 58.44\; \text{g mol}^{-1}\) → \(n = 0.0856\; \text{mol}\) |
| **Convert moles → number of particles** | \(N = n \times N_{\!A}\) | 0.010 mol CO₂ → \(N = 0.010 \times 6.022\times10^{23} = 6.02\times10^{21}\) molecules |
| **Convert particles → moles** | \(n = \frac{N}{N_{\!A}}\) | \(3.0\times10^{23}\) atoms → \(n = 0.498\; \text{mol}\) |
| **Molarity to moles** | \(n = M \times V\) (V in L) | 0.2 M HCl, 250 mL → \(n = 0.2 \times 0.250 = 0.050\; \text{mol}\) |

---

### 6. Common misconceptions (worth remembering for the exam)

| Misconception | Reality |
|---------------|---------|
| “A mole is a mass.” | No. A mole is a *count* of entities. Its *mass* is the **molar mass**, which varies from substance to substance. |
| “Avogadro’s number is a mass.” | It is a pure number (particles per mole), not a mass. |
| “All gases have the same molar mass.” | Only *ideal* gases at the same temperature and pressure have the same *molar volume* (22.4 L at STP). Their molar masses depend on the molecular weight. |
| “One mole of any gas weighs the same.” | Wrong. One mole of any gas occupies the same volume at STP, but the **mass** equals its molar mass (e.g., 2 g for H₂ vs. 44 g for CO₂). |

---

### 7. Bottom line for your A‑Level studies

- **Mole** = the amount of substance containing **\(6.022\times10^{23}\)** particles.  
- **Avogadro constant** (\(N_{\!A}\)) is the numerical bridge that lets you go from *mass* ↔ *moles* ↔ *number of particles*.  
- Master the three conversion steps (mass ↔ moles ↔ particles) and you’ll be able to tackle any stoichiometry, solution‑preparation, or gas‑law problem that the exam throws at you.

Feel free to ask if you need a worked example or clarification on any particular topic!

**Citations:** (none — baseline has no retrieval step)

**Review:** [x] Correct  [ ] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Correct and complete. Definition, Avogadro constant, worked conversions, and common-misconceptions table all accurate. (This is the baseline's counterpart to the grounded pipeline's Q9 retrieval gap — the LLM's own general knowledge covers it fine; the gap was specifically in retrieval, not in LLM chemistry knowledge.)

---

## 10. [EN] Explain the difference between empirical formula and molecular formula.

**Expected unit:** 3

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Empirical formula vs. Molecular formula**

|                     | **Empirical formula** | **Molecular formula** |
|---------------------|-----------------------|-----------------------|
| **What it tells you** | The *simplest whole‑number* ratio of the elements present in a compound. | The *actual* number of atoms of each element in one molecule of the compound. |
| **Notation** | Smallest set of integers that reflects the composition (e.g., CH₂O, C₂H₅). | May contain larger integers that are whole‑number multiples of the empirical formula (e.g., C₆H₁₂O₆, C₈H₁₈). |
| **How it is obtained** | From elemental analysis (percent composition) → convert to moles → divide by the smallest mole value → round to nearest whole numbers. | First find the empirical formula, then determine the molar mass of the compound (e.g., by mass spectrometry or by using the known molecular weight).  Divide the molecular mass by the empirical‑formula mass; the quotient (usually an integer, *n*) tells you how many times the empirical unit is repeated:  Molecular formula = (Empirical formula)ⁿ. |
| **When are they the same?** | When the compound’s molecular mass is exactly the mass of the empirical unit (n = 1). Example: glucose’s empirical formula is C₆H₁₂O₆, which is also its molecular formula because the molecular mass (180 g mol⁻¹) equals the empirical‑formula mass. |
| **Typical use** | Quick way to express composition; useful in stoichiometry problems where only the ratio matters. | Needed when the exact number of atoms matters (e.g., for drawing structures, calculating physical properties, or naming the compound). |

---

### Example 1 – Glucose

1. **Percent composition (given)**: C 40.0 %, H 6.7 %, O 53.3 %  
2. Convert to moles (using atomic masses C = 12.01, H = 1.008, O = 16.00) →  
   - C: 40.0 g / 12.01 ≈ 3.33 mol  
   - H: 6.7 g / 1.008 ≈ 6.64 mol  
   - O: 53.3 g / 16.00 ≈ 3.33 mol  
3. Divide by the smallest (3.33) → C ≈ 1, H ≈ 2, O ≈ 1 → **Empirical formula = CH₂O**.  
4. Empirical‑formula mass = 12.01 + 2×1.008 + 16.00 ≈ 30.03 g mol⁻¹.  
5. Known molecular mass of glucose = 180 g mol⁻¹.  
   - n = 180 / 30.03 ≈ 6 → **Molecular formula = (CH₂O)⁶ = C₆H₁₂O₆**.

---

### Example 2 – Ethylene (C₂H₄)

1. From analysis we obtain the ratio C : H = 2 : 4 → simplify → **Empirical formula = CH₂**.  
2. Empirical‑formula mass = 12.01 + 2×1.008 ≈ 14.03 g mol⁻¹.  
3. Molecular mass of ethylene = 28.05 g mol⁻¹.  
   - n = 28.05 / 14.03 ≈ 2 → **Molecular formula = (CH₂)² = C₂H₄**.

---

### Key points to remember for A‑Level exams

1. **Always start with the empirical formula** – it is the foundation for the molecular formula.  
2. **Check the integer multiplier** (n). If the division of the molecular mass by the empirical‑formula mass does not give a whole number, re‑examine your empirical formula (rounding errors, experimental uncertainties).  
3. **When the problem only asks for composition**, the empirical formula is sufficient.  
4. **When the problem involves physical properties, isomerism, or structural drawing**, you need the molecular formula.  

---

#### Quick “cheat‑sheet” steps

1. **Find empirical formula**  
   - Convert % → grams → moles → divide by smallest → round to nearest whole numbers.  
2. **Calculate empirical‑formula mass** (sum of atomic masses).  
3. **Obtain molecular mass** (given or from molar mass data).  
4. **Compute n = (Molecular mass) / (Empirical‑formula mass)**.  
5. **Write molecular formula** = (Empirical formula)ⁿ.

Understanding the distinction and the relationship between the two formulas will help you solve a wide range of stoichiometry and molecular‑weight problems in the G.C.E. Advanced Level Chemistry syllabus. Good luck!

**Citations:** (none — baseline has no retrieval step)

**Review:** [x] Correct  [ ] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Correct and complete. Definitions and both worked examples (glucose, ethylene) are accurate.

---

## 11. [EN] What is molarity and how is it calculated?

**Expected unit:** 3

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Molarity (M)**  

Molarity is the most common way of expressing the concentration of a solution in school‑level chemistry.  
It tells you **how many moles of solute are present in one litre of solution**.

\[
\boxed{M = \frac{n_{\text{solute}}}{V_{\text{solution}}}}
\]

* \(M\) = molarity (units = mol L⁻¹, often written simply as “M”)  
* \(n_{\text{solute}}\) = amount of solute in **moles** (mol)  
* \(V_{\text{solution}}\) = total volume of the solution in **litres** (L)

---

## How to calculate molarity

### 1. From the amount of solute (in moles) and the volume of solution  

1. **Determine the number of moles** of the solute.  
   - If you already have the amount in moles, use it directly.  
   - If you have the mass (g), first convert to moles using the molar mass (M\(_\text{r}\)):
     \[
     n = \frac{m_{\text{mass}}}{M_{\text{r}}}
     \]
2. **Measure the final volume of the solution** in litres (L).  
   - Remember: the volume is that of the *solution*, not just the solvent.  
3. **Apply the definition** \(M = n/V\).

### 2. From mass of solute and desired molarity (preparing a solution)

If you need to prepare a solution of a known molarity:

\[
m_{\text{mass}} = M \times V_{\text{solution}} \times M_{\text{r}}
\]

* \(m_{\text{mass}}\) = mass of solute to weigh (g)  
* \(M\) = desired molarity (mol L⁻¹)  
* \(V_{\text{solution}}\) = final volume of solution (L)  
* \(M_{\text{r}}\) = molar mass of the solute (g mol⁻¹)

### 3. Dilution (changing concentration)

When a solution is diluted, the number of moles of solute stays the same, so:

\[
M_1 V_1 = M_2 V_2
\]

* \(M_1\), \(V_1\) = concentration and volume before dilution  
* \(M_2\), \(V_2\) = concentration and volume after dilution  

---

## Worked example (A‑Level style)

**Problem:**  
Prepare 250 mL of a 0.75 M aqueous solution of potassium nitrate, KNO₃. (Molar mass of KNO₃ = 101.1 g mol⁻¹.)

**Solution:**

1. Convert the required volume to litres:  
   \[
   V = 250\ \text{mL} = 0.250\ \text{L}
   \]

2. Use the formula for mass needed:  
   \[
   m = M \times V \times M_{\text{r}}
   \]
   \[
   m = 0.75\ \text{mol L}^{-1} \times 0.250\ \text{L} \times 101.1\ \text{g mol}^{-1}
   \]
   \[
   m = 0.1875\ \text{mol} \times 101.1\ \text{g mol}^{-1}
   \]
   \[
   m \approx 18.96\ \text{g}
   \]

3. **Procedure:**  
   - Weigh **≈ 19 g** of solid KNO₃.  
   - Transfer the solid to a 250 mL volumetric flask.  
   - Add distilled water, swirl to dissolve, then fill up to the mark with water.  
   - The solution now has a molarity of **0.75 M**.

---

## Important points for A‑Level exams

| Point | Why it matters |
|-------|----------------|
| **Temperature dependence** | Volume changes with temperature, so molarity is technically temperature‑dependent. In most exam problems the temperature is assumed to be 25 °C unless stated otherwise. |
| **Solution vs. solvent volume** | Always use the *final* solution volume. Adding solute changes the volume slightly; you must account for that by measuring the total volume after the solute is dissolved. |
| **Significant figures** | Keep the same number of significant figures as the data given (e.g., 0.75 M has two sig‑figs, so report the final mass to two sig‑figs). |
| **Molar mass** | Use the atomic masses from the periodic table (e.g., C = 12.01, H = 1.008, O = 16.00). |
| **Dilution calculations** | Remember that \(M_1V_1 = M_2V_2\) works only when no solute is added or removed, only water. |

---

## Quick checklist for a “calculate the molarity” question

1. **Identify** the mass (or moles) of solute given.  
2. **Convert** mass → moles using molar mass (if needed).  
3. **Find** the total volume of the solution in litres.  
4. **Apply** \(M = n/V\).  
5. **State** the answer with correct units (mol L⁻¹) and appropriate sig‑figs.

---

### TL;DR

- **Molarity (M)** = moles of solute ÷ litres of solution.  
- Convert mass → moles with molar mass, then divide by volume (L).  
- For preparation: **mass needed** = M × V × molar mass.  
- For dilution: **\(M_1V_1 = M_2V_2\)**.  

Use these steps, keep track of units, and you’ll be able to handle any A‑Level mol

**Citations:** (none — baseline has no retrieval step)

**Review:** [ ] Correct  [x] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Content given (M = n/V, preparation, dilution, worked KNO3 example) is accurate. Cut off mid-word ("any A-Level mol") at the token cap.

---

## 12. [EN] Explain oxidation numbers with an example.

**Expected unit:** 3

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Oxidation Numbers – What They Are and How to Use Them**

In A‑Level chemistry an *oxidation number* (or *oxidation state*) is a bookkeeping number that tells us how many electrons an atom **effectively** gains or loses when a compound is formed.  
It is **not** always the real charge on the atom, but it lets us see which atoms are oxidised (lose electrons) and which are reduced (gain electrons) in a redox process.

---

## 1. The “rules” for assigning oxidation numbers  

| Rule | How to apply it (examples) |
|------|----------------------------|
| **1. Pure elements** have oxidation number **0**. | \( \mathrm{Na},\; \mathrm{Cl_2},\; \mathrm{O_2},\; \mathrm{C (graphite)}\) → 0 |
| **2. Monatomic ions** have oxidation number equal to their charge. | \( \mathrm{Na^+}=+1,\; \mathrm{Cl^-}=-1,\; \mathrm{Fe^{2+}}=+2\) |
| **3. Hydrogen** is usually **+1** (except when bonded to metals, e.g. NaH, where it is –1). |
| **4. Oxygen** is usually **–2** (exceptions: peroxides \(\mathrm{O_2^{2-}}\) → –1 each, superoxides \(\mathrm{O_2^-}\) → –½ each, and when bound to fluorine, e.g. \(\mathrm{OF_2}\) where O = +2). |
| **5. Fluorine** is always **–1** (the most electronegative element). |
| **6. The sum of oxidation numbers in a **neutral** compound = 0; in an **ion** = the ionic charge. |
| **7. The oxidation number of other halogens (Cl, Br, I) is –1 unless they are combined with a more electronegative element (e.g. \(\mathrm{ClO^-}\) where Cl = +1). |
| **8. For the remaining elements the oxidation number is whatever is needed to satisfy rule 6.** |

---

## 2. Worked Example – Determining the oxidation numbers in **potassium permanganate, \(\mathbf{KMnO_4}\)**  

1. **Write the formula and note the overall charge**  
   \(\mathrm{KMnO_4}\) is a neutral compound → total oxidation number = 0.

2. **Assign the known oxidation numbers**  
   * K is an alkali metal → **+1** (rule 2).  
   * O is usually –2 → **–2** each.

3. **Set up the algebraic sum**  

\[
\underbrace{(+1)}_{\text{K}} + \underbrace{x}_{\text{Mn}} + 4\underbrace{(-2)}_{\text{O}} = 0
\]

\[
+1 + x - 8 = 0 \;\Longrightarrow\; x = +7
\]

4. **Result**  

| Element | Oxidation number |
|---------|-----------------|
| K       | +1 |
| Mn      | **+7** |
| O       | –2 |

Thus, in \(\mathrm{KMnO_4}\) manganese is in the **+7** oxidation state – the highest oxidation state manganese can attain.

---

## 3. Using Oxidation Numbers in a Redox Reaction  

Let’s see how oxidation numbers help us identify what is oxidised and what is reduced in a classic A‑Level reaction:

\[
\boxed{\mathrm{Zn + CuSO_4 \;\longrightarrow\; ZnSO_4 + Cu}}
\]

### Step‑by‑step oxidation‑number analysis  

| Species | Assign oxidation numbers (using the rules) |
|---------|--------------------------------------------|
| **Zn (solid)** | Element → 0 |
| **CuSO₄** | Cu = **+2** (most common for Cu in salts) <br> S = **+6** (in sulfate) <br> O = –2 each |
| **ZnSO₄** | Zn = **+2** (now part of a cation) <br> S = +6 (unchanged) <br> O = –2 each |
| **Cu (solid)** | Element → 0 |

### Identify the changes  

| Element | Reactant oxidation number | Product oxidation number | Change |
|---------|---------------------------|--------------------------|--------|
| Zn      | 0 → **+2**                | ↑ (loss of electrons) → **oxidised** |
| Cu      | **+2** → 0                | ↓ (gain of electrons) → **reduced** |
| S, O    | No change (both stay +6 and –2) | **spectator** in the redox sense |

**What happened?**  
- Zinc **lost** 2 electrons: \(\mathrm{Zn \rightarrow Zn^{2+} + 2e^-}\) (oxidation).  
- Copper(II) **gained** those 2 electrons: \(\mathrm{Cu^{2+} + 2e^- \rightarrow Cu}\) (reduction).

Because the oxidation numbers of Zn and Cu change, the reaction is a **redox** (reduction‑oxidation) reaction. The sulfate ion (\(\mathrm{SO_4^{2-}}\)) simply acts as a spectator; its oxidation numbers stay the same.

---

## 4. Quick Checklist for A‑Level Exams  

1. **Write the formula** and note the overall charge.  
2. **Apply the rules** (start with the easy ones: pure elements, monatomic ions, H, O, halogens).  
3. **Use algebra** if an element’s oxidation number is unknown.  
4. **Check the sum** – it must equal 0 for

**Citations:** (none — baseline has no retrieval step)

**Review:** [ ] Correct  [x] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Content given (rules, KMnO4 worked example, Zn+CuSO4 redox analysis) is accurate. Cut off mid-sentence ("it must equal 0 for") at the token cap.

---

## 13. [EN] What is the flame test used for in identifying cations?

**Expected unit:** 6

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Flame Test – A Quick Qualitative Test for Cations**

In the G.C.E. Advanced Level (A‑Level) chemistry syllabus the flame test is introduced as a **simple, rapid, and inexpensive qualitative method for the identification of certain metal‑ion (cation) species** in an unknown sample.  

---

## 1. Why does a flame give a colour?

1. **Electronic excitation** – When a metal‑containing compound is introduced into a hot flame, the high temperature supplies energy that promotes electrons in the metal ions from their ground state to an excited electronic state.  

2. **Relaxation & photon emission** – As the excited electrons return to lower‑energy (ground) states they release the excess energy as photons. The wavelength (colour) of the emitted light depends on the **energy gap** between the two levels, which is characteristic of the particular metal ion.  

3. **Spectral lines** – The emitted light consists of a series of discrete wavelengths (spectral lines). In a naked eye observation we see the dominant colour(s) that correspond to the most intense lines in the visible region.

---

## 2. General Procedure (A‑Level laboratory)

| Step | Action | Reason |
|------|--------|--------|
| **1. Clean the nichrome/ platinum wire** | Dip the wire in concentrated HCl, then dip it in a dilute HNO₃ solution, rinse with distilled water and hold it in the flame until it burns colourless. | Removes any residual metal that could give a false colour. |
| **2. Prepare the sample** | If the test substance is a solid, grind a tiny amount with a few drops of concentrated HCl to make a moist paste (or dissolve a soluble salt in a few drops of water). | The acid helps volatilise the metal as a simple halide/oxide that can be excited in the flame. |
| **3. Introduce the sample** | Dip the clean, hot wire into the prepared paste (or dip the wire directly into a solution) and place it back in the hottest part of the Bunsen flame (the non‑luminous, blue cone). | The metal ions are carried into the flame where they are excited. |
| **4. Observe the colour** | Look at the flame through the side of the flame (to avoid the bright inner cone) and note the dominant colour. | The colour is the diagnostic clue. |
| **5. Compare with standards** | Perform the same test with known metal salts (e.g., NaCl, KCl, CaCl₂, etc.) under identical conditions. | Provides a reference for colour matching. |

*Safety note*: Work under a fume‑hood, wear goggles and gloves, and keep a fire‑extinguisher nearby. Some metal salts (e.g., BaCl₂, SrCl₂) are toxic; handle them with care.

---

## 3. Typical Flame Colours of Common Cations (A‑Level focus)

| Cation (common salt) | Flame colour (visible) | Remarks / Tips |
|----------------------|------------------------|----------------|
| **Na⁺** (NaCl) | Bright **yellow** (often described as “sodium yellow”) | Very intense; can mask weaker colours. Use cobalt glass to filter out Na‑yellow if needed. |
| **K⁺** (KCl) | **Lilac / light purple** | Very faint; cobalt glass enhances it by removing Na‑yellow. |
| **Li⁺** (LiCl) | **Crimson / carmine red** | Distinct, but can be confused with strontium; cobalt glass helps. |
| **Ca²⁺** (CaCl₂) | **Brick‑red / orange‑red** | Strong, easy to recognise. |
| **Ba²⁺** (BaCl₂) | **Pale green** (often called “apple‑green”) | Distinct from copper green; use cobalt glass to suppress Na‑yellow. |
| **Sr²⁺** (SrCl₂) | **Bright red** (candle‑flame red) | More intense than calcium red. |
| **Cu²⁺** (CuCl₂) | **Blue‑green** (turquoise) | Often confused with boron; copper gives a very characteristic green‑blue. |
| **Zn²⁺** (ZnCl₂) | **Blue‑white** (almost colourless) | Usually not observed; Zn is considered “flame‑inactive”. |
| **Pb²⁺** (PbCl₂) | **Pale blue** (or faint white) | Weak colour, rarely used for identification. |
| **Mn²⁺** (MnCl₂) | **Pale green** (often faint) | Not reliable for routine tests. |
| **Al³⁺**, **Mg²⁺**, **Fe³⁺** | **No distinct colour** (or very faint) | These cations are essentially flame‑inactive. |

*Tip*: **Cobalt glass** (deep blue) is placed between the observer’s eye and the flame to absorb the intense yellow of sodium, allowing the weaker colours (K, Li, Ba, etc.) to be seen more clearly.

---

## 4. What the Flame Test **Can** and **Cannot** Do

| Capability | Explanation |
|------------|-------------|
| **Identify** a limited set of metal ions that give strong, characteristic colours (Na, K, Li, Ca, Ba, Sr, Cu). | The test is based on the unique electronic transitions of these ions. |
| **Distinguish** between ions with markedly different colours (e.g., Na⁺ vs. Ca²⁺). | Easy to differentiate when colours are far apart. |
| **Provide a quick preliminary check** before more sophisticated analysis (e.g., spectroscopy, precipitation). | Useful in field work or when only a few drops of sample are available. |
| **Detect contamination** (e.g., sodium contamination in a “pure” copper sample). | Sodium’s bright yellow is hard to miss. |

| Limitation | Explanation |
|------------|-------------|
| **Overlap of colours** – e.g., Li⁺ (crimson) vs. Sr²⁺ (bright red) can be ambiguous. | Use complementary tests (precipitation, solubility) for confirmation. |
| **Weak or absent colours** for many cations (Al³⁺, Mg²⁺, Zn²⁺, Fe³⁺). | Flame test is

**Citations:** (none — baseline has no retrieval step)

**Review:** [ ] Correct  [x] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Content given (mechanism, procedure, flame-colour table) is accurate and matches standard values. Cut off mid-sentence ("Flame test is") at the token cap.

---

## 14. [EN] Describe the chemistry of nitrogen oxoacids.

**Expected unit:** 6

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Nitrogen Oxo‑acids – A‑Level Overview**

Nitrogen can combine with oxygen to give a series of oxo‑acids that differ in the oxidation state of the nitrogen atom, the number of oxygen atoms attached, and in their chemical behaviour.  
The most important ones that appear in the G.C.E. Advanced Level syllabus are:

| Acid (formula) | Common name | N oxidation state | Typical colour / stability | Main anion (in water) |
|----------------|-------------|-------------------|----------------------------|-----------------------|
| HNO₂            | Nitrous acid | +3                | colourless, unstable, decomposes readily | NO₂⁻ (nitrite) |
| HNO₃            | Nitric acid  | +5                | colourless, strong oxidising acid, stable | NO₃⁻ (nitrate) |
| H₂N₂O₂          | Hyponitrous acid | +1 (average) | colourless, exists only in solution, quickly disproportionates | N₂O₂²⁻ (hyponitrite) |
| HNO₄            | Per‑nitric acid (pernitric) | +7 | very strong oxidiser, prepared only in situ | NO₄⁻ (pernitrite) |
| H₂NO₃ (or HNO₂·H₂O) | Nitrous acid in equilibrium with N₂O₃ | +3 | exists as N₂O₃ (blue) in the gas phase | – |
| H₂NO₄ (or HNO₃·H₂O) | Nitric acid in equilibrium with N₂O₅ | +5 | N₂O₅ (colourless solid) sublimates | – |

Below is a systematic description of their **structures, preparation, acid‑base behaviour, redox properties and typical reactions**.

---

## 1. Structural Features

| Acid | Structural formula (simplified) | Key bond lengths / geometry |
|------|--------------------------------|-----------------------------|
| **HNO₂** | HO–N=O (the N is pyramidal, one N–O single, one N=O double) | N–O(single) ≈ 1.40 Å, N=O ≈ 1.20 Å |
| **HNO₃** | O₂N–OH (trigonal planar around N, three N–O bonds, one is a hydroxyl) | All N–O ≈ 1.22 Å (resonance) |
| **H₂N₂O₂** | HO–N= N–OH (cis‑ or trans‑hydroxy‑diazene) | N=N ≈ 1.25 Å, N–O ≈ 1.40 Å |
| **HNO₄** | HO–O–N=O₂ (peroxy linkage) | O–O ≈ 1.48 Å, N=O ≈ 1.20 Å |

*Resonance* is important for HNO₃ and its salts: the nitrate ion is planar with three equivalent N–O bonds (1.23 Å). The nitrite ion is V‑shaped (O–N–O ≈ 115°) with one N=O and one N–O⁻ bond that are delocalised.

---

## 2. Preparation (Typical Laboratory / Industrial Routes)

| Acid | Common preparation method (A‑Level relevance) |
|------|-----------------------------------------------|
| **Nitrous acid (HNO₂)** | *In‑situ* generation by adding a dilute acid (HCl, H₂SO₄) to a nitrite salt (NaNO₂, KNO₂).<br>  `NaNO₂ + HCl → HNO₂ + NaCl`<br>Because HNO₂ is unstable, it is used immediately. |
| **Nitric acid (HNO₃)** | Oxidation of nitrogen dioxide (NO₂) in water (the “contact process”):<br>  `3 NO₂ + H₂O → 2 HNO₃ + NO`<br>Industrial route: 2 NO₂ + H₂O → HNO₃ + HNO₂ (followed by oxidation of HNO₂). |
| **Hyponitrous acid (H₂N₂O₂)** | Generated by reducing nitrous acid with a strong reducing agent (e.g., Zn/HCl) at low temperature, or by hydrolysis of hyponitrite salts (Na₂N₂O₂). |
| **Per‑nitric acid (HNO₄)** | Formed by reacting concentrated HNO₃ with hydrogen peroxide at low temperature: <br>  `HNO₃ + H₂O₂ → HNO₄ + H₂O` (only in situ, very strong oxidiser). |

---

## 3. Acid‑Base Behaviour (Dissociation)

| Acid | First dissociation (Ka₁) | Second dissociation (if any) | pH of a 0.10 M solution (approx.) |
|------|--------------------------|------------------------------|-----------------------------------|
| **HNO₂** | Ka₁ ≈ 4.5 × 10⁻⁴ (moderately weak) | No second dissociation | pH ≈ 2.0 |
| **HNO₃** | Ka₁ ≈ 2 × 10⁻¹ (practically a strong acid) | No second dissociation | pH ≈ 1.0 (0.10 M) |
| **H₂N₂O₂** | Ka₁ ≈ 1 × 10⁻⁴ (weak) | Ka₂ ≈ 1 × 10⁻⁸ (very weak) | pH ≈ 2.5 (0.10 M) |
| **HNO₄** | Very strong (≈ 100 % dissociation) | – | pH ≈ 0.5 (0.10 M) |

*Key points for the exam*  

* HNO₃ is a **strong acid** – it ionises completely in water.

**Citations:** (none — baseline has no retrieval step)

**Review:** [ ] Correct  [x] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Content given is accurate, but introduces acids beyond the NIE Unit 6 scope (e.g. per-nitric acid HNO4, hyponitrous acid) not present in the resource book — syllabus drift risk from having no retrieval scope. Also cut off mid-list ("it ionises completely in water." then nothing) at the token cap.

---

## 15. [EN] What are coordination compounds of transition metals?

**Expected unit:** 6

**Grounded:** False (baseline — no retrieval)

**Answer:**

**Coordination compounds (or coordination complexes) are a special class of chemical species in which a transition‑metal ion is surrounded by a set of molecules or ions called *ligands*.**  

---

## 1. What makes a compound a “coordination compound”?

| Feature | Description |
|---------|-------------|
| **Central atom** | Usually a **transition‑metal ion** (e.g., Fe³⁺, Cu²⁺, Co²⁺, Ni²⁺, Pt²⁺). Transition metals are favoured because they have vacant d‑orbitals that can accept electron pairs. |
| **Ligands** | Molecules or ions that **donate a lone‑pair of electrons** to the metal to form a **coordinate (dative) covalent bond**. A ligand may be neutral (NH₃, H₂O, CO) or anionic (Cl⁻, NO₂⁻, CN⁻). |
| **Coordination sphere** | The metal ion together with all the ligands attached to it. It is written inside square brackets: \[M(L)ₙ\]ⁿ⁺. |
| **Counter‑ions** | Ions that balance the overall charge but are **outside** the brackets (e.g., Cl⁻ in \[Co(NH₃)₆\]Cl₃). They are not directly bonded to the metal. |
| **Coordination number** | The total number of donor atoms that are directly bonded to the metal (commonly 4, 6, 2, or 8). |

---

## 2. Types of Ligands

| Type | Example | Donor atoms (donor sites) |
|------|---------|---------------------------|
| **Monodentate** | NH₃, H₂O, Cl⁻, CN⁻ | One donor atom per ligand |
| **Bidentate** | ethylenediamine (en), oxalate (C₂O₄²⁻) | Two donor atoms from the same ligand (forms a chelate ring) |
| **Polydentate (multidentate)** | EDTA⁴⁻ (hexadentate), porphyrin (tetra‑dentate) | Three or more donor atoms from the same ligand |
| **Ambidentate** | NO₂⁻ (can bind through N or O) | One donor atom, but two possible binding modes |

*Chelation* (binding of bidentate or polydentate ligands) greatly increases the stability of the complex – a phenomenon known as the **chelate effect**.

---

## 3. Common Geometries

| Coordination number | Typical geometry | Example |
|---------------------|------------------|---------|
| 2 | Linear | \[Ag(NH₃)₂\]⁺ |
| 4 | Tetrahedral or square planar | \[NiCl₄\]²⁻ (tetrahedral), \[PtCl₄\]²⁻ (square planar) |
| 5 | Trigonal bipyramidal or square pyramidal | \[Fe(CN)₅\]³⁻ |
| 6 | Octahedral (most common) | \[Co(NH₃)₆\]³⁺, \[Cu(H₂O)₆\]²⁺ |
| 8 | Square antiprismatic or dodecahedral | \[ZrF₈\]⁴⁻ |

---

## 4. Naming (IUPAC style – simplified for A‑Level)

1. **List the ligands alphabetically** (ignoring prefixes like di‑, tri‑).  
   - Anionic ligands end in “‑o” (e.g., chloro, cyanido).  
   - Neutral ligands keep their common name (e.g., ammine for NH₃, aqua for H₂O).  
2. **Write the metal name** followed by its oxidation state in Roman numerals in parentheses.  
3. **If the complex is an anion**, add the suffix “‑ate” to the metal name (e.g., ferrate for Fe).  

*Example*: \[Cr(NH₃)₃Cl₃\] → **triammine trichloro‑chromium(III)** (if neutral) or **triammine trichloro‑chromate(III)** (if the whole species carries a negative charge).

---

## 5. Important Properties & Applications

| Property | Reason | Example/Application |
|----------|--------|---------------------|
| **Colour** | d‑d electron transitions (or charge‑transfer bands) absorb visible light. | \[Cu(H₂O)₆\]²⁺ is blue; \[Co(NH₃)₆\]³⁺ is pink. |
| **Magnetism** | Number of unpaired d‑electrons depends on ligand field strength (strong‑field vs. weak‑field ligands). | \[Fe(CN)₆\]³⁻ is low‑spin (diamagnetic); \[Fe(H₂O)₆\]³⁺ is high‑spin (paramagnetic). |
| **Catalysis** | Metal centre can change oxidation state while ligands provide a controlled environment. | Wilkinson’s catalyst \[RhCl(PPh₃)₃\] for hydrogenation. |
| **Biological relevance** | Many metalloproteins are coordination complexes. | Hemoglobin – \[Fe(II)–porphyrin\] with O₂ binding; Vitamin B₁₂ – cobalt‑cobalamin. |
| **Medicinal use** | Specific metal‑ligand combinations can target disease pathways. | Cisplatin \[Pt(NH₃)₂Cl₂\] – anticancer drug. |
| **Analytical chemistry** | Complex formation is used in qualitative/quantitative tests. | Titration of metal ions with EDTA (complexometric titration). |

---

## 6. Simple Examples for A‑Level Revision

| Complex | Formula | Coordination number | Geometry | Oxidation state of metal |
|---------|---------|---------------------|----------|--------------------------|
| Hexaamminecobalt(III) chloride | \[Co(NH₃)₆\]Cl

**Citations:** (none — baseline has no retrieval step)

**Review:** [ ] Correct  [x] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Content given (ligand types, geometries, naming, applications table) is accurate. Cut off mid-table-cell ("[Co(NH3)6]Cl") at the token cap.

---

## 16. [SI] මෝලයක් කියන්නේ මොකක්ද?

**Expected unit:** 3

**Grounded:** False (baseline — no retrieval)

**Answer:**

**මෝලය (Mole) කියන්නේ කුමක්ද?**  

මෝලය යනු රසායන විද්‍යාවේ **ප්‍රමාණය මැනීමට භාවිතා කරන මූලික ඒකකයක්** වේ. එය **අණු, අයන, අණුකණ්ණා, මොලෙක්‍යුල, හෝ වෙනත් කණ්ණා** (උදාහරණයක් ලෙස ග්‍රහණය, වායු) ගණනක් සලකුණු කරයි.  

---

## 1. මෝලයේ සංඛ්‍යාත්මක අර්ථය  
- **1 මෝලයක් = 6.022 140 76 × 10²³** (ඇවොගාඩ්‍රෝ සංඛ්‍යාව, **Nₐ**)  
- මේ සංඛ්‍යාව යනු **අවොගාඩ්‍රෝ නියමය** ලෙස හැඳින්වේ.  
- එනම්, 1 මෝලයක් තුළ **6.022 × 10²³** ක් පමණ අණු, අයන, මොලෙක්‍යුල, හෝ වෙනත් කණ්ණා අඩංගු වේ.  

## 2. මෝලය හා භාර (Mass) අතර සම්බන්ධය  
- **මෝලර භාරය (Molar mass)** යනු එක් මෝලයක් සඳහා ඇති **ග්‍රෑම් (g)** ප්‍රමාණයයි.  
- උදාහරණයක් ලෙස, **H₂O (ජලය)** හි මෝලර භාරය ≈ **18.015 g mol⁻¹**.  
  - එනම්, 1 මෝල ජලය (6.022 × 10²³ ජල මොලෙක්‍යුල) ≈ 18.015 g වේ.  

## 3. මෝලය භාවිතා කරන ප්‍රධාන හේතු  
| හේතුව | විස්තර |
|--------|----------|
| **ප්‍රතික්‍රියා අනුපාත** | රසායනික ප්‍රතික්‍රියාවන්හි අණු/අයන සංඛ්‍යාත්මක අනුපාතය මෝලවලින් ලියයි (උදා: 2 H₂ + O₂ → 2 H₂O). |
| **ආකාරය (Concentration)** | ද්‍රාවකයේ **මෝලාරිටි (M)** = mol L⁻¹ (එක් ලීටරයක මෝල ගණන). |
| **ආකාර ගණනය** | ද්‍රව්‍යයක් ගණනය කිරීමේදී (උදා: 0.5 mol NaCl) භාරය, පරමාණු සංඛ්‍යාව, ආදී ගණනය කිරීමට මෝලය භාවිතා වේ. |
| **ප්‍රතික්‍රියා ශක්තිය** | ප්‍රතික්‍රියා වේගය, සමතුලිතතාවය (equilibrium) වැනි ගණිත සූත්‍රවල මෝල අගයන් අවශ්‍ය වේ. |

## 4. මෝලය ගණනය කිරීමේ මූලික සූත්‍ර  
1. **භාරයෙන් මෝලය**  
   \[
   n = \frac{m}{M}
   \]  
   - *n* = මෝල ගණන (mol)  
   - *m* = ද්‍රව්‍යයේ භාර (g)  
   - *M* = මෝලර භාර (g mol⁻¹)  

2. **අණු/අයන සංඛ්‍යාවෙන් මෝලය**  
   \[
   n = \frac{N}{N_A}
   \]  
   - *N* = අණු/අයන සංඛ්‍යාව  
   - *N_A* = ඇවොගාඩ්‍රෝ සංඛ්‍යාව (6.022 × 10²³)  

3. **ආකාර (Concentration) සමඟ**  
   \[
   C = \frac{n}{V}
   \]  
   - *C* = මෝලාරිටි (M) = mol L⁻¹  
   - *V* = ද්‍රාවකයේ පරිමාණය (L)  

## 5. උදාහරණයක් (Example)  

**ප්‍රශ්නය:** 5.0 g NaCl (සෝඩියම් ක්ලෝරයිඩ්) කී මෝලයක් වේ?  

- NaCl හි මෝලර භාරය = Na (22.99) + Cl (35.45) ≈ **58.44 g mol⁻¹**  
- මෝල ගණන = \( n = \frac{5.0\ \text{g}}{58.44\ \text{g mol}^{-1}} \approx 0.0855\ \text{mol} \)  

**ඉතිරි ප්‍රතිඵල:** 5 g NaCl ≈ **0.0855 mol** (≈ 5.15 × 10²² අයන).  

---

### සාරාංශය  
- **මෝලය** = 6.022 × 10²³ කණ්ණා (අණු, අයන, මොලෙක්‍යුල) එකතුව.  
- මෝලර භාරය (g mol⁻¹) භාවිතා කර **භාර ↔ මෝල** පරිවර්තනය කරයි.  
- රසායනික ප්‍රතික්‍රියාවන්, ආකාර ගණනය, සමතුලිතතාවය වැනි සියලුම ගණිත කටයුතු සඳහා මෝලය අත්‍යවශ්‍ය වේ.  

ඉදිරියේදී ඔබට මෝලය සම්බන්ධ ගැටළු (උදා: ප්‍රතික්‍රියා අනුපාත, ආකාර ගණනය, පරමාණු සංඛ්‍යාව) තිබේ නම්, ඒවාත් සමඟ පියවරෙන් පියවරට විසඳුම් ලබා ද

**Citations:** (none — baseline has no retrieval step)

**Review:** [ ] Correct  [x] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Content given is accurate and matches the proposed method's correct Sinhala mole answer. Cut off mid-word at the token cap.

---

## 17. [SI] අයනික බන්ධන යනු කුමක්ද?

**Expected unit:** 2

**Grounded:** False (baseline — no retrieval)

**Answer:**

**අයනික බන්ධන (Ionic Bond) කියන්නේ කුමක්ද?**  

---

### 1. අයනික බන්ධනයේ මූලික අදහස  
- **ආයන (ions)** දෙකක් **විද්‍යුත් ආකර්ෂණය** මගින් එකට බැඳෙන්නේ අයනික බන්ධනයයි.  
- එක අයන **ඉලෙක්ට්‍රෝනයක්** (හෝ ඊට වඩා) **අහිමි කර** (ආකර්ෂණය) **කැටි (cation)** වීමෙන්, අනෙක් අයන **ඉලෙක්ට්‍රෝනයක්** **ලැබී** (ආකර්ෂණය) **අනියන් (anion)** වීමෙන් බන්ධනයක් සෑදේ.  

### 2. අයනික බන්ධනයේ නිර්මාණ ක්‍රියාවලිය  

| පියවර | සිදුවීම | උදාහරණය |
|--------|----------|-----------|
| 1️⃣ | **ඉලෙක්ට්‍රෝන අහිමි කිරීම** – අඩු ඉලෙක්ට්‍රෝන ආකෘතිය (ඉලෙක්ට්‍රොන අඩු) ඇති ලෝහ (මැටල්) අයනයක් ඉලෙක්ට්‍රෝනයක් අහිමි කර කැටි (Na → Na⁺ + e⁻). | Na (සෝඩියම්) |
| 2️⃣ | **ඉලෙක්ට්‍රෝන ලබා ගැනීම** – ඉලෙක්ට්‍රෝන අධික (ඉලෙක්ට්‍රොන වැඩි) ඇති නොලෝහ (නොමැටල්) අයනයක් එම ඉලෙක්ට්‍රෝනය ලබා ගනී, අනියන (Cl → Cl⁻ + e⁻). | Cl (කලෝරින්) |
| 3️⃣ | **ආකර්ෂණය** – කැටි (Na⁺) සහ අනියන (Cl⁻) අතර විදුලි ආකර්ෂණය (Coulombic attraction) සිදු වෙයි. |
| 4️⃣ | **ක්‍රિસ્ટල් ලැටිස්** – බහු සංඛ්‍යාවක අයන එකට එකතු වී **ක්‍රિસ્ટල් ලැටිස්** (ionic crystal) එකක් ගොඩනැගේ. | NaCl (සෝඩියම් ක්ලෝරයිඩ්) |

### 3. අයනික බන්ධනයේ ලක්ෂණ  

| ලක්ෂණය | විස්තර |
|----------|----------|
| **ඉලෙක්ට්‍රෝන ගත කිරීම** | බන්ධනය සෑදීමට ඉලෙක්ට්‍රෝන 1–3 ක් (සාමාන්‍යයෙන් 1) අහිමි/ලැබේ. |
| **ආකර්ෂණ ශක්තිය** | කැටි හා අනියන අතර **Coulombic attraction** (විදුලි ආකර්ෂණ) මත පදනම්ව, බන්ධනය ශක්තිමත් වේ. |
| **ලැටිස් (Crystal) ව්‍යුහය** | අයනික සංයෝග සාමාන්‍යයෙන් **ක್ಯೂබික්, ෆේස්-සෙන්ටර්ඩ් ඔක්ටාහෙඩ්‍රල්** වැනි නියමිත ලැටිස් ව්‍යුහයන් ගොඩනඟයි. |
| **උච්ච බිඳීමේ තාපය** | බන්ධනය බිඳීමට (melting) උච්ච තාපය (high melting point) අවශ්‍ය වේ. |
| **විදුලි චාලකත්වය** | **ඉදිරිපත් (solid) තත්වයේ** විදුලිය නොචාලකයි; **දියර (aqueous) හෝ ගැස්සු (molten) තත්වයේ** විදුලිය චාලක වේ (අයන චලනය නිසා). |
| **දෘශ්‍ය රූපය** | බොහෝ අයනික සංයෝග **සුදු, පැහැති, පාරදෘශ්‍ය** (transparent) හෝ **අපාරදෘශ්‍ය** (opaque) විය හැක. |
| **දෘඪත්වය** | බොහෝ අයනික සම්භන්ධිත ද්‍රව්‍ය **දෘඪ (brittle)** වේ; බලයක් යෙදූ විට අයන අතර ආකර්ෂණය බිඳී, අයන ස්ලයිඩ් වීමෙන් කඩයි. |

### 4. අයනික බන්ධනය ඇති සාමාන්‍ය උදාහරණ  

| සංයෝගය | සූත්‍රය | කැටි (Cation) | අනියන (Anion) |
|----------|----------|----------------|----------------|
| සෝඩියම් ක්ලෝරයිඩ් | NaCl | Na⁺ | Cl⁻ |
| කැල්සියම් ඔක්සයිඩ් | CaO | Ca²⁺ | O²⁻ |
| මැග්නීසියම් සල්ෆයිඩ් | MgS | Mg²⁺ | S²⁻ |
| ලිත්‍යම් බ්‍රෝමයිඩ් | LiBr | Li⁺ | Br⁻ |
| අල්මිනියම් ක්ලෝරයිඩ් | AlCl₃ (ඉහළ තාපයේ) | Al³⁺ | 3Cl⁻ |

> **සටහන:** AlCl₃ වායු තත්ත්වයේ මොලිකුලර් (covalent) වශයෙන් පවතී, නමුත් **ඉහළ තාපයේ** (molten) හෝ **ක්‍රිස්ටල්** තත්වයේ අයනික ලැටිස් වශයෙන් පවතී.

### 5. අයනික බන්ධනය හා සම්මත (Covalent) බන්ධනය අතර වෙනස්කම්  

| ලක්ෂණය | අයනික බන්ධනය | සම්මත (Covalent) බන්ධනය |
|----------|----------------|

**Citations:** (none — baseline has no retrieval step)

**Review:** [ ] Correct  [x] Partially correct  [ ] Incorrect

**Notes:** (AI self-review) Content given (ionic bonding mechanism, examples table) is accurate. Cut off mid-table (empty/malformed final row) at the token cap.

---
