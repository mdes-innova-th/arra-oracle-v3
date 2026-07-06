# Arra Oracle v3 — Known Issues

> รวมปัญหาที่ค้นพบจากการศึกษา — อัปเดต 2026-06-18

---

## A. ปัญหาเชิงโครงสร้าง / กระทบการ boot

### A-01 — `docs/architecture.md` ล้าสมัย

- **สถานะ:** ยืนยัน
- **รายละเอียด:**
  - เขียนว่าใช้ ChromaDB แต่ package.json ใช้ `@lancedb/lancedb` และ `sqlite-vec`
  - Endpoint เก่า เช่น `/consult` ไม่ได้อยู่ใน README endpoint table
  - `consult_log` ถูกอธิบายว่า active แต่ schema ระบุว่า legacy/retained
- **ผลกระทบ:** นักพัฒนาใหม่อาจสับสนระหว่างเอกสารกับโค้ดจริง
- **แนวทางแก้:** อัปเดต `docs/architecture.md` ให้สอดคล้องกับ `README.md` + `src/`
- **ความเสี่ยง:** กลาง

### A-02 — ชื่อ data dir default เป็น legacy

- **สถานะ:** ยืนยัน (`src/config.ts`)
- **รายละเอียด:** `ORACLE_DATA_DIR` default = `~/.arra-oracle-v2` ทั้งที่ repo เป็น v3
- **ผลกระทบ:** งงตอน debug หาไฟล์ data; อาจชนกับ v2 ถ้ารันคู่กัน
- **แนวทางแก้:** เปลี่ยน default เป็น `~/.arra-oracle-v3` พร้อม migration ข้อมูล v2
- **ความเสี่ยง:** กลาง

### A-03 — `repository.url` ใน `package.json` ชี้ v2

- **สถานะ:** ยืนยัน (`package.json` บรรทัด 24)
- **รายละเอียด:** `repository.url` = `https://github.com/Soul-Brews-Studio/arra-oracle-v2.git` แต่ README ชี้ `arra-oracle-v3`
- **ผลกระทบ:** `npm` / package metadata อาจ redirect ผิด
- **แนวทางแก้:** แก้ `repository.url` ให้ตรงกับ v3
- **ความเสี่ยง:** ต่ำ

---

## B. ปัญหาความปลอดภัย

### B-01 — HTTP API ไม่มี authentication เริ่มต้น

- **สถานะ:** ยังไม่ได้ verify ละเอียด
- **รายละเอียด:** `/api/search`, `/api/learn`, `/api/list` ดูเปิดโดย default (ต้องตรวจ `src/server/handlers.ts` อีกครั้ง)
- **ผลกระทบ:** หาก expose บน network ใครก็เรียก API ได้
- **แนวทางแก้:** ตรวจสอบ auth middleware; ถ้าไม่มีให้ document ให้ชัดว่าต้องใช้ reverse proxy + auth
- **ความเสี่ยง:** สูง (ถือ้า expose ข้างนอก)

### B-02 — Plugin autoload จาก data dir

- **สถานะ:** ยืนยัน (`src/server/plugin/loader.ts`)
- **รายละเอียด:** สามารถ drop plugin ลงใน `PLUGINS_DIR` แล้ว server โหลดรันได้
- **ผลกระทบ:** ถื่อ้า data dir ถูกแก้ไขโดยไม่ได้ตั้งใจ อาจ execute code ได้
- **แนวทางแก้:** Document ให้ชัด + ควร sign/verify plugin หรือ disable autoload บน production
- **ความเสี่ยง:** กลาง

---

## C. ปัญหาจากเอกสาร / UX

### C-01 — Onboarding path ซับซ้อน

- **สถานะ:** มี docs หลายอัน
- **รายละเอียด:** มี `docs/ONBOARDING.md`, `docs/LOCAL-DEV.md`, `docs/DOCKER-MCP-TOOLKIT.md`, `docs/INSTALL.md` แยกกัน
- **ผลกระทบ:** ผู้ใช้ใหม่ไม่รู้จะเริ่มจากไหน
- **แนวทางแก้:** `SETUP.md` ที่ repo root เป็น canonical quick-start; ลิงก์ไป docs ย่อย
- **ความเสี่ยง:** ต่ำ

### C-02 — Vector proxy / sidecar ยากต่อ debug

- **สถานะ:** ฟีเจอร์มีอยู่ (`src/vector-server.ts`, `VECTOR_URL`)
- **รายละเอียด:** การตั้งค่า vector proxy / embedded / disabled กระจายอยู่หลายไฟล์
- **ผลกระทบ:** ถือ้า vector search ไม่ทำงาน ยากต่อการ trace
- **แนวทางแก้:** `/api/health` ควรรายงาน vectorMode ชัดเจน (README ระบุว่า #1390 จะทำ)
- **ความเสี่ยง:** กลาง

---

## D. ปัญหาที่ยังเปิดจากโครงสร้าง repo

- `docs/architecture.md` ล้าสมัย
- `web/` และ `cli/` เป็น workspace ย่อยแต่ไม่มี README เป็นของตัวเอง
- `config.ts` references `src/const.ts` แต่ยังไม่ได้ศึกษาละเอียด
- ยังไม่ได้รัน test suite (`bun test`) ในครั้งนี้

---

*เขียน/อัปเดต: 2026-06-18 | Jit Oracle*
