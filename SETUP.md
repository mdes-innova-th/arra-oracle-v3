# Arra Oracle v3 — Setup Guide

> คู่มือติดตั้งและเปิดเครื่องมือพัฒนา — อัปเดต 2026-06-18

---

## สิ่งที่ต้องมีก่อน

- [Bun](https://bun.sh) >= 1.3.0 (ติดตั้งด้วย `curl -fsSL https://bun.sh/install | bash`)
- `git`
- `curl` (สำหรับ smoke test)
- (Optional) `gh` CLI

ตรวจสอบ:

```bash
bun --version   # >= 1.3.0
```

---

## 1. ติดตั้ง Dependencies

```bash
cd C:\Users\MDES-DEV-NB\Jit\workspaces\arra-oracle-v3
bun install
```

---

## 2. เปิด HTTP API Server

```bash
ORACLE_PORT=47778 bun run src/server.ts
```

ทดสอบ:

```bash
curl http://localhost:47778/api/health
```

ควรได้คำตอบคล้าย `{"status":"ok", ...}`

---

## 3. เปิด MCP Server (Claude Code)

```bash
claude mcp add arra-oracle-v2 -- bunx --bun --package github:Soul-Brews-Studio/arra-oracle-v3 arra-oracle-v2
```

หรือเพิ่มใน `~/.claude.json`:

```json
{
  "mcpServers": {
    "arra-oracle-v2": {
      "command": "bunx",
      "args": ["--bun", "--package", "github:Soul-Brews-Studio/arra-oracle-v3", "arra-oracle-v2"]
    }
  }
}
```

---

## 4. เปิด Web Dashboard (Astro)

```bash
cd web
PUBLIC_BACKEND_URL=http://localhost:47778 bun run dev
```

เปิดที่ URL ที่ Astro แสดง (ปกติ http://localhost:4321)

ถื่อ้าติด CORS ให้สตาร์ท server ด้วย:

```bash
CORS_ORIGIN=http://localhost:4321 ORACLE_PORT=47778 bun run src/server.ts
```

---

## 5. เปิด Operator CLI

```bash
cd cli
bun run src/cli.ts --help
```

ตัวอย่าง search:

```bash
bun run src/cli.ts search "oracle principles"
```

---

## 6. เตรียม Knowledge Base (ψ/)

ตัวเลือก 1 — ใช้ project root ถ้ามี `ψ/` อยู่แล้ว:

```bash
ORACLE_REPO_ROOT=C:\Users\MDES-DEV-NB\Jit bun run src/server.ts
```

ตัวเลือก 2 — ใช้ data dir default:

```bash
ORACLE_DATA_DIR=C:\Users\MDES-DEV-NB\.arra-oracle-v2 bun run src/server.ts
```

จากนั้น index เนื้อหา:

```bash
bun run src/indexer/cli.ts scan
bun run src/indexer/cli.ts reindex
```

หรือผ่าน HTTP API:

```bash
curl -X POST http://localhost:47778/api/indexer/scan
curl -X POST http://localhost:47778/api/indexer/reindex
```

---

## 7. Environment Variables ที่ใช้บ่อย

| Variable | ค่า default | ใช้ทำอะไร |
|----------|-------------|-----------|
| `ORACLE_PORT` | `47778` | HTTP server port |
| `ORACLE_DATA_DIR` | `~/.arra-oracle-v2` | DB, vectors, plugins, logs |
| `ORACLE_REPO_ROOT` | auto | ตำแหน่ง `ψ/` |
| `VECTOR_URL` | — | Proxy vector ไปยัง vector server |
| `CORS_ORIGIN` | — | CORS origin สำหรับ web app |

---

## 8. Database Setup

SQLite สร้างอัตโนมัติที่ `ORACLE_DATA_DIR/oracle.db` ถ้ายังไม่มี schema ให้ push:

```bash
bun run db:push
```

หรือ generate + migrate ปกติ:

```bash
bun run db:generate
bun run db:migrate
```

---

## 9. Production Considerations

- เปลี่ยน/กำหนด `ORACLE_DATA_DIR` ให้ชัดเจน
- อย่า expose HTTP API โดยไม่มี reverse proxy + auth (ดู `KNOWN_ISSUES.md`)
- ตั้งค่า `CORS_ORIGIN` ให้ตรงกับ origin ของ web app
- ตรวจสอบว่า Codex / Claude Code ใช้ `ORACLE_DATA_DIR` เดียวกัน

---

## 10. Quick Start Checklist

- [ ] Bun >= 1.3.0 ติดตั้งแล้ว
- [ ] `bun install` สำเร็จ
- [ ] `bun run src/server.ts` ตอบ `/api/health` ได้
- [ ] MCP server เพิ่มเข้า Claude Code แล้ว (ถ้าต้องการ)
- [ ] มี `ψ/` หรือ knowledge base ให้ index
- [ ] Web dashboard เปิดได้ (ถ้าต้องการ)

---

## เอกสารที่เกี่ยวข้อง

- [ARCHITECTURE.md](./ARCHITECTURE.md) — ภาพรวมเทคนิค
- [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) — ปัญหาที่ยังเปิด
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) — แก้ไขปัญหา
- [RISKS.md](./RISKS.md) — ความเสี่ยง
- [docs/LOCAL-DEV.md](./docs/LOCAL-DEV.md) — คู่มือ dev ดั้งเดิม
- [docs/ONBOARDING.md](./docs/ONBOARDING.md) — progressive onboarding
- [docs/API.md](./docs/API.md) — API ละเอียด

---

*เขียน/อัปเดต: 2026-06-18 | Jit Oracle*
