import Image from "next/image";
import Link from "next/link";
import LogoutButton from "./LogoutButton";

type HeaderUser = {
  fullName: string;
  email: string;
  roles: string[];
};

function menuForRoles(roles: string[]) {
  // You can adjust these anytime
  const isAdmin = roles.includes("ADMIN") || roles.includes("SUPER_ADMIN");
  const isDoctor = roles.includes("DOCTOR");
  const isDataEntry = roles.includes("DATA_ENTRY");
  const isReception = roles.includes("RECEPTION");
  const isScan = roles.includes("SCAN_IN_CHARGE");

  // Common links (placeholders for now)
  const items: { label: string; href: string }[] = [
    { label: "Home", href: "/" },
  ];

  if (isAdmin) items.push({ label: "Users", href: "/admin/users/new" });
  if (isDoctor) items.push({ label: "Doctor", href: "/doctor" });
  if (isDataEntry) items.push({ label: "Data Entry", href: "/data-entry" });
  if (isReception) items.push({ label: "Reception", href: "/reception" });
  if (isScan) items.push({ label: "Scan", href: "/scan" });

  return items;
}

export default function Header({ user }: { user: HeaderUser }) {
  const items = menuForRoles(user.roles);

  return (
    <header className="w-full">
      {/* Top blue bar */}
      <div className="bg-white text-gray-900">
        <div className="mx-auto max-w-7xl px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              ✉️ <span>smnh@gmail.com</span>
            </span>
            <span className="flex items-center gap-2">
              📞 <span>+91 8892705071</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span aria-hidden>✖</span>
            <span aria-hidden>f</span>
            <span aria-hidden>◎</span>
            <span aria-hidden>in</span>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="border-b bg-blue-600">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <Image
              src="/smnh-logo.png"
              alt="SMNH"
              width={40}
              height={40}
              priority
            />
            <span className="text-2xl font-bold text-white">SMNH</span>
          </div>

          {/* Menu */}
          <nav className="hidden md:flex items-center gap-7 text-[15px]">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="text-white hover:text-blue-700"
              >
                {it.label}
              </Link>
            ))}
            <Link href="/contact" className="text-white hover:text-blue-700">
              Contact
            </Link>
          </nav>

          {/* User icon + name */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-medium text-white">
                {user.fullName}
              </div>
              <div className="text-xs text-white">{user.email}</div>
            </div>

            <div className="flex items-center gap-2">
              {/* Profile icon */}
              <div className="h-10 w-10 rounded-full bg-gray-100 border flex items-center justify-center">
                <span className="text-gray-500">👤</span>
              </div>

              {/* Logout */}
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
