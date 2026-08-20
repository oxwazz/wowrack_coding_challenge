---
layout: default
---

<div class="slide-kicker">FEATURES & CAPABILITIES · CORE FLOW</div>


# Dari Case Menjadi <span>Job Run</span>

<div class="code-explain">
<div>

```ts
async deployCase(deploymentCase, jobRunId) {
  const maxTimeout = caseMaxTimeout(deploymentCase)

  return this.runJobRun(
    await this.createJobRunFromCase(
      deploymentCase,
      jobRunId,
    ),
    maxTimeout,
  )
}
```

<p class="source tight"><code>core/deployment-orchestrator.ts</code> · disederhanakan</p>
</div>

<div class="numbered-flow">
  <div>
    <b>01</b>
    <span><strong>Ambil definition</strong><small>Case menunjuk template job yang tersimpan di database.</small></span>
  </div>
  <div>
    <b>02</b>
    <span><strong>Resolve dan validasi</strong><small>Step ID digabung dengan registry, lalu dependency dan cycle diperiksa.</small></span>
  </div>
  <div>
    <b>03</b>
    <span><strong>Buat snapshot runtime</strong><small>Input, retry, timeout, dan instance disimpan sebagai <code>JobDefinition[]</code>.</small></span>
  </div>
  <div>
    <b>04</b>
    <span><strong>Jalankan scheduler</strong><small>Orchestrator menyerahkan job run yang sudah konkret ke scheduler.</small></span>
  </div>
</div>
</div>

<!--
Alur core dimulai dari DeploymentOrchestrator sebagai pintu masuk utama. Ketika deployCase dipanggil, orchestrator membaca definition yang dipilih oleh case dari database.

Definition tersebut belum langsung dieksekusi. resolveJobCase lebih dulu mencocokkan setiap step ID dengan deploymentSteps registry. Pada tahap ini buildApiJobGraph memastikan tidak ada step yang tidak dikenal, dependency yang hilang, ID duplikat, dependency cycle, atau penggunaan fan-out yang tidak valid.

Setelah valid, konfigurasi case dioverlay ke setiap step. Defaults dapat dioverride oleh konfigurasi step, lalu oleh named instance. Hasilnya adalah JobDefinition runtime yang konkret dan disimpan sebagai snapshot. Baru setelah itu job run diserahkan ke Scheduler untuk dieksekusi.
-->

---
layout: default
---

<div class="slide-kicker">CORE FLOW · SCHEDULING</div>

# Dependency Menentukan <span>Kapan Job Jalan</span>

<div class="code-explain scheduler-code">
<div>

```ts
for (const job of definitions) {
  if (remaining.get(job.id) === 0)
    await enqueue(job.id)
}

while (ready.length > 0 || running.size > 0) {
  while (ready.length > 0) {
    const jobId = ready.shift()!
    running.set(jobId, execute(jobId))
  }

  const completed = await Promise.race(
    [...running.values()].map(({ result }) => result),
  )
}
```

<p class="source tight"><code>core/scheduler.ts</code> · disederhanakan</p>
</div>

<div class="numbered-flow">
  <div>
    <b>01</b>
    <span><strong>Hitung dependency</strong><small><code>remaining</code> menyimpan jumlah dependency yang belum selesai.</small></span>
  </div>
  <div>
    <b>02</b>
    <span><strong>Masukkan job ready</strong><small>Job tanpa dependency berubah dari <code>PENDING</code> ke <code>READY</code>.</small></span>
  </div>
  <div>
    <b>03</b>
    <span><strong>Eksekusi paralel</strong><small>Semua job ready dimulai tanpa menunggu job independen lainnya.</small></span>
  </div>
  <div>
    <b>04</b>
    <span><strong>Buka dependent</strong><small>Setelah sukses, counter child dikurangi; nol berarti child siap jalan.</small></span>
  </div>
</div>
</div>

<!--
Scheduler tidak mengandalkan urutan array sebagai urutan eksekusi. Scheduler membangun dua index: dependents untuk mengetahui job mana yang menunggu sebuah job, dan remaining untuk menghitung berapa dependency yang belum selesai.

Semua job dengan remaining nol dimasukkan ke ready queue. Scheduler kemudian memulai seluruh job yang ready. Karena tiap eksekusi disimpan di map running, job-job independen dapat berjalan paralel.

Promise.race dipakai agar scheduler langsung merespons job pertama yang selesai. Jika job tersebut sukses, nilai remaining milik setiap dependent dikurangi. Ketika nilainya menjadi nol, dependent masuk ke ready queue. Dengan alur ini, dependency tetap aman tanpa mengorbankan parallel execution.
-->

