"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  upsertDepartment,
  upsertEmploymentStatus,
  upsertNationality,
  upsertPosition,
} from "@/lib/actions/hr";
import type { Department, Nationality, Position } from "@/lib/hr/types";
import type { EmploymentStatus } from "@/lib/hr/types";

type LookupsAdminProps = {
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  nationalities: Nationality[];
};

export function LookupsAdmin({
  departments,
  positions,
  statuses,
  nationalities,
}: LookupsAdminProps) {
  return (
    <div className="space-y-8">
      <LookupSection title="Departments">
        <form action={upsertDepartment} className="flex flex-wrap gap-2">
          <Input name="name" placeholder="New department" required className="max-w-xs" />
          <Input name="sort_order" type="number" placeholder="Order" className="w-24" />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
        <ul className="mt-3 space-y-1 text-sm">
          {departments.map((d) => (
            <li key={d.id} className="text-[#3D421F]">
              {d.name}
            </li>
          ))}
        </ul>
      </LookupSection>

      <LookupSection title="Positions">
        <form action={upsertPosition} className="flex flex-wrap gap-2">
          <select
            name="department_id"
            required
            className="h-10 rounded-md border border-black/10 px-2 text-sm"
          >
            <option value="">Department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <Input name="name" placeholder="Position name" required className="max-w-xs" />
          <Input name="sort_order" type="number" placeholder="Order" className="w-24" />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
        <ul className="mt-3 space-y-1 text-sm">
          {positions.map((p) => (
            <li key={p.id} className="text-[#3D421F]">
              {p.name}
              <span className="text-black/40">
                {" "}
                ·{" "}
                {departments.find((d) => d.id === p.department_id)?.name}
              </span>
            </li>
          ))}
        </ul>
      </LookupSection>

      <LookupSection title="Employment statuses">
        <form action={upsertEmploymentStatus} className="flex flex-wrap gap-2">
          <Input name="name" placeholder="Status name" required className="max-w-xs" />
          <Input name="sort_order" type="number" placeholder="Order" className="w-24" />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
        <ul className="mt-3 space-y-1 text-sm">
          {statuses.map((s) => (
            <li key={s.id}>{s.name}</li>
          ))}
        </ul>
      </LookupSection>

      <LookupSection title="Nationalities">
        <form action={upsertNationality} className="flex flex-wrap gap-2">
          <Input name="name" placeholder="Nationality" required className="max-w-xs" />
          <Input
            name="fly_home_ticket_value"
            type="number"
            placeholder="Ticket AED"
            className="w-28"
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm">
          {nationalities.map((n) => (
            <li key={n.id}>
              {n.name}{" "}
              <span className="text-black/40">· AED {n.fly_home_ticket_value}</span>
            </li>
          ))}
        </ul>
      </LookupSection>
    </div>
  );
}

function LookupSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
