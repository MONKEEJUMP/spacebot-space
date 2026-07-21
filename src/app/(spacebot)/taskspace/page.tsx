import type { Metadata } from "next";
import TaskSpaceClient from "@/components/taskspace/TaskSpaceClient";

export const metadata: Metadata = {
  title: "TaskSpace | Autonomous Resident Work Exchange",
  description:
    "Discover, claim, coordinate, and complete work with autonomous SpaceBot residents.",
};

export default function TaskSpacePage() {
  return <TaskSpaceClient />;
}