---
layout: default
---

<div class="slide-kicker">CORE FLOW · RELIABILITY</div>

# Gagal Ditangani Sampai <span>Rollback</span>

<div class="code-explain failure-code">
<div>

```ts
const outcome = await executor.execute(...)

if (!outcome.success) {
  await stopAfterFailure(jobId)
  // abort job aktif
  // pending/ready/retrying -> SKIPPED
}

if (failedBy !== undefined) {
  await rollbackSuccessfulJobs(
    store, executor, jobRunId, definitions,
  )
}
```

<p class="source tight"><code>core/scheduler.ts</code> · disederhanakan</p>
</div>

<div class="numbered-flow">
  <div>
    <b>01</b>
    <span><strong>Retry per job</strong><small><code>JobExecutor</code> mengulang attempt sampai batas <code>maxRetries</code>.</small></span>
  </div>
  <div>
    <b>02</b>
    <span><strong>Timeout dan cancel</strong><small><code>AbortSignal</code> menghentikan attempt yang melewati batas atau terdampak failure.</small></span>
  </div>
  <div>
    <b>03</b>
    <span><strong>Failure propagation</strong><small>Job aktif dibatalkan; job yang belum jalan ditandai <code>SKIPPED</code>.</small></span>
  </div>
  <div>
    <b>04</b>
    <span><strong>Rollback terbalik</strong><small>Step yang sudah sukses di-rollback dari urutan terakhir ke pertama.</small></span>
  </div>
</div>
</div>

<!--
Reliability dibagi antara JobExecutor dan Scheduler. JobExecutor bertanggung jawab pada satu job: mengubah status menjadi RUNNING, menjalankan handler dengan timeout, menyimpan result, dan melakukan retry bila masih ada kesempatan.

Jika seluruh retry habis, Scheduler melakukan failure propagation. Status run diubah menjadi FAILED, job yang masih aktif dibatalkan melalui AbortController, sedangkan job PENDING, READY, atau RETRYING ditandai SKIPPED agar tidak pernah ikut dieksekusi.

Sesudah seluruh job aktif berhenti, rollbackSuccessfulJobs mengambil job yang sudah SUCCESS dan memprosesnya dengan urutan definition terbalik. Setiap rollback juga mempunyai retry dan timeout sendiri. Seluruh transisi status disimpan melalui OrchestratorStore, sehingga hasil akhir dan riwayat proses tetap dapat diperiksa.
-->

---
layout: default
---

<div class="slide-kicker">CORE FLOW · SUMMARY</div>

# Kapabilitas yang Dihasilkan <span>Core</span>

<div class="bullet-columns">
  <div class="bullet-panel feature-panel">
    <h3>Orchestration</h3>
    <ul>
      <li><b>Validasi definition</b> sebelum runtime dibuat.</li>
      <li><b>Dependency-aware scheduling</b> berdasarkan status dependency.</li>
      <li><b>Parallel execution</b> untuk seluruh job yang sudah ready.</li>
      <li><b>Fan-out instance</b> untuk satu step dengan beberapa input.</li>
    </ul>
  </div>

  <div class="bullet-panel feature-panel">
    <h3>Reliability</h3>
    <ul>
      <li><b>Retry dan timeout</b> yang dapat diatur per step.</li>
      <li><b>Failure propagation</b> melalui cancel dan status skipped.</li>
      <li><b>Automatic rollback</b> dengan urutan terbalik.</li>
      <li><b>Persistent state</b> untuk result dan audit setiap job run.</li>
    </ul>
  </div>
</div>

<div class="statement-strip compact-strip">
  <span class="dot"></span>
  <span><strong>Orchestrator</strong> membentuk run, <strong>Scheduler</strong> mengatur dependency, dan <strong>Executor</strong> menjaga eksekusinya.</span>
</div>

<!--
Jadi, fitur yang terlihat di aplikasi sebenarnya dihasilkan oleh pembagian responsibility di core.

DeploymentOrchestrator membentuk dan menyimpan job run. Scheduler menentukan kapan setiap job boleh berjalan dan memungkinkan job independen berjalan paralel. JobExecutor menangani detail satu attempt, termasuk retry, timeout, penyimpanan result, dan rollback handler.

Kombinasi ketiganya membuat flow deployment tidak sekadar menjalankan API secara berurutan, tetapi memiliki validasi sebelum eksekusi, parallel scheduling, failure propagation, automatic rollback, dan state yang tetap tersimpan untuk kebutuhan inspeksi.
-->
