# Arra Oracle v3 — Risk Register

> ความเสี่ยงที่พบจากการศึกษา + ลำดับการแก้ที่ปลอดภัย — อัปเดต 2026-06-18

---

## ระดับความรุนแรง

| ระดับ | ความหมาย |
|-------|---------|
| 🔴 CRITICAL | Security หรือระบบพัง; ต้องแก้ก่อน deploy |
| 🟠 HIGH | ฟีเจอร์หลักใช้ไม่ได้ หรือเอกสารผิดพลาดจน误导 |
| 🟡 MEDIUM | UX/quality debt; ควรแก้ใน sprint ถัดไป |
| 🟢 LOW | ไม่กระทบการใช้งานหลัก |

---

## 1. Security Risks

| ID | Risk | ไฟล์ | ผลกระทบ | แนวทางแก้ | ระดับ |
|----|------|------|---------|-----------|------|
| R-SEC-01 | HTTP API เปิดโดย default โดยไม่มี auth | `src/server.ts`, `src/server/handlers.ts` | ถ้า expose บน network ใครก็เรียก `/api/learn`, `/api/search` ได้ | ตรวจ auth middleware หรือ document ให้ชัดว่าต้องใช้ reverse proxy + auth | 🔴 |
| R-SEC-02 | Plugin autoload รัน code จาก data dir | `src/server/plugin/loader.ts` | Plugin อันตรายที่ถูก drop ลง data dir จะ execute ได้ | Sign/verify plugin หรือ disable autoload บน production | 🟠 |
| R-SEC-03 | `/api/file` path traversal potential | `src/server/handlers.ts` | ถือ้า realpath check มี bug อาจอ่านไฟล์นอก REPO_ROOT | Audit path validation; ensure `fs.realpathSync` + prefix check | 🟡 |

---

## 2. Documentation / Operational Risks

| ID | Risk | ผลกระทบ | แนวทางแก้ | ระดับ |
|----|------|---------|-----------|------|
| R-DOC-01 | `docs/architecture.md` ล้าสมัย (ChromaDB,  endpoints เก่า) | นักพัฒนาใหม่สับสน | อัปเดตให้ตรงกับ `README.md` และโค้ดจริง | 🟠 |
| R-DOC-02 | Data dir default เป็น `.arra-oracle-v2` | งงตอน debug; อาจชนกับ v2 | เปลี่ยน default เป็น v3 พร้อม migration | 🟠 |
| R-DOC-03 | `repository.url` ใน `package.json` ชี้ v2 | Package metadata ผิด | แก้ URL ให้ตรงกับ v3 | 🟢 |
| R-DOC-04 | Onboarding กระจายหลายไฟล์ | ผู้ใช้ใหม่ไม่รู้จะเริ่มจากไหน | ใช้ `SETUP.md` เป็น canonical entrypoint | 🟡 |

---

## 3. Functional / Runtime Risks

| ID | Risk | ไฟล์ | ผลกระทบ | แนวทางแก้ | ระดับ |
|----|------|------|---------|-----------|------|
| R-FUNC-01 | Vector search ซับซ้อน / hard to debug | `src/vector/`, `src/vector-server.ts` | Search ไม่ทำงานแล้วหาไม่เจอว่าทำไม | `/api/health` รายงาน vectorMode ชัดเจน; log ละเอียดขึ้น | 🟡 |
| R-FUNC-02 | Indexer queue (`indexingJobs`) อาจค้าง | `src/db/schema.ts` | Vector embedding ค้างเป็น pending แล้วไม่ embed | สร้าง daemon/schedule มา process queue | 🟡 |
| R-FUNC-03 | MCP alias system ซับซ้อน | `src/index.ts` | Legacy prefix อาจทำให้ tool ชื่องง | ค่อยๆ deprecate legacy prefixes | 🟢 |

---

## 4. Safe Improvement Order

ถือ้าได้รับอนุมัติให้เริ่มแก้ แนะนำลำดับนี้:

1. **P0 — Verify HTTP API auth** (`R-SEC-01`): ตรวจว่ามี auth middleware หรือไม่; ถือ้าไม่มีให้ document + add reverse proxy requirement
2. **P0 — Fix critical metadata** (`R-DOC-02`, `R-DOC-03`): แก้ `package.json` repository URL, วางแผน rename data dir
3. **P1 — Update `docs/architecture.md`** (`R-DOC-01`): LanceDB, current endpoints, current schema
4. **P1 — Plugin autoload hardening** (`R-SEC-02`): sign/verify หรือ allowlist
5. **P2 — Vector debuggability** (`R-FUNC-01`): health report + structured logging
6. **P2 — Consolidate onboarding** (`R-DOC-04`): ลิงก์จาก `SETUP.md` ไป docs ย่อย

---

## 5. Approval Gate

ก่อนเริ่มงานแก้ไขใดๆ ที่ไม่ใช่ doc-only:
- **BigBoss ต้องอนุมัติ** การเปลี่ยน data dir default, security refactor, หรือ plugin system
- งาน doc-only / metadata fix (`package.json` URL) สามารถทำได้ทันที แต่ต้อง commit ชัดเจน

---

*เขียน/อัปเดต: 2026-06-18 | Jit Oracle*
