# Rock Foundry v2 — Tahap 1: Ingatan Proyek, Kartu, dan Galeri

Tanggal: 22 Nov 2026 · Status: menunggu persetujuan pemilik

## 1. Maksud dan alasan

Pemilik membangun banyak proyek bareng AI agent (terutama Hermes, kadang Claude Code/Codex), tapi bukan programmer. Masalah utamanya **lupa**: sejarah proyek tersebar di puluhan folder kerja (BresciaHub punya 100 worktree di 3 lokasi), riwayat chat ChatGPT/Gemini, dan memori tiap agent. Tiap ada ide fitur atau laporan error, pemilik harus minta "tarik konteks" ke chatbot yang cuma ingat obrolan, bukan kondisi repo atau server yang sebenarnya.

Rock Foundry v2 adalah **buku proyek untuk builder yang kerja bareng AI agent**: Hermes (atau agent lain) yang mengerjakan, Rock Foundry yang mengingat dan menunjukkan. Semua yang rumit ada di mesin di belakang; di depan cuma galeri proyek, halaman proyek, dan tombol.

Rock Foundry v2 menjadi proyek **open source (MIT)** yang bermanfaat untuk banyak builder. Soal pemasukan diputuskan nanti.

Tahap 1 (dokumen ini) adalah fondasi dari 4 tahap yang disepakati:

1. **Ingatan + kartu proyek + galeri** ← dokumen ini
2. Kotak masuk proyek (masukan user, issue, PR kontributor) ditriase Hermes
3. Angka: jumlah user dan pemasukan
4. Peluang otomatis yang diurutkan memakai data tahap 2–3

## 2. Sasaran, bukan-sasaran, anti-sasaran

**Sasaran tahap 1**

- Menemukan semua proyek di folder yang ditunjuk pemilik secara otomatis, termasuk mengelompokkan banyak worktree/clone dari satu repo menjadi satu proyek.
- Menyusun **kartu proyek** berbahasa biasa per proyek: apa ini, posisi sekarang, yang menggantung, rapihin folder, jangan disentuh, perlu diputusin, peluang, riwayat, plus catatan teknis untuk agent.
- Kartu **diperbarui otomatis** setelah sesi Hermes selesai dan bisa di-refresh manual; pemilik tidak pernah mengisi apa pun.
- **Galeri proyek** di Hermes Desktop (sidebar → "Projects"), klik ubin membuka halaman proyek dengan tombol yang memulai chat Hermes berbekal konteks kartu.
- Agent (Hermes, Claude Code, Codex) bisa membaca kartu sebelum bekerja di sebuah proyek.
- Repo `rockfoundry` dirapikan: kode lama diarsipkan, README baru menjelaskan arah v2.

**Bukan sasaran tahap 1**

- Jumlah user, pemasukan, biaya (tahap 3). Ubin dan halaman tidak menampilkan kotak kosong untuk ini di tahap 1.
- Kotak masuk masukan user / triase PR (tahap 2).
- Riset kompetitor dan peluang berbasis data luar (tahap 4). Peluang tahap 1 hanya dari catatan proyek dan diberi label begitu.
- Dashboard web / akses HP (menyusul; plugin web dashboard Hermes adalah jalurnya).
- Menjalankan, mengubah, deploy, atau merge apa pun di proyek pemilik.

**Anti-sasaran (gagal walau secara teknis jalan)**

- Rock Foundry **menulis atau mengubah** repo/folder proyek pemilik, atau melakukan `git fetch`/`checkout` diam-diam.
- Kartu **membocorkan rahasia**: isi `.env`, token, kunci, IP server, atau membaca file kredensial (contoh nyata di mesin pemilik: `gcp-credentials.json`, `youtube_token.json` di `C:\AI PROJECTS`).
- Kartu **mengarang**: menyebut sesuatu "live" padahal tidak ada bukti. Yang tidak diketahui harus ditulis "belum ketahuan".
- Tampilan terasa seperti alat developer (istilah git, SHA, branch) di bagian yang dibaca pemilik. Istilah teknis hanya di bagian "Catatan teknis buat agent".
- Biaya model membengkak karena narasi dibuat ulang tiap kali walau faktanya tidak berubah.
- Galeri meniru kanban bawaan Hermes Desktop.

