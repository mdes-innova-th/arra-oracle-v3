# Arra Oracle v3 — Troubleshooting

> คู่มือแก้ไขปัญหาที่พบบ่อย — อัปเดต 2026-06-18

---

## 1. `EADDRINUSE: address already in use :47778`

### สาเหตุ
มี process อื่นถือ port 47778 อยู่ (server เก่าค้าง หรือรันอีก instance)

### แก้ไข Windows

```powershell
Get-NetTCPConnection -LocalPort 47778 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

หรือใช้ cmd:

```cmd
for /f "tokens=5" %a in ('netstat -ano ^| findstr :47778') do taskkill /PID %a /F
```

### แก้ไข WSL/Linux/macOS

```bash
lsof -i :47778
kill -9 <pid>
```

หรือเปลี่ยน port:

```bash
ORACLE_PORT=47779 bun run src/server.ts
```

---

## 2. Browser CORS error

### สาเหตุ
Web dev server (`web/`) รันที่ port 4321 แต่ HTTP server ไม่ได้ allow origin นั้น

### แก้ไข

สตาร์ท server ด้วย `CORS_ORIGIN`:

```bash
CORS_ORIGIN=http://localhost:4321 ORACLE_PORT=47778 bun run src/server.ts
```

Fallback: เปิด web ด้วย query string:

```
http://localhost:4321/?api=http://localhost:47778
```

---

## 3. `bun: command not found` หรือ syntax error ตอน start

### สาเหตุ
Bun ไม่ได้ติดตั้ง หรือ version เก่าเกินไป

### แก้ไข

```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
bun --version   # ควร >= 1.3.0
```

บน Windows ใช้ PowerShell:

```powershell
powershell -c "irm bun.sh/install.ps1|iex"
```

---

## 4. Search ไม่เจอผลลัพธ์

### สาเหตุ
- ยังไม่ได้ index knowledge base
- `ψ/` ไม่ได้อยู่ใน `REPO_ROOT`
- Vector search fail แล้ว degrade เป็น FTS5 แต่คำค้นไม่ match

### แก้ไข

1. ตรวจว่า `ψ/` อยู่ตำแหน่งที่ server มองเห็น:

```bash
curl http://localhost:47778/api/file?path=ψ/memory/learnings/test.md
```

2. Index เนื้อหา:

```bash
curl -X POST http://localhost:47778/api/indexer/scan
curl -X POST http://localhost:47778/api/indexer/reindex
```

3. ทดสอบ FTS-only:

```bash
curl "http://localhost:47778/api/search?mode=fts&q=principle"
```

---

## 5. LanceDB / vector search hangs

### สาเหตุ
LanceDB ยังไม่พร้อมหรือ model ไม่ได้ embed

### แก้ไข

ใช้ FTS5-only ก่อน (vector จะ degrade อัตโนมัติ):

```bash
curl "http://localhost:47778/api/search?mode=fts&q=..."
```

ถือ้าต้องการปิด vector proxy:

```bash
VECTOR_URL= ORACLE_PORT=47778 bun run src/server.ts
```

---

## 6. MCP server ไม่ตอบสนองใน Claude Code

### สาเหตุ
- Bun ไม่ได้อยู่ใน PATH ของ Claude Code
- `ORACLE_DATA_DIR` ไม่ตรงกันระหว่าง MCP instance
- Stdio server crash

### แก้ไข

1. ทดสอบ MCP ผ่าน terminal ก่อน:

```bash
bunx --bun --package github:Soul-Brews-Studio/arra-oracle-v3 arra-oracle-v2
```

2. ใช้ absolute path สำหรับ bun:

```bash
claude mcp add arra-oracle-v2 -- /home/user/.bun/bin/bunx --bun --package github:Soul-Brews-Studio/arra-oracle-v3 arra-oracle-v2
```

3. ตรวจสอบ `ORACLE_DATA_DIR` ให้ตรงกันระหว่าง Claude Code และ Codex

---

## 7. Database locked / `busy_timeout` error

### สาเหตุ
มีหลาย process เปิด SQLite พร้อมกัน

### แก้ไข

- หยุด server / indexer ที่รันซ้ำ
- ตรวจ PID file ที่ `ORACLE_DATA_DIR/oracle-http.pid`
- ถือ้าจำเป็นให้ใช้ `PRAGMA busy_timeout` ผ่าน `src/db/index.ts` (มีแล้ว)

---

## 8. Plugin ไม่โหลด

### สาเหตุ
- Plugin ไม่ได้อยู่ใน `PLUGINS_DIR`
- `ORACLE_DISABLED_PLUGINS` บังคับปิด
- Plugin format ไม่ถูกต้อง

### แก้ไข

ตรวจสอบ:

```bash
curl http://localhost:47778/api/plugins
curl http://localhost:47778/api/plugins/<name>
```

ดู env:

```bash
env | grep ORACLE_ (plugins|enabled|disabled)
```

---

## 9. หา data dir ไม่เจอ

### สาเหตุ
Default data dir เป็น `~/.arra-oracle-v2` (legacy name)

### แก้ไข

ตรวจสอบ path:

```bash
# Linux/WSL
ls ~/.arra-oracle-v2

# Windows
ls $env:USERPROFILE\.arra-oracle-v2
```

หรือ override:

```bash
ORACLE_DATA_DIR=/path/to/data bun run src/server.ts
```

---

## 10. เปิด web dashboard แล้วไม่เจอข้อมูล

### สาเหตุ
- `PUBLIC_BACKEND_URL` ผิด
- Server ไม่ได้ allow CORS
- ยังไม่ได้ index

### แก้ไข

1. ตรวจ `web/.env` หรือ env var `PUBLIC_BACKEND_URL`
2. เปิด web ด้วย `?api=http://localhost:47778`
3. ตรวจ `/api/health` และ `/api/list`

---

*เขียน/อัปเดต: 2026-06-18 | Jit Oracle*
