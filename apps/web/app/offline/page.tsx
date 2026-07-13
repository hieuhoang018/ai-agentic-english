export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center dark:bg-inverse-surface">
      <div className="max-w-[28rem]">
        <span className="material-symbols-outlined text-6xl text-outline">wifi_off</span>
        <h1 className="mt-4 text-2xl font-bold text-on-surface dark:text-inverse-on-surface">Bạn đang ngoại tuyến</h1>
        <p className="mt-2 text-on-surface-variant dark:text-surface-dim">
          Không thể kết nối mạng lúc này. Một số nội dung đã xem gần đây vẫn có thể truy cập được
          — hãy thử quay lại trang trước, hoặc kết nối mạng và tải lại trang.
        </p>
      </div>
    </div>
  );
}