## 3. Batasan

- **Mesin pemilik:** Windows 11, proyek di `C:\AI PROJECTS` dan `D:\HERMES DESIGN AGENT\working` (plus sesekali `D:\hb-linux`). Harus jalan di Windows, macOS, Linux.
- **Hermes** v0.23.x, Python ≥3.11. Plugin memakai API publik Hermes saja (lihat §6.3).
- **GitHub CLI** (`gh`) mungkin ada dan sudah login; mungkin juga tidak. Tanpa `gh`, kartu tetap jadi dengan data git saja.
- **Hanya baca.** Perintah git yang dipakai hanya yang membaca (`log`, `worktree list`, `for-each-ref`, `merge-base`, `rev-list`, `status --porcelain`, `show <ref>:<path>`). Tidak ada `fetch` kecuali pemilik menjalankan `--fetch`.
- **ToS langganan:** mesin tidak pernah membaca token login CLI. Narasi dibuat lewat `ctx.llm` milik Hermes, atau lewat CLI resmi (`claude -p`, `codex exec`) yang login sendiri.
- **Open source:** repo publik; tidak boleh ada IP, hostname privat, atau kredensial pemilik di riwayat yang di-push.

## 4. Pendekatan

| | Pendekatan | Untung | Rugi |
|---|---|---|---|
| A | Plugin Hermes saja | Paling cepat | Terkunci ke Hermes; perubahan API plugin Hermes mematahkan semuanya |
| B | Aplikasi sendiri (seperti Rock Foundry lama) | Jalan tanpa Hermes | Menyaingi Hermes Desktop, paling berat, bukan yang pemilik mau (panel di Hermes) |
| **C** | **Mesin terpisah + plugin Hermes sebagai wajah pertama** | Otak tidak terkunci ke satu aplikasi; kartu tetap terbaca sebagai file biasa; wajah lain (Claude Code, web) bisa menyusul | Struktur sedikit lebih banyak di awal |

**Dipilih pemilik: C.** Alasan: proyek open source untuk banyak builder tidak boleh menempelkan otaknya ke satu aplikasi; tambahan kerjanya kecil.

## 5. Keputusan pemilik (dari brainstorming)

- Tampilan **galeri** (ubin seperti etalase karya), bukan kanban dan bukan "yang perlu perhatian dulu".
- Ubin: gambar, nama, satu kalimat "ini apa", titik status, kapan terakhir dikerjakan, badge kecil untuk hal yang perlu diputuskan.
- Klik ubin → halaman proyek berisi isi kartu + tombol **Lanjutin**, **Brainstorm**, **Kerjain peluang** yang membuka chat Hermes dengan konteks proyek.
- Urutan galeri: paling baru dikerjakan di atas.
- Kartu terutama untuk **manusia** dalam bahasa biasa; bagian teknis dilipat untuk agent.
- Rock Foundry dijadikan open source; README repo diganti agar orang paham arah baru; kode yang tidak dipakai dirapikan.
- Pemasukan/monetisasi: nanti.

## 6. Desain

### 6.1 Struktur repo baru (`main`)

