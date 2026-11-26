# แผนการดำเนินงาน: ทำให้ WSUS Sync เบา ครบ และไม่เกิด error สุ่ม

**เป้าหมาย:** sync ได้ข้อมูลครบ ใช้ request น้อยที่สุด ไม่มี 500 / access denied แบบสุ่ม และ test connection สะท้อนความจริง

**ไฟล์หลัก**

- Next: `apps/web/lib/wsus-api-sync.ts`, `apps/web/app/api/wsus-sync/route.ts`, `apps/web/app/api/wsus-servers/[id]/test/route.ts`, `apps/web/app/(app)/sync/**`
- WSUS API (C#): `wsus/WsusRestApi/WsusRouterHandler.cs`, `Services/WsusCacheService.cs`, `Services/WsusSdkDataService.cs`, `Services/WsusConnectionFactory.cs`, `Models/*`

## Phase 1 — กันข้อมูลหาย / error ที่ซ่อนอยู่ (Next เท่านั้น, ความเสี่ยงต่ำ)

1. `fetchFromWsus`: เพิ่ม retry 3 ครั้ง, exponential backoff + jitter
   - retry: 403 `WSUS_PERMISSION_DENIED`, 429, 5xx, timeout, network error
   - ไม่ retry: 401, 404, 400
2. `fetchComputerDetailsInBatches`: เลิก `return null` แบบเงียบ
   - retry รายเครื่อง แล้วเก็บรายชื่อเครื่องที่ล้มจริง
   - ตอนเขียน DB: ลบ/แทนที่เฉพาะเครื่องที่ดึงสำเร็จ (เครื่องที่ล้มคงข้อมูลเดิม)
3. เพิ่มสถานะ `Partial` ใน `lastStatus` พร้อมข้อความ "ล้ม X/Y เครื่อง" ใน `lastError`
4. แสดง `Partial` ในหน้า `/sync` (badge + ข้อความ)

**ตรวจรับ:** จำลอง API ตอบ 500 แบบสุ่ม 10% → sync จบด้วย Success หรือ Partial, ข้อมูลเดิมไม่หาย

## Phase 2 — Test connection จริง + Warm-up

1. WSUS API: ให้ `/health` คืน `snapshotReady` / `warming` และ `lastError` ของ snapshot
2. `testWsusServerConnection`: เรียก `/health` แล้วต่อด้วย endpoint ที่ต้อง auth และแตะ SDK (`/summary`) แยกผลเป็น: เชื่อมต่อไม่ได้ / API key ผิด / WSUS permission / snapshot ยังไม่พร้อม
3. ก่อน `syncWsusServerById`: warm-up ด้วย `/summary` ตัวเดียว (retry จนพร้อม ไม่เกิน timeout) แล้วจึงยิง `/computers`, `/updates`, `/sync` ขนานกัน

**ตรวจรับ:** restart app pool แล้วกด sync ทันที → ไม่เกิด 403/502 แบบสุ่ม; test connection ใช้ key ผิด → ฟ้อง 401 ชัดเจน

## Phase 3 — ทำให้ WSUS API ทนทาน (C#)

1. `WsusCacheService`: เก็บ snapshot เดิมไว้ถ้า refresh ล้ม (stale-while-revalidate) แทนการตอบ 502; เพิ่ม negative cache สั้น ๆ (~10–15 วินาที) กัน request ชนกันตอน error
2. ใช้ `IUpdateServer` ร่วมกัน/สร้างใหม่เมื่อ error เท่านั้น แทน `ConnectLocal()` ทุก request
3. จัด mapping error ให้ชัด: แยก `UnauthorizedAccessException` ที่เกิดจาก SDK ชั่วคราว ออกจากการไม่มีสิทธิ์จริง; ส่ง header `Retry-After` เมื่อ warming (503)
4. `Install-WsusRestApi`: ตรวจ/บันทึกว่า app pool identity อยู่ในกลุ่ม WSUS Administrators และปิด idle timeout / ตั้ง preload (alwaysRunning) เพื่อลด cold start

**ตรวจรับ:** ดู `FileLogger` ไม่มี exception ซ้ำตอน refresh; ยิงขนาน 20 request ตอน cache หมดอายุ → ได้ 200 ทั้งหมด

## Phase 4 — ลดจำนวน request (หลักของ "เบาที่สุด")

1. เพิ่ม endpoint ใหม่ `GET /client-patches?page&pageSize&includeInstalled=false`
   - ดึง event history 60 วัน **ครั้งเดียว** ต่อรอบ แล้ว map ตามเครื่อง/อัปเดต
   - อ่านสถานะ per-computer แบบ batch และแบ่งหน้า ไม่ต้องยิงรายเครื่อง
   - cache ผลตาม `CacheDuration`
2. Next: ใช้ endpoint ใหม่เป็นหลัก; fallback ไป `/computers/{id}` ถ้า server เก่าไม่มี endpoint (ตรวจจาก 404)
3. ตั้ง `skipInstalledClientPatches = true` เป็นค่าเริ่มต้น
4. สำหรับ scope `all`: ดึง `/computers`, `/updates`, `/sync` ครั้งเดียวต่อรอบ (ไม่ซ้ำกับ client-patches)

**ตรวจรับ:** วัดจำนวน request และเวลาก่อน/หลังกับ server จริง (เป้า: จาก ~N+เล็กน้อย เหลือ ~10–20 request ต่อรอบ)

## Phase 5 — Rate limit แบบปรับตามสภาพ

1. แทน `WSUS_REQUEST_INTERVAL_MS = 250` ด้วย semaphore จำกัด in-flight (ค่าเริ่ม 2–3 ปรับด้วย env)
2. ถ้าเจอ 429/5xx/timeout ให้ลด concurrency ชั่วคราว (AIMD) แล้วค่อยเพิ่มกลับ
3. ตัดการยิง 3 request พร้อมกันตอนเริ่มเมื่อ snapshot ยังไม่พร้อม (ผูกกับ warm-up ใน Phase 2)

## Phase 6 — ทดสอบและปล่อย

- Unit test (Vitest หรือที่โปรเจกต์ใช้): retry/backoff, Partial logic, การแทนที่ข้อมูลเฉพาะเครื่องที่สำเร็จ
- ทดสอบ mock server ที่สุ่ม 403/500/timeout + cold start
- ทดสอบกับ WSUS จริง 1 เครื่อง: เทียบจำนวนแถว `ClientPatchStatus` ก่อน/หลัง ต้องเท่ากัน
- ปล่อยตามลำดับ: Phase 1–2 (Next เท่านั้น) → Phase 3–4 (ต้อง deploy WSUS API ใหม่ ผ่าน `Install-WsusRestApi.bat`) → Phase 5
- Rollback: Next fallback ไป endpoint เดิมได้ จึง deploy ฝั่ง Next ก่อน/หลัง API ได้อิสระ

## ความเสี่ยงและข้อสมมติ

> [!NOTE]
> สาเหตุของ 403/500 เป็นการอนุมานจากโค้ด ควรเก็บ log จาก `FileLogger` ของ WSUS ตอนเกิดอาการจริงยืนยันก่อนลงมือ Phase 3

- Endpoint bulk ใหม่ต้องทดสอบประสิทธิภาพกับ SDK จริง (WSUS SDK ช้าแบบไม่เชิงเส้นบน DB ใหญ่)
- ยังไม่ได้ตรวจโค้ด UI ของหน้า `/sync` ละเอียด (Phase 1 ข้อ 4 อาจต้องปรับเพิ่ม)

## ลำดับเวลาโดยประมาณ

| Phase | งาน                 | ประมาณ  |
| ----- | ------------------- | ------- |
| 1     | Retry + Partial     | 0.5 วัน |
| 2     | Test จริง + Warm-up | 0.5 วัน |
| 3     | ความทนทานฝั่ง C#    | 1 วัน   |
| 4     | Bulk endpoint       | 1–2 วัน |
| 5     | Adaptive rate limit | 0.5 วัน |
| 6     | ทดสอบ/ปล่อย         | 1 วัน   |
