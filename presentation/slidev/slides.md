---
theme: default
layout: center
class: text-center
title: Deployment Job Orchestrator · Alur Data End-to-End
titleTemplate: '%s · TypeScript DAG Orchestrator'
info: |
  Presentasi 30 menit tentang alur data Deployment Job Orchestrator.
author: WOWRACK Engineering Challenge
colorSchema: dark
highlighter: shiki
shiki:
  theme: one-dark-pro
lineNumbers: false
aspectRatio: 16/9
canvasWidth: 1280
transition: none
mdc: true
duration: 30min
timer: countdown
drawings:
  persist: false
defaults:
  layout: default
  transition: slide-left

---

# VM Deployment <span>Orchestrator</span>

### Wowrack Coding Challenge
<div class="h-3"></div>
Halim + Aditya

---
src: ./overview.md
---

---
src: ./design-decisions.md
---

---
src: ./project-structure.md
---

---
src: ./features-and-capabilities.md
---

---
src: ./limitations-and-future-improvements.md
---

---
layout: default
---

<div class="h-full flex items-center justify-center">
  <div class="text-center font-bold text-4xl">
    Selesai. Terima kasih.
  </div>
</div>

---
layout: default
---

<div class="slide-kicker">DESIGN DECISION · DEFINITION CONTRACT</div>

# Array Itu <span>Selection</span>, Bukan Seluruh Workflow

<div class="definition-resolution">
  <div class="definition-source array-source">
    <small>DATABASE · REUSABLE TEMPLATE</small>
    <b><code>jobs.definition</code></b>
    <pre>["vpc", "subnet", "acl-list", "vm"]</pre>
    <span>Hanya memilih capability yang dipakai.</span>
  </div>

  <div class="resolution-arrow"><span>resolve + validate</span>→</div>

  <div class="definition-source registry-source">
    <small>CODE · SINGLE SOURCE OF TRUTH</small>
    <b><code>deploymentSteps</code></b>
    <div class="registry-fields">
      <span><code>dependsOn</code></span>
      <span><code>execution</code></span>
      <span><code>run</code></span>
      <span><code>rollback</code></span>
    </div>
    <span>Menentukan topology dan behavior.</span>
  </div>

  <div class="resolution-arrow"><span>overlay case</span>→</div>

  <div class="definition-source runtime-source">
    <small>RUNTIME · EXECUTABLE SNAPSHOT</small>
    <b><code>JobDefinition[]</code></b>
    <div class="runtime-fields">
      <span>input</span><span>retry</span><span>timeout</span><span>apiControl</span>
    </div>
    <span>DAG konkret yang disimpan per run.</span>
  </div>
</div>

<div class="design-reasons">
  <div><b>Satu aturan dependency</b><span>Tidak ada copy <code>dependsOn</code> yang bisa berbeda antar-template.</span></div>
  <div><b>Definition tetap kecil</b><span>Template mudah dibaca, dibandingkan, dan divalidasi.</span></div>
  <div><b>Behavior tetap type-safe</b><span>API handler dan rollback tidak dieksekusi dari JSON database.</span></div>
</div>

<div class="definition-caveat">
  <b>Trade-off:</b> topology tidak bisa diubah per-template; perubahan registry harus diperlakukan sebagai perubahan kontrak dan diuji terhadap seluruh definition.
</div>

<!--
Di design ini, array pada jobs.definition bukan representasi lengkap workflow. Array hanya berfungsi sebagai selection: capability mana saja yang ingin dimasukkan ke template deployment.

Detail yang menjadi sifat intrinsik sebuah step—dependency, mode eksekusi, handler API, dan rollback—diletakkan satu kali di deployment-step registry. Saat case dijalankan, buildApiJobGraph menggabungkan selection tersebut dengan registry, memeriksa step yang tidak dikenal, dependency yang hilang, fan-out constraint, serta cycle. Input dan konfigurasi operasional kemudian dioverlay dari case, dan hasil akhirnya disimpan sebagai snapshot JobDefinition untuk run tersebut.

Keuntungan utamanya adalah tidak ada dua sumber kebenaran untuk dependency. Kalau dependsOn juga disimpan di setiap definition, template A dan template B dapat mendeskripsikan step vm dengan dependency berbeda tanpa sengaja. Selain itu, function handler tetap berada di code sehingga type-checking, testing, dan security boundary lebih jelas.

Trade-off-nya juga nyata: topology tidak dapat dikustomisasi per-template. Perubahan dependency di registry akan memengaruhi validasi definition yang ada, sehingga perubahan registry perlu dianggap sebagai perubahan kontrak dan dites terhadap seluruh persisted definition.
-->

---
layout: default
---

<div class="slide-kicker">ALTERNATIVE MODELS</div>

# Tiga Pendekatan, <span>Tiga Trade-off</span>