```
rockfoundry/
├── engine/                     # paket Python "rockfoundry" + CLI
│   ├── pyproject.toml
│   ├── src/rockfoundry/
│   │   ├── config.py           # baca ~/.rockfoundry/config.toml
│   │   ├── discover.py         # cari repo/worktree, kelompokkan jadi proyek
│   │   ├── facts.py            # kumpulkan fakta git + gh (tanpa LLM)
│   │   ├── classify.py         # status folder, status proyek, badge
│   │   ├── safety.py           # deny-list file, redaksi output
│   │   ├── narrative.py        # narasi via penyedia LLM (opsional)
│   │   ├── card.py             # render card.md dari facts + narrative
│   │   ├── store.py            # tulis ~/.rockfoundry/projects/<slug>/
│   │   └── cli.py
│   └── tests/
├── hermes-plugin/              # paket plugin Hermes "rockfoundry"
│   ├── plugin.yaml
│   ├── __init__.py             # register(ctx): hook, skill, command
│   ├── plugin_api.py           # REST /api/plugins/rockfoundry/*
│   ├── skills/rockfoundry/SKILL.md
│   └── desktop/plugin.js       # halaman Projects: galeri + halaman proyek
├── docs/
│   ├── superpowers/specs/      # dokumen desain ini
│   ├── card-format.md          # format kartu & facts.json
│   └── safety.md               # apa yang tidak pernah dibaca/ditulis
├── README.md                   # Inggris (audiens open source)
├── README.id.md                # Bahasa Indonesia
├── CONTRIBUTING.md, SECURITY.md, CHANGELOG.md, LICENSE (MIT)
└── .github/workflows/ci.yml    # lint + test engine & plugin
```

### 6.2 Mesin (`engine/`)

**Konfigurasi** `~/.rockfoundry/config.toml` (dibuat otomatis saat pertama jalan, dengan pertanyaan folder mana yang di-scan bila belum ada):

```toml
roots = ["C:/AI PROJECTS", "D:/HERMES DESIGN AGENT/working"]
scan_depth = 2
stale_days = 30

[safety]
deny = ["*.env", ".env*", "*credential*", "*secret*", "*token*", "*.pem", "*.key", "id_*", "auth.json"]

[projects.bresciahub]          # opsional, override per proyek
name = "BresciaHub"
release_tags = ["prod-*"]
homepage = "https://bresciahub.id"
```

**Penemuan proyek.** Setiap folder di bawah `roots` (sampai `scan_depth`) yang merupakan repo git atau worktree dicatat. Folder dikelompokkan menjadi satu proyek berdasarkan URL `origin` yang dinormalkan (tanpa kredensial, tanpa `.git`, huruf kecil); bila tanpa remote, berdasarkan git common dir. Worktree yang terdaftar di repo utama tapi berada di luar `roots` (contoh `D:\hb-linux\release-internal`) tetap ikut lewat `git worktree list`. Folder tanpa git diabaikan.

**Fakta (tanpa LLM), disimpan di `facts.json`:**

- identitas: slug, nama, remote, default branch, tanggal commit pertama, jumlah commit di default branch.
- aktivitas: tanggal commit terakhir di semua folder dan di `origin/<default>`.
- penanda rilis: tag yang cocok `release_tags` (default: `v*`, `release-*`, `prod-*`) dan GitHub Releases bila `gh` tersedia; tanggal rilis terakhir.
- PR (bila `gh` tersedia): sampai 200 PR terakhir, status, tanggal merge, nama branch (cukup untuk mendeteksi squash merge branch lama).
- per folder kerja: path, branch, tanggal commit terakhir, jumlah file berubah (`status --porcelain --untracked-files=no`), status (lihat aturan).
- folder utama: tertinggal/terdepan berapa commit dari `origin/<default>`.
- dokumen panduan yang ditemukan di default branch: `AGENTS.md`, `CLAUDE.md`, `README.md`, dan `docs/*` yang namanya cocok `PRODUCTION*`, `DEPLOY*`, `RELEASE*` — termasuk yang hanya ada di branch lain (dicatat sebagai temuan "catatan cuma ada di cabang samping").

**Aturan status folder kerja** (urutan pertama yang cocok):

1. `live` — HEAD terkandung di penanda rilis terbaru.
2. `masuk-utama` — HEAD leluhur `origin/<default>`, **atau** branch-nya punya PR berstatus merged (menangani squash merge yang tidak terdeteksi git).
3. `menggantung` — selain itu dan disentuh ≤ `stale_days`.
4. `ditinggal` — selain itu dan disentuh > `stale_days`.

