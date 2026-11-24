"""The element symbols, so a formula can be told apart from a typo.

This is the periodic table as the A/L syllabus spells it. It exists for one job:
"NaCL" and "Xx2O" are not chemistry, and nothing downstream should pretend to count
their atoms.
"""

# ruff: noqa: SIM905 - one row per period reads like the table it came from
SYMBOLS = frozenset(
    """
    H He Li Be B C N O F Ne
    Na Mg Al Si P S Cl Ar K Ca
    Sc Ti V Cr Mn Fe Co Ni Cu Zn
    Ga Ge As Se Br Kr Rb Sr Y Zr
    Nb Mo Tc Ru Rh Pd Ag Cd In Sn
    Sb Te I Xe Cs Ba La Ce Pr Nd
    Pm Sm Eu Gd Tb Dy Ho Er Tm Yb
    Lu Hf Ta W Re Os Ir Pt Au Hg
    Tl Pb Bi Po At Rn Fr Ra Ac Th
    Pa U Np Pu Am Cm Bk Cf Es Fm
    Md No Lr Rf Db Sg Bh Hs Mt Ds
    Rg Cn Nh Fl Mc Lv Ts Og
    """.split()
)

# Placeholders written as if they were elements. They are readable chemistry, but
# their atoms are unknown, so an equation containing one cannot be counted.
GROUP_SYMBOLS = {
    "R": "an unspecified organic group",
    "X": "an unspecified halogen",
    "M": "an unspecified metal",
    "Ph": "phenyl, C6H5",
}
