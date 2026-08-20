---
layout: two-cols-header
---

<div class="slide-kicker">OVERVIEW</div>


# Challenge <span>Problem</span>

```mermaid 
flowchart LR
    VPC["vpc"]
    SUB["subnet"]
    ACL["acl-list"]
    RULE["acl-rule × N"]
    ATT["attach-acl"]
    VM["vm"]
    IP["public-ip"]
    NAT["static-nat"]

    VPC ~~~ SUB ~~~ ACL ~~~ RULE ~~~ ATT ~~~ VM ~~~ IP ~~~ NAT

    classDef root fill:#282c34,stroke:#e6edf3,color:#e6edf3,stroke-width:1px,font-size:14px;
    classDef work fill:#282c34,stroke:#e6edf3,color:#e6edf3,stroke-width:1px,font-size:14px;
    classDef fan fill:#282c34,stroke:#e6edf3,color:#e6edf3,stroke-width:1px,font-size:14px;

    class VPC,IP root;
    class SUB,ACL,ATT,VM,NAT work;
    class RULE fan;
```

<div v-click>

```mermaid
flowchart LR
    VPC["vpc"] --> SUB["subnet"]
    SUB --> ACL["acl-list"]
    ACL --> RULE["acl-rule × N"]
    RULE --> ATT["attach-acl"]
    ATT --> VM["vm"]
    VM --> IP["public-ip"]
    IP --> NAT["static-nat"]

    classDef root fill:#282c34,stroke:#61afef,color:#e6edf3,stroke-width:1px,font-size:14px;
    classDef work fill:#282c34,stroke:#98c379,color:#e6edf3,stroke-width:1px,font-size:14px;
    classDef fan fill:#282c34,stroke:#c678dd,color:#e6edf3,stroke-width:1px,font-size:14px;

    class VPC root;
    class SUB,ACL,ATT,VM,IP,NAT work;
    class RULE fan;
```
❌

</div>


<div v-click>

```mermaid
%%{init: {
  "themeVariables": {
    "fontSize": "14px"
  },
  "flowchart": {
    "nodeSpacing": 15,
    "rankSpacing": 60,
    "padding": 14
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
✅

</div>

<!--
- kita sudah tau problemnya semua, karna ini sudah dijelaskan kemarin, intinya gimana caranya kita handle job ini se-efisien mungkin
- sebenarnya job bisa jalan secara linear, tapi ini nggak efektif. satu job akan menunggu job yang lain
- nah challengenya adalah membuat job tersebut menjadi paralel. kita bisa atur. mana job yang bisa jalan bareng, dan mana job yang harus menunggu terlebih dahulu
- harusnya untuk penyelesaian masalah dari semua tim kurang lebih sama, karna problem yang dikasih juga sama.
- mungkin yang jadi pembeda ada di seberapa banyak fitur, tech stack, dan pertimbangan desain yang dipakai
-->

