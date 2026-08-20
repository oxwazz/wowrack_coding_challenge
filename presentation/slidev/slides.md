---
theme: default
layout: two-cols-header
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
src: ./limitations-and-future-improvements≈.md
---

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

---
layout: default
---

<div class="slide-kicker">SYSTEM LAYERS</div>

# Struktur <span>Project</span>

<div class="project-layer-grid">
  <div class="project-layer interface-layer">
    <small>ENTRY POINT</small>
    <b>interfaces/cli</b>
    <code>app.tsx · cases/*.json</code>
    <p>UI interaktif, pemilihan skenario, dan input deployment.</p>
  </div>

  <div class="layer-arrow">→</div>

  <div class="project-layer core-layer">
    <small>BUSINESS LOGIC</small>
    <b>core</b>
    <code>orchestrator · scheduler · executor</code>
    <p>Validasi DAG, scheduling, retry, timeout, dan rollback.</p>
  </div>

  <div class="layer-arrow">→</div>

  <div class="project-layer request-layer">
    <small>INTEGRATION</small>
    <b>requests</b>
    <code>deployment-steps · client · api/*</code>
    <p>Registry step dan adapter request ke Fake CloudStack API.</p>
  </div>

  <div class="layer-arrow">↔</div>

  <div class="project-layer database-layer">
    <small>PERSISTENCE</small>
    <b>database</b>
    <code>store · migrations · schema</code>
    <p>Snapshot definition dan append-only status history di SQLite.</p>
  </div>
</div>

<div class="project-foundation">
  <div><b>types.ts</b><span>kontrak data lintas layer</span></div>
  <div><b>constants.ts</b><span>default dan nilai bersama</span></div>
  <div><b>utils.ts</b><span>helper generik</span></div>
  <div><b>__test__/</b><span>test yang mencerminkan modul source</span></div>
</div>

<div class="statement-strip compact-strip structure-strip">
  <span class="dot purple"></span>
  <span>Dependency mengalir dari <strong>interface → core → integration</strong>; kontrak bersama tetap berada di root <code>src/</code>.</span>
</div>

<!--
Struktur project dibagi berdasarkan tanggung jawab, bukan berdasarkan fitur deployment tertentu.

Layer interfaces menjadi pintu masuk aplikasi. Di sini ada CLI berbasis Ink serta sebelas file case JSON yang dipakai untuk mendemonstrasikan berbagai kondisi eksekusi.

Layer core berisi business logic yang tidak bergantung pada tampilan CLI: orchestrator sebagai facade, pembentukan dan validasi graph, scheduler, executor, timeout, serta rollback.

Layer requests menghubungkan core dengan Fake CloudStack API. Deployment steps mendefinisikan dependency dan handler setiap step, sementara folder api berisi wrapper command yang spesifik terhadap CloudStack.

Layer database mengisolasi persistence melalui store, schema, dan migration. Types, constants, dan utilities menjadi fondasi yang dipakai lintas layer, sedangkan struktur test mengikuti area source agar perubahan pada setiap layer mudah diverifikasi.
-->

---
layout: default
---

<div class="slide-kicker">PROJECT FLOW · COLLABORATION</div>

# Cara Layer <span>Bekerja Bersama</span>

<div class="collaboration-flow">
  <div class="collab-node">
    <small>01 · CLI</small>
    <b>Pilih case</b>
    <code>app.tsx</code>
    <span>Membaca skenario JSON dan memulai deployment.</span>
  </div>
  <i>→</i>
  <div class="collab-node emphasized">
    <small>02 · ORCHESTRATOR</small>
    <b>Resolve definition</b>
    <code>deployment-orchestrator.ts</code>
    <span>Menggabungkan template, config, dan named instances.</span>
  </div>
  <i>→</i>
  <div class="collab-node emphasized">
    <small>03 · CORE ENGINE</small>
    <b>Jalankan DAG</b>
    <code>scheduler.ts · job-executor.ts</code>
    <span>Menjalankan job ready; mengatur retry dan failure.</span>
  </div>
  <i>→</i>
  <div class="collab-node">
    <small>04 · ADAPTER</small>
    <b>Panggil API</b>
    <code>deployment-steps.ts</code>
    <span>Menerjemahkan context job menjadi request CloudStack.</span>
  </div>
</div>

<div class="persistence-rail">
  <div class="rail-line"></div>
  <div class="rail-label"><b>OrchestratorStore · SQLite</b><span>definition · snapshot · status transition · result · error</span></div>
  <div class="rail-touchpoints">
    <span>create run</span>
    <span>read state</span>
    <span>append log</span>
    <span>inspect result</span>
  </div>
</div>

<div class="layer-responsibilities">
  <div><b>Core tetap reusable</b><span>Tidak mengetahui detail UI atau bentuk menu CLI.</span></div>
  <div><b>Integrasi dapat diganti</b><span>Handler registry menjadi boundary menuju provider API.</span></div>
  <div><b>State dapat diaudit</b><span>Setiap transisi tersimpan, bukan hanya status terakhir.</span></div>
</div>

<!--
Slide ini menunjukkan bagaimana layer tadi bekerja dalam satu deployment.

CLI membaca case JSON dan meminta orchestrator memulai deployment. Orchestrator mengambil job definition dari database, menggabungkannya dengan input dan konfigurasi case, lalu mengubah named instance menjadi runtime job yang konkret.

Hasil resolusi diteruskan ke core engine. Scheduler menentukan job yang ready berdasarkan dependency, sedangkan JobExecutor menangani attempt, timeout, retry, dan pemanggilan handler. Handler di deployment steps kemudian menerjemahkan job context menjadi request yang sesuai untuk Fake CloudStack API.

SQLite bukan hanya output di akhir flow. Orchestrator, scheduler, dan executor menggunakan store sepanjang proses untuk membuat run, membaca state, serta mencatat setiap transisi, result, dan error. Pemisahan ini membuat core reusable, adapter integrasi mudah diganti, dan seluruh eksekusi dapat diaudit.
-->

---
layout: default
---

<div class="slide-kicker">NEXT ITERATION</div>

# Kekurangan & Peluang <span>Improvement</span>

<div class="bullet-columns">
  <div class="bullet-panel improve-panel">
    <h3>Reliability & Scale</h3>
    <ul>
      <li><b>Belum ada resume otomatis</b> untuk melanjutkan run setelah process crash atau restart.</li>
      <li><b>Concurrency belum dibatasi</b>; seluruh job ready dapat berjalan sekaligus.</li>
      <li><b>Retry masih sederhana</b>; perlu exponential backoff, jitter, dan klasifikasi error.</li>
      <li><b>Masih single-process + SQLite</b>; belum siap untuk distributed worker dan high availability.</li>
      <li><b>Belum resource-aware</b>; scheduler belum mempertimbangkan priority, quota, atau kapasitas worker.</li>
    </ul>
  </div>

  <div class="bullet-panel improve-panel">
    <h3>Product & Maintainability</h3>
    <ul>
      <li><b>Observability terbatas</b>; belum ada metrics, tracing, alerting, atau dashboard.</li>
      <li><b>Fan-out masih leaf-only</b>; hasil instance belum dapat menjadi dependency step berikutnya.</li>
      <li><b>Integrasi masih berupa fake API</b>; perlu hardening untuk auth, idempotency, dan error nyata.</li>
      <li><b>Interface hanya CLI</b>; API atau web UI akan memudahkan monitoring dan operasi tim.</li>
      <li><b>Belum ada staging E2E</b> untuk menguji perilaku terhadap CloudStack dan network failure nyata.</li>
    </ul>
  </div>
</div>

<div class="priority-note">
  <b>Prioritas berikutnya:</b> crash recovery, concurrency limit, lalu production observability.
</div>

<!--
Walaupun fitur dasarnya sudah cukup lengkap untuk sebuah proof of concept, masih ada beberapa hal yang perlu ditingkatkan sebelum digunakan pada environment production.

Prioritas pertama adalah reliability. Saat ini belum ada mekanisme resume otomatis setelah process restart. Scheduler juga langsung menjalankan seluruh job yang ready, sehingga ke depan perlu concurrency limit, priority, dan awareness terhadap quota atau kapasitas worker. Strategi retry juga sebaiknya dilengkapi exponential backoff dan jitter agar tidak menambah beban saat service sedang bermasalah.

Prioritas berikutnya adalah scalability dan operasional. Arsitektur masih single-process dengan SQLite, sehingga distributed worker dan high availability belum tersedia. Observability juga perlu diperluas dengan metrics, tracing, alerting, dan dashboard. Selain itu, integrasi perlu diuji terhadap CloudStack staging untuk memvalidasi authentication, idempotency, serta berbagai network failure yang tidak sepenuhnya tercakup oleh fake API.

Jadi, tiga improvement yang paling penting untuk tahap berikutnya adalah crash recovery, pembatasan concurrency, dan production observability.
-->