Folder `live`/`masuk-utama` tanpa perubahan belum disimpan = **bisa diberesin**. Folder `live`/`masuk-utama` dengan perubahan = **cek dulu**.

**Status proyek (titik di ubin):** `aktif` ≤7 hari, `pelan` ≤60 hari, `tidur` >60 hari; tambahan label `live` bila ada penanda rilis.

**Badge "perlu diputusin"** dihitung tanpa LLM dari fakta: PR merged setelah rilis terakhir ("udah live belum?"), kelompok kerjaan menggantung, folder utama tertinggal jauh (>50 commit), catatan produksi tidak ada di default branch.

**Narasi (opsional, pakai LLM):** bagian "Apa ini", ringkasan "Posisi sekarang", "Jangan disentuh", dan "Peluang". Masukan ke model hanya `facts.json` + potongan dokumen panduan (maks. ~8 rb token per proyek), tidak pernah kode. Hasil berupa JSON terstruktur yang divalidasi. Penyedia:

- di dalam Hermes: `ctx.llm` (model yang sedang dipakai pemilik);
- CLI mandiri: `--llm claude` (`claude -p`), `--llm codex` (`codex exec`), atau `--llm none` (default; kartu tetap lengkap untuk bagian berbasis fakta, bagian narasi tertulis "belum diringkas").

Narasi di-cache dengan kunci hash dari fakta + dokumen; model hanya dipanggil lagi bila hash berubah, atau saat refresh mingguan.

**Keluaran** di `~/.rockfoundry/projects/<slug>/` (di luar repo, sengaja — 100 worktree akan membuat 100 versi kartu bila disimpan di dalam repo):

- `card.md` — kartu untuk manusia, mengikuti format draf BresciaHub (§8 referensi), bagian teknis dalam `<details>`.
- `facts.json` — data mesin, ber-`schema_version`.
- `narrative.json` — cache narasi.
- `history.jsonl` — peristiwa tambah-saja: sesi Hermes selesai, rilis baru terdeteksi, PR merged, catatan manual.

**CLI:**

```
rockfoundry scan [--project SLUG] [--llm none|claude|codex] [--fetch]
rockfoundry list [--json]
rockfoundry card SLUG            # cetak card.md
rockfoundry note SLUG "teks"     # tambah catatan ke riwayat
rockfoundry doctor               # cek git, gh, config, izin folder
```

**Keamanan (`safety.py`):** tidak pernah membuka file yang cocok deny-list (juga lewat `git show`); semua teks keluaran melewati redaksi: alamat IPv4/IPv6 privat & publik, string mirip kunci (prefix `sk-`, `ghp_`, `AKIA`, JWT, hex ≥32), dan nilai setelah `KEY=`/`TOKEN=`/`SECRET=`/`PASSWORD=`. Prompt narasi melarang menyalin alamat server, kredensial, atau path rahasia.

### 6.3 Plugin Hermes (`hermes-plugin/`)

Paket plugin native (`plugin.yaml` + `register(ctx)`) yang juga membawa `desktop/plugin.js` (mode "unified package" di Desktop Plugin SDK). Bergantung pada paket `rockfoundry` (dideklarasikan di `python_dependencies`; sebelum terbit di PyPI memakai `git+https://github.com/ranggaoscar/rockfoundry#subdirectory=engine`).

- **Pertama kali dibuka:** bila `config.toml` belum ada, halaman Projects menampilkan layar pengaturan singkat untuk memilih folder yang di-scan (CLI menanyakannya di terminal). Tidak ada scan sebelum pemilik memilih folder.

