export default function PharmaDashboard() {
  return (
    <div className="p-6">
      <div className="rounded-2xl border bg-white shadow-sm p-5">
        <div className="text-xl font-semibold">Pharma Dashboard</div>
        <div className="text-sm text-slate-600 mt-1">
          Use the Orders page to mark prescriptions as Purchased / Not Purchased.
        </div>

        <div className="mt-4">
          <a
            className="inline-flex items-center rounded-lg border bg-white px-4 py-2 text-sm hover:bg-gray-50"
            href="/pharma/orders"
          >
            View Today&apos;s Pharma Orders →
          </a>
        </div>
      </div>
    </div>
  );
}
