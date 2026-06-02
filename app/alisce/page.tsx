'use client'

import { Cormorant_Garamond, Jost } from 'next/font/google'

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-cormorant',
  display: 'swap',
})

const jost = Jost({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-jost',
  display: 'swap',
})

const G = {
  bg: '#FFFCF8',
  bgAlt: '#F3EEE6',
  bgDark: '#1C1A16',
  bgCard: '#2C2820',
  gold: '#B8933A',
  dark: '#1C1A16',
  textSec: '#6B6354',
  textMuted: '#9C9184',
  cream: '#EBE4D8',
  border: 'rgba(184,147,58,0.22)',
  borderDark: 'rgba(184,147,58,0.15)',
}

const IMGS = {
  hero: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1400&q=85&fit=crop',
  living: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=900&q=85&fit=crop',
  bedroom: 'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=900&q=85&fit=crop',
  kitchen: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=85&fit=crop',
  couple: 'https://images.unsplash.com/photo-1529634806980-85c3dd6d34ac?w=900&q=85&fit=crop',
  showroom: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=900&q=85&fit=crop',
  decor: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=900&q=85&fit=crop',
  event: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=900&q=85&fit=crop',
  competition: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=900&q=85&fit=crop',
}

export default function AliscePage() {
  return (
    <div
      className={`${cormorant.variable} ${jost.variable}`}
      style={{ background: G.bg, color: G.dark, fontFamily: "'Jost', sans-serif", minHeight: '100vh' }}
    >
      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, background: G.bg, borderBottom: `1px solid ${G.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72 }}>
          <a href="#" style={{ textDecoration: 'none', lineHeight: 1.05 }}>
            <div style={{ fontFamily: "'Jost', sans-serif", fontWeight: 800, fontSize: '1.2rem', letterSpacing: '0.06em', color: G.dark }}>ALİSCE</div>
            <div style={{ fontFamily: "'Jost', sans-serif", fontWeight: 800, fontSize: '1.2rem', letterSpacing: '0.06em', color: G.gold }}>
              LİFE<sup style={{ fontSize: '0.5rem', verticalAlign: 'super' }}>®</sup>
            </div>
          </a>
          <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
            {[
              { label: 'Prova Evleri', href: '#prova-evleri' },
              { label: 'Etkinlikler', href: '#etkinlikler' },
              { label: 'Markalar', href: '#markalar' },
              { label: 'Hakkımızda', href: '#hakkimizda' },
              { label: 'İş Ortaklığı', href: '#is-ortakligi' },
            ].map(link => (
              <a key={link.href} href={link.href} style={{ fontFamily: "'Jost', sans-serif", fontSize: '0.82rem', fontWeight: 500, color: G.textSec, textDecoration: 'none', letterSpacing: '0.03em' }}>
                {link.label}
              </a>
            ))}
            <a href="#randevu" style={{ background: G.dark, color: G.bg, padding: '0.55rem 1.4rem', fontFamily: "'Jost', sans-serif", fontSize: '0.78rem', fontWeight: 600, textDecoration: 'none', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
              Randevu Al
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ minHeight: '92vh', display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '5rem 4rem 5rem 5rem', background: `linear-gradient(160deg, #FFFCF8 0%, #F3EEE6 100%)` }}>
          <p style={{ color: G.gold, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase' as const, marginBottom: '1.5rem' }}>
            Yeni Nesil Deneyim Platformu
          </p>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: 'clamp(2.6rem, 5vw, 4.2rem)', lineHeight: 1.12, color: G.dark, marginBottom: '1.75rem' }}>
            Yaşamı satın almadan önce<br />
            <em style={{ color: G.gold }}>deneyimle</em>
          </h1>
          <p style={{ color: G.textSec, fontSize: '1.05rem', lineHeight: 1.85, marginBottom: '3rem', maxWidth: 460 }}>
            Alisce Life, markaları ve yaşam alanlarını satın almadan önce gerçek ortamında deneyimlemeni sağlar.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' as const }}>
            <a href="#prova-evleri" style={btn('dark')}>Prova Evini Keşfet</a>
            <a href="#etkinlikler" style={btn('outline')}>Etkinlikleri Gör</a>
            <a href="#is-ortakligi" style={btn('gold')}>İş Ortağı Ol</a>
          </div>
          <div style={{ display: 'flex', gap: '3rem', marginTop: '4rem', paddingTop: '3rem', borderTop: `1px solid ${G.border}` }}>
            {[['3', 'Adımda Çalışır'], ['360°', 'Deneyim'], ['100+', 'Marka']].map(([num, label]) => (
              <div key={label}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '2rem', fontWeight: 600, color: G.gold }}>{num}</div>
                <div style={{ fontSize: '0.72rem', color: G.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <img src={IMGS.hero} alt="Alisce Life yaşam alanı" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(255,252,248,0.3) 0%, transparent 40%)' }} />
          <div style={{ position: 'absolute', bottom: '2.5rem', left: '2rem', right: '2rem', background: 'rgba(28,26,22,0.82)', backdropFilter: 'blur(8px)', padding: '1.5rem 2rem', border: `1px solid ${G.borderDark}` }}>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '1.1rem', color: '#FFFCF8', lineHeight: 1.5 }}>
              "Alisce Life bir mağaza değil; bir yaşam deneyim sistemidir."
            </p>
          </div>
        </div>
      </section>

      {/* ── NASIL ÇALIŞIR ── */}
      <section id="nasil-calisir" style={section(G.bg)}>
        <div style={container}>
          <Header tag="Sistem" title={<>Deneyimle <em style={{ color: G.gold }}>→</em> Karar ver <em style={{ color: G.gold }}>→</em> Hayata geçir</>} sub="Sistem basit, süreç nettir. Tüm yapı 3 adımda çalışır." />
          <div style={grid('repeat(3,1fr)', '2rem')}>
            {[
              { num: '01', icon: '🏡', title: 'Prova Evini Seç', desc: 'Bulunduğun şehirdeki prova evini seç. Farklı yaşam konseptleri arasından mobilya ve ürünleri gerçek ev düzeninde gör.', note: 'Ürünü katalogda değil, gerçek yaşam alanında gör' },
              { num: '02', icon: '📅', title: 'Deneyim Gününe Katıl', desc: 'Belirlenen gün ve saatte prova evine gel. Çeyiz günleri, marka deneyim günleri ve evlilik hazırlık etkinlikleri seni bekliyor.', note: 'Ürünleri birebir dene ve karşılaştır' },
              { num: '03', icon: '✅', title: 'Karar Ver, Bağlantı Kur', desc: 'Beğendiklerini seç, markalarla doğrudan iletişime geç ve özel kampanyalardan yararlan.', note: 'Doğru karar + doğrudan satın alma süreci' },
            ].map(s => (
              <div key={s.num} style={{ padding: '2.5rem', border: `1px solid ${G.border}`, background: G.bg }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '3.5rem', fontWeight: 300, color: G.gold, opacity: 0.3, lineHeight: 1, marginBottom: '0.5rem' }}>{s.num}</div>
                <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}>{s.icon}</div>
                <h3 style={cardTitle}>{s.title}</h3>
                <p style={cardDesc}>{s.desc}</p>
                <p style={{ color: G.gold, fontSize: '0.78rem', fontWeight: 600, marginTop: '1rem' }}>— {s.note}</p>
              </div>
            ))}
          </div>

          {/* Görsel bant */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginTop: '3rem', height: 220, overflow: 'hidden' }}>
            {[IMGS.living, IMGS.bedroom, IMGS.kitchen].map((src, i) => (
              <div key={i} style={{ overflow: 'hidden', position: 'relative' }}>
                <img src={src} alt="Yaşam alanı" style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.4s' }} />
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(184,147,58,0.08)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROVA EVLERİ ── */}
      <section id="prova-evleri" style={section(G.bgAlt)}>
        <div style={container}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center', marginBottom: '4rem' }}>
            <div>
              <p style={tag}>Prova Evleri</p>
              <h2 style={h2}>Gerçek yaşam alanlarını deneyimle</h2>
              <p style={{ color: G.textSec, fontSize: '0.95rem', lineHeight: 1.85, marginBottom: '2rem' }}>
                Mobilya, beyaz eşya ve çeyiz ürünlerini ev ortamında gör, dene ve karar ver. Her şehirde farklı konseptler, her konseptte gerçek ürünler.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2.5rem' }}>
                {[
                  { icon: '🏙️', title: 'Şehir Seç', desc: 'Bulunduğun şehirdeki prova evlerini keşfet.' },
                  { icon: '🛋️', title: 'Ev Konsepti Seç', desc: 'Modern, klasik veya minimalist — istediğin stili dene.' },
                  { icon: '📅', title: 'Randevu Al', desc: 'Uygun gün ve saati seç, prova evine gel.' },
                ].map(item => (
                  <div key={item.title} style={{ display: 'flex', gap: '1rem', padding: '1.25rem', background: G.bg, border: `1px solid ${G.border}` }}>
                    <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.1rem', fontWeight: 600, color: G.dark }}>{item.title}</div>
                      <div style={{ color: G.textSec, fontSize: '0.85rem', marginTop: '0.2rem' }}>{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <a href="#randevu" style={btn('dark')}>Ziyaret Planla</a>
            </div>
            <div style={{ position: 'relative' }}>
              <img src={IMGS.showroom} alt="Prova evi iç görünüm" style={{ width: '100%', height: 480, objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: '-1.5rem', right: '-1.5rem', background: G.bgDark, padding: '1.5rem 2rem', border: `1px solid ${G.borderDark}` }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '2rem', fontWeight: 600, color: G.gold }}>10+</div>
                <div style={{ color: G.textMuted, fontSize: '0.75rem', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>Şehirde Prova Evi</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ETKİNLİKLER ── */}
      <section id="etkinlikler" style={section(G.bg)}>
        <div style={container}>
          <Header tag="Etkinlikler" title="Deneyim günlerini kaçırma" sub="Her hafta farklı markalar ve çeyiz konseptleri ile hazırlanan özel deneyim günleri." />
          <div style={grid('repeat(3,1fr)', '1.5rem')}>
            {[
              { icon: '💍', title: 'Çeyiz Günleri', desc: 'Evlilik hazırlığındaki çiftler için tüm markaların bir arada sunulduğu özel günler.', img: IMGS.couple },
              { icon: '🛋️', title: 'Marka Deneyim Günleri', desc: 'Seçkin markaların ürünlerini gerçek ortamda keşfet, uzmanlarıyla tanış.', img: IMGS.showroom },
              { icon: '🏡', title: 'Evlilik Hazırlık Etkinlikleri', desc: 'Yeni hayatınızı kurarken ihtiyacınız olan her şeyi tek çatı altında deneyimleyin.', img: IMGS.event },
            ].map(ev => (
              <div key={ev.title} style={{ border: `1px solid ${G.border}`, overflow: 'hidden' }}>
                <div style={{ height: 200, overflow: 'hidden' }}>
                  <img src={ev.img} alt={ev.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ padding: '1.75rem', background: G.bg }}>
                  <div style={{ fontSize: '1.6rem', marginBottom: '0.75rem' }}>{ev.icon}</div>
                  <h3 style={cardTitle}>{ev.title}</h3>
                  <p style={cardDesc}>{ev.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: '3rem' }}>
            <a href="#randevu" style={btn('gold')}>Etkinliğe Katıl</a>
          </div>
        </div>
      </section>

      {/* ── ÇEYİZ GÜNLERİ ── */}
      <section style={{ background: G.bgDark, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 600 }}>
          <div style={{ position: 'relative', overflow: 'hidden' }}>
            <img src={IMGS.couple} alt="Çeyiz hazırlığı" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 60%, #1C1A16 100%)' }} />
          </div>
          <div style={{ padding: '6rem 5rem 6rem 4rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ color: G.gold, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase' as const, marginBottom: '1rem' }}>Çeyiz Günleri</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: 600, color: '#FFFCF8', lineHeight: 1.2, marginBottom: '1.5rem' }}>
              Yeni hayatına hazırlanırken evini önce prova et
            </h2>
            <p style={{ color: G.textMuted, fontSize: '0.92rem', lineHeight: 1.85, marginBottom: '2rem' }}>
              Çeyiz hazırlığında olan çiftler için tüm markaların bir arada olduğu özel deneyim günleri.
            </p>
            {['Mobilya kombinleri', 'Beyaz eşya setleri', 'Çeyiz ve tekstil ürünleri'].map(item => (
              <div key={item} style={{ display: 'flex', gap: '0.75rem', color: G.cream, fontSize: '0.9rem', marginBottom: '0.6rem' }}>
                <span style={{ color: G.gold }}>✦</span> {item}
              </div>
            ))}
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.2rem', fontStyle: 'italic', color: G.gold, margin: '2rem 0' }}>
              "Satın almadan önce evini kur"
            </p>
            <a href="#randevu" style={btn('gold')}>Çeyiz Günü Randevusu Al</a>
          </div>
        </div>
      </section>

      {/* ── MARKALAR ── */}
      <section id="markalar" style={section(G.bgAlt)}>
        <div style={container}>
          <Header tag="Markalar" title="Markaları evin içinde gör" sub="Ürünleri katalogda değil, gerçek yaşam alanında deneyimle." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
            {[
              { icon: '🛋️', title: 'Mobilya Markaları', desc: 'Koltuk, yatak odası, yemek odası — gerçek yaşam düzeninde gormeden karar verme.', img: IMGS.living },
              { icon: '🍽️', title: 'Beyaz Eşya Markaları', desc: 'Mutfak ve ev aletlerini gerçek kullanım senaryosunda test et, uzman tavsiyesi al.', img: IMGS.kitchen },
              { icon: '🧵', title: 'Çeyiz Markaları', desc: 'Tekstil, dekorasyon ve çeyiz ürünlerini bir arada gör, en doğru kombini bul.', img: IMGS.decor },
            ].map(cat => (
              <div key={cat.title} style={{ border: `1px solid ${G.border}`, overflow: 'hidden', background: G.bg }}>
                <div style={{ height: 180, overflow: 'hidden' }}>
                  <img src={cat.img} alt={cat.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div style={{ padding: '1.75rem' }}>
                  <div style={{ fontSize: '1.6rem', marginBottom: '0.75rem' }}>{cat.icon}</div>
                  <h3 style={cardTitle}>{cat.title}</h3>
                  <p style={cardDesc}>{cat.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div style={{ textAlign: 'center' }}>
            <a href="#is-ortakligi" style={btn('dark')}>Markaları Keşfet</a>
          </div>
        </div>
      </section>

      {/* ── HAKKIMIZDA ── */}
      <section id="hakkimizda" style={section(G.bg)}>
        <div style={container}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5rem', alignItems: 'center' }}>
            <div>
              <p style={tag}>Hakkımızda</p>
              <h2 style={h2}>Deneyim odaklı yeni nesil bir <em style={{ color: G.gold }}>yaşam platformu</em></h2>
              <p style={{ color: G.textSec, fontSize: '0.95rem', lineHeight: 1.85, marginBottom: '1.25rem' }}>
                Alisce Life, yaşamı satın almadan önce deneyimleme fikriyle kurulmuş yeni nesil bir deneyim platformudur.
              </p>
              <p style={{ color: G.textSec, fontSize: '0.95rem', lineHeight: 1.85, marginBottom: '1.25rem' }}>
                Geleneksel alışveriş modelinin ötesine geçerek, kullanıcıların evlerini gerçek ortamda görerek karar vermesini sağlar.
              </p>
              <p style={{ color: G.textSec, fontSize: '0.95rem', lineHeight: 1.85, marginBottom: '2.5rem' }}>
                Mobilya, beyaz eşya, çeyiz ve dekorasyon markalarını dijital kataloglarda değil, <strong style={{ color: G.dark }}>gerçek yaşam senaryoları içinde</strong> bir araya getirir.
              </p>
              <blockquote style={{ borderLeft: `3px solid ${G.gold}`, paddingLeft: '1.5rem', fontFamily: "'Cormorant Garamond', serif", fontSize: '1.2rem', fontStyle: 'italic', color: G.dark, lineHeight: 1.6 }}>
                "Alisce Life bir mağaza değil; bir yaşam deneyim sistemidir."
              </blockquote>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {[
                { icon: '🎯', title: 'Amacımız', items: ['Satın alma kararını deneyimle vermek', 'Markaları gerçek kullanıcıyla buluşturmak', 'Yaşam alanı seçimini daha güvenli yapmak'] },
                { icon: '🏡', title: 'Yaklaşımımız', items: ['Gerçek prova evleri', 'Yaşam senaryosu odaklı sergileme', 'Marka-kullanıcı buluşma ortamı'] },
                { icon: '🤝', title: 'Değerimiz', items: ['Kullanıcı için doğru karar', 'Marka için gerçek temas', 'Emlak için değer üretimi'] },
              ].map(block => (
                <div key={block.title} style={{ padding: '1.75rem', border: `1px solid ${G.border}`, background: G.bgAlt }}>
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.3rem' }}>{block.icon}</span>
                    <h4 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.2rem', fontWeight: 600, color: G.dark }}>{block.title}</h4>
                  </div>
                  {block.items.map(item => (
                    <div key={item} style={{ display: 'flex', gap: '0.5rem', color: G.textSec, fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                      <span style={{ color: G.gold, flexShrink: 0 }}>—</span> {item}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── İŞ ORTAKLIĞI ── */}
      <section id="is-ortakligi" style={section(G.bgAlt)}>
        <div style={container}>
          <Header tag="İş Ortaklığı" title="Alisce Life ekosistemine katıl" sub="Markanı, ürününü ve hizmetini gerçek kullanıcı deneyimiyle buluştur." />

          <div style={grid('repeat(2,1fr)', '2rem')}>
            <div style={{ background: G.bg, padding: '2.5rem', border: `1px solid ${G.border}` }}>
              <img src={IMGS.showroom} alt="Markalar için" style={{ width: '100%', height: 200, objectFit: 'cover', marginBottom: '1.75rem' }} />
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🌍</div>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.6rem', fontWeight: 600, color: G.dark, marginBottom: '0.75rem' }}>Markalara Bölgesel Yayılma</h3>
              <p style={{ color: G.textSec, fontSize: '0.88rem', lineHeight: 1.75, marginBottom: '1.5rem' }}>
                Şehir şehir fiziksel yatırım yapmadan büyü. Mağaza açmadan bölgesel görünürlük ve satış imkânı.
              </p>
              {['Fiziksel mağaza olmadan görünürlük', 'Bölgesel satış erişimi', 'Yeni pazarlara düşük maliyetle giriş', 'Kampanya testleri şehir bazlı'].map(item => (
                <div key={item} style={{ display: 'flex', gap: '0.6rem', color: G.textSec, fontSize: '0.85rem', padding: '0.5rem 0', borderBottom: `1px solid ${G.border}` }}>
                  <span style={{ color: G.gold }}>✦</span> {item}
                </div>
              ))}
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '1rem', color: G.gold, marginTop: '1.5rem' }}>
                "Yüksek yatırım olmadan şehir şehir büyüyen satış ağı"
              </p>
            </div>

            <div style={{ background: G.bg, padding: '2.5rem', border: `1px solid ${G.border}` }}>
              <img src={IMGS.competition} alt="Emlak üreticileri için" style={{ width: '100%', height: 200, objectFit: 'cover', marginBottom: '1.75rem' }} />
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🏗️</div>
              <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.6rem', fontWeight: 600, color: G.dark, marginBottom: '0.75rem' }}>Emlak Üreticilerine</h3>
              <p style={{ color: G.textSec, fontSize: '0.88rem', lineHeight: 1.75, marginBottom: '1.5rem' }}>
                Boş bekleyen emlak alanları gelir üreten deneyim alanına dönüşür. Satışı bekleyen projeler markalara kiralanır.
              </p>
              {['Boş alanların gelir üretmesi', 'Proje maliyetleri erken dönemde karşılanır', 'Satış süreci hızlanır', 'Satış öncesi talep oluşumu'].map(item => (
                <div key={item} style={{ display: 'flex', gap: '0.6rem', color: G.textSec, fontSize: '0.85rem', padding: '0.5rem 0', borderBottom: `1px solid ${G.border}` }}>
                  <span style={{ color: G.gold }}>✦</span> {item}
                </div>
              ))}
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '1rem', color: G.gold, marginTop: '1.5rem' }}>
                "Bekleyen projeyi gelir kaynağına çevir"
              </p>
            </div>
          </div>

          {/* Ortak değer */}
          <div style={{ background: G.bgDark, padding: '3.5rem', textAlign: 'center', margin: '2rem 0' }}>
            <p style={{ color: G.textMuted, fontSize: '0.72rem', letterSpacing: '0.18em', textTransform: 'uppercase' as const, marginBottom: '1.25rem' }}>Sistemin Ortak Değeri</p>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1.1rem, 2.5vw, 1.7rem)', color: '#FFFCF8', lineHeight: 1.7 }}>
              "Alisce Life, üreticiyi kullanıcıyla; markayı ise şehirlerle buluşturan<br />
              <em style={{ color: G.gold }}>deneyim tabanlı büyüme sistemidir.</em>"
            </p>
          </div>

          {/* Başvuru formu */}
          <div style={{ background: G.bg, padding: '3rem', border: `1px solid ${G.border}` }}>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.9rem', fontWeight: 600, color: G.dark, marginBottom: '0.5rem' }}>İş Ortağı Başvurusu</h3>
            <p style={{ color: G.textSec, fontSize: '0.9rem', marginBottom: '2rem' }}>Ürününü sergile, gerçek müşteriyle buluş, satışını artır.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              {['Şirket Adı', 'Yetkili Kişi', 'E-posta', 'Telefon'].map(f => (
                <input key={f} placeholder={f} style={input} />
              ))}
            </div>
            <select style={{ ...input, width: '100%', marginTop: '1rem', color: G.textSec }}>
              <option value="">Ortaklık Türü Seçin</option>
              <option>Mobilya Markası</option>
              <option>Beyaz Eşya Markası</option>
              <option>Çeyiz / Tekstil Markası</option>
              <option>Emlak Üreticisi</option>
              <option>Diğer</option>
            </select>
            <textarea placeholder="Marka / Ürün hakkında kısa bilgi" rows={4} style={{ ...input, width: '100%', marginTop: '1rem', resize: 'none', boxSizing: 'border-box' as const }} />
            <button style={{ marginTop: '1rem', background: G.dark, color: G.bg, padding: '0.9rem 2.5rem', fontFamily: "'Jost', sans-serif", fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, border: 'none', cursor: 'pointer' }}>
              Başvuru Gönder
            </button>
          </div>
        </div>
      </section>

      {/* ── YARIŞMA MODELİ ── */}
      <section id="yarisma" style={{ padding: '7rem 2rem', background: G.bgDark }}>
        <div style={container}>
          <div style={{ textAlign: 'center', marginBottom: '4.5rem' }}>
            <p style={{ color: G.gold, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase' as const, marginBottom: '0.75rem' }}>Özel Proje</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 600, color: '#FFFCF8', marginBottom: '1rem' }}>
              Prova Ev & Yaşam Tasarım Ligi
            </h2>
            <p style={{ color: G.textMuted, fontSize: '0.95rem', maxWidth: 600, margin: '0 auto' }}>
              Katılımcılar sadece yarışmıyor — gerçek bir yaşam alanı kuruyor, bütçe yönetiyor, markalarla çalışıyor.
            </p>
          </div>

          {/* Geniş görsel */}
          <div style={{ position: 'relative', height: 340, overflow: 'hidden', marginBottom: '3rem' }}>
            <img src={IMGS.competition} alt="Prova Ev Yarışma Modeli" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(28,26,22,0.65)' }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ color: G.textMuted, fontSize: '0.72rem', letterSpacing: '0.18em', textTransform: 'uppercase' as const }}>Modelin Döngüsü</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
                {['Katıl', 'Tasarla', 'Deneyimle', 'Yayınlan', 'Oylan', 'Kazan'].map((s, i, arr) => (
                  <>
                    <span key={s} style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.4rem', color: '#FFFCF8' }}>{s}</span>
                    {i < arr.length - 1 && <span key={`a${i}`} style={{ color: G.gold }}>→</span>}
                  </>
                ))}
              </div>
            </div>
          </div>

          <div style={grid('repeat(3,1fr)', '1.5rem')}>
            {[
              { icon: '💰', title: 'Sanal Yaşam Bütçesi', desc: 'Her katılımcıya sabit sanal bütçe. En pahalı değil — en doğru yaşam alanı kazanır.' },
              { icon: '🧩', title: 'Görev Sistemi', desc: 'Kahve köşesi tasarla, küçük alanı maksimum kullan, misafir odası kur. Görev tamamla, puan kazan.' },
              { icon: '🛋️', title: 'Marka Entegrasyonu', desc: 'Markalar yarışmanın aktif oyuncusu. Ürünler görevlerde kullanılır — reklam değil, deneyim.' },
              { icon: '📺', title: 'TV + Dijital Yayın', desc: 'Haftalık TV bölümleri, günlük dijital içerikler, oylama sistemi, canlı görev takibi.' },
              { icon: '📊', title: 'Puanlama', desc: 'Bütçe yönetimi %30 · Fonksiyonellik %30 · Estetik %20 · Marka uyumu %20' },
              { icon: '🏆', title: 'Ödüller', desc: 'Tam yaşam paketi (mobilya + beyaz eşya + dekorasyon), marka özel ödülleri, kampanya kuponları.' },
            ].map(item => (
              <div key={item.title} style={{ background: G.bgCard, padding: '2rem', border: `1px solid ${G.borderDark}` }}>
                <div style={{ fontSize: '1.8rem', marginBottom: '0.75rem' }}>{item.icon}</div>
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.3rem', fontWeight: 600, color: '#FFFCF8', marginBottom: '0.5rem' }}>{item.title}</h3>
                <p style={{ color: G.textMuted, fontSize: '0.85rem', lineHeight: 1.75 }}>{item.desc}</p>
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(184,147,58,0.08)', border: `1px solid ${G.borderDark}`, padding: '2.5rem', textAlign: 'center', marginTop: '2rem' }}>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(1rem, 2vw, 1.4rem)', color: '#FFFCF8', lineHeight: 1.7, fontStyle: 'italic' }}>
              "Alisce Life Prova Ev Yarışma Modeli, kullanıcıların sanal bütçe ve görev sistemiyle gerçek yaşam alanı tasarladığı, TV ve dijital platformlarda yayınlanan hibrit deneyim yarışma ekosistemir."
            </p>
          </div>
        </div>
      </section>

      {/* ── YORUMLAR ── */}
      <section id="yorumlar" style={section(G.bgAlt)}>
        <div style={container}>
          <Header
            tag="Müşteri Yorumları"
            title={<>Deneyimleyenler <em style={{ color: G.gold }}>anlatıyor</em></>}
            sub="Prova evlerini ziyaret eden ve etkinliklere katılan kullanıcıların gerçek deneyimleri."
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1.5rem' }}>
            {[
              {
                name: 'Selin & Murat K.',
                role: 'Çeyiz Günleri Katılımcısı · İstanbul',
                text: 'Evlenmeden önce mobilyaları katalogdan seçmek çok zordu. Alisce Life sayesinde her şeyi gerçek evin içinde gördük. Koltuk takımından yatak odasına kadar her şeyi prova ettik, pişmanlık yaşamadık.',
                stars: 5,
                initial: 'S',
              },
              {
                name: 'Ayşe T.',
                role: 'Prova Evi Ziyaretçisi · Ankara',
                text: 'Yeni daireme aldığım kanepe yanlış renk olmuştu. Alisce Life\'e gidip aynı modeli farklı renklerle gördükten sonra doğru kararı verebildim. Bu sistem kesinlikle her alıcıya lazım.',
                stars: 5,
                initial: 'A',
              },
              {
                name: 'Kerem Y.',
                role: 'Marka Deneyim Günü · İzmir',
                text: 'Beyaz eşya seçerken sadece teknik özelliklere bakıyordum. Burada gerçek mutfak ortamında kullandım, fark inanılmazdı. Çok daha bilinçli bir karar verdim.',
                stars: 5,
                initial: 'K',
              },
              {
                name: 'Zeynep & Emre A.',
                role: 'Evlilik Hazırlık Etkinliği · Bursa',
                text: 'Birçok markayı tek günde, tek yerde gördük. Hem zaman hem para tasarrufu yaptık. Özellikle çeyiz tekstili seçiminde görevli uzmanlar çok yardımcı oldu.',
                stars: 5,
                initial: 'Z',
              },
              {
                name: 'Berk Mobilya',
                role: 'İş Ortağı Marka · İstanbul',
                text: 'Showroomumuzu 3 şehre taşıma maliyeti yerine Alisce Life ile ortaklık kurarak bölgesel görünürlük elde ettik. Doğrudan müşteri teması sağladı, dönüşüm oranlarımız belirgin biçimde arttı.',
                stars: 5,
                initial: 'B',
              },
              {
                name: 'Fatma Ö.',
                role: 'Prova Evi Ziyaretçisi · İstanbul',
                text: 'Evim için doğru stili bir türlü karar veremiyordum. Modern mi klasik mi? Prova evinde her ikisini de yaşadıktan sonra hangisinin bana uyduğunu anladım. Harika bir konsept.',
                stars: 5,
                initial: 'F',
              },
              {
                name: 'Mustafa & Derya C.',
                role: 'Çeyiz Günleri · Ankara',
                text: 'Nişanlıydık, ne alacağımızı tartışıyorduk. Alisce Life\'de her şeyi birlikte görünce fikir ayrılıklarımız ortadan kalktı. Ortak bir zevk yakalamak bu kadar kolay olabilirmiş.',
                stars: 5,
                initial: 'M',
              },
              {
                name: 'Renova Yapı',
                role: 'Emlak İş Ortağı · İzmir',
                text: 'Teslim bekleyen projemizin showroom alanını Alisce Life ile değerlendirdik. Hem gelir elde ettik hem de potansiyel alıcılara yaşam alanını yaşatarak gösterebildik. Satış süreci hızlandı.',
                stars: 5,
                initial: 'R',
              },
            ].map((review, i) => (
              <div key={i} style={{ background: G.bg, border: `1px solid ${G.border}`, padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Yıldızlar */}
                <div style={{ display: 'flex', gap: '3px' }}>
                  {Array.from({ length: review.stars }).map((_, s) => (
                    <span key={s} style={{ color: G.gold, fontSize: '0.9rem' }}>★</span>
                  ))}
                </div>
                {/* Yorum */}
                <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '1.05rem', color: G.dark, lineHeight: 1.7, flex: 1 }}>
                  "{review.text}"
                </p>
                {/* Kullanıcı */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1rem', borderTop: `1px solid ${G.border}` }}>
                  <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: G.bgDark,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: "'Cormorant Garamond', serif",
                    fontSize: '1.1rem', fontWeight: 600, color: G.gold,
                    flexShrink: 0,
                  }}>
                    {review.initial}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600, color: G.dark }}>{review.name}</div>
                    <div style={{ fontSize: '0.75rem', color: G.textMuted, marginTop: '0.1rem' }}>{review.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Özet bar */}
          <div style={{ marginTop: '3rem', background: G.bgDark, padding: '2.5rem 3rem', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap' as const, gap: '2rem' }}>
            {[
              { num: '4.9', label: 'Ortalama Puan', sub: '200+ değerlendirme' },
              { num: '%96', label: 'Memnuniyet', sub: 'Tekrar önerir' },
              { num: '3.000+', label: 'Ziyaretçi', sub: '2024 itibarıyla' },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '2.4rem', fontWeight: 600, color: G.gold }}>{stat.num}</div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#FFFCF8', marginTop: '0.2rem' }}>{stat.label}</div>
                <div style={{ fontSize: '0.72rem', color: G.textMuted, marginTop: '0.1rem' }}>{stat.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── RANDEVU ── */}
      <section id="randevu" style={section(G.bg)}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <Header tag="Randevu" title="Deneyimini planla" sub="Prova evlerini ve etkinlikleri ziyaret etmek için randevunu oluştur." />
          <div style={{ background: G.bgAlt, padding: '3rem', border: `1px solid ${G.border}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <input placeholder="Ad Soyad" style={input} />
              <input placeholder="Telefon" style={input} />
              <input placeholder="Şehir Seçin" style={input} />
              <input type="date" style={{ ...input, color: G.textSec }} />
              <select style={{ ...input, color: G.textSec }}>
                <option value="">Etkinlik Türü Seçin</option>
                <option>Çeyiz Günleri</option>
                <option>Marka Deneyim Günleri</option>
                <option>Evlilik Hazırlık Etkinlikleri</option>
                <option>Prova Evi Ziyareti</option>
              </select>
              <button style={{ background: G.dark, color: G.bg, padding: '1rem', fontFamily: "'Jost', sans-serif", fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, border: 'none', cursor: 'pointer', marginTop: '0.5rem' }}>
                Randevu Al
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── İLETİŞİM ── */}
      <section id="iletisim" style={section(G.bgAlt)}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <p style={tag}>İletişim</p>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 600, color: G.dark, marginBottom: '1rem' }}>
            Bizimle iletişime geç
          </h2>
          <p style={{ color: G.textSec, fontSize: '0.95rem', marginBottom: '3rem' }}>
            Sorularınız, iş birlikleriniz veya ziyaret planlarınız için hemen iletişime geçin.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1.25rem', flexWrap: 'wrap' as const }}>
            <a href="https://wa.me/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.9rem 1.75rem', background: '#25D366', color: '#fff', textDecoration: 'none', fontFamily: "'Jost', sans-serif", fontSize: '0.82rem', fontWeight: 600 }}>
              WhatsApp ile Yaz
            </a>
            <a href="tel:" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.9rem 1.75rem', background: G.dark, color: G.bg, textDecoration: 'none', fontFamily: "'Jost', sans-serif", fontSize: '0.82rem', fontWeight: 600 }}>
              Telefon ile Ara
            </a>
            <a href="mailto:aliscelife@gmail.com" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.9rem 1.75rem', background: G.gold, color: G.dark, textDecoration: 'none', fontFamily: "'Jost', sans-serif", fontSize: '0.82rem', fontWeight: 700 }}>
              aliscelife@gmail.com
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: G.bgDark, padding: '3.5rem 2rem', borderTop: `1px solid ${G.borderDark}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' as const, gap: '2rem' }}>
          <div style={{ lineHeight: 1.05 }}>
            <div style={{ fontFamily: "'Jost', sans-serif", fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.06em', color: '#FFFCF8' }}>ALİSCE</div>
            <div style={{ fontFamily: "'Jost', sans-serif", fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.06em', color: G.gold }}>
              LİFE<sup style={{ fontSize: '0.5rem' }}>®</sup>
            </div>
          </div>
          <p style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '1.05rem', color: G.textMuted }}>
            "Yaşamı satın almadan önce deneyimle"
          </p>
          <div style={{ textAlign: 'right' }}>
            <a href="mailto:aliscelife@gmail.com" style={{ color: G.gold, fontSize: '0.82rem', textDecoration: 'none', display: 'block', marginBottom: '0.3rem' }}>aliscelife@gmail.com</a>
            <p style={{ color: G.textMuted, fontSize: '0.75rem', margin: 0 }}>© 2026 Alisce Life. Tüm hakları saklıdır.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

// ── YARDIMCI BİLEŞENLER ──

function Header({ tag, title, sub }: { tag: string; title: React.ReactNode; sub: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
      <p style={{ color: G.gold, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase' as const, marginBottom: '0.75rem' }}>{tag}</p>
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 600, color: G.dark, lineHeight: 1.2 }}>{title}</h2>
      <p style={{ color: G.textSec, marginTop: '1rem', fontSize: '0.95rem', maxWidth: 560, margin: '1rem auto 0' }}>{sub}</p>
    </div>
  )
}

// ── STİL YARDIMCILARI ──

const section = (bg: string): React.CSSProperties => ({ padding: '6rem 2rem', background: bg })
const container: React.CSSProperties = { maxWidth: 1100, margin: '0 auto' }
const grid = (cols: string, gap: string): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: cols, gap })

const cardTitle: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: '1.35rem',
  fontWeight: 600,
  color: G.dark,
  marginBottom: '0.6rem',
}

const cardDesc: React.CSSProperties = {
  color: G.textSec,
  fontSize: '0.88rem',
  lineHeight: 1.75,
}

const h2: React.CSSProperties = {
  fontFamily: "'Cormorant Garamond', serif",
  fontSize: 'clamp(1.9rem, 3.5vw, 2.8rem)',
  fontWeight: 600,
  color: G.dark,
  lineHeight: 1.2,
  marginBottom: '1.5rem',
}

const tag: React.CSSProperties = {
  color: G.gold,
  fontSize: '0.72rem',
  fontWeight: 600,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  marginBottom: '0.75rem',
}

const input: React.CSSProperties = {
  padding: '0.875rem 1rem',
  border: `1px solid ${G.border}`,
  background: G.bg,
  fontFamily: "'Jost', sans-serif",
  fontSize: '0.85rem',
  color: G.dark,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

function btn(variant: 'dark' | 'gold' | 'outline'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-block',
    padding: '0.875rem 2rem',
    fontFamily: "'Jost', sans-serif",
    fontSize: '0.82rem',
    fontWeight: 600,
    textDecoration: 'none',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  }
  if (variant === 'dark') return { ...base, background: G.bgDark, color: G.bg }
  if (variant === 'gold') return { ...base, background: G.gold, color: G.bgDark }
  return { ...base, background: 'transparent', color: G.dark, border: `1px solid ${G.border}` }
}