- **Hook `post_tool_call`:** mencatat path folder yang disentuh tool (mis. `workdir` tool terminal, `path` tool file) per `session_id`, di memori proses.
- **Hook `on_session_end`:** bila folder yang tercatat untuk sesi itu ada di dalam proyek yang dikenal → `scan --project` (fakta saja, cepat) + satu baris ke `history.jsonl` berisi ringkasan sesi (dibuat `ctx.llm`, maks. 1 kalimat). Narasi diperbarui hanya bila hash berubah.
- **Skill `rockfoundry`:** mengajari agent: sebelum bekerja di proyek, baca `card.md`-nya (terutama "Jangan disentuh" dan "Catatan teknis"); setelah selesai, jangan edit kartu sendiri — mesin yang memperbarui.
- **Perintah:** `/proyek` (daftar), `/proyek <nama>` (tampilkan kartu), `/proyek refresh [nama]`.
- **Refresh mingguan:** perintah `/proyek jadwal` membuat cron Hermes mingguan untuk `scan` semua proyek dengan narasi. Tidak dibuat otomatis tanpa persetujuan pemilik.
- **`plugin_api.py`:** `GET /projects`, `GET /projects/<slug>` (facts + card + narrative), `POST /projects/<slug>/refresh`, `GET /projects/<slug>/image`.
- **`desktop/plugin.js`:** halaman **Projects** + baris sidebar.
  - Galeri: grid ubin responsif; ubin = gambar (lihat bawah), nama, satu kalimat, titik status, "terakhir dikerjakan", badge "N perlu diputusin" bila ada. Diurutkan dari yang terbaru. Komponen UI memakai kit bawaan SDK agar menyatu dengan Hermes.
  - Halaman proyek: kepala (gambar, nama, satu kalimat, mulai kapan, agent yang pernah mengerjakan dari riwayat), 3 angka ringkas (live terakhir, menggantung, bisa diberesin), lalu bagian kartu berurutan, bagian teknis dilipat.
  - Tombol **Lanjutin / Brainstorm / Kerjain peluang**: membuka sesi chat Hermes baru dengan cwd = folder utama proyek dan pesan pembuka yang menyertakan isi kartu + niat tombol. "Kerjain peluang" tersedia per butir peluang.
  - Gambar ubin: logo di repo (`logo.*`, `public/favicon.*`, `assets/logo*`, `apps/*/public/favicon.*`) → inisial. **Screenshot halaman live** (dari `homepage` di config atau GitHub) diambil saat refresh mingguan bila browser Hermes tersedia; bila gagal, kembali ke logo/inisial.

### 6.4 Perapihan repo dan README

Kondisi saat ini (dicek ulang 22 Nov): repo **publik**; `origin/main` = `3a83f06` (Product Studio + WebMCP + 5 commit Work OS). `docs/RF-002-HERMES-LIVE.md` di `main` publik **sudah memuat** IP VPS, IP Tailscale, nama user SSH, dan nama file kunci SSH (bukan isi kuncinya). Working tree lokal menghapus `apps/web` dan isi `packages/` (belum di-commit; tidak ada perubahan lain selain `IDEA.md` yang tidak dilacak dan dokumen desain ini).

Langkah:

1. Tag `legacy/product-studio` di `origin/main` (`3a83f06`) — dipush setelah pemilik setuju; kode lama tetap bisa dilihat publik.
2. Penghapusan di working tree dikembalikan dulu (`git restore`) — aman karena semuanya sudah ada di commit — lalu pindah ke branch baru.
3. Branch kerja baru `feat/v2-project-memory` dari `origin/main`; hapus dari pohon: `apps/`, `packages/`, `PRD.md`, `PROJECT_MANIFEST.json`, `DEMO.md`, `README_START_HERE.md`, `product/`, `design/`, `delivery/`, `decisions/`, `technical/`, `deployment/`, `backups/`, `archive/`, `agent/`, `public/`, `docs/*` lama, `package.json`, `pnpm-*`, `.env.example`, `next.pid`. `.pnpm-store/` dan `node_modules/` masuk `.gitignore`.
4. `IDEA.md` milik pemilik tidak disentuh.
5. README baru (EN + ID): apa itu Rock Foundry v2, untuk siapa, screenshot galeri, cara pasang (engine via `pipx`/`uv tool install`, plugin via `hermes plugins install`), cara kerja (fakta tanpa LLM, narasi opsional), keamanan (hanya baca, deny-list), peta jalan 4 tahap, catatan bahwa versi lama ada di tag `legacy/product-studio`.
6. CHANGELOG: entri v2.0.0. CI GitHub Actions: lint (ruff) + test engine (pytest) di Windows & Linux.
7. Push branch dan buka PR ke `main` **hanya setelah pemilik setuju** di chat. Pemilik yang merge.
8. Demo lama `foundry.rockbase.web.id` dibiarkan jalan; README tidak lagi menautkannya.
9. **Alamat VPS di riwayat publik:** menghapus `docs/RF-002-*.md` dari `main` tidak menghapusnya dari riwayat git. Menulis ulang riwayat (force push) bersifat merusak dan **bukan bagian rencana ini** kecuali pemilik memintanya. Yang disarankan ke pemilik: pastikan SSH VPS hanya menerima kunci (tanpa password) dan port sensitif tertutup firewall.

