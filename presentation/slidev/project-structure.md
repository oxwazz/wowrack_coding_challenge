---
layout: default
---

<div class="slide-kicker">PROJECT STRUCTURE</div>


# Struktur <span>Projek</span>

```text
src/
├── core/
│   ├── api-job-graph.ts      membangun dan memvalidasi alur serta dependensi job
│   ├── job-definition.ts     menggabungkan alur job dan konfigurasi case
│   ├── job-executor.ts       eksekusi, retry, timeout, dan rollback satu job
│   ├── scheduler.ts          mengatur urutan eksekusi job berdasarkan dependensi
│   ├── rollback.ts           mengatur urutan rollback deployment
│   └── deployment-orchestrator.ts pengatur utama proses deployment
├── database/
│   ├── __generated__/        database SQLite
│   ├── migrations/           skema dan seed data
│   └── store.ts              akses dan penyimpanan data
├── interfaces/cli/
│   ├── cases/                case demo
│   └── app.tsx               tampilan dan entry point CLI
└── requests/
    ├── api/                   satu file per command beserta query, props, dan return type
    ├── client.ts              HTTP client bersama
    └── deployment-steps.ts    definisi step, dependensi, serta run/rollback CloudStack

__test__/                      unit test
```


<!--
Untuk menjelaskan struktur ini saat presentasi, bisa dimulai dari gambaran besar, lalu fokus ke bagian core:

- src/core/ — Logic utama aplikasi
  - Bagian paling penting yang mengatur keseluruhan proses deployment.
  - api-job-graph.ts → membangun dan memvalidasi alur serta dependensi antar-job.
  - job-definition.ts → menggabungkan alur job dengan konfigurasi dari case yang akan dijalankan.
  - job-executor.ts → menjalankan satu job, termasuk menangani retry, timeout, error, dan rollback.
  - scheduler.ts → menentukan job mana yang sudah boleh dijalankan berdasarkan dependensinya.
  - rollback.ts → menentukan urutan rollback ketika deployment gagal.
  - deployment-orchestrator.ts → menjadi pengatur utama yang menghubungkan seluruh proses di core.

- src/database/ — Penyimpanan data
  - Menyimpan informasi yang dibutuhkan aplikasi menggunakan SQLite.
  - migrations/ berisi schema dan initial/seed data.
  - store.ts menjadi layer untuk membaca dan menyimpan data.

- src/interfaces/cli/ — Interface pengguna
  - Bagian yang berhubungan dengan CLI.
  - cases/ berisi beberapa skenario deployment untuk demo.
  - app.tsx menjadi entry point sekaligus tampilan CLI.

- src/requests/ — Komunikasi dengan CloudStack
  - api/ berisi command API, query/parameter, dan return type.
  - client.ts adalah HTTP client yang digunakan bersama.
  - deployment-steps.ts mendefinisikan setiap step, termasuk dependensi, proses run, dan rollback.

- __test__/ — Pengujian
  - Berisi unit test untuk memastikan setiap logic bekerja sesuai yang diharapkan.

Kalimat untuk presenter:

“Secara garis besar, project ini saya pisahkan berdasarkan responsibility. Bagian core menangani alur utama deployment dan dependensi antar-job, database untuk penyimpanan data, interfaces untuk interaksi melalui CLI, dan requests untuk komunikasi dengan CloudStack. Jadi masing-masing bagian punya tanggung jawab yang jelas, sementara logic utama deployment tetap terpusat di core.”
-->