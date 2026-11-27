import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listUsers } from "../src/api/admin";
import { createClass, listClasses, setClassStudents, setClassTeachers } from "../src/api/classes";
import { ClassesPage } from "../src/features/admin/ClassesPage";

vi.mock("../src/api/admin", () => ({ listUsers: vi.fn() }));
vi.mock("../src/api/classes", () => ({
  listClasses: vi.fn(),
  createClass: vi.fn(),
  setClassTeachers: vi.fn(),
  setClassStudents: vi.fn(),
  archiveClass: vi.fn(),
}));

const people = [
  { id: 1, email: "ta@school.lk", name: "Teacher A", role: "teacher", is_active: true, created_at: "" },
  { id: 2, email: "s1@school.lk", name: "Student One", role: "student", is_active: true, created_at: "" },
  { id: 3, email: "s2@school.lk", name: "Student Two", role: "student", is_active: true, created_at: "" },
];
const class13A = { id: 7, name: "13 A", academic_year: "2026", archived: false, teacher_ids: [], student_ids: [2] };

describe("ClassesPage (class rosters)", () => {
  beforeEach(() => {
    vi.mocked(listUsers).mockResolvedValue(people as never);
    vi.mocked(listClasses).mockResolvedValue([class13A]);
  });

  it("lists classes and saves only teacher accounts as teachers", async () => {
    vi.mocked(setClassTeachers).mockResolvedValue({ ...class13A, teacher_ids: [1] });
    render(<ClassesPage />);
    const card = await screen.findByRole("region", { name: "Class 13 A" });
    const teachers = within(card).getByRole("group", { name: "Teachers" });

    expect(within(teachers).queryByLabelText(/Student One/)).not.toBeInTheDocument();
    fireEvent.click(within(teachers).getByLabelText(/Teacher A/));
    fireEvent.click(within(card).getByRole("button", { name: "Save teachers" }));

    await waitFor(() => expect(setClassTeachers).toHaveBeenCalledWith(7, [1]));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved teachers for 13 A.");
  });

  it("keeps enrolled students ticked and saves the new set", async () => {
    vi.mocked(setClassStudents).mockResolvedValue({ ...class13A, student_ids: [2, 3] });
    render(<ClassesPage />);
    const card = await screen.findByRole("region", { name: "Class 13 A" });
    const students = within(card).getByRole("group", { name: "Students" });

    expect(within(students).getByLabelText(/Student One/)).toBeChecked();
    fireEvent.click(within(students).getByLabelText(/Student Two/));
    fireEvent.click(within(card).getByRole("button", { name: "Save students" }));

    await waitFor(() => expect(setClassStudents).toHaveBeenCalledWith(7, [2, 3]));
  });

  it("creates a class", async () => {
    vi.mocked(createClass).mockResolvedValue({ ...class13A, id: 8, name: "12 C", student_ids: [] });
    render(<ClassesPage />);
    await screen.findByRole("region", { name: "Class 13 A" });

    fireEvent.change(screen.getByLabelText("Class name"), { target: { value: " 12 C " } });
    fireEvent.change(screen.getByLabelText("Academic year"), { target: { value: "2027" } });
    fireEvent.click(screen.getByRole("button", { name: "Add class" }));

    await waitFor(() => expect(createClass).toHaveBeenCalledWith({ name: "12 C", academic_year: "2027" }));
    expect(await screen.findByRole("region", { name: "Class 12 C" })).toBeInTheDocument();
  });
});
