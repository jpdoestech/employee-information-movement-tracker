import { describe, it, expect } from "vitest";
import { demoAnalytics } from "../../src/demoAnalytics";
import type { Employee } from "../../src/domain";

describe("overview synthetic fixture calculations", () => {
  const employees: Employee[] = [
    {
      id: "a",
      row_version: 1,
      values: {
        status: "Active",
        branch: "North",
        client: "Shared",
        employment_type: "Regular",
        department: "Operations",
        position: "Clerk",
        date_hired: "2026-01-01",
        birth_date: "2000-10-27",
        gender: "Female",
      },
    },
    {
      id: "b",
      row_version: 1,
      values: {
        status: "Active",
        branch: "South",
        client: "Shared",
        employment_type: "Regular",
        department: "Operations",
        position: "Clerk",
        date_hired: "2026-10-25",
        birth_date: "2000-10-26",
        gender: "Male",
      },
    },
  ];
  const org = [
    { id: "n", kind: "client", label: "Shared", context: "North" },
    { id: "s", kind: "client", label: "Shared", context: "South" },
  ];
  const today = "2026-10-26";
  it("separates duplicate client labels, uses inclusive ranges and exact birthday age", () => {
    const result = demoAnalytics(employees, [], [], org, today, {});
    expect(result.from).toBe("2026-09-27");
    expect(result.clients.map((r) => r.id)).toEqual(["n", "s"]);
    expect(result.period.hires).toBe(1);
    expect(result.period.opening).toBe(1);
    expect(result.period.retention).toBe(100);
    expect(result.age_gender).toContainEqual({
      age: "18–25",
      gender: "Female",
      count: 1,
    });
    expect(result.age_gender).toContainEqual({
      age: "26–30",
      gender: "Male",
      count: 1,
    });
    expect(result.fill_rate).toBeNull();
  });
  it("caps coverage per client/type so overstaffing cannot conceal vacancies", () => {
    const result = demoAnalytics(
      employees,
      [],
      [
        {
          id: "one",
          reference: "PRF",
          client_id: "n",
          employment_type: "Regular",
          department: "Operations",
          position: "Clerk",
          required_headcount: 1,
          lines: [
            {
              id: "one-line",
              department: "Operations",
              position: "Clerk",
              required_headcount: 1,
            },
          ],
          starts_on: "2026-01-01",
          ends_on: null,
          active: true,
        },
        {
          id: "two",
          reference: "PRF2",
          client_id: "n",
          employment_type: "Contractual",
          required_headcount: 3,
          lines: [
            {
              id: "two-line",
              department: "Operations",
              position: "Clerk",
              required_headcount: 3,
            },
          ],
          starts_on: "2026-01-01",
          ends_on: null,
          active: true,
        },
        {
          id: "expired",
          reference: "OLD",
          client_id: "s",
          employment_type: "Regular",
          department: "Operations",
          position: "Clerk",
          required_headcount: 100,
          lines: [
            {
              id: "expired-line",
              department: "Operations",
              position: "Clerk",
              required_headcount: 100,
            },
          ],
          starts_on: "2026-01-01",
          ends_on: today,
          active: true,
        },
      ],
      org,
      today,
      {},
      new Map([
        ["a", "one-line"],
        ["b", "one-line"],
      ]),
    );
    expect(result.staffing).toEqual({ required: 4, filled: 1 });
    expect(result.fill_rate).toBe(25);
  });
  it("rejects reversed and future ranges and leaves undefined rates empty", () => {
    expect(() =>
      demoAnalytics([], [], [], org, today, { from: today, to: "2026-10-25" }),
    ).toThrow();
    expect(() =>
      demoAnalytics([], [], [], org, today, { to: "2026-10-27" }),
    ).toThrow();
    expect(demoAnalytics([], [], [], org, today, {}).period).toMatchObject({
      hires: null,
      retention: null,
      turnover: null,
    });
  });
});
