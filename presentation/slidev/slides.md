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

::left::

```mermaid
%%{init: {
  "themeVariables": {
    "fontSize": "14px"
  },
  "flowchart": {
    "nodeSpacing": 15,
    "rankSpacing": 40,
    "padding": 10
  }
}}%%

flowchart LR
    VPC["vpc"] --> SUB["subnet"]
    VPC --> ACL["acl-list"]
    ACL --> RULE["acl-rule × N"]
    SUB --> ATT["attach-acl"]
    ACL --> ATT
    SUB --> VM["vm"]
    IP["public-ip"] --> NAT["static-nat"]
    VM --> NAT

    classDef root fill:#282c34,stroke:#61afef,color:#e6edf3,stroke-width:1px,font-size:14px;
    classDef work fill:#282c34,stroke:#98c379,color:#e6edf3,stroke-width:1px,font-size:14px;
    classDef fan fill:#282c34,stroke:#c678dd,color:#e6edf3,stroke-width:1px,font-size:14px;

    class VPC,IP root;
    class SUB,ACL,ATT,VM,NAT work;
    class RULE fan;
```

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
    </ul>
  </div>

  <div class="bullet-panel feature-panel">
    <h3>Reliability & Operations</h3>
    <ul>
      <li><b>Retry dan timeout</b> yang dapat diatur per case, step, maupun instance.</li>
      <li><b>Automatic rollback</b> dalam urutan terbalik ketika deployment gagal.</li>
      <li><b>Persistent audit trail</b> melalui SQLite dan append-only status log.</li>
      <li><b>Interactive CLI & 11 demo cases</b> untuk success, failure, retry, dan rollback.</li>
    </ul>
  </div>
</div>

<div class="statement-strip compact-strip">
  <span class="dot"></span>
  <span>Satu flow mencakup <strong>validasi → eksekusi → retry → rollback → persistence</strong>.</span>
</div>

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
    </ul>
  </div>

  <div class="bullet-panel improve-panel">
    <h3>Product & Maintainability</h3>
    <ul>
      <li><b>Observability terbatas</b>; belum ada metrics, tracing, alerting, atau dashboard.</li>
      <li><b>Fan-out masih leaf-only</b>; hasil instance belum dapat menjadi dependency step berikutnya.</li>
      <li><b>Integrasi masih berupa fake API</b>; perlu hardening untuk auth, idempotency, dan error nyata.</li>
      <li><b>Interface hanya CLI</b>; API atau web UI akan memudahkan monitoring dan operasi tim.</li>
    </ul>
  </div>
</div>

<div class="priority-note">
  <b>Prioritas berikutnya:</b> crash recovery, concurrency limit, lalu production observability.
</div>
