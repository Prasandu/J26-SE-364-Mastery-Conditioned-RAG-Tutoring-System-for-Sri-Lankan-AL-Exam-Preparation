"""Seed verified Chemistry questions (Units 1, 2, 3).

Usage:
    python scripts/seed_questions.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionLocal  # noqa: E402
from app.models import VerifiedQuestion  # noqa: E402

QUESTIONS = [
    {
        "question_code": "CHEM-U3-Q001",
        "topic_id": "U03-MOLE",
        "unit": "3",
        "question_text": (
            "Calculate the amount of substance (in mol) in 9 g of water (H2O). " "Use H = 1, O = 16."
        ),
        "difficulty": "easy",
        "verified_answer": "0.5",
        "answer_unit": "mol",
        "hint_text": "Which two quantities do you need to calculate the number of moles?",
        "concept_text": (
            "Number of moles = mass of substance / molar mass of substance. "
            "You need the given mass and the molar mass of H2O."
        ),
        "guided_question_text": (
            "What is the molar mass of H2O? (H = 1, O = 16). " "Add the atomic masses: 2 x H + 1 x O."
        ),
        "worked_steps_text": (
            "Step 1: Molar mass of H2O = (2 x 1) + 16 = 18 g/mol.\n"
            "Step 2: moles = mass / molar mass = 9 / 18.\n"
            "Step 3: Compute the division."
        ),
        "full_solution_text": (
            "Molar mass of H2O = (2 x 1) + 16 = 18 g/mol.\n"
            "moles = mass / molar mass = 9 g / 18 g/mol = 0.5 mol."
        ),
    },
    {
        "question_code": "CHEM-U3-Q002",
        "topic_id": "U03-MOLAR-MASS",
        "unit": "3",
        "question_text": "Calculate the molar mass of NaCl (sodium chloride). Use Na = 23, Cl = 35.5.",
        "difficulty": "easy",
        "verified_answer": "58.5",
        "answer_unit": "g/mol",
        "hint_text": "What are the two elements in NaCl, and what are their atomic masses?",
        "concept_text": (
            "Molar mass of a compound is the sum of the atomic masses of all atoms " "in its formula."
        ),
        "guided_question_text": "NaCl has one Na atom and one Cl atom. What is 23 + 35.5?",
        "worked_steps_text": (
            "Step 1: Identify atoms in NaCl: 1 x Na, 1 x Cl.\n" "Step 2: Molar mass = (1 x 23) + (1 x 35.5)."
        ),
        "full_solution_text": "Molar mass of NaCl = 23 + 35.5 = 58.5 g/mol.",
    },
    {
        "question_code": "CHEM-U3-Q003",
        "topic_id": "U03-MOLE",
        "unit": "3",
        "question_text": (
            "Calculate the amount of substance (in mol) in 11 g of carbon dioxide (CO2). "
            "Use C = 12, O = 16."
        ),
        "difficulty": "medium",
        "verified_answer": "0.25",
        "answer_unit": "mol",
        "hint_text": "Which two quantities do you need to calculate the number of moles?",
        "concept_text": (
            "Number of moles = mass of substance / molar mass of substance. "
            "You need the given mass and the molar mass of CO2."
        ),
        "guided_question_text": ("What is the molar mass of CO2? (C = 12, O = 16). " "Add: 1 x C + 2 x O."),
        "worked_steps_text": (
            "Step 1: Molar mass of CO2 = 12 + (2 x 16) = 44 g/mol.\n"
            "Step 2: moles = mass / molar mass = 11 / 44.\n"
            "Step 3: Compute the division."
        ),
        "full_solution_text": (
            "Molar mass of CO2 = 12 + (2 x 16) = 44 g/mol.\n"
            "moles = mass / molar mass = 11 g / 44 g/mol = 0.25 mol."
        ),
    },
    {
        "question_code": "CHEM-U3-Q004",
        "topic_id": "U03-MOLARITY",
        "unit": "3",
        "question_text": (
            "Calculate the molarity (mol dm-3) of a solution containing 0.5 mol of NaOH "
            "dissolved to make 2 dm3 of solution."
        ),
        "difficulty": "easy",
        "verified_answer": "0.25",
        "answer_unit": "mol dm-3",
        "hint_text": "Which two quantities do you need to calculate molarity?",
        "concept_text": (
            "Molarity = amount of substance (mol) / volume of solution (dm3). "
            "You need the number of moles and the total volume."
        ),
        "guided_question_text": "You are given 0.5 mol in 2 dm3. What is 0.5 divided by 2?",
        "worked_steps_text": (
            "Step 1: Molarity = moles / volume.\n"
            "Step 2: Molarity = 0.5 mol / 2 dm3.\n"
            "Step 3: Compute the division."
        ),
        "full_solution_text": "Molarity = 0.5 mol / 2 dm3 = 0.25 mol dm-3.",
    },
    {
        "question_code": "CHEM-U3-Q005",
        "topic_id": "U03-PERCENTAGE-COMPOSITION",
        "unit": "3",
        "question_text": (
            "Calculate the percentage by mass of oxygen in carbon dioxide (CO2). "
            "Use C = 12, O = 16. Give your answer to 2 decimal places."
        ),
        "difficulty": "medium",
        "verified_answer": "72.73",
        "answer_unit": "%",
        "hint_text": "What is the molar mass of CO2, and what mass of that comes from oxygen?",
        "concept_text": (
            "Percentage by mass of an element = (total mass of that element in the "
            "formula / molar mass of the compound) x 100."
        ),
        "guided_question_text": (
            "Molar mass of CO2 is 44 g/mol. The mass from oxygen is 2 x 16 = 32. " "What is (32 / 44) x 100?"
        ),
        "worked_steps_text": (
            "Step 1: Molar mass of CO2 = 12 + (2 x 16) = 44 g/mol.\n"
            "Step 2: Mass from oxygen = 2 x 16 = 32 g/mol.\n"
            "Step 3: Percentage = (32 / 44) x 100."
        ),
        "full_solution_text": (
            "Molar mass of CO2 = 44 g/mol. Mass from oxygen = 32 g/mol.\n"
            "Percentage oxygen = (32 / 44) x 100 = 72.73%."
        ),
    },
    {
        "question_code": "CHEM-U1-Q001",
        "topic_id": "U01-ISOTOPES",
        "unit": "1",
        "question_text": (
            "An atom of chlorine has mass number 37 and atomic number 17. " "How many neutrons does it have?"
        ),
        "difficulty": "easy",
        "verified_answer": "20",
        "answer_unit": None,
        "hint_text": "How is mass number related to protons and neutrons?",
        "concept_text": (
            "Mass number (A) = number of protons (Z) + number of neutrons. "
            "Atomic number is the number of protons."
        ),
        "guided_question_text": "If mass number is 37 and atomic number (protons) is 17, what is 37 - 17?",
        "worked_steps_text": (
            "Step 1: neutrons = mass number - atomic number.\n" "Step 2: neutrons = 37 - 17."
        ),
        "full_solution_text": "Neutrons = mass number - atomic number = 37 - 17 = 20.",
    },
    {
        "question_code": "CHEM-U1-Q002",
        "topic_id": "U01-ELECTRON-CONFIG",
        "unit": "1",
        "question_text": (
            "What is the maximum number of electrons that can occupy the third "
            "principal energy level (n = 3)?"
        ),
        "difficulty": "medium",
        "verified_answer": "18",
        "answer_unit": None,
        "hint_text": "There is a formula connecting the principal quantum number n to the maximum electrons.",
        "concept_text": ("The maximum number of electrons in principal energy level n is given by 2n^2."),
        "guided_question_text": "For n = 3, what is 2 x 3^2?",
        "worked_steps_text": ("Step 1: Maximum electrons = 2n^2.\n" "Step 2: For n = 3: 2 x (3^2) = 2 x 9."),
        "full_solution_text": "Maximum electrons = 2n^2 = 2 x 3^2 = 2 x 9 = 18.",
    },
    {
        "question_code": "CHEM-U2-Q001",
        "topic_id": "U02-ELECTRONEGATIVITY",
        "unit": "2",
        "question_text": (
            "Using Pauling electronegativity values (H = 2.20, Cl = 3.16), calculate "
            "the electronegativity difference between H and Cl in HCl."
        ),
        "difficulty": "easy",
        "verified_answer": "0.96",
        "answer_unit": None,
        "hint_text": "Electronegativity difference is the larger value minus the smaller value.",
        "concept_text": (
            "A bigger electronegativity difference generally means a more polar bond. "
            "Subtract the smaller value from the larger value."
        ),
        "guided_question_text": "Cl has electronegativity 3.16 and H has 2.20. What is 3.16 - 2.20?",
        "worked_steps_text": (
            "Step 1: Identify the two values: H = 2.20, Cl = 3.16.\n" "Step 2: Difference = 3.16 - 2.20."
        ),
        "full_solution_text": "Electronegativity difference = 3.16 - 2.20 = 0.96.",
    },
    {
        "question_code": "CHEM-U2-Q002",
        "topic_id": "U02-LEWIS-STRUCTURE",
        "unit": "2",
        "question_text": "How many lone pairs of electrons are on the oxygen atom in a water molecule (H2O)?",
        "difficulty": "easy",
        "verified_answer": "2",
        "answer_unit": None,
        "hint_text": "Oxygen has 6 valence electrons. How many does it share in bonds with the two H atoms?",
        "concept_text": (
            "Oxygen has 6 valence electrons. In H2O it forms 2 bonding pairs (one with "
            "each H atom), using 2 of its electrons in bonds; the rest are lone pairs."
        ),
        "guided_question_text": (
            "Oxygen has 6 valence electrons and uses 2 in bonds to the two H atoms, "
            "leaving 4 electrons. How many pairs is that?"
        ),
        "worked_steps_text": (
            "Step 1: Oxygen has 6 valence electrons.\n"
            "Step 2: 2 electrons are used in bonding pairs (1 per O-H bond).\n"
            "Step 3: Remaining electrons = 6 - 2 = 4, which is 2 lone pairs."
        ),
        "full_solution_text": (
            "Oxygen has 6 valence electrons, uses 2 in the two O-H bonds, leaving 4 "
            "electrons = 2 lone pairs."
        ),
    },
]


def main() -> None:
    db = SessionLocal()
    try:
        for q in QUESTIONS:
            existing = db.query(VerifiedQuestion).filter_by(question_code=q["question_code"]).first()
            if existing:
                print(f"skip (already exists): {q['question_code']}")
                continue
            db.add(VerifiedQuestion(**q))
            print(f"added: {q['question_code']}")
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
