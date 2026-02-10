// src/components/header/UserMenu.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import LogoutButton from "./LogoutButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type HeaderUser = {
  fullName: string;
  email: string;
  roles: string[];
  image?: string | null;
};

function UserAvatar({ image, name }: { image?: string | null; name: string }) {
  if (image) {
    return (
      <Image
        src={`/images/users/${image}`}
        alt={name}
        width={36}
        height={36}
        className="rounded-full object-cover border"
      />
    );
  }

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="h-9 w-9 rounded-full border bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold">
      {initials}
    </div>
  );
}

export default function UserMenu({ user }: { user: HeaderUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full hover:bg-gray-100 p-1"
        >
          <UserAvatar image={user.image} name={user.fullName} />
          <svg
            className="h-4 w-4 text-gray-500"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="min-w-[220px] z-[9999] bg-white border shadow-xl"
      >
        <div className="px-3 py-2">
          <div className="text-sm font-semibold">{user.fullName}</div>
          <div className="text-xs text-gray-600">{user.email}</div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/attendance">Attendance</Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/profile">Edit Profile</Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild>
          <Link href="/change-password">Change Password</Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <div className="px-1 py-1">
          <LogoutButton variant="text" />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