## 7. Pengujian dan bukti selesai

- **Unit/integrasi engine** dengan repo git sementara: worktree ganda, dua lokasi, squash-merge + PR palsu, tag rilis, folder kotor, remote dengan kredensial di URL (harus dinormalkan), file deny-list (tidak pernah dibaca), redaksi IP/kunci.
- **Plugin:** `hermes plugins validate` lulus; hook `on_session_end` teruji dengan sesi palsu; endpoint REST teruji.
- **Uji nyata (hanya baca) di mesin pemilik:** `rockfoundry scan` menghasilkan kartu BresciaHub yang angkanya cocok dengan draf 22 Nov (100 folder kerja; 60 live; 49 bisa diberesin; 11 cek dulu; folder utama tertinggal 210) dikoreksi untuk status PR terbaru; proyek lain (Aletra Digital, Virtual Showroom, Rock Foundry, Brescia Academy, Brescia Bali Ops, Trading Desk) muncul di galeri.
- **Galeri** dibuka di Hermes Desktop pemilik dan dicek pemilik.
- Tidak ada file di folder proyek pemilik yang berubah setelah scan (dibuktikan dengan `git status` sebelum/sesudah).

## 8. Referensi

- Draf kartu BresciaHub (spike 22 Nov): format acuan `card.md`.
- Hermes docs: Desktop Plugin SDK (`desktop-plugin-sdk.md`), Build a Hermes Plugin (`plugins/index.md`), Plugin LLM Access (`plugin-llm-access.md`), Plugin Catalog submission.

## 9. Diserahkan ke builder

- Nama panggilan API Desktop SDK yang tepat (register page/nav, membuka sesi chat baru dengan cwd + pesan) — diverifikasi terhadap docs Hermes terpasang.
- Bila `on_session_end` tidak membawa cwd, fallback: cocokkan via data sesi lewat `host.request`/gateway, atau andalkan refresh manual + mingguan.
- Pustaka CLI/TOML, aturan slug, teks persis template kartu, gaya grid.
- Batas waktu & paralelisme scan (target: 100 worktree < 30 detik tanpa narasi).

## 10. Keputusan yang diambil asisten (bisa dikoreksi pemilik)

- README utama berbahasa Inggris + `README.id.md`.
- Folder tanpa git tidak muncul di galeri (menghindari folder seperti `Tools`, `chrome-profile`).
- Kartu disimpan di `~/.rockfoundry/`, bukan di dalam repo proyek.
- Narasi default mati di CLI mandiri; di Hermes memakai model yang sedang dipakai.
- Refresh mingguan baru aktif setelah pemilik menjalankan `/proyek jadwal`.
- Kode Work OS sudah ada di GitHub, jadi cukup diarsipkan lewat tag `legacy/product-studio`; demo lama dibiarkan jalan.
- `on_session_end` Hermes tidak membawa folder kerja, jadi plugin mencatat folder dari argumen panggilan tool (`post_tool_call`, mis. `workdir` di tool terminal) per sesi, lalu memakai catatan itu saat sesi selesai.
- Screenshot halaman live termasuk tahap 1 tapi dengan fallback ke logo/inisial.
