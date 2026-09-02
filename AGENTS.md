# คำแนะนำสำหรับ AI Agent (Opencode Desktop)

เอกสารฉบับนี้กำหนดกฎระเบียบ แนวทางปฏิบัติ และ Best Practices สำหรับ AI Agent ที่ปฏิบัติงานในโปรเจกต์ **SoloMD**

---

## 1. กฎเหล็กด้าน Git และการจัดการ Branch (Strict Rules)

- **ห้ามทำงานบนสาขาหลัก (`main` / `master`/ `personal-main`) โดยตรง:** ทุกครั้งที่มีการปรับปรุงโค้ด เพิ่มฟีเจอร์ หรือแก้ไขปัญหา ห้ามคอมมิตหรือแก้ไขบนสาขาหลักเด็ดขาด เพื่อรักษาความเสถียรของสาขาหลัก
- **บังคับสร้าง Branch ใหม่ทุกครั้ง:** ก่อนเริ่มงานทุกชิ้น ต้องสร้างและสลับไปสาขาใหม่เสมอตามรูปแบบ (Naming Convention) ดังนี้:
  - ฟีเจอร์ใหม่: `feature/<ชื่อ-สั้นๆ-สื่อความหมาย>`
  - แก้ไขบั๊ก: `fix/<ชื่อ-สั้นๆ-สื่อความหมาย>`
  - งานปรับปรุง/รีแฟคเตอร์: `refactor/<ชื่อ-สั้นๆ-สื่อความหมาย>`
  - ตั้งชื่อสาขาให้สื่อกับสิ่งที่ทำ

- **ห้าม PR หรือ Merge เข้าสาขาหลักด้วยตนเองเด็ดขาด:** 
  - AI Agent มีหน้าที่เขียนโค้ด คอมมิต และพุชโค้ดขึ้น Remote Branch ทิ้งไว้เท่านั้น
  - **ไม่อนุญาต**ให้เปิด Pull Request (PR) หรือกด Merge เข้าสาขาหลัก (`main` / `master` / `personal-main`) เองโดยไม่ได้รับคำสั่งหรืออนุมัติอย่างชัดเจนจากผู้ใช้งาน (Human)

---

## 2. แนวปฏิบัติที่ดีที่สุด (Best Practices)

- **การสื่อสาร:** ใช้ภาษาไทยเป็นหลักในการตอบคำถาม การสรุปงาน และการสื่อสารกับผู้ใช้ (เว้นแต่มีการระบุเป็นภาษาอังกฤษ)
- **การทดสอบความถูกต้อง (Self-Verification):**
  - ทุกครั้งที่มีการแก้ไขโค้ด ควรตรวจสอบให้แน่ใจว่าโปรเจกต์ยังสามารถคอมไพล์ผ่านและไม่มีข้อผิดพลาด
  - รันคำสั่งทดสอบ (Tests) หรือการตรวจสอบมาตรฐาน (Linting/Type-checking) ที่เกี่ยวข้องในโปรเจกต์ทุกครั้งก่อนส่งมอบงาน
- **ความปลอดภัย (Security & Secrets):**
  - **ห้าม**ฮาร์ดโค้ด รหัสผ่าน API Keys หรือข้อมูลลับใดๆ ลงในโค้ด
  - ตรวจสอบ `git status` และ `git diff` ทุกครั้งก่อนทำการ Commit เพื่อป้องกันการนำไฟล์ที่ไม่จำเป็นหรือไฟล์ลับขึ้นระบบ
- **ความสะอาดของโค้ด:**
  - ปฏิบัติตามโครงสร้างและสไตล์การเขียนโค้ดเดิมของโปรเจกต์อย่างเคร่งครัด
  - เขียนคอมเมนต์เฉพาะจุดที่ซับซ้อนและจำเป็นจริงๆ (เน้นอธิบายเหตุผล *ทำไม* ไม่ใช่ *ทำอะไร*)

### 2.1 กฎห้ามลักไก่ — ต้อง Best Practice ทุก Case (No Cheating, No Exception)

> ห้ามแก้แบบลวกๆ เพื่อให้ CI เขียว — ต้องแก้ที่ต้นเหตุให้ถูกวิธีทุกกรณี