<div class="approach-table">
  <div class="approach-head">
    <span>MODEL</span><span>YANG DISIMPAN</span><span>KELEBIHAN</span><span>RISIKO / BIAYA</span>
  </div>

  <div class="approach-row recommended">
    <div><small>CURRENT</small><b>ID-only definition</b></div>
    <div><code>["vpc", "vm"]</code><span>DAG + API ada di registry.</span></div>
    <div><span>Ringkas, type-safe, dependency konsisten, mudah divalidasi.</span></div>
    <div><span>Topology tidak fleksibel per-template; perubahan registry berdampak global.</span></div>
  </div>

  <div class="approach-row rich-definition">
    <div><small>FULLY DECLARATIVE</small><b>Semua di definition</b></div>
    <div><code>id · dependsOn · api · rollback · config</code></div>
    <div><span>Workflow portable dan dapat dibuat user tanpa deploy code baru.</span></div>
    <div><span>Schema/versioning kompleks; validasi keamanan dan dispatch handler lebih berat.</span></div>
  </div>

  <div class="approach-row code-only">
    <div><small>STATIC</small><b>Registry / code-only</b></div>
    <div><code>workflowId → fixed DAG</code><span>DB tidak menyimpan daftar step.</span></div>
    <div><span>Paling sederhana dan aman untuk sedikit workflow yang stabil.</span></div>
    <div><span>Setiap variasi butuh perubahan code dan release baru.</span></div>
  </div>
</div>

<div class="decision-scale">
  <span><b>Kontrol & type safety</b><small>code-only</small></span>
  <i>←</i>
  <strong>ID-only</strong>
  <i>→</i>
  <span><b>Fleksibilitas runtime</b><small>fully declarative</small></span>
</div>

<div class="statement-strip compact-strip approach-verdict">
  <span class="dot"></span>
  <span>Untuk challenge ini, <strong>ID-only adalah titik tengah yang tepat</strong>: template tetap reusable, sementara graph dan API behavior tetap terkontrol di code.</span>
</div>

<!--
Ada tiga model yang masuk akal untuk ownership workflow.

Model pertama adalah pendekatan saat ini: definition hanya menyimpan logical step IDs. Registry memiliki dependency dan behavior. Ini memberi titik tengah antara template yang reusable dan implementasi yang tetap terkontrol serta type-safe.

Model kedua adalah fully declarative. Seluruh informasi—step, dependsOn, endpoint atau API command, rollback, mapping input-output, dan konfigurasi—disimpan di definition. Model ini cocok jika produk harus menyediakan workflow builder dan user boleh membuat graph baru tanpa release aplikasi. Namun konsekuensinya jauh lebih besar: perlu schema versioning, allowlist command, expression language untuk mapping result, secret handling, compatibility migration, dan sandboxing atau dispatch layer yang aman. Menyimpan nama function saja di JSON belum membuat behavior benar-benar portable.

Model ketiga adalah code-only. Database hanya menyimpan workflow ID, atau bahkan tidak menyimpan template sama sekali; seluruh DAG statis berada di code. Ini paling sederhana untuk beberapa flow yang sangat stabil, tetapi setiap kombinasi baru membutuhkan perubahan source dan release.

Untuk scope challenge ini, ID-only paling seimbang. Jika kebutuhan bergeser menjadi workflow builder yang benar-benar user-defined, barulah fully declarative layak dipilih sebagai produk tersendiri, bukan sekadar menambahkan dependsOn ke JSON.
-->

---
layout: default
---

<div class="slide-kicker">PROJECT CAPABILITIES</div>

# Fitur Utama <span>Project</span>

<div class="bullet-columns">
  <div class="bullet-panel feature-panel">
    <h3>Orchestration</h3>
    <ul>
      <li><b>DAG-based scheduling</b> untuk menjaga urutan dependency antar-job.</li>
      <li><b>Parallel execution</b> untuk job independen yang sudah siap dijalankan.</li>
      <li><b>Named instances / fan-out</b> untuk mengeksekusi beberapa ACL rule secara paralel.</li>
      <li><b>Definition validation</b> untuk dependency hilang, step tidak dikenal, dan cycle.</li>
      <li><b>Configuration inheritance</b> dari orchestrator, defaults, step, hingga named instance.</li>
    </ul>
  </div>

  <div class="bullet-panel feature-panel">
    <h3>Reliability & Operations</h3>
    <ul>
      <li><b>Retry dan timeout</b> yang dapat diatur per case, step, maupun instance.</li>
      <li><b>Automatic rollback</b> dalam urutan terbalik ketika deployment gagal.</li>
      <li><b>Persistent audit trail</b> melalui SQLite dan append-only status log.</li>
      <li><b>Interactive CLI & 11 demo cases</b> untuk success, failure, retry, dan rollback.</li>
      <li><b>Failure propagation</b> untuk membatalkan job aktif dan menandai job terblokir sebagai skipped.</li>
    </ul>
  </div>
</div>

<div class="statement-strip compact-strip">
  <span class="dot"></span>
  <span>Satu flow mencakup <strong>validasi → eksekusi → retry → rollback → persistence</strong>.</span>
</div>

<!--
Kalau dirangkum, project ini tidak hanya menjalankan sekumpulan request API, tetapi sudah memiliki alur orchestration yang cukup lengkap.

Pada sisi orchestration, DAG memastikan setiap job hanya berjalan setelah dependency-nya selesai. Job yang independen bisa berjalan paralel, sedangkan named instance memungkinkan satu logical step seperti ACL rule dipecah menjadi beberapa job. Sebelum dijalankan, definition juga divalidasi untuk mendeteksi dependency yang hilang, step yang belum terdaftar, atau cycle.

Pada sisi reliability, setiap job mendukung retry dan timeout dengan konfigurasi berjenjang. Jika kegagalan tetap terjadi, orchestrator akan menghentikan flow, menandai job yang terblokir sebagai skipped, lalu melakukan rollback terhadap resource yang sebelumnya berhasil dibuat. Seluruh perubahan status disimpan sebagai append-only log di SQLite, sehingga riwayat eksekusi dapat diperiksa kembali melalui CLI.
-->
