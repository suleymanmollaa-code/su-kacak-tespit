import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-900">
      {/* Nav */}
      <nav className="border-b border-blue-100 px-6 py-4 bg-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center shadow-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6 8 4 12 4 16a8 8 0 0 0 16 0c0-4-2-8-8-14z"/>
                <path d="M9 16c0 1.7 1.3 3 3 3s3-1.3 3-3"/>
              </svg>
            </div>
            <div>
              <span className="font-bold text-blue-600 text-lg leading-none">Susayar</span>
              <span className="block text-[10px] text-zinc-400 leading-none tracking-wide">Akmadan bil.</span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-zinc-500">
            <a href="#nasil-calisir" className="hover:text-blue-600 transition-colors">Nasıl Çalışır?</a>
            <a href="#kimler-icin" className="hover:text-blue-600 transition-colors">Kimler İçin?</a>
            <a href="#ozellikler" className="hover:text-blue-600 transition-colors">Özellikler</a>
            <a href="#iletisim" className="hover:text-blue-600 transition-colors">İletişim</a>
          </div>
          <Button size="sm" className="bg-blue-500 hover:bg-blue-600 text-white shadow-sm">
            Ücretsiz Demo
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-20 text-center">
          <Badge className="mb-6 bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-100">
            İş Yerleri İçin IoT + Yapay Zeka
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight text-zinc-900">
            Vanana Tak,{" "}
            <span className="text-blue-500">Su Kaçağını</span>{" "}
            Unut
          </h1>
          <p className="text-xl text-zinc-500 max-w-2xl mx-auto mb-3 leading-relaxed">
            Fabrika, ofis, otel veya işletmenizin vanalarına 15 dakikada kurulan
            akıllı sensörler — su kaçağını faturanız gelmeden tespit eder,
            anında sizi uyarır.
          </p>
          <p className="text-blue-500 font-medium mb-10 text-lg italic">Akmadan bil.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-blue-500 hover:bg-blue-600 text-white px-8 shadow-md shadow-blue-200">
              Ücretsiz Demo İste
            </Button>
            <Button size="lg" variant="outline" className="border-blue-200 text-blue-600 hover:bg-blue-50 px-8">
              Nasıl Çalışır?
            </Button>
          </div>

          {/* Stats */}
          <div className="mt-20 grid grid-cols-1 sm:grid-cols-4 gap-8 border-t border-blue-100 pt-12">
            {[
              { value: "%94", label: "Kaçak Tespit Oranı" },
              { value: "< 30sn", label: "Alarm Süresi" },
              { value: "2 ay", label: "Ortalama Amorti Süresi" },
              { value: "7/24", label: "Kesintisiz İzleme" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-4xl font-bold text-blue-500 mb-2">{stat.value}</div>
                <div className="text-sm text-zinc-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="bg-blue-600 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge className="mb-4 bg-white/20 text-white border-white/30 hover:bg-white/20">
                Tanıdık mı geliyor?
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold mb-6 text-white">
                Su Faturası Neden Bu Kadar Yüksek?
              </h2>
              <ul className="space-y-4 text-blue-100">
                {[
                  "Vanadan damlayan küçük kaçak aylarca fark edilmiyor",
                  "Gece saatlerinde kimse yokken su akmaya devam ediyor",
                  "Duvar içindeki boru patlaması fark edilene kadar büyük hasar veriyor",
                  "Sigorta tazminatı için 'önceden haberdar olmak' şart — ama sistem yok",
                  "Teknik servis gelene kadar çok geç olmuş oluyor",
                ].map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="text-white/60 mt-1 shrink-0 font-bold">✕</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-xl">
              <div className="text-center space-y-6">
                <div>
                  <div className="text-5xl font-bold text-blue-500 mb-1">%20-30</div>
                  <div className="text-zinc-500 text-sm">iş yerlerinde su faturasının kaçaktan kaynaklandığı tahmin ediliyor</div>
                </div>
                <div className="h-px bg-blue-100" />
                <div>
                  <div className="text-5xl font-bold text-blue-500 mb-1">2 ay</div>
                  <div className="text-zinc-500 text-sm">fark edilmeyen kaçakların ortalama süresi</div>
                </div>
                <div className="h-px bg-blue-100" />
                <div>
                  <div className="text-5xl font-bold text-blue-500 mb-1">₺50K+</div>
                  <div className="text-zinc-500 text-sm">ortalama su hasarı onarım maliyeti</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="nasil-calisir" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-100">
              Kurulum
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-zinc-900">15 Dakikada Hazır</h2>
            <p className="text-zinc-500 max-w-xl mx-auto">
              Teknik bilgi gerekmez. Usta çağırmaya gerek yok.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Vanaya Tak",
                desc: "Mevcut vanalarınıza klips sistemiyle monte edin. Kablo yok, delme yok, usta yok. Pille aylarca çalışır.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22V12M12 12C12 12 7 9 7 5a5 5 0 0 1 10 0c0 4-5 7-5 7z"/>
                    <path d="M9 12H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-4"/>
                  </svg>
                ),
              },
              {
                step: "02",
                title: "WiFi'ye Bağla",
                desc: "QR kodu okutun, iş yeri WiFi'nize bağlayın. Sensör hemen veri göndermeye başlar. Dashboard'unuz anında aktif.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
                    <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
                    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
                    <circle cx="12" cy="20" r="1" fill="currentColor"/>
                  </svg>
                ),
              },
              {
                step: "03",
                title: "Alarm Al, Müdahale Et",
                desc: "Anormallik tespit edildiğinde SMS ve uygulama bildirimi alırsınız. Nerede olursanız olun, anında haberdar.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                ),
              },
            ].map((item) => (
              <Card key={item.step} className="border-blue-100 shadow-sm hover:shadow-md hover:border-blue-300 transition-all">
                <CardContent className="p-8">
                  <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-500 mb-5">
                    {item.icon}
                  </div>
                  <div className="text-xs font-mono text-blue-400 mb-2">{item.step}</div>
                  <h3 className="text-xl font-semibold mb-3 text-zinc-900">{item.title}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Who is it for */}
      <section id="kimler-icin" className="bg-blue-50 py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-100">
              Kimler İçin?
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-zinc-900">Her İş Yerine Uyar</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "Fabrika & Üretim Tesisi",
                desc: "Büyük su tüketimi, yüksek hasar riski. Tek kaçak üretimi durdurabilir. 7/24 izleme ile sıfır sürpriz.",
                roi: "Aylık ₺5K-50K tasarruf potansiyeli",
              },
              {
                title: "Otel & Restoran",
                desc: "Misafir odalarından mutfağa kadar tüm su noktaları. Su hasarı = itibar kaybı. Önce koruyun.",
                roi: "Sigorta priminde indirim + hasar önleme",
              },
              {
                title: "AVM & Ofis Binası",
                desc: "Ortak alan boruları, yüzlerce bağlantı noktası. Yönetici olarak tek panelden tüm binanızı görün.",
                roi: "Ortak gider %15-25 azalma",
              },
              {
                title: "Depo & Lojistik Merkezi",
                desc: "Gece boş kalan devasa alanlar. Su kaçağını gece olurken değil, olmadan önce yakalayın.",
                roi: "Stok ve ürün hasarı koruması",
              },
              {
                title: "Sera & Tarım Tesisi",
                desc: "Sulama sistemindeki kaçak hem su israfı hem ürün kaybı. AI sulama profilinizi öğrenir.",
                roi: "Su tüketiminde %20-30 azalma",
              },
              {
                title: "Konut Sitesi Yönetimi",
                desc: "Ortak boru hatları, havuz, çevre sulama. Aidat faturasını düşürün, sakinleri memnun edin.",
                roi: "Ortak gider optimizasyonu",
              },
            ].map((f) => (
              <Card key={f.title} className="bg-white border-blue-100 hover:border-blue-300 hover:shadow-md transition-all">
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-2 text-zinc-900">{f.title}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed mb-4">{f.desc}</p>
                  <div className="bg-blue-50 rounded-lg px-3 py-2">
                    <span className="text-xs font-medium text-blue-600">{f.roi}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="ozellikler" className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-100">
              Özellikler
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-zinc-900">Tek Sistem, Tam Kontrol</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "Gerçek Zamanlı Dashboard",
                desc: "Tüm sensörlerinizin anlık verilerini tek ekranda görün. Bilgisayar veya telefon, her yerden erişin.",
              },
              {
                title: "AI Anomali Tespiti",
                desc: "Yapay zeka iş yerinizin normal su profilini öğrenir. Mesai dışı akış, ani basınç değişimi otomatik algılanır.",
              },
              {
                title: "Anında SMS & Bildirim",
                desc: "Kaçak tespit edildiğinde seçtiğiniz kişilere SMS, e-posta ve uygulama bildirimi gider.",
              },
              {
                title: "Pil ile Uzun Çalışma",
                desc: "Kablo çekmeye gerek yok. Sensörler pil ile 6-12 ay çalışır. Bakım gerektirmez.",
              },
              {
                title: "Aylık Tüketim Raporu",
                desc: "Su kullanımını tarihe göre karşılaştırın. Anormal tüketim dönemlerini kolayca görün.",
              },
              {
                title: "Çoklu Kullanıcı",
                desc: "Yetkili ekip üyelerinizi sisteme ekleyin. Site müdürü, teknik sorumlu, işletme sahibi ayrı ayrı erişsin.",
              },
            ].map((f) => (
              <Card key={f.title} className="border-blue-100 hover:border-blue-300 hover:shadow-md transition-all">
                <CardContent className="p-6">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mb-4" />
                  <h3 className="font-semibold mb-2 text-zinc-900">{f.title}</h3>
                  <p className="text-zinc-500 text-sm leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ROI */}
      <section className="bg-blue-600 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ne Kadar Tasarruf Edersiniz?</h2>
          <p className="text-blue-100 mb-8 text-lg">
            Orta ölçekli bir fabrika için örnek hesap:
          </p>
          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            {[
              { label: "Aylık su faturası", value: "₺15.000" },
              { label: "Tahmini kaçak payı (%20)", value: "₺3.000" },
              { label: "Yıllık tasarruf", value: "₺36.000" },
            ].map((item) => (
              <div key={item.label} className="bg-white/10 rounded-xl p-5">
                <div className="text-2xl font-bold text-white mb-1">{item.value}</div>
                <div className="text-blue-200 text-sm">{item.label}</div>
              </div>
            ))}
          </div>
          <p className="text-blue-200 text-sm">
            Susayar kurulum maliyeti: ~₺5.000 → <span className="text-white font-semibold">2 aydan kısa sürede amorti</span>
          </p>
        </div>
      </section>

      {/* CTA */}
      <section id="iletisim" className="py-24 bg-white">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <div className="bg-blue-50 rounded-3xl p-12 border border-blue-100">
            <Badge className="mb-4 bg-blue-100 text-blue-600 border-blue-200 hover:bg-blue-100">
              Sınırlı Erken Erişim
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-zinc-900">
              İlk 50 İş Yerine Özel Fiyat
            </h2>
            <p className="text-zinc-500 mb-10 leading-relaxed">
              Ürünü geliştiriyoruz. İlk 50 iş yeri için kurulum ücretsiz,
              aylık abonelikte %50 indirim. Yerinizi ayırtın.
            </p>
            <form className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-4">
              <input
                type="email"
                placeholder="İş e-postanız"
                className="flex-1 bg-white border border-blue-200 rounded-lg px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:border-blue-500 shadow-sm"
              />
              <Button className="bg-blue-500 hover:bg-blue-600 text-white whitespace-nowrap shadow-md shadow-blue-200">
                Yerim Ayır
              </Button>
            </form>
            <p className="text-xs text-zinc-400">Spam yok. İstediğiniz zaman iptal edin.</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-blue-100 py-8 px-6 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-400">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2C6 8 4 12 4 16a8 8 0 0 0 16 0c0-4-2-8-8-14z"/>
                <path d="M9 16c0 1.7 1.3 3 3 3s3-1.3 3-3"/>
              </svg>
            </div>
            <div>
              <span className="font-semibold text-blue-600">Susayar</span>
              <span className="text-zinc-300 mx-1">·</span>
              <span className="italic text-zinc-400">Akmadan bil.</span>
            </div>
          </div>
          <span>© 2025 Susayar. Tüm hakları saklıdır.</span>
        </div>
      </footer>
    </main>
  );
}
