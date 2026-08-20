---
layout: default
---

<div class="slide-kicker">DESIGN DECISIONS</div>


# Tiga Pendekatan, <span>Tiga Trade-off</span>

1. fully declarative
2. code-only
3. id-only.

<!--

[//]: # (- saat mengerjakan coding challenge ini, saya dan Mas Adit memikirkan apa pendekatan yang cocok untuk dieksekusi.)

[//]: # (- kami menemukan setidaknya 3 pendekatan: fully declarative, code-only, id-only.)

Saat mengerjakan coding challenge ini, saya dan Mas Adit berdiskusi dan mencoba memikirkan pendekatan yang paling cocok untuk menyelesaikan challenge tersebut. 

Kami mempertimbangkan bagaimana setiap pendekatan dapat diimplementasikan, seberapa mudah logic-nya dipahami, serta bagaimana nantinya solusi tersebut dapat dikembangkan jika kebutuhannya bertambah. 

Dari hasil diskusi dan eksplorasi tersebut, kami menemukan setidaknya tiga pendekatan yang dapat digunakan, yaitu Fully Declarative, Code-Only, dan ID-Only. 

Masing-masing pendekatan memiliki cara kerja, kelebihan, dan kekurangannya sendiri yang kemudian kami pertimbangkan sebelum menentukan pendekatan yang akan digunakan.
-->

---
layout: two-cols-header
---

<div class="slide-kicker">DESIGN DECISIONS</div>


# 1. Pendekatan <span>Fully Declarative</span>

::left::

```json
{
  "id": "deploy-vm",
  "name": "Deploy VM dengan Public IP",
  "jobs": [
    {
      "id": "vpc",
      "dependsOn": [],
      "run": {
        "command": "createVpc",
        "input": {
          "cidr": "$this.vpc.cidr",
          "name": "$this.vpc.name"
        }
      },
      "rollback": {
        "command": "deleteVpc",
        "input": {
          "id": "$jobs.vpc.result.id"
        }
      }
    },
    {
      "id": "subnet",
      "dependsOn": ["vpc"],
      "run": {
        "command": "createNetwork",
        "input": {
          "vpcid": "$jobs.vpc.result.id",
          "name": "$this.subnet.name",
          "gateway": "$this.subnet.gateway",
          "netmask": "$this.subnet.netmask"
        }
      },
      "rollback": {
        "command": "deleteNetwork",
        "input": {
          "id": "$jobs.subnet.result.id"
        }
      }
    },
    {
      "id": "vm",
      "dependsOn": ["subnet"],
      "run": {
        "command": "deployVirtualMachine",
        "input": {
          "networkids": "$jobs.subnet.result.id",
          "templateid": "$this.vm.templateId",
          "serviceofferingid": "$this.vm.serviceOfferingId"
        }
      },
      "rollback": {
        "command": "destroyVirtualMachine",
        "input": {
          "id": "$jobs.vm.result.id"
        }
      }
    }
  ]
}
```

::right::

<div v-click>

kelebihan:
- Mudah dibaca — flow terlihat langsung dari JSON.
- Tidak perlu hardcode flow — tidak perlu banyak if, await, try/catch, dan rollback manual di kode.
- hanya butuh file definition

kekurangan:
- Kurang fleksibel untuk logic kompleks — branching/dynamic flow lebih sulit.
- JSON bisa membesar — definition kompleks menjadi verbose.
- Perlu membuat DSL sendiri — misalnya when, foreach, retry, timeout, dll.
- Engine lebih kompleks — perlu resolver, dependency manager, state management, rollback, dll.
- Expression terbatas — $jobs.x.result.y akhirnya bisa berkembang menjadi bahasa scripting sendiri.

</div>

<!--

[//]: # (- Learning curve nya susah karena developer perlu memahami aturan/semantics definition engine.)

[//]: # (- susah dimaintain karena seperti membuat bahasa pemrograman sendiri akhirnya.)

[//]: # (- belum lagi debugging, akan sulit untuk mencari issuenya.)

Alurnya kurang lebih seperti ini:
- Semua workflow didefinisikan di dalam definition, mulai dari dependency, command yang dijalankan, input, sampai rollback.
- Engine membaca dependsOn untuk menentukan urutan eksekusi job.
- Contohnya, vpc dijalankan terlebih dahulu karena tidak punya dependency.
- Setelah vpc selesai, hasilnya bisa direferensikan oleh subnet melalui $jobs.vpc.result.id.
- Setelah subnet selesai, barulah vm bisa dijalankan.
- Kalau terjadi kegagalan, engine membaca bagian rollback untuk mengembalikan resource yang sudah dibuat sebelumnya.
Jadi intinya, engine hanya bertugas membaca dan mengeksekusi definition, sedangkan hampir seluruh aturan workflow sudah didefinisikan secara declarative.

Saya tidak memilih pendekatan ini karena.

1. Learning curve cukup tinggi, karena developer perlu memahami terlebih dahulu aturan dan semantics yang digunakan oleh definition engine sebelum bisa mengembangkan atau melakukan perubahan pada workflow.

2. Lebih sulit untuk di-maintain, karena seiring bertambahnya kebutuhan dan aturan, pendekatan ini bisa berkembang menjadi seperti membuat bahasa pemrograman sendiri. Akibatnya, kompleksitas definition engine juga akan terus bertambah.

3. Proses debugging menjadi lebih sulit, terutama ketika terjadi error pada workflow. Developer perlu mencari tahu apakah masalah berasal dari definition, aturan pada engine, dependency antar-step, atau dari proses eksekusinya sendiri.
-->

---
layout: two-cols-header
---

<div class="slide-kicker">DESIGN DECISIONS</div>


# 2. Pendekatan <span>Code-Only</span>

::left::

```md {3-4}
| id | name          | definition_id            |
|----|---------------|--------------------------|
| 1  | ...           | deploy-vm                |
| 2  | ...           | deploy-vm-with-public-ip |
```

1. deploy vm tanpa public ip

call function di kodingan dengan definition id: `deploy-vm`

2. deploy vm dengan public ip

call function di kodingan dengan definition id: `deploy-vm-with-public-ip`

```ts
const definitions = {
  "deploy-vm": [
    { id: "vpc",        dependsOn: [],                  run: () => {}, rollback: () => {} },
    { id: "subnet",     dependsOn: ["vpc"],             run: () => {}, rollback: () => {} },
    { id: "vm",         dependsOn: ["subnet"],          run: () => {}, rollback: () => {} },
  ],

  "deploy-vm-with-public-ip": [
    { id: "vpc",        dependsOn: [],                  run: () => {}, rollback: () => {} },
    { id: "subnet",     dependsOn: ["vpc"],             run: () => {}, rollback: () => {} },
    { id: "vm",         dependsOn: ["subnet"],          run: () => {}, rollback: () => {} },
    { id: "public-ip",  dependsOn: [],                  run: () => {}, rollback: () => {} },
    { id: "static-nat", dependsOn: ["vm", "public-ip"], run: () => {}, rollback: () => {} },
  ],
};
```

::right::

<div v-click>

kelebihan:
- Simpel - karena di database hanya perlu menyimpan definition_id.
- Logic lebih fleksibel - karena semuanya ditulis langsung di code.
- Mudah menangani logic kompleks - karena tidak dibatasi oleh format atau aturan definition engine.

kekurangan:
- Terlalu statis - setiap ada kombinasi workflow baru perlu menambahkan definition baru di code.
- Banyak redundansi code - karena antar-definition kemungkinan memiliki banyak job yang sama.

</div>

<!--
Alurnya cukup sederhana:
- Di database kita hanya menyimpan definition_id.
- definition_id tersebut digunakan untuk mencari definition yang ada di code.
- Misalnya deploy-vm, maka engine menjalankan rangkaian job untuk deploy VM biasa.
- Kalau deploy-vm-with-public-ip, engine menjalankan definition yang sudah ditambahkan job public-ip dan static-nat.
- Semua dependency, run, dan rollback ditulis langsung di code.
Jadi intinya, database hanya menentukan definition mana yang dipakai, sedangkan seluruh logic workflow ada di code.

Saya juga tidak memilih pendekatan ini karena meskipun implementasinya simpel dan fleksibel dari sisi coding, pendekatan ini akan menjadi terlalu statis ketika jumlah workflow dan kombinasinya bertambah. Setiap ada kombinasi baru, kita perlu menambahkan handling baru di code.

Selain itu, karena beberapa workflow kemungkinan memiliki step yang mirip, akan muncul cukup banyak redundansi code. Dalam jangka panjang, semakin banyak kombinasi yang perlu didukung, semakin banyak pula code yang harus ditambahkan dan di-maintain. Jadi, pendekatan ini cukup mudah untuk kebutuhan sederhana, tetapi kurang scalable dan kurang nyaman untuk dikembangkan ketika variasi workflow semakin banyak.
-->

---
layout: two-cols-header
---

<div class="slide-kicker">DESIGN DECISIONS</div>

# 3. Pendekatan <span>ID-Only</span>

```md {3-4}
| id                            | name          | definition                                                             |
|-------------------------------|---------------|------------------------------------------------------------------------|
| deploy-vm-without-public-ip   | ...           | [vpc, subnet, acl-list, acl-rule, attach-acl, vm]                       |
| deploy-vm-with-public-ip      | ...           | [vpc, subnet, acl-list, acl-rule, attach-acl, vm, public-ip, static-nat] |
| deploy-vpc-with-acl-rules     | ...           | [vpc, acl-list, acl-rule]                                               |
| deploy-vm-with-missing-subnet | ...           | [vpc, acl-list, vm]                                                     |
| deploy-vm-with-unknown-jobs  | ...           | [vpc-new, acl-list, vm-new]                                             |
```

::left::

```ts
function createDeploymentSteps(client: FakeCloudStackClient) {
    return {
        "vpc":        { dependsOn: [],                     run: () => {}, rollback: () => {} },
        "subnet":     { dependsOn: ["vpc"],                run: () => {}, rollback: () => {} },
        "acl-list":   { dependsOn: ["vpc"],                run: () => {} },
        "acl-rule":   { dependsOn: ["acl-list"],           run: () => {} },
        "attach-acl": { dependsOn: ["subnet", "acl-list"], run: () => {} },
        "vm":         { dependsOn: ["subnet"],             run: () => {}, rollback: () => {} },
        "public-ip":  { dependsOn: [],                     run: () => {} },
        "static-nat": { dependsOn: ["vm", "public-ip"],    run: () => {} },
    }
}
```

::right::

<div v-click>

kelebihan:
- Lebih simpel 
- Mudah direuse 
- Tidak ada duplikasi logic 

kekurangan:
- Fleksibilitas lebih terbatas 
- Konfigurasi job ada di code
- Step baru perlu ditambahkan ke registry
- Definition tidak menyimpan detail job

</div>

<!--
Untuk pendekatan ini:

- Di database, definition hanya menyimpan kumpulan ID job yang ingin dijalankan.
- Detail setiap job seperti dependency, run, dan rollback tetap berada di code.
- Engine membaca daftar ID dari database, kemudian mencocokkannya dengan job yang tersedia di code.
- Untuk membuat kombinasi workflow baru, kita cukup menyusun ulang atau menambahkan ID job di definition, tanpa membuat seluruh workflow dari awal.

Intinya, database menentukan job apa yang dijalankan, sedangkan code menentukan bagaimana job tersebut dijalankan.


kelebihan:
- Lebih simpel — definition di DB cukup berisi daftar ID job yang akan dijalankan
- Mudah direuse — job yang sama bisa dipakai oleh banyak definition tanpa copy-paste.
- Tidak ada duplikasi logic — vpc, subnet, vm, dll hanya didefinisikan sekali.

kekurangan:
- Fleksibilitas lebih terbatas — tapi masih cukup selama job yang dibutuhkan sudah terdaftar.
- Konfigurasi job ada di code — tapi ini membuat behavior lebih terkontrol dan mudah dilacak.
- Step baru perlu ditambahkan ke registry — tapi prosesnya sederhana dan hanya dilakukan di satu tempat.
- Definition tidak menyimpan detail job — tapi hasilnya definition jadi lebih ringkas dan mudah dibaca.

Untuk challenge ini, kami lebih memilih pendekatan ini karena implementasinya lebih sederhana dan alur logic-nya lebih mudah dipahami. Setiap definition cukup menentukan ID dari job yang dibutuhkan, sedangkan detail seperti dependency, proses run, dan rollback tetap dikelola di satu tempat. 

Dengan struktur seperti ini, code menjadi lebih mudah dibaca, di-maintain, dan dikembangkan ketika nantinya perlu menambahkan job atau workflow baru.
-->

