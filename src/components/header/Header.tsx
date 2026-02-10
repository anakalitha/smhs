// src/components/header/Header.tsx
import Image from "next/image";
import UserMenu from "./UserMenu";

type HeaderUser = {
  fullName: string;
  email: string;
  roles: string[];
  image?: string | null; // e.g. "user_imageA.webp"
};

export default function Header({ user }: { user: HeaderUser }) {
  return (
    <header className="w-full">
      {/* Top blue bar */}
      <div className="bg-blue-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-2 flex items-center justify-between text-sm">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-2">
              ✉️ <span>smnh@gmail.com</span>
            </span>
            <span className="flex items-center gap-2">
              📞 <span>+91 8892705071</span>
            </span>
          </div>

          <div className="flex items-center gap-4 opacity-80">
            <span aria-hidden>✖</span>
            <span aria-hidden>f</span>
            <span aria-hidden>◎</span>
            <span aria-hidden>in</span>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="border-b bg-white relative z-50">
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
            <span className="text-2xl font-bold text-black">
              Sri Mruthyunjaya Nursing Home
            </span>
          </div>

          {/* User profile block */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right leading-tight">
              <div className="text-sm font-semibold text-black">
                {user.fullName}
              </div>
              <div className="text-xs text-gray-600">
                {user.roles.join(", ")}
              </div>
              <div className="text-xs text-gray-600">{user.email}</div>
            </div>

            <UserMenu user={user} />
          </div>
        </div>
      </div>
    </header>
  );
}