- **ห้าม** `// @ts-ignore` / `// @ts-expect-error` / `as any` / `any` / `!` (non-null) / `unwrap()` / `expect()` / `allow(dead_code, unused)` แบบไม่มีเหตุผล — ถ้าจำเป็นต้องใช้ ต้องมี `// SAFETY: <เหตุผล> — TODO: <issue> ` และมีทางแก้จริง
- **ห้าม** `hardcode` สี `#hex` / `magic number` / `string` ซ้ำ — ต้องใช้ `var(--*)` จาก `styles/tokens.css` หรือ `const` ตั้งชื่อ
- **ห้าม** `copy-paste` logic ซ้ำ — ต้องแยก `types.ts` / `lib/*.ts` / `util` แล้ว import
- **ห้าม** `console.log` / `dbg!` / `println!` / `eprintln!` ค้างใน PR — ต้องใช้ `log::debug` หรือลบก่อน push
- **ห้าม** `force-push` / `commit` ตรง `main` / เปิด PR เอง — ตามข้อ 1
- **ต้อง** แยก `type` ออกจาก `.vue` / `.rs` ไฟล์เดียว — ตัวอย่างที่ดี: `app/src/ui/types.ts` แยก `DsSelectOption` แล้ว `DsSelect.vue` + `index.ts` import จากที่เดียว
- **ต้อง** ผ่าน `tsc --noEmit` 0 error, `cargo clippy -- -D warnings`, `cargo test` ทุกครั้ง — ตรวจด้วย `grep -R "@ts-ignore|@ts-expect-error|TODO.*hack" app/src --include="*.ts" --include="*.vue"` ต้องว่างก่อน PR

### 2.2 Local vs CI — เครื่องเล็ก (T470 Gen7 RAM 8GB) ไม่ต้องรันหนัก

> Best practice ยังบังคับทุก case แต่ **ย้ายที่ตรวจ** — Local ทำเบา, CI ทำหนัก

- **Local (8GB) รันแค่เบา (~10 วิ):**
  - `grep -R "@ts-ignore|@ts-expect-error" app/src` + `eslint --cache --max-warnings 0` + `git status/diff`
  - `tsc --noEmit` แบบ `incremental` ถ้าไหว — ถ้าไม่ไหวให้ `skip` แล้วให้ CI ตรวจให้
  - **ห้ามบังคับ** `cargo build` / `cargo test` / `vite build` / `tauri build` ที่ local ถ้า `RAM < 16GB` — จะ OOM
- **CI (GitHub Actions) รันหนักแทนทุก PR — ต้องเขียวก่อน merge:**
  - `typecheck` — `npx tsc --noEmit --project app/tsconfig.json`
  - `rust` — `cargo clippy --manifest-path app/src-tauri/Cargo.toml -- -D warnings` + `cargo test`
  - `build` — `pnpm --filter app run build` (vite) — cache `~/.cargo`, `target/`, `node_modules`
  - ดู `.github/workflows/ci.yml` — job แยกเพื่อไม่ OOM, `timeout 20m`, `cache` เปิดหมด
- **กติกา:** ทุก PR ต้อง `CI green` ก่อนขอรีวิว — Local ไม่เขียวเพราะ skip `tsc` ได้ แต่ CI ต้องเขียว

---

## 3. ขั้นตอนการปฏิบัติงานมาตรฐาน (Workflow)

1. **ตรวจสอบสถานะ:** ตรวจสอบ Branch ปัจจุบันและสถานะของโปรเจกต์
2. **สร้าง Branch:** สร้างและสลับไปยัง Branch ใหม่ที่เหมาะสมตามข้อ 1 เสมอ
3. **ลงมือปฏิบัติ:** ดำเนินการตามโจทย์ที่ได้รับอย่างรอบคอบ
4. **ตรวจสอบ:** รันคำสั่งตรวจสอบความถูกต้อง/เทส
5. **สรุปผล:** แจ้งสรุปสิ่งที่ทำและรอให้มนุษย์เป็นผู้ดำเนินการรีวิว/เปิด PR/Merge ต่อไป

--- 

## 4. อธิบายด้วยภาษาที่เข้าใจง่าย