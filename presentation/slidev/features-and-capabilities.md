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
Pertama, Sebelum proses dijalankan, sistem akan melakukan validasi terhadap definition untuk memastikan seluruh konfigurasi sudah benar. Setelah itu, setiap job dijadwalkan berdasarkan status dependency-nya. Job yang dependency-nya telah selesai dapat langsung dijalankan secara paralel sehingga proses deployment menjadi lebih cepat dan efisien. Sistem juga mendukung konsep fan-out, yaitu satu step dapat menghasilkan beberapa instance berdasarkan input yang diberikan.

Selanjutnya, Setiap step memiliki konfigurasi retry dan timeout yang dapat disesuaikan. Jika terjadi kegagalan, sistem akan meneruskan status tersebut ke proses terkait melalui mekanisme cancel dan skipped. Kami juga menyediakan automatic rollback yang dijalankan dengan urutan terbalik untuk mengembalikan sistem ke kondisi sebelumnya. Selain itu, hasil dan status dari setiap job run disimpan secara persisten, sehingga dapat digunakan untuk pemantauan dan kebutuhan audit.
-->
