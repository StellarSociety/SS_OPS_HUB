import { LookupEditor, type LookupFieldConfig } from "@/components/hr/lookup-editor";
import {
  deleteCertificationType,
  deleteCivilStatus,
  deleteDepartment,
  deleteEmploymentStatus,
  deleteGender,
  deleteInsuranceCategory,
  deleteNationality,
  deletePosition,
  deleteWorkingStatus,
  reorderCertificationTypes,
  reorderCivilStatuses,
  reorderDepartments,
  reorderEmploymentStatuses,
  reorderGenders,
  reorderInsuranceCategories,
  reorderNationalities,
  reorderPositions,
  reorderWorkingStatuses,
  upsertCertificationType,
  upsertCivilStatus,
  upsertDepartment,
  upsertEmploymentStatus,
  upsertGender,
  upsertInsuranceCategory,
  upsertNationality,
  upsertPosition,
  upsertWorkingStatus,
} from "@/lib/actions/hr";
import type {
  CertificationType,
  CivilStatus,
  Department,
  EmploymentStatus,
  Gender,
  InsuranceCategory,
  Nationality,
  Position,
  WorkingStatus,
} from "@/lib/hr/types";

export function LookupSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-black/10 bg-white p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-black/55">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function DepartmentsSection({
  departments,
}: {
  departments: Department[];
}) {
  return (
    <LookupSection
      title="Departments"
      description="Drag to reorder, edit a name inline, or add a new department."
    >
      <LookupEditor
        items={departments}
        namePlaceholder="Department name"
        addLabel="Add department"
        emptyLabel="No departments yet — add the first one below."
        upsertAction={upsertDepartment}
        deleteAction={deleteDepartment}
        reorderAction={reorderDepartments}
      />
    </LookupSection>
  );
}

export function PositionsSection({
  positions,
  departments,
}: {
  positions: Position[];
  departments: Department[];
}) {
  const departmentOptions = departments.map((d) => ({
    value: d.id,
    label: d.name,
  }));
  const departmentField: LookupFieldConfig = {
    key: "department_id",
    label: "Department",
    type: "select",
    required: true,
    placeholder: "Department",
    options: departmentOptions,
  };

  const positionsByDepartment = new Map<string, Position[]>();
  for (const department of departments) {
    positionsByDepartment.set(department.id, []);
  }
  const unassigned: Position[] = [];
  for (const position of positions) {
    const group = positionsByDepartment.get(position.department_id);
    if (group) group.push(position);
    else unassigned.push(position);
  }

  return (
    <LookupSection
      title="Positions"
      description="Positions are grouped by department. Drag to reorder within a department, edit inline, reassign a position to another department, or add a new one."
    >
      <div className="space-y-6">
        {departments.map((department) => (
          <div key={department.id} className="space-y-2">
            <h3 className="font-nav text-sm font-semibold uppercase tracking-[0.08em] text-[#3D421F]">
              {department.name}
            </h3>
            <LookupEditor
              items={positionsByDepartment.get(department.id) ?? []}
              namePlaceholder="Position name"
              addLabel="Add position"
              emptyLabel={`No positions in ${department.name} yet — add the first one below.`}
              fields={[departmentField]}
              addDefaults={{ department_id: department.id }}
              upsertAction={upsertPosition}
              deleteAction={deletePosition}
              reorderAction={reorderPositions}
            />
          </div>
        ))}

        {unassigned.length > 0 ? (
          <div className="space-y-2">
            <h3 className="font-nav text-sm font-semibold uppercase tracking-[0.08em] text-black/50">
              Unassigned
            </h3>
            <LookupEditor
              items={unassigned}
              namePlaceholder="Position name"
              addLabel="Add position"
              emptyLabel="No unassigned positions."
              fields={[departmentField]}
              upsertAction={upsertPosition}
              deleteAction={deletePosition}
              reorderAction={reorderPositions}
            />
          </div>
        ) : null}
      </div>
    </LookupSection>
  );
}

export function EmploymentStatusSection({
  statuses,
}: {
  statuses: EmploymentStatus[];
}) {
  return (
    <LookupSection
      title="Employment statuses"
      description="Drag to reorder, edit a name inline, or add a new status."
    >
      <LookupEditor
        items={statuses}
        namePlaceholder="Status name"
        addLabel="Add status"
        emptyLabel="No statuses yet — add the first one below."
        upsertAction={upsertEmploymentStatus}
        deleteAction={deleteEmploymentStatus}
        reorderAction={reorderEmploymentStatuses}
      />
    </LookupSection>
  );
}

