---
layout: default
---

<div class="slide-kicker">LIMITATIONS & FUTURE IMPROVEMENTS</div>


# Kekurangan & Peluang <span>Improvement</span>
<div class="bullet-panel improve-panel">
<h3>For Next Iteration: </h3>
<ul>
<div v-click>
  <li><b>Belum ada resume otomatis</b> untuk melanjutkan run setelah process crash atau restart.</li>
</div>
<div v-click>
  <li><b>Concurrency belum dibatasi</b>; seluruh job ready dapat berjalan sekaligus.</li>
</div>
<div v-click>
  <li><b>Retry masih sederhana</b>; perlu exponential backoff, jitter, dan klasifikasi error.</li>
</div>
</ul>
</div>



<!--
Pertama, belum ada mekanisme resume otomatis. Jadi ketika process mengalami crash atau restart di tengah workflow, proses yang sebelumnya berjalan belum bisa langsung dilanjutkan dari state terakhir.

Kedua, concurrency juga belum dibatasi. Saat ini semua job yang statusnya sudah ready bisa dieksekusi secara bersamaan. Ke depannya, kita bisa menambahkan concurrency limit supaya penggunaan resource lebih terkontrol.

Terakhir, mekanisme retry masih cukup sederhana. Untuk implementasi yang lebih robust, retry bisa dikembangkan dengan exponential backoff, jitter, serta klasifikasi error, sehingga kita bisa menentukan error mana yang memang perlu di-retry dan mana yang sebaiknya langsung dianggap gagal.
-->
