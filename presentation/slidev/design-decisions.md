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

Saat mengerjakan coding challenge ini, saya dan Mas Adit berdiskusi dan mencoba memikirkan pendekatan yang paling cocok untuk menyelesaikan challenge tersebut. Kami mempertimbangkan bagaimana setiap pendekatan dapat diimplementasikan, seberapa mudah logic-nya dipahami, serta bagaimana nantinya solusi tersebut dapat dikembangkan jika kebutuhannya bertambah. Dari hasil diskusi dan eksplorasi tersebut, kami menemukan setidaknya tiga pendekatan yang dapat digunakan, yaitu Fully Declarative, Code-Only, dan ID-Only. Masing-masing pendekatan memiliki cara kerja, kelebihan, dan kekurangannya sendiri yang kemudian kami pertimbangkan sebelum menentukan pendekatan yang akan digunakan.
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
          "cidr": "$case.vpc.cidr",
          "name": "$case.vpc.name"
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
          "name": "$case.subnet.name",
          "gateway": "$case.subnet.gateway",
          "netmask": "$case.subnet.netmask"
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
          "templateid": "$case.vm.templateId",
          "serviceofferingid": "$case.vm.serviceOfferingId"
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

kelebihan:
- Mudah dibaca — flow terlihat langsung dari JSON.
- Tidak perlu hardcode flow — tidak perlu banyak if, await, try/catch, dan rollback manual di kode.
- hanya butuh 1 file definition

kekurangan:
- Kurang fleksibel untuk logic kompleks — branching/dynamic flow lebih sulit.
- JSON bisa membesar — definition kompleks menjadi verbose.
- Perlu membuat DSL sendiri — misalnya when, foreach, retry, timeout, dll.
- Engine lebih kompleks — perlu resolver, dependency manager, state management, rollback, dll.
- Expression terbatas — $jobs.x.result.y akhirnya bisa berkembang menjadi bahasa scripting sendiri.

<!--

[//]: # (- Learning curve nya susah karena developer perlu memahami aturan/semantics definition engine.)

[//]: # (- susah dimaintain karena seperti membuat bahasa pemrograman sendiri akhirnya.)

[//]: # (- belum lagi debugging, akan sulit untuk mencari issuenya.)

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
| id | name          | worflow_id                |
|----|---------------|---------------------------|
| 1  | ...           | deploy-vm                 |
| 2  | ...           | deploy-vm-with-public-ip  |
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

kelebihan:
- simpel karena di db hanya menyimpan definition id saja
- semua logic ada di code. mau sekomplex apapun harusnya bisa dihandle

kekurangan:
- terlalu statis. tiap ada kombinasi baru butuh handle baru di kodingan.
- akan banyak redudansi code. karena kemiripan kombinasi yang dibuat


<!--
Saya juga tidak memilih pendekatan ini karena meskipun implementasinya simpel dan fleksibel dari sisi coding, pendekatan ini akan menjadi terlalu statis ketika jumlah workflow dan kombinasinya bertambah. Setiap ada kombinasi baru, kita perlu menambahkan handling baru di code.

Selain itu, karena beberapa workflow kemungkinan memiliki step yang mirip, akan muncul cukup banyak redundansi code. Dalam jangka panjang, semakin banyak kombinasi yang perlu didukung, semakin banyak pula code yang harus ditambahkan dan di-maintain. Jadi, pendekatan ini cukup mudah untuk kebutuhan sederhana, tetapi kurang scalable dan kurang nyaman untuk dikembangkan ketika variasi workflow semakin banyak.
-->

---
layout: two-cols-header
---

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

kelebihan:
- Lebih simpel 
- Mudah direuse 
- Tidak ada duplikasi logic 

kekurangan:
- Fleksibilitas lebih terbatas 
- Konfigurasi job ada di code
- Dependency bersifat tetap
- Step baru perlu ditambahkan ke registry
- Definition tidak menyimpan detail job
- Custom behavior per workflow lebih terbatas 

<!--
kelebihan:
- Lebih simpel — definition di DB cukup berisi daftar ID job yang akan dijalankan
- Mudah direuse — job yang sama bisa dipakai oleh banyak definition tanpa copy-paste.
- Tidak ada duplikasi logic — vpc, subnet, vm, dll hanya didefinisikan sekali.

kekurangan:
- Fleksibilitas lebih terbatas — tapi masih cukup selama job yang dibutuhkan sudah terdaftar.
- Konfigurasi job ada di code — tapi ini membuat behavior lebih terkontrol dan mudah dilacak.
- Dependency bersifat tetap — tapi justru membuat aturan antar-job lebih konsisten.
- Step baru perlu ditambahkan ke registry — tapi prosesnya sederhana dan hanya dilakukan di satu tempat.
- Definition tidak menyimpan detail job — tapi hasilnya definition jadi lebih ringkas dan mudah dibaca.
- Custom behavior per workflow lebih terbatas — tapi untuk kebanyakan workflow, reuse behavior yang sama sudah cukup.


Untuk challenge ini, kami lebih memilih pendekatan ini karena implementasinya lebih sederhana dan alur logic-nya lebih mudah dipahami. Setiap definition cukup menentukan ID dari job yang dibutuhkan, sedangkan detail seperti dependency, proses run, dan rollback tetap dikelola di satu tempat. 

Dengan struktur seperti ini, code menjadi lebih mudah dibaca, di-maintain, dan dikembangkan ketika nantinya perlu menambahkan job atau workflow baru.
-->

