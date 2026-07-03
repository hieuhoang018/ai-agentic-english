import { UserButton } from "@clerk/nextjs";

export default function SettingsPage() {
  return (
    <div className="rounded-lg border border-outline-variant bg-white p-8">
      <h1 className="text-3xl font-bold text-on-surface">Cài đặt</h1>
      <p className="mt-3 text-on-surface-variant">Quản lý thông báo, thời gian học mỗi ngày và tùy chọn tài khoản.</p>
      <UserButton />
    </div>
  )
}
