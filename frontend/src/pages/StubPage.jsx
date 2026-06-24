// Shared placeholder for pages not yet implemented.

export default function StubPage({ title, subtitle }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <h2 className="text-xl font-semibold text-gray-200">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}
