import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function testJobChoices({ owner, test, as, q, m, id, today }) {
  const rpc = (user, fn, p, request = randomUUID()) =>
    as(
      user,
      async (client) =>
        (
          await client.query(
            `select public.${fn}($1${fn === "staffing_page" ? "" : ",$2"}) r`,
            fn === "staffing_page" ? [p] : [p, request],
          )
        ).rows[0].r,
    );
  const original = (
    await owner.query(
      "select * from public.field_definitions where key in ('department','position')",
    )
  ).rows;
  try {
    await test("official Department/Position lists require Superadmin, versions and actor-bound idempotency", async () => {
      for (const key of ["department", "position"]) {
        const field = original.find((field) => field.key === key);
        const p = {
          key,
          options:
            key === "department"
              ? ["PRODUCTION", "WAREHOUSE"]
              : ["FINISHER", "WAREHOUSEMAN"],
          expected_version: field.row_version,
        };
        const request = randomUUID();
        const saved = await rpc(id.sa, "set_job_choices", p, request);
        assert.deepEqual(
          await rpc(id.sa, "set_job_choices", p, request),
          saved,
        );
        await assert.rejects(rpc(id.viewer, "set_job_choices", p), {
          code: "42501",
        });
        await assert.rejects(rpc(id.sa, "set_job_choices", p), {
          code: "40001",
        });
        await assert.rejects(
          rpc(
            id.sa,
            "set_job_choices",
            { ...p, options: ["Changed"] },
            request,
          ),
          /different payload/,
        );
        await assert.rejects(
          rpc(id.sa, "set_job_choices", {
            ...p,
            expected_version: saved.row_version,
            options: ["Job", " job "],
          }),
          { code: "22023" },
        );
      }
      const pos = (
        await owner.query(
          "select * from public.field_definitions where key='position'",
        )
      ).rows[0];
      assert.equal(
        pos.type,
        original.find((field) => field.key === "position").type,
      );
      await assert.rejects(
        m(id.sa, "field", { ...pos, expected_version: pos.row_version }),
        /System field/,
      );
    });
    await test("temporary job names are accepted in manual entry and imports even with configured dropdown metadata", async () => {
      await owner.query(
        "update public.field_definitions set type='select' where key='department'",
      );
      const manual = await m(id.sa, "employee_create", {
        target_level: "head_office",
        initial_position: "Temporary specialist",
        values: {
          first_name: "SOLARJOB",
          last_name: "TEMPORARY",
          department: "New temporary team",
        },
      });
      assert.equal(
        (await q(id.sa, "employee", { id: manual.id })).employee.values
          .department,
        "New temporary team",
      );
      await m(id.sa, "employee_import", {
        target_level: "head_office",
        rows: [
          {
            values: {
              first_name: "LUNARJOB",
              last_name: "IMPORT",
              department: "Incoming team",
              position: "Incoming position",
            },
          },
        ],
      });
      assert.equal(
        (
          await owner.query(
            "select count(*) n from public.employees where custom_values->>'department'='Incoming team'",
          )
        ).rows[0].n,
        "1",
      );
      const choices = (
        await owner.query(
          "select options from public.field_definitions where key='department'",
        )
      ).rows[0].options;
      assert.deepEqual(choices, ["PRODUCTION", "WAREHOUSE"]);
    });
    await test("temporary PRF job labels can be filled without official catalog promotion and case alone does not change vacancy counts", async () => {
      const line = {
        id: randomUUID(),
        department: "Temporary PRF team",
        position: "Temporary PRF job",
        required_headcount: 2,
      };
      const p = {
        id: randomUUID(),
        client_id: id.c2,
        reference: "TEMP-JOB-PRF",
        employment_type: "Regular",
        starts_on: today,
        ends_on: null,
        active: true,
        expected_version: 0,
        lines: [line],
      };
      await rpc(id.sa, "set_staffing_requisition", p);
      await m(id.sa, "employee_create", {
        target_level: "client",
        branch_id: id.b2,
        client_id: id.c2,
        initial_position: "temporary prf job",
        values: {
          first_name: "MERCURYJOB",
          last_name: "LINKED",
          department: "temporary prf team",
          employment_type: "Regular",
          date_hired: today,
          prf_number: p.reference,
        },
      });
      const page = await rpc(id.sa, "staffing_page", { search: p.reference });
      assert.equal(page.items[0].required_headcount, 2);
      assert.equal(page.items[0].filled_headcount, 1);
      assert.equal(
        (100 * page.items[0].filled_headcount) /
          page.items[0].required_headcount,
        50,
      );
      const position = (
        await owner.query(
          "select options,row_version from public.field_definitions where key='position'",
        )
      ).rows[0];
      assert.deepEqual(position.options, ["FINISHER", "WAREHOUSEMAN"]);
      await rpc(id.sa, "set_job_choices", {
        key: "position",
        expected_version: position.row_version,
        options: [],
      });
    });
  } finally {
    for (const field of original)
      await owner.query(
        "update public.field_definitions set type=$1,options=$2,row_version=row_version+1 where id=$3",
        [field.type, JSON.stringify(field.options), field.id],
      );
  }
}