export function WorkingStatusSection({
  statuses,
}: {
  statuses: WorkingStatus[];
}) {
  return (
    <LookupSection
      title="Working Status"
      description="Tags used on the schedules roster (Active, leave, OFF-Boarding). Assignment rules come later — for now manage the list here."
    >
      <LookupEditor
        items={statuses}
        namePlaceholder="Working status"
        addLabel="Add working status"
        emptyLabel="No working statuses yet — add the first one below."
        upsertAction={upsertWorkingStatus}
        deleteAction={deleteWorkingStatus}
        reorderAction={reorderWorkingStatuses}
      />
    </LookupSection>
  );
}

export function NationalitiesSection({
  nationalities,
}: {
  nationalities: Nationality[];
}) {
  return (
    <LookupSection
      title="Nationalities"
      description="Drag to reorder, edit the fly-home ticket value inline, or add a new nationality. The value in the Fly-home ticket column is the employee's annual Fly Ticket allowance benefit (in AED) for that nationality."
    >
      <LookupEditor
        items={nationalities}
        namePlaceholder="Nationality"
        addLabel="Add nationality"
        emptyLabel="No nationalities yet — add the first one below."
        fields={[
          {
            key: "fly_home_ticket_value",
            label: "Fly-home ticket (AED)",
            type: "number",
            placeholder: "Ticket AED",
            className: "h-9 w-28",
          },
        ]}
        upsertAction={upsertNationality}
        deleteAction={deleteNationality}
        reorderAction={reorderNationalities}
      />
    </LookupSection>
  );
}

export function CivilStatusSection({
  civilStatuses,
}: {
  civilStatuses: CivilStatus[];
}) {
  return (
    <LookupSection
      title="Civil status"
      description="Drag to reorder, edit a name inline, or add a new civil status."
    >
      <LookupEditor
        items={civilStatuses}
        namePlaceholder="Civil status"
        addLabel="Add civil status"
        emptyLabel="No civil statuses yet — add the first one below."
        upsertAction={upsertCivilStatus}
        deleteAction={deleteCivilStatus}
        reorderAction={reorderCivilStatuses}
      />
    </LookupSection>
  );
}

export function GenderSection({ genders }: { genders: Gender[] }) {
  return (
    <LookupSection
      title="Gender"
      description="Drag to reorder, edit a name inline, or add a new gender option."
    >
      <LookupEditor
        items={genders}
        namePlaceholder="Gender"
        addLabel="Add gender"
        emptyLabel="No gender options yet — add the first one below."
        upsertAction={upsertGender}
        deleteAction={deleteGender}
        reorderAction={reorderGenders}
      />
    </LookupSection>
  );
}

export function InsuranceCategoriesSection({
  categories,
}: {
  categories: InsuranceCategory[];
}) {
  return (
    <LookupSection
      title="Insurance categories"
      description="Drag to reorder, set the default medical value inline, or add a new category."
    >
      <LookupEditor
        items={categories}
        namePlaceholder="Category name"
        addLabel="Add category"
        emptyLabel="No insurance categories yet — add the first one below."
        fields={[
          {
            key: "default_medical_value",
            label: "Default medical value (AED)",
            type: "number",
            placeholder: "Value AED",
            className: "h-9 w-32",
          },
        ]}
        upsertAction={upsertInsuranceCategory}
        deleteAction={deleteInsuranceCategory}
        reorderAction={reorderInsuranceCategories}
      />
    </LookupSection>
  );
}

export function CertificationTypesSection({
  certifications,
}: {
  certifications: CertificationType[];
}) {
  return (
    <LookupSection
      title="Certifications"
      description="Training and certification types, their renewal cycle, and reminder lead days."
    >
      <LookupEditor
        items={certifications}
        namePlaceholder="Certification name"
        addLabel="Add certification"
        emptyLabel="No certifications yet — add the first one below."
        fields={[
          {
            key: "renewal_months",
            label: "Renewal (months)",
            type: "number",
            placeholder: "Months",
            className: "h-9 w-24",
          },
          {
            key: "lead_days",
            label: "Reminder lead (days)",
            type: "number",
            placeholder: "Lead days",
            className: "h-9 w-28",
          },
        ]}
        upsertAction={upsertCertificationType}
        deleteAction={deleteCertificationType}
        reorderAction={reorderCertificationTypes}
      />
    </LookupSection>
  );
}
