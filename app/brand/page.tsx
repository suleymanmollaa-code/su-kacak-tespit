export default function BrandPage() {
  return (
    <main className="min-h-screen bg-zinc-100 p-12">
      <h1 className="text-2xl font-bold text-zinc-700 mb-10">Susayar — Marka Kılavuzu</h1>

      <div className="space-y-10">
        {/* Device Mockup */}
        <div className="bg-white rounded-2xl p-10 shadow-sm border border-zinc-200">
          <p className="text-xs text-zinc-400 uppercase tracking-widest mb-6">Cihaz Montaj Görünümü</p>
          <img src="/brand/device-mockup.svg" alt="Susayar Cihaz" className="w-full max-w-2xl" />
        </div>
        {/* TPE Logo */}
        <div className="bg-white rounded-2xl p-10 shadow-sm border border-zinc-200">
          <p className="text-xs text-zinc-400 uppercase tracking-widest mb-6">TPE Başvuru Logosu</p>
          <img src="/brand/susayar-tpe-logo.svg" alt="Su Sayar TPE Logo" className="h-24" />
        </div>

        {/* Logo - Light */}
        <div className="bg-white rounded-2xl p-10 shadow-sm border border-zinc-200">
          <p className="text-xs text-zinc-400 uppercase tracking-widest mb-6">Logo — Beyaz Zemin</p>
          <img src="/brand/susayar-logo.svg" alt="Susayar Logo" className="h-20" />
        </div>

        {/* Logo - Dark */}
        <div className="bg-zinc-900 rounded-2xl p-10 shadow-sm">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-6">Logo — Koyu Zemin</p>
          <img src="/brand/susayar-logo-dark.svg" alt="Susayar Logo Dark" className="h-20" />
        </div>

        {/* Icon only */}
        <div className="bg-white rounded-2xl p-10 shadow-sm border border-zinc-200">
          <p className="text-xs text-zinc-400 uppercase tracking-widest mb-6">İkon — Tek Başına</p>
          <img src="/brand/susayar-icon.svg" alt="Susayar Icon" className="h-20" />
        </div>

        {/* Colors */}
        <div className="bg-white rounded-2xl p-10 shadow-sm border border-zinc-200">
          <p className="text-xs text-zinc-400 uppercase tracking-widest mb-6">Renk Paleti</p>
          <div className="flex gap-4">
            {[
              { color: "bg-blue-700", hex: "#1E40AF", name: "Koyu Mavi" },
              { color: "bg-blue-500", hex: "#3B82F6", name: "Ana Mavi" },
              { color: "bg-blue-400", hex: "#60A5FA", name: "Açık Mavi" },
              { color: "bg-white border border-zinc-200", hex: "#FFFFFF", name: "Beyaz" },
              { color: "bg-zinc-900", hex: "#0F172A", name: "Siyah" },
            ].map((c) => (
              <div key={c.hex} className="text-center">
                <div className={`w-16 h-16 rounded-xl ${c.color} mb-2`} />
                <p className="text-xs font-mono text-zinc-500">{c.hex}</p>
                <p className="text-xs text-zinc-400">{c.name}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Typography */}
        <div className="bg-white rounded-2xl p-10 shadow-sm border border-zinc-200">
          <p className="text-xs text-zinc-400 uppercase tracking-widest mb-6">Tipografi</p>
          <p className="text-5xl font-bold text-blue-700 mb-2">Susayar</p>
          <p className="text-lg tracking-widest text-zinc-400 uppercase">Akmadan bil.</p>
          <p className="text-sm text-zinc-300 mt-4">Font: Helvetica Neue / Arial — Bold 700</p>
        </div>

        {/* TÜRKPATENT Notu */}
        <div className="bg-blue-50 rounded-2xl p-10 border border-blue-100">
          <p className="text-xs text-zinc-400 uppercase tracking-widest mb-4">TÜRKPATENT Başvurusu İçin</p>
          <ul className="space-y-2 text-sm text-zinc-600">
            <li>• SVG dosyalarını PNG'ye çevirin (min. 300dpi)</li>
            <li>• Sınıf 9 (elektronik cihaz) + Sınıf 42 (yazılım hizmeti)</li>
            <li>• Başvuru: turkpatent.gov.tr</li>
            <li>• Logo + kelime markası ayrı ayrı tescil edilebilir</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
