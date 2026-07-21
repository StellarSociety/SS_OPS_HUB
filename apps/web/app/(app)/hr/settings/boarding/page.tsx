import {
  LogOut,
  MessageSquareText,
  UserCheck,
  UserPlus,
} from "lucide-react";
import {
  HrSettingsRoadmap,
  HrSettingsSectionHeader,
} from "@/components/hr/hr-settings-section";

const BOARDING_ROADMAP = [
  {
    title: "Hiring",
    description:
      "Offer templates, document checklists, and hand-off from recruitment into Hiring status.",
    icon: UserPlus,
  },
  {
    title: "ON Boarding",
    description:
      "Day-one tasks, system access, and probation kick-off when someone joins ON Board.",
    icon: UserCheck,
  },
  {
    title: "OFF Boarding",
    description:
      "Exit checklists, asset return, and final pay triggers when moving to OFF Board or OUT.",
    icon: LogOut,
  },
  {
    title: "Communications",
    description:
      "Welcome and farewell message templates sent to staff and managers.",
    icon: MessageSquareText,
    status: "soon" as const,
  },
] as const;

export default function HrBoardingSettingsPage() {
  return (
    <div className="space-y-4">
      <HrSettingsSectionHeader
        title="Boarding"
        description="Hiring, ON-Boarding, OFF-Boarding, and related communications. Employment status rules stay under Staff Details."
      />
      <HrSettingsRoadmap
        items={BOARDING_ROADMAP}
        footnote="These modules are on the roadmap — nothing to configure here yet."
      />
    </div>
  );
}
