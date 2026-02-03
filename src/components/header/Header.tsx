import Image from "next/image";
import LogoutButton from "./LogoutButton";
import UserMenu from "./UserMenu";

type HeaderUser = {
  fullName: string;
  email: string;
  roles: string[];
};

export default function Header({ user }: { user: HeaderUser }) {
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
      <div className="border-b bg-blue-900">
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
            <span className="text-2xl font-bold text-white">
              Sri Mruthyunjaya Nursing Home
            </span>
          </div>

          {/* User icon + name */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-medium text-white">
                {user.roles.join(", ")}
              </div>
              <div className="text-sm font-medium text-white">
                {user.fullName}
              </div>
              <div className="text-xs text-white">{user.email}</div>
            </div>

            <div className="flex items-center gap-2">
              <UserMenu />
              {/* Logout */}
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
