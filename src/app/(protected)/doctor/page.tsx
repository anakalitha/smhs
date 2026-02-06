"use client";

import TodayQueueCard from "./_components/TodayQueueCard";
import PatientLookupCard from "./_components/PatientLookupCard";
import NotificationsPanel from "@/components/notifications/NotificationsPanel";
import ReportsSection from "./_components/ReportsSection";

export default function DoctorDashboardPage() {
  return (
    <div className="min-h-[calc(100vh-120px)] bg-[#F2F2F2]">
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <TodayQueueCard />
        </div>
        <div className="lg:col-span-2">
          <NotificationsPanel />
        </div>
      </div>
      <div className="mt-4">
        <PatientLookupCard />
      </div>
      <div className="mt-4">
        <ReportsSection />
      </div>
    </div>
  );
}
