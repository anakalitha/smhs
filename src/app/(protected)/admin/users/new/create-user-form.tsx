"use client";

import { useState } from "react";

type Branch = { id: number; name: string };

export default function CreateUserForm({
  myRoles,
  myOrgId,
  myBranchId,
  roles,
  branches,
}: {
  myRoles: string[];
  myOrgId: number | null;
  myBranchId: number | null;
  roles: string[];
  branches: Branch[];
}) {
  const isSuperAdmin = myRoles.includes("SUPER_ADMIN");
  const isAdmin = myRoles.includes("ADMIN");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState(
    roles.find((r) => r === "DOCTOR") || roles[0] || "DOCTOR"
  );
  const [branchId, setBranchId] = useState<number | "">(
    isAdmin && myBranchId ? myBranchId : ""
  );

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setTempPassword(null);

    if (!myOrgId) {
      setMsg("Your account is not linked to an organization. Fix user org_id.");
      return;
    }

    if (isSuperAdmin && branchId === "") {
      setMsg("Please select a branch.");
      return;
    }

    if (password.length < 8) {
      setMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setMsg("Password and Confirm Password do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone: phone || null,
          role,
          branchId: branchId === "" ? null : branchId,
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data?.error || "Failed to create user.");
        return;
      }

      setMsg(`User created: ${data.email}`);
      setTempPassword(data.tempPassword);

      setFullName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setConfirmPassword("");
      if (isSuperAdmin) setBranchId("");
    } catch {
      setMsg("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-lg border bg-white p-5"
    >
      {msg && (
        <div className="rounded-md border px-3 py-2 text-sm bg-gray-50">
          {msg}
        </div>
      )}

      {tempPassword && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm">
          Temporary password:{" "}
          <span className="font-semibold">{tempPassword}</span>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Full Name *</label>
        <input
          className="w-full rounded-md border px-3 py-2"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Email *</label>
        <input
          type="email"
          className="w-full rounded-md border px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Phone</label>
        <input
          className="w-full rounded-md border px-3 py-2"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Role *</label>
        <select
          className="w-full rounded-md border px-3 py-2"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Tip: You can later restrict which roles branch admins can create.
        </p>
      </div>

      {isSuperAdmin ? (
        <div>
          <label className="block text-sm font-medium mb-1">Branch *</label>
          <select
            className="w-full rounded-md border px-3 py-2"
            value={branchId}
            onChange={(e) =>
              setBranchId(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">Select branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="text-sm text-gray-600">
          Branch: <span className="font-medium">{myBranchId ?? "Not set"}</span>
          <div className="text-xs text-gray-500 mt-1">
            As branch ADMIN, you can only create users for your own branch.
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-1">Password *</label>
        <input
          type="password"
          className="w-full rounded-md border px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Confirm Password *
        </label>
        <input
          type="password"
          className="w-full rounded-md border px-3 py-2"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-blue-600 text-white py-2.5 font-medium hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? "Creating..." : "Create User"}
      </button>
    </form>
  );
}
