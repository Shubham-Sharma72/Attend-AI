import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, test } from "vitest";
import StudentForm, { EMPTY_STUDENT } from "./StudentForm.jsx";

function Harness({ start = {}, branches = [], classes = [] }) {
  const [v, setV] = useState({ ...EMPTY_STUDENT, ...start });
  return (<><StudentForm value={v} onChange={setV} prefix="t" branches={branches} classes={classes} />
    <output data-testid="val">{`${v.branch}|${v.class_name}`}</output></>);
}

test("branch and semester are dropdowns: 1-8 semesters, common branches, and Other to type", () => {
  render(<Harness branches={["Civil (Structures)"]} />);
  const branch = screen.getByLabelText("Branch");
  const sem = screen.getByLabelText("Semester");
  expect([...sem.querySelectorAll("option")].map((o) => o.textContent))
    .toEqual(["Choose…", ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `Semester ${n}`), "Other (type it)"]);
  expect([...branch.querySelectorAll("option")].map((o) => o.value)).toEqual(expect.arrayContaining(["CSE", "ECE", "Civil (Structures)"]));

  fireEvent.change(branch, { target: { value: "ECE" } });
  fireEvent.change(sem, { target: { value: "6th sem" } });
  expect(screen.getByTestId("val").textContent).toBe("ECE|6th sem");

  fireEvent.change(branch, { target: { value: "__other__" } });
  fireEvent.change(screen.getByLabelText("Branch: type your own"), { target: { value: "Ocean Engineering" } });
  expect(screen.getByTestId("val").textContent).toBe("Ocean Engineering|6th sem");
});

test("an older typed value opens in the Other box when editing", () => {
  render(<Harness start={{ branch: "CSE", class_name: "6th sem A" }} />);
  expect(screen.getByLabelText("Branch").value).toBe("CSE");
  expect(screen.getByLabelText("Semester: type your own").value).toBe("6th sem A");
});
